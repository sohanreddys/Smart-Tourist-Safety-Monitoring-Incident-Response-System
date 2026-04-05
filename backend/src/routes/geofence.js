const express = require('express');
const { db, generateId } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Seed default geofences
const seedGeofences = () => {
  if (db.geofences.length === 0) {
    db.geofences.push(
      {
        id: generateId(),
        name: 'Flood-Prone River Zone',
        lat: 17.39,
        lng: 78.49,
        radius: 500,
        riskLevel: 'high',
        description: 'Area near river bank prone to flash floods during monsoon season.',
        createdBy: 'system',
        active: true,
      },
      {
        id: generateId(),
        name: 'Wildlife Sanctuary Buffer',
        lat: 17.375,
        lng: 78.475,
        radius: 800,
        riskLevel: 'medium',
        description: 'Buffer zone near wildlife sanctuary. Wild animal sightings reported.',
        createdBy: 'system',
        active: true,
      },
      {
        id: generateId(),
        name: 'Restricted Heritage Site',
        lat: 17.362,
        lng: 78.474,
        radius: 300,
        riskLevel: 'low',
        description: 'Protected heritage area. Photography restrictions apply.',
        createdBy: 'system',
        active: true,
      },
      {
        id: generateId(),
        name: 'Night Unsafe Zone',
        lat: 17.395,
        lng: 78.505,
        radius: 600,
        riskLevel: 'high',
        description: 'Area reported unsafe after dark. Multiple incidents reported.',
        createdBy: 'system',
        active: true,
      }
    );
  }
};
seedGeofences();

// GET /api/geofence
router.get('/', auth, (req, res) => {
  res.json({ geofences: db.geofences.filter((g) => g.active) });
});

// POST /api/geofence
router.post('/', auth, adminOnly, (req, res) => {
  const { name, lat, lng, radius, riskLevel, description } = req.body;
  if (!name || !lat || !lng || !radius) {
    return res.status(400).json({ error: 'name, lat, lng, and radius are required' });
  }

  const geofence = {
    id: generateId(),
    name,
    lat: parseFloat(lat),
    lng: parseFloat(lng),
    radius: parseFloat(radius),
    riskLevel: riskLevel || 'medium',
    description: description || '',
    createdBy: req.user.name,
    active: true,
  };

  db.geofences.push(geofence);
  res.status(201).json({ success: true, geofence });
});

// POST /api/geofence/check
router.post('/check', auth, (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  const violations = [];
  for (const fence of db.geofences.filter((g) => g.active)) {
    const distance = getDistanceMeters(lat, lng, fence.lat, fence.lng);
    if (distance <= fence.radius) {
      violations.push({ ...fence, distanceFromCenter: Math.round(distance) });
    }
  }

  res.json({ insideGeofence: violations.length > 0, violations });
});

// DELETE /api/geofence/:id
router.delete('/:id', auth, adminOnly, (req, res) => {
  const fence = db.geofences.find((g) => g.id === req.params.id);
  if (!fence) return res.status(404).json({ error: 'Geofence not found' });
  fence.active = false;
  res.json({ success: true });
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
