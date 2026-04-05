const express = require('express');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/location/update
router.post('/update', auth, (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const locationEntry = {
      id: generateId(),
      userId: req.user.id,
      userName: req.user.name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      accuracy: accuracy || null,
      timestamp: new Date().toISOString(),
    };

    db.locations.push(locationEntry);

    const user = db.users.find((u) => u.id === req.user.id);
    if (user) {
      user.lastLocation = { lat: locationEntry.lat, lng: locationEntry.lng, timestamp: locationEntry.timestamp };
    }

    res.json({ success: true, location: locationEntry });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// GET /api/location/history
router.get('/history', auth, (req, res) => {
  const history = db.locations
    .filter((l) => l.userId === req.user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100);
  res.json({ locations: history });
});

// GET /api/location/all-users (admin only)
router.get('/all-users', auth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const usersWithLocation = db.users
    .filter((u) => u.role === 'tourist' && u.lastLocation)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      lastLocation: u.lastLocation,
      isOnline: u.isOnline,
    }));

  res.json({ users: usersWithLocation });
});

// GET /api/location/nearby-services (mock)
router.get('/nearby-services', auth, (req, res) => {
  const { lat, lng } = req.query;
  const baseLat = parseFloat(lat) || 17.385;
  const baseLng = parseFloat(lng) || 78.4867;

  const services = [
    { id: 1, name: 'City General Hospital', type: 'hospital', lat: baseLat + 0.005, lng: baseLng + 0.003, phone: '108', distance: '0.6 km' },
    { id: 2, name: 'Central Police Station', type: 'police', lat: baseLat - 0.003, lng: baseLng + 0.006, phone: '100', distance: '0.7 km' },
    { id: 3, name: 'Fire & Rescue Station', type: 'fire', lat: baseLat + 0.008, lng: baseLng - 0.004, phone: '101', distance: '0.9 km' },
    { id: 4, name: 'Tourist Info Center', type: 'info', lat: baseLat - 0.002, lng: baseLng - 0.005, phone: '1363', distance: '0.5 km' },
    { id: 5, name: 'Pharmacy 24x7', type: 'pharmacy', lat: baseLat + 0.001, lng: baseLng + 0.008, phone: '+91-9876543210', distance: '0.8 km' },
  ];

  res.json({ services });
});

module.exports = router;
