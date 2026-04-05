const express = require('express');
const { db } = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/anomaly/check
router.post('/check', auth, (req, res) => {
  const { userId } = req.body;
  const targetId = userId || req.user.id;

  const locations = db.locations
    .filter((l) => l.userId === targetId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const anomalies = [];

  // Rule 1: Stationary too long (> 30 min at same spot)
  if (locations.length >= 2) {
    const last = locations[locations.length - 1];
    const prev = locations[locations.length - 2];
    const timeDiff = (new Date(last.timestamp) - new Date(prev.timestamp)) / 60000;
    const distance = getDistanceMeters(last.lat, last.lng, prev.lat, prev.lng);

    if (timeDiff > 30 && distance < 50) {
      anomalies.push({
        type: 'stationary',
        severity: 'medium',
        message: `User stationary for ${Math.round(timeDiff)} minutes at same location`,
        location: { lat: last.lat, lng: last.lng },
      });
    }
  }

  // Rule 2: Erratic/fast movement (speed > 120 km/h)
  if (locations.length >= 2) {
    const last = locations[locations.length - 1];
    const prev = locations[locations.length - 2];
    const timeDiffHours = (new Date(last.timestamp) - new Date(prev.timestamp)) / 3600000;
    const distanceKm = getDistanceMeters(last.lat, last.lng, prev.lat, prev.lng) / 1000;

    if (timeDiffHours > 0) {
      const speed = distanceKm / timeDiffHours;
      if (speed > 120) {
        anomalies.push({
          type: 'erratic_movement',
          severity: 'high',
          message: `Unusual speed detected: ${Math.round(speed)} km/h`,
          location: { lat: last.lat, lng: last.lng },
        });
      }
    }
  }

  // Rule 3: Inside geofence
  if (locations.length > 0) {
    const last = locations[locations.length - 1];
    for (const fence of db.geofences.filter((g) => g.active)) {
      const dist = getDistanceMeters(last.lat, last.lng, fence.lat, fence.lng);
      if (dist <= fence.radius) {
        anomalies.push({
          type: 'geofence_violation',
          severity: fence.riskLevel === 'high' ? 'critical' : 'medium',
          message: `Inside restricted zone: ${fence.name}`,
          location: { lat: last.lat, lng: last.lng },
          geofence: fence.name,
        });
      }
    }
  }

  // Rule 4: Late night activity (11 PM - 5 AM)
  if (locations.length > 0) {
    const last = locations[locations.length - 1];
    const hour = new Date(last.timestamp).getHours();
    if (hour >= 23 || hour < 5) {
      anomalies.push({
        type: 'late_night',
        severity: 'low',
        message: 'Activity detected during late night hours (11PM-5AM)',
        location: { lat: last.lat, lng: last.lng },
      });
    }
  }

  // Rule 5: SOS frequency (> 2 SOS in 1 hour)
  const recentAlerts = db.alerts.filter(
    (a) => a.userId === targetId && a.type === 'sos' &&
    (new Date() - new Date(a.createdAt)) < 3600000
  );
  if (recentAlerts.length > 2) {
    anomalies.push({
      type: 'frequent_sos',
      severity: 'critical',
      message: `${recentAlerts.length} SOS alerts triggered in the last hour`,
    });
  }

  res.json({ userId: targetId, anomalies, anomalyCount: anomalies.length, checkedAt: new Date().toISOString() });
});

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = router;
