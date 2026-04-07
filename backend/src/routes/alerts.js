const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.post('/sos', auth, async (req, res) => {
  try {
    const { lat, lng, message, type, accuracy, altitude, speed, heading, deviceInfo } = req.body;

    // Fetch full user profile for snapshot
    const userDoc = await User.findById(req.user.id).lean();
    const userSnapshot = userDoc ? {
      phone: userDoc.phone || '',
      bloodGroup: userDoc.bloodGroup || '',
      nationality: userDoc.nationality || '',
      gender: userDoc.gender || '',
      dateOfBirth: userDoc.dateOfBirth || '',
      medicalConditions: userDoc.medicalConditions || '',
      emergencyContactName: userDoc.emergencyContactName || '',
      emergencyContactPhone: userDoc.emergencyContactPhone || '',
      emergencyContactRelation: userDoc.emergencyContactRelation || '',
      address: userDoc.address || '',
    } : {};

    const alert = await Alert.create({
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      type: type || 'sos',
      message: message || 'Emergency SOS triggered!',
      lat: parseFloat(lat) || null,
      lng: parseFloat(lng) || null,
      accuracy: parseFloat(accuracy) || null,
      altitude: parseFloat(altitude) || null,
      speed: parseFloat(speed) || null,
      heading: parseFloat(heading) || null,
      status: 'active',
      priority: type === 'sos' ? 'critical' : 'high',
      recordingActive: true,
      deviceInfo: deviceInfo || {},
      userSnapshot,
    });

    // Emit to admin dashboards
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('sos:received', {
        ...alert.toObject(),
        id: alert._id.toString(),
        receivedAt: new Date().toISOString(),
      });
      io.to('user:' + req.user.id).emit('sos:acknowledged', {
        alertId: alert._id.toString(),
        message: 'SOS received — authorities have been notified. Help is on the way.',
      });
    }

    res.status(201).json({ success: true, alert: { ...alert.toObject(), id: alert._id.toString() } });
  } catch (err) {
    console.error('SOS error:', err);
    res.status(500).json({ error: 'Failed to create SOS alert' });
  }
});

// User self-cancel (must be at least 7 seconds old)
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    if (alert.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not your alert' });
    }
    if (alert.status !== 'active') {
      return res.status(400).json({ error: 'Alert is already ' + alert.status });
    }

    // Enforce 7-second minimum
    const elapsed = Date.now() - new Date(alert.createdAt).getTime();
    if (elapsed < 7000) {
      const remaining = Math.ceil((7000 - elapsed) / 1000);
      return res.status(400).json({
        error: 'Cannot cancel yet. Wait ' + remaining + ' more second(s).',
        remainingMs: 7000 - elapsed,
      });
    }

    alert.status = 'cancelled';
    alert.cancelledAt = new Date();
    alert.cancelledBy = 'user';
    alert.recordingActive = false;
    await alert.save();

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('alert:status_changed', {
        alertId: alert._id.toString(),
        status: 'cancelled',
        cancelledBy: 'user',
        cancelledAt: alert.cancelledAt,
        userName: req.user.name,
      });
    }

    res.json({ success: true, alert: { ...alert.toObject(), id: alert._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel alert' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { userId: req.user.id };
    const alerts = await Alert.find(query).sort({ createdAt: -1 }).limit(200).lean();
    const mapped = alerts.map(a => ({ ...a, id: a._id.toString() }));
    res.json({ alerts: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Get single alert with full details (for admin detail view)
router.get('/:id', auth, async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).lean();
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    // Admin or own alert
    if (req.user.role !== 'admin' && alert.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ alert: { ...alert, id: alert._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

router.patch('/:id/resolve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    alert.resolvedBy = req.user.name;
    alert.recordingActive = false;
    await alert.save();

    const io = req.app.get('io');
    if (io) {
      io.to('user:' + alert.userId.toString()).emit('alert:resolved', {
        alertId: alert._id.toString(),
        resolvedBy: alert.resolvedBy,
        message: 'Your alert has been resolved by ' + alert.resolvedBy,
      });
      io.to('admins').emit('alert:status_changed', {
        alertId: alert._id.toString(),
        status: 'resolved',
        resolvedBy: alert.resolvedBy,
        resolvedAt: alert.resolvedAt,
      });
    }

    res.json({ success: true, alert: { ...alert.toObject(), id: alert._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

router.post('/batch', auth, async (req, res) => {
  try {
    const { alerts: offlineAlerts } = req.body;
    if (!Array.isArray(offlineAlerts)) return res.status(400).json({ error: 'alerts must be an array' });
    const io = req.app.get('io');
    const created = [];

    for (const a of offlineAlerts) {
      const alert = await Alert.create({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        type: a.type || 'sos',
        message: a.message || 'Offline SOS alert',
        lat: a.lat || null,
        lng: a.lng || null,
        status: 'active',
        priority: 'critical',
        offlineSync: true,
      });
      created.push(alert);

      if (io) {
        io.to('admins').emit('sos:received', {
          ...alert.toObject(),
          id: alert._id.toString(),
          receivedAt: new Date().toISOString(),
          offlineSync: true,
        });
      }
    }
    res.status(201).json({ success: true, synced: created.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync alerts' });
  }
});

module.exports = router;
