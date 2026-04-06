const express = require('express');
const { db } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post('/check', auth, (req, res) => {
  const targetId = req.body.userId || req.user.id;
  const locations = db.locations.filter((l) => l.userId === targetId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const anomalies = [];

  if (locations.length >= 2) {
    const last = locations[locations.length - 1];
    const prev = locations[locations.length - 2];
    const timeDiff = (new Date(last.timestamp) - new Date(prev.timestamp)) / 60000;
    const dist = getDistanceMeters(last.lat, last.lng, prev.lat, prev.lng);
    if (timeDiff > 30 && dist < 50) anomalies.push({ type: 'stationary', severity: 'medium', message: 'User stationary for ' + Math.round(timeDiff) + ' minutes' });
    const timeDiffH = timeDiff / 60;
    if (timeDiffH > 0) {
      const speed = (dist / 1000) / timeDiffH;
      if (speed > 120) anomalies.push({ type: 'erratic_movement', severity: 'high', message: 'Unusual speed: ' + Math.round(speed) + ' km/h' });
    }
  }

  if (locations.length > 0) {
    const last = locations[locations.length - 1];
    for (const fence of db.geofences.filter((g) => g.active)) {
      if (getDistanceMeters(last.lat, last.lng, fence.lat, fence.lng) <= fence.radius)
        anomalies.push({ type: 'geofence_violation', severity: fence.riskLevel === 'high' ? 'critical' : 'medium', message: 'Inside: ' + fence.name });
    }
    const hour = new Date(last.timestamp).getHours();
    if (hour >= 23 || hour < 5) anomalies.push({ type: 'late_night', severity: 'low', message: 'Late night activity (11PM-5AM)' });
  }

  const recentSOS = db.alerts.filter((a) => a.userId === targetId && a.type === 'sos' && (new Date() - new Date(a.createdAt)) < 3600000);
  if (recentSOS.length > 2) anomalies.push({ type: 'frequent_sos', severity: 'critical', message: recentSOS.length + ' SOS in last hour' });

  res.json({ userId: targetId, anomalies, anomalyCount: anomalies.length, checkedAt: new Date().toISOString() });
});

module.exports = router;
