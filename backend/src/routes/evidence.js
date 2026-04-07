const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const Evidence = require('../models/Evidence');
const Alert = require('../models/Alert');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/evidence');
fs.mkdirSync(uploadsDir, { recursive: true });

// Allow auth via ?token= query (so <video> tags can stream without Bearer header)
const authQueryOrHeader = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }
    if (!token) return res.status(401).json({ error: 'No token' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'wandermate-secret');
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = { id: user._id.toString(), role: user.role, name: user.name };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, req.user.id + '_' + req.params.alertId + '_' + ts + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true),
});

// ─── SPECIFIC ROUTES FIRST (must come before /:alertId) ───────────────────────

// Serve evidence files with Range support and ?token= auth
router.get('/file/:filename', authQueryOrHeader, async (req, res) => {
  try {
    const responderRoles = ['admin', 'medical', 'police', 'fire', 'disaster'];
    if (!responderRoles.includes(req.user.role)) {
      const ev = await Evidence.findOne({ filename: req.params.filename });
      if (!ev || ev.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.mp4' ? 'video/mp4'
      : ext === '.mov' ? 'video/quicktime'
      : ext === '.webm' ? 'video/webm'
      : ext === '.m4a' ? 'audio/mp4'
      : ext === '.mp3' ? 'audio/mpeg'
      : 'application/octet-stream';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mime,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('File serve error:', err);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Upload evidence for an alert
router.post('/:alertId/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const alert = await Alert.findById(req.params.alertId);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    const evidence = await Evidence.create({
      alertId: req.params.alertId,
      userId: req.user.id,
      type: req.body.type || 'video',
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      duration: parseFloat(req.body.duration) || null,
      cameraType: req.body.cameraType || 'back',
      mimeType: req.file.mimetype,
      clipIndex: parseInt(req.body.clipIndex) || 0,
    });

    const count = await Evidence.countDocuments({ alertId: req.params.alertId });
    alert.evidenceCount = count;
    alert.recordingActive = true;
    await alert.save();

    const io = req.app.get('io');
    const fileUrl = '/api/evidence/file/' + req.file.filename;
    if (io) {
      const responderRooms = ['admins', 'medical', 'police', 'fire', 'disaster'];
      responderRooms.forEach(room => {
        io.to(room).emit('evidence:uploaded', {
          alertId: req.params.alertId,
          evidenceId: evidence._id.toString(),
          type: evidence.type,
          cameraType: evidence.cameraType,
          size: evidence.size,
          clipIndex: evidence.clipIndex,
          mimeType: evidence.mimeType,
          url: fileUrl,
          userName: req.user.name,
          totalEvidence: count,
          uploadedAt: new Date().toISOString(),
        });
      });
    }

    res.status(201).json({
      success: true,
      evidence: { ...evidence.toObject(), id: evidence._id.toString(), url: fileUrl },
    });
  } catch (err) {
    console.error('Evidence upload error:', err);
    res.status(500).json({ error: 'Failed to upload evidence' });
  }
});

// Latest clip for an alert (live viewer polling)
router.get('/:alertId/latest', auth, async (req, res) => {
  try {
    const ev = await Evidence.findOne({ alertId: req.params.alertId })
      .sort({ createdAt: -1 }).lean();
    if (!ev) return res.json({ evidence: null });
    res.json({
      evidence: { ...ev, id: ev._id.toString(), url: '/api/evidence/file/' + ev.filename },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Stop recording marker
router.post('/:alertId/stop-recording', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);
    if (alert) { alert.recordingActive = false; await alert.save(); }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// ─── PARAMETERISED CATCH-ALL LAST ─────────────────────────────────────────────

// List all evidence for an alert
router.get('/:alertId', auth, async (req, res) => {
  try {
    const evidence = await Evidence.find({ alertId: req.params.alertId })
      .sort({ createdAt: 1 }).lean();
    const mapped = evidence.map(e => ({
      ...e,
      id: e._id.toString(),
      url: '/api/evidence/file/' + e.filename,
    }));
    res.json({ evidence: mapped, total: mapped.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

module.exports = router;
