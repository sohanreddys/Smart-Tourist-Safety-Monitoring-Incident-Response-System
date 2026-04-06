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
    res.status(201).json({ success: true, alert });
  } catch (err) { res.status(500).json({ error: 'Failed to create SOS alert' }); }
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
  res.json({ success: true, alert });
});

router.post('/batch', auth, (req, res) => {
  try {
    const { alerts: offlineAlerts } = req.body;
    if (!Array.isArray(offlineAlerts)) return res.status(400).json({ error: 'alerts must be an array' });
    const created = [];
    for (const a of offlineAlerts) {
      const alert = {
        id: generateId(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
        type: a.type || 'sos', message: a.message || 'Offline SOS alert',
        lat: a.lat || null, lng: a.lng || null, status: 'active', priority: 'critical',
        createdAt: a.createdAt || new Date().toISOString(), resolvedAt: null, resolvedBy: null, offlineSync: true,
      };
      db.alerts.push(alert);
      created.push(alert);
    }
    res.status(201).json({ success: true, synced: created.length, alerts: created });
  } catch (err) { res.status(500).json({ error: 'Failed to sync alerts' }); }
});

module.exports = router;
