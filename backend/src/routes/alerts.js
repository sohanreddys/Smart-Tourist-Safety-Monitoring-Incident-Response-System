const express = require('express');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.post('/sos', auth, (req, res) => {
  try {
    const { lat, lng, message, type } = req.body;
    const alert = {
      id: generateId(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      type: type || 'sos', message: message || 'Emergency SOS triggered!',
      lat: parseFloat(lat) || null, lng: parseFloat(lng) || null,
      status: 'active', priority: type === 'sos' ? 'critical' : 'high',
      createdAt: new Date().toISOString(), resolvedAt: null, resolvedBy: null,
    };
    db.alerts.push(alert);

    // CRITICAL: Emit to admin dashboards via Socket.io so live feed updates
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('sos:received', {
        ...alert,
        receivedAt: new Date().toISOString(),
      });
      // Also acknowledge back to the tourist
      io.to('user:' + req.user.id).emit('sos:acknowledged', {
        alertId: alert.id,
        message: 'SOS received — authorities have been notified. Help is on the way.',
      });
    }

    res.status(201).json({ success: true, alert });
  } catch (err) {
    console.error('SOS error:', err);
    res.status(500).json({ error: 'Failed to create SOS alert' });
  }
});

router.get('/', auth, (req, res) => {
  let alerts = req.user.role === 'admin'
    ? db.alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : db.alerts.filter((a) => a.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ alerts });
});

router.patch('/:id/resolve', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const alert = db.alerts.find((a) => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  alert.resolvedBy = req.user.name;

  // Notify the tourist that their alert was resolved
  const io = req.app.get('io');
  if (io) {
    io.to('user:' + alert.userId).emit('alert:resolved', {
      alertId: alert.id,
      resolvedBy: alert.resolvedBy,
      message: 'Your alert has been resolved by ' + alert.resolvedBy,
    });
    // Also notify all admins for live feed update
    io.to('admins').emit('alert:status_changed', {
      alertId: alert.id,
      status: 'resolved',
      resolvedBy: alert.resolvedBy,
      resolvedAt: alert.resolvedAt,
    });
  }

  res.json({ success: true, alert });
});

router.post('/batch', auth, (req, res) => {
  try {
    const { alerts: offlineAlerts } = req.body;
    if (!Array.isArray(offlineAlerts)) return res.status(400).json({ error: 'alerts must be an array' });
    const created = [];
    const io = req.app.get('io');

    for (const a of offlineAlerts) {
      const alert = {
        id: generateId(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
        type: a.type || 'sos', message: a.message || 'Offline SOS alert',
        lat: a.lat || null, lng: a.lng || null, status: 'active', priority: 'critical',
        createdAt: a.createdAt || new Date().toISOString(), resolvedAt: null, resolvedBy: null, offlineSync: true,
      };
      db.alerts.push(alert);
      created.push(alert);

      // Emit each synced offline alert to admins
      if (io) {
        io.to('admins').emit('sos:received', {
          ...alert,
          receivedAt: new Date().toISOString(),
          offlineSync: true,
        });
      }
    }
    res.status(201).json({ success: true, synced: created.length, alerts: created });
  } catch (err) { res.status(500).json({ error: 'Failed to sync alerts' }); }
});

module.exports = router;
