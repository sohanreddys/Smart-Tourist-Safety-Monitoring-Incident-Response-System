const express = require('express');
const { db, generateId } = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const router = express.Router();

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Seed real India-based geofences — tourist safety zones across major cities
if (db.geofences.length === 0) {
  db.geofences.push(
    // === HYDERABAD ===
    { id: generateId(), name: 'Hussain Sagar Lake - Drowning Risk', lat: 17.4239, lng: 78.4738, radius: 400, riskLevel: 'high', description: 'Deep lake with strong currents. Multiple drowning incidents reported. No swimming allowed.', createdBy: 'system', active: true, city: 'Hyderabad' },
    { id: generateId(), name: 'Golconda Fort - Restricted Heritage Zone', lat: 17.3833, lng: 78.4011, radius: 600, riskLevel: 'medium', description: 'Protected ASI heritage site. Restricted areas after 5:30 PM. Stay on marked trails.', createdBy: 'system', active: true, city: 'Hyderabad' },
    { id: generateId(), name: 'Old City Charminar - Crowded Zone', lat: 17.3616, lng: 78.4747, radius: 500, riskLevel: 'medium', description: 'Extremely crowded area especially during festivals. Pickpocket risk. Keep valuables secure.', createdBy: 'system', active: true, city: 'Hyderabad' },
    { id: generateId(), name: 'Musi River Banks - Flood Prone', lat: 17.3720, lng: 78.4860, radius: 350, riskLevel: 'high', description: 'Flash flood risk during monsoon season (Jun-Oct). Banks are unstable and slippery.', createdBy: 'system', active: true, city: 'Hyderabad' },

    // === DELHI ===
    { id: generateId(), name: 'Yamuna River Banks - Pollution & Flood Risk', lat: 28.6328, lng: 77.2498, radius: 500, riskLevel: 'high', description: 'Extremely polluted water. Flooding during monsoon. Do not enter water. Health hazard zone.', createdBy: 'system', active: true, city: 'Delhi' },
    { id: generateId(), name: 'Chandni Chowk - Dense Crowd Zone', lat: 28.6506, lng: 77.2303, radius: 400, riskLevel: 'medium', description: 'One of the most crowded markets in India. High pickpocket risk. Avoid during peak hours.', createdBy: 'system', active: true, city: 'Delhi' },
    { id: generateId(), name: 'India Gate - Night Unsafe Zone', lat: 28.6129, lng: 77.2295, radius: 600, riskLevel: 'medium', description: 'Exercise caution after 10 PM. Tourist scam reports in the area. Stay in well-lit sections.', createdBy: 'system', active: true, city: 'Delhi' },
    { id: generateId(), name: 'Qutub Minar - Restricted Heritage Area', lat: 28.5245, lng: 77.1855, radius: 300, riskLevel: 'low', description: 'ASI protected monument. Climbing prohibited. Stay behind safety barriers at all times.', createdBy: 'system', active: true, city: 'Delhi' },

    // === MUMBAI ===
    { id: generateId(), name: 'Marine Drive - High Tide Danger Zone', lat: 18.9432, lng: 72.8235, radius: 300, riskLevel: 'high', description: 'Dangerous during high tide and monsoon. Massive waves crash over the promenade. Stay back from sea wall.', createdBy: 'system', active: true, city: 'Mumbai' },
    { id: generateId(), name: 'Dharavi - Guided Tours Only', lat: 19.0430, lng: 72.8520, radius: 800, riskLevel: 'medium', description: 'Large residential area. Visit only with authorized tour guides. Solo tourist entry not recommended.', createdBy: 'system', active: true, city: 'Mumbai' },
    { id: generateId(), name: 'Juhu Beach - Rip Current Zone', lat: 19.0883, lng: 72.8262, radius: 500, riskLevel: 'high', description: 'Strong rip currents. Multiple drowning incidents yearly. No swimming. Lifeguards only 7AM-6PM.', createdBy: 'system', active: true, city: 'Mumbai' },

    // === GOA ===
    { id: generateId(), name: 'Baga Beach - Night Safety Zone', lat: 15.5550, lng: 73.7517, radius: 400, riskLevel: 'medium', description: 'Exercise extreme caution after midnight. Drink spiking reports. Travel in groups after dark.', createdBy: 'system', active: true, city: 'Goa' },
    { id: generateId(), name: 'Dudhsagar Falls - Restricted Trek', lat: 15.3144, lng: 74.3143, radius: 700, riskLevel: 'high', description: 'Trekking prohibited during monsoon (Jun-Sep). Slippery rocks and flash floods. Only enter with permits.', createdBy: 'system', active: true, city: 'Goa' },
    { id: generateId(), name: 'Anjuna Cliff Edge - Fall Risk', lat: 15.5735, lng: 73.7410, radius: 200, riskLevel: 'high', description: 'Unstable cliff edges with no railings. Fatal falls reported. Stay 5m back from the edge.', createdBy: 'system', active: true, city: 'Goa' },

    // === JAIPUR ===
    { id: generateId(), name: 'Nahargarh Fort - Edge Danger Zone', lat: 26.9372, lng: 75.8154, radius: 300, riskLevel: 'high', description: 'Steep cliff edges with minimal fencing. Do not climb walls or lean over parapets. Fatal falls reported.', createdBy: 'system', active: true, city: 'Jaipur' },
    { id: generateId(), name: 'Johari Bazaar - Tourist Scam Zone', lat: 26.9155, lng: 75.8229, radius: 350, riskLevel: 'low', description: 'Common gem and jewelry scam area. Buy only from government-certified shops with hallmark.', createdBy: 'system', active: true, city: 'Jaipur' },

    // === VARANASI ===
    { id: generateId(), name: 'Ganges Ghats - Strong Current Zone', lat: 25.3109, lng: 83.0107, radius: 500, riskLevel: 'high', description: 'Extremely strong river currents. Boats must have life jackets. No swimming during monsoon.', createdBy: 'system', active: true, city: 'Varanasi' },
    { id: generateId(), name: 'Manikarnika Ghat - Restricted Cremation Area', lat: 25.3131, lng: 83.0135, radius: 150, riskLevel: 'medium', description: 'Active cremation site. Photography strictly prohibited. Approach with cultural sensitivity.', createdBy: 'system', active: true, city: 'Varanasi' },

    // === KERALA ===
    { id: generateId(), name: 'Kovalam Beach - Rip Current Zone', lat: 8.3988, lng: 76.9783, radius: 400, riskLevel: 'high', description: 'Dangerous undercurrents, especially during monsoon. Swim only in designated areas with lifeguards.', createdBy: 'system', active: true, city: 'Kerala' },
    { id: generateId(), name: 'Periyar Tiger Reserve - Wildlife Zone', lat: 9.4681, lng: 77.2347, radius: 1500, riskLevel: 'high', description: 'Active tiger and elephant territory. Stay on marked trails only. Guide mandatory. No food outside camps.', createdBy: 'system', active: true, city: 'Kerala' },

    // === AGRA ===
    { id: generateId(), name: 'Taj Mahal - Restricted Security Zone', lat: 27.1751, lng: 78.0421, radius: 400, riskLevel: 'low', description: 'Heavy security zone. No drones, tripods, or large bags. Entry from East/West gates only. Open sunrise to sunset.', createdBy: 'system', active: true, city: 'Agra' },

    // === RISHIKESH ===
    { id: generateId(), name: 'Laxman Jhula Rapids - Drowning Risk', lat: 30.1254, lng: 78.3195, radius: 300, riskLevel: 'high', description: 'Extremely dangerous rapids. No swimming or diving from bridge. Rafting only with licensed operators.', createdBy: 'system', active: true, city: 'Rishikesh' },

    // === SHIMLA / MANALI ===
    { id: generateId(), name: 'Rohtang Pass - Avalanche Zone', lat: 32.3722, lng: 77.2479, radius: 2000, riskLevel: 'high', description: 'Avalanche risk zone (Nov-Apr). Road closed during heavy snowfall. Altitude sickness possible above 3,978m.', createdBy: 'system', active: true, city: 'Manali' },
    { id: generateId(), name: 'Solang Valley - Landslide Prone', lat: 32.3167, lng: 77.1589, radius: 500, riskLevel: 'medium', description: 'Landslide risk during monsoon. Adventure activities only with certified operators.', createdBy: 'system', active: true, city: 'Manali' }
  );
}

router.get('/', auth, (req, res) => {
  const { city, lat, lng, radius } = req.query;
  let fences = db.geofences.filter((g) => g.active);

  // Filter by city if provided
  if (city) {
    fences = fences.filter((g) => g.city && g.city.toLowerCase() === city.toLowerCase());
  }

  // Filter by proximity if lat/lng provided
  if (lat && lng) {
    const maxRadius = parseFloat(radius) || 50000; // default 50km
    fences = fences.filter((g) => {
      const dist = getDistanceMeters(parseFloat(lat), parseFloat(lng), g.lat, g.lng);
      return dist <= maxRadius;
    });
  }

  res.json({ geofences: fences, total: fences.length });
});

router.post('/', auth, adminOnly, (req, res) => {
  const { name, lat, lng, radius, riskLevel, description, city } = req.body;
  if (!name || !lat || !lng || !radius) return res.status(400).json({ error: 'name, lat, lng, radius required' });
  const geofence = { id: generateId(), name, lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius), riskLevel: riskLevel || 'medium', description: description || '', city: city || '', createdBy: req.user.name, active: true };
  db.geofences.push(geofence);

  // Broadcast new geofence to all connected clients
  const io = req.app.get('io');
  if (io) io.emit('geofence:created', geofence);

  res.status(201).json({ success: true, geofence });
});

router.post('/check', auth, (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const violations = [];
  for (const fence of db.geofences.filter((g) => g.active)) {
    const distance = getDistanceMeters(lat, lng, fence.lat, fence.lng);
    if (distance <= fence.radius) violations.push({ ...fence, distanceFromCenter: Math.round(distance) });
  }

  // If violations found, emit to admins via socket
  if (violations.length > 0) {
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('geofence:alert', {
        userId: req.user.id,
        userName: req.user.name,
        violations: violations.map(v => ({ name: v.name, riskLevel: v.riskLevel, city: v.city })),
        lat, lng,
        timestamp: new Date().toISOString(),
      });
    }
  }

  res.json({ insideGeofence: violations.length > 0, violations, nearbyCount: violations.length });
});

router.delete('/:id', auth, adminOnly, (req, res) => {
  const fence = db.geofences.find((g) => g.id === req.params.id);
  if (!fence) return res.status(404).json({ error: 'Geofence not found' });
  fence.active = false;
  res.json({ success: true });
});

// Get all cities with geofences
router.get('/cities', auth, (req, res) => {
  const cities = [...new Set(db.geofences.filter(g => g.active && g.city).map(g => g.city))].sort();
  res.json({ cities });
});

module.exports = router;
