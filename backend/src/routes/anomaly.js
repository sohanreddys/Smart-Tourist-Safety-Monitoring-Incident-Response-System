const express = require('express');
const Location = require('../models/Location');
const Geofence = require('../models/Geofence');
const Alert = require('../models/Alert');
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

router.post('/check', auth, async (req, res) => {
  try {
    const targetId = req.body.userId || req.user.id;
    const locations = await Location.find({ userId: targetId })
      .sort({ timestamp: 1 })
      .limit(50)
      .lean();
    const anomalies = [];

    if (locations.length >= 2) {
      const last = locations[locations.length - 1];
      const prev = locations[locations.length - 2];
      const timeDiff = (new Date(last.timestamp) - new Date(prev.timestamp)) / 60000;
      const dist = getDistanceMeters(last.lat, last.lng, prev.lat, prev.lng);
      if (timeDiff > 30 && dist < 50) {
        anomalies.push({ type: 'stationary', severity: 'medium', message: 'User stationary for ' + Math.round(timeDiff) + ' minutes' });
      }
      const timeDiffH = timeDiff / 60;
      if (timeDiffH > 0) {
        const speed = (dist / 1000) / timeDiffH;
        if (speed > 120) {
          anomalies.push({ type: 'erratic_movement', severity: 'high', message: 'Unusual speed: ' + Math.round(speed) + ' km/h' });
        }
      }
    }

    if (locations.length > 0) {
      const last = locations[locations.length - 1];
      const activeGeofences = await Geofence.find({ active: true }).lean();
      for (const fence of activeGeofences) {
        if (getDistanceMeters(last.lat, last.lng, fence.lat, fence.lng) <= fence.radius) {
          anomalies.push({
            type: 'geofence_violation',
            severity: fence.riskLevel === 'high' ? 'critical' : 'medium',
            message: 'Inside: ' + fence.name,
          });
        }
      }
      const hour = new Date(last.timestamp).getHours();
      if (hour >= 23 || hour < 5) {
        anomalies.push({ type: 'late_night', severity: 'low', message: 'Late night activity (11PM-5AM)' });
      }
    }

    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentSOSCount = await Alert.countDocuments({
      userId: targetId,
      type: 'sos',
      createdAt: { $gte: oneHourAgo },
    });
    if (recentSOSCount > 2) {
      anomalies.push({ type: 'frequent_sos', severity: 'critical', message: recentSOSCount + ' SOS in last hour' });
    }

    // Emit anomalies to admins if any found
    if (anomalies.length > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to('admins').emit('anomaly:alert', {
          userId: targetId,
          anomalies,
          timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({ userId: targetId, anomalies, anomalyCount: anomalies.length, checkedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Anomaly check error:', err);
    res.status(500).json({ error: 'Failed to check anomalies' });
  }
});

module.exports = router;
