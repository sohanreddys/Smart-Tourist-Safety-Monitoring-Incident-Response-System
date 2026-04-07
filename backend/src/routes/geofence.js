const express = require('express');
const Geofence = require('../models/Geofence');
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

// Seed India geofences on first load
const INDIA_GEOFENCES = [
  // HYDERABAD
  { name: 'Hussain Sagar Lake - Drowning Risk', lat: 17.4239, lng: 78.4738, radius: 400, riskLevel: 'high', description: 'Deep lake with strong currents. Multiple drowning incidents reported. No swimming allowed.', city: 'Hyderabad' },
  { name: 'Golconda Fort - Restricted Heritage Zone', lat: 17.3833, lng: 78.4011, radius: 600, riskLevel: 'medium', description: 'Protected ASI heritage site. Restricted areas after 5:30 PM.', city: 'Hyderabad' },
  { name: 'Old City Charminar - Crowded Zone', lat: 17.3616, lng: 78.4747, radius: 500, riskLevel: 'medium', description: 'Extremely crowded area especially during festivals. Pickpocket risk.', city: 'Hyderabad' },
  { name: 'Musi River Banks - Flood Prone', lat: 17.3720, lng: 78.4860, radius: 350, riskLevel: 'high', description: 'Flash flood risk during monsoon season (Jun-Oct). Banks are unstable.', city: 'Hyderabad' },
  // DELHI
  { name: 'Yamuna River Banks - Pollution & Flood Risk', lat: 28.6328, lng: 77.2498, radius: 500, riskLevel: 'high', description: 'Extremely polluted water. Flooding during monsoon. Health hazard zone.', city: 'Delhi' },
  { name: 'Chandni Chowk - Dense Crowd Zone', lat: 28.6506, lng: 77.2303, radius: 400, riskLevel: 'medium', description: 'One of the most crowded markets in India. High pickpocket risk.', city: 'Delhi' },
  { name: 'India Gate - Night Unsafe Zone', lat: 28.6129, lng: 77.2295, radius: 600, riskLevel: 'medium', description: 'Exercise caution after 10 PM. Tourist scam reports in the area.', city: 'Delhi' },
  { name: 'Qutub Minar - Restricted Heritage Area', lat: 28.5245, lng: 77.1855, radius: 300, riskLevel: 'low', description: 'ASI protected monument. Climbing prohibited. Stay behind safety barriers.', city: 'Delhi' },
  // MUMBAI
  { name: 'Marine Drive - High Tide Danger Zone', lat: 18.9432, lng: 72.8235, radius: 300, riskLevel: 'high', description: 'Dangerous during high tide and monsoon. Stay back from sea wall.', city: 'Mumbai' },
  { name: 'Dharavi - Guided Tours Only', lat: 19.0430, lng: 72.8520, radius: 800, riskLevel: 'medium', description: 'Visit only with authorized tour guides. Solo tourist entry not recommended.', city: 'Mumbai' },
  { name: 'Juhu Beach - Rip Current Zone', lat: 19.0883, lng: 72.8262, radius: 500, riskLevel: 'high', description: 'Strong rip currents. No swimming. Lifeguards only 7AM-6PM.', city: 'Mumbai' },
  // GOA
  { name: 'Baga Beach - Night Safety Zone', lat: 15.5550, lng: 73.7517, radius: 400, riskLevel: 'medium', description: 'Exercise extreme caution after midnight. Drink spiking reports.', city: 'Goa' },
  { name: 'Dudhsagar Falls - Restricted Trek', lat: 15.3144, lng: 74.3143, radius: 700, riskLevel: 'high', description: 'Trekking prohibited during monsoon. Slippery rocks and flash floods.', city: 'Goa' },
  { name: 'Anjuna Cliff Edge - Fall Risk', lat: 15.5735, lng: 73.7410, radius: 200, riskLevel: 'high', description: 'Unstable cliff edges with no railings. Fatal falls reported.', city: 'Goa' },
  // JAIPUR
  { name: 'Nahargarh Fort - Edge Danger Zone', lat: 26.9372, lng: 75.8154, radius: 300, riskLevel: 'high', description: 'Steep cliff edges with minimal fencing. Fatal falls reported.', city: 'Jaipur' },
  { name: 'Johari Bazaar - Tourist Scam Zone', lat: 26.9155, lng: 75.8229, radius: 350, riskLevel: 'low', description: 'Common gem and jewelry scam area. Buy only from certified shops.', city: 'Jaipur' },
  // VARANASI
  { name: 'Ganges Ghats - Strong Current Zone', lat: 25.3109, lng: 83.0107, radius: 500, riskLevel: 'high', description: 'Extremely strong river currents. No swimming during monsoon.', city: 'Varanasi' },
  { name: 'Manikarnika Ghat - Restricted Cremation Area', lat: 25.3131, lng: 83.0135, radius: 150, riskLevel: 'medium', description: 'Active cremation site. Photography strictly prohibited.', city: 'Varanasi' },
  // KERALA
  { name: 'Kovalam Beach - Rip Current Zone', lat: 8.3988, lng: 76.9783, radius: 400, riskLevel: 'high', description: 'Dangerous undercurrents. Swim only in designated areas with lifeguards.', city: 'Kerala' },
  { name: 'Periyar Tiger Reserve - Wildlife Zone', lat: 9.4681, lng: 77.2347, radius: 1500, riskLevel: 'high', description: 'Active tiger and elephant territory. Guide mandatory.', city: 'Kerala' },
  // AGRA
  { name: 'Taj Mahal - Restricted Security Zone', lat: 27.1751, lng: 78.0421, radius: 400, riskLevel: 'low', description: 'Heavy security zone. No drones, tripods, or large bags.', city: 'Agra' },
  // RISHIKESH
  { name: 'Laxman Jhula Rapids - Drowning Risk', lat: 30.1254, lng: 78.3195, radius: 300, riskLevel: 'high', description: 'Extremely dangerous rapids. No swimming or diving from bridge.', city: 'Rishikesh' },
  // MANALI
  { name: 'Rohtang Pass - Avalanche Zone', lat: 32.3722, lng: 77.2479, radius: 2000, riskLevel: 'high', description: 'Avalanche risk zone (Nov-Apr). Altitude sickness possible above 3,978m.', city: 'Manali' },
  { name: 'Solang Valley - Landslide Prone', lat: 32.3167, lng: 77.1589, radius: 500, riskLevel: 'medium', description: 'Landslide risk during monsoon. Adventure activities only with certified operators.', city: 'Manali' },
];

// Seed geofences into MongoDB if collection is empty
async function seedGeofences() {
  try {
    const count = await Geofence.countDocuments();
    if (count === 0) {
      const docs = INDIA_GEOFENCES.map(g => ({ ...g, createdBy: 'system', active: true }));
      await Geofence.insertMany(docs);
      console.log('Seeded ' + docs.length + ' India geofences into MongoDB');
    }
  } catch (err) {
    console.error('Geofence seed error:', err.message);
  }
}

router.get('/', auth, async (req, res) => {
  try {
    const { city, lat, lng, radius } = req.query;
    const filter = { active: true };
    if (city) filter.city = new RegExp(city, 'i');

    let fences = await Geofence.find(filter).lean();

    // Add id field
    fences = fences.map(f => ({ ...f, id: f._id.toString() }));

    // Filter by proximity if lat/lng provided
    if (lat && lng) {
      const maxRadius = parseFloat(radius) || 50000;
      fences = fences.filter((g) => {
        const dist = getDistanceMeters(parseFloat(lat), parseFloat(lng), g.lat, g.lng);
        return dist <= maxRadius;
      });
    }

    res.json({ geofences: fences, total: fences.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch geofences' });
  }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, lat, lng, radius, riskLevel, description, city } = req.body;
    if (!name || !lat || !lng || !radius) return res.status(400).json({ error: 'name, lat, lng, radius required' });
    const geofence = await Geofence.create({
      name, lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius),
      riskLevel: riskLevel || 'medium', description: description || '', city: city || '',
      createdBy: req.user.name, active: true,
    });
    const io = req.app.get('io');
    if (io) io.emit('geofence:created', { ...geofence.toObject(), id: geofence._id.toString() });
    res.status(201).json({ success: true, geofence: { ...geofence.toObject(), id: geofence._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create geofence' });
  }
});

router.post('/check', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const fences = await Geofence.find({ active: true }).lean();
    const violations = [];
    for (const fence of fences) {
      const distance = getDistanceMeters(lat, lng, fence.lat, fence.lng);
      if (distance <= fence.radius) {
        violations.push({ ...fence, id: fence._id.toString(), distanceFromCenter: Math.round(distance) });
      }
    }

    if (violations.length > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to('admins').emit('geofence:alert', {
          userId: req.user.id, userName: req.user.name,
          violations: violations.map(v => ({ name: v.name, riskLevel: v.riskLevel, city: v.city })),
          lat, lng, timestamp: new Date().toISOString(),
        });
      }
    }

    res.json({ insideGeofence: violations.length > 0, violations, nearbyCount: violations.length });
  } catch (err) {
    res.status(500).json({ error: 'Geofence check failed' });
  }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const fence = await Geofence.findById(req.params.id);
    if (!fence) return res.status(404).json({ error: 'Geofence not found' });
    fence.active = false;
    await fence.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete geofence' });
  }
});

router.get('/cities', auth, async (req, res) => {
  try {
    const cities = await Geofence.distinct('city', { active: true, city: { $ne: '' } });
    res.json({ cities: cities.sort() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

router.seedGeofences = seedGeofences;
module.exports = router;
