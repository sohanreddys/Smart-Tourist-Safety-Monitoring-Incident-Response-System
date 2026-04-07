const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Evidence = require('../models/Evidence');
const Alert = require('../models/Alert');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/evidence');
fs.mkdirSync(uploadsDir, { recursive: true });

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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/aac', 'image/jpeg', 'image/png'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, true); // Accept all for hackathon
    }
  },
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

    // Update evidence count on alert
    const count = await Evidence.countDocuments({ alertId: req.params.alertId });
    alert.evidenceCount = count;
    alert.recordingActive = true;
    await alert.save();

    // Notify admins of new evidence
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('evidence:uploaded', {
        alertId: req.params.alertId,
        evidenceId: evidence._id.toString(),
        type: evidence.type,
        cameraType: evidence.cameraType,
        size: evidence.size,
        clipIndex: evidence.clipIndex,
        userName: req.user.name,
        totalEvidence: count,
        uploadedAt: new Date().toISOString(),
      });
    }

    res.status(201).json({
      success: true,
      evidence: { ...evidence.toObject(), id: evidence._id.toString() },
    });
  } catch (err) {
    console.error('Evidence upload error:', err);
    res.status(500).json({ error: 'Failed to upload evidence' });
  }
});

// List evidence for an alert
router.get('/:alertId', auth, async (req, res) => {
  try {
    const evidence = await Evidence.find({ alertId: req.params.alertId })
      .sort({ createdAt: 1 })
      .lean();
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

// Serve evidence files
router.get('/file/:filename', auth, async (req, res) => {
  try {
    // Admins can access all, users only their own
    if (req.user.role !== 'admin') {
      const ev = await Evidence.findOne({ filename: req.params.filename });
      if (!ev || ev.userId.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Stop recording marker
router.post('/:alertId/stop-recording', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);
    if (alert) {
      alert.recordingActive = false;
      await alert.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update recording status' });
  }
});

module.exports = router;
