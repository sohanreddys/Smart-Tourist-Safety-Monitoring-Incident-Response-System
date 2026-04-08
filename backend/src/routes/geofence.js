const express = require('express');
const Geofence = require('../models/Geofence');
const { auth, adminOnly } = require('../middleware/auth');
const router = express.Router();

const doFetch = (...args) =>
  (globalThis.fetch ? globalThis.fetch(...args) : import('node-fetch').then(({ default: f }) => f(...args)));

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Ray-casting point-in-polygon
function pointInPolygon(lat, lng, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isInsideFence(lat, lng, fence) {
  if (fence.shape === 'polygon' && Array.isArray(fence.polygon) && fence.polygon.length >= 3) {
    return pointInPolygon(lat, lng, fence.polygon);
  }
  if (fence.lat != null && fence.lng != null && fence.radius) {
    return getDistanceMeters(lat, lng, fence.lat, fence.lng) <= fence.radius;
  }
  return false;
}

// ------------------- LEGACY CIRCLE SEED (kept for non-Hyderabad cities) -------------------
const INDIA_GEOFENCES = [
  { name: 'Yamuna River Banks - Pollution & Flood Risk', lat: 28.6328, lng: 77.2498, radius: 500, riskLevel: 'high', description: 'Extremely polluted water. Flooding during monsoon.', city: 'Delhi' },
  { name: 'Chandni Chowk - Dense Crowd Zone', lat: 28.6506, lng: 77.2303, radius: 400, riskLevel: 'medium', description: 'One of the most crowded markets in India. Pickpocket risk.', city: 'Delhi' },
  { name: 'India Gate - Night Unsafe Zone', lat: 28.6129, lng: 77.2295, radius: 600, riskLevel: 'medium', description: 'Exercise caution after 10 PM.', city: 'Delhi' },
  { name: 'Qutub Minar - Restricted Heritage Area', lat: 28.5245, lng: 77.1855, radius: 300, riskLevel: 'low', description: 'ASI protected monument.', city: 'Delhi' },
  { name: 'Marine Drive - High Tide Danger Zone', lat: 18.9432, lng: 72.8235, radius: 300, riskLevel: 'high', description: 'Dangerous during high tide and monsoon.', city: 'Mumbai' },
  { name: 'Juhu Beach - Rip Current Zone', lat: 19.0883, lng: 72.8262, radius: 500, riskLevel: 'high', description: 'Strong rip currents.', city: 'Mumbai' },
  { name: 'Baga Beach - Night Safety Zone', lat: 15.5550, lng: 73.7517, radius: 400, riskLevel: 'medium', description: 'Exercise caution after midnight.', city: 'Goa' },
  { name: 'Dudhsagar Falls - Restricted Trek', lat: 15.3144, lng: 74.3143, radius: 700, riskLevel: 'high', description: 'Trek prohibited during monsoon.', city: 'Goa' },
  { name: 'Nahargarh Fort - Edge Danger Zone', lat: 26.9372, lng: 75.8154, radius: 300, riskLevel: 'high', description: 'Steep cliff edges.', city: 'Jaipur' },
  { name: 'Ganges Ghats - Strong Current Zone', lat: 25.3109, lng: 83.0107, radius: 500, riskLevel: 'high', description: 'Extremely strong river currents.', city: 'Varanasi' },
  { name: 'Kovalam Beach - Rip Current Zone', lat: 8.3988, lng: 76.9783, radius: 400, riskLevel: 'high', description: 'Dangerous undercurrents.', city: 'Kerala' },
  { name: 'Taj Mahal - Restricted Security Zone', lat: 27.1751, lng: 78.0421, radius: 400, riskLevel: 'low', description: 'Heavy security zone.', city: 'Agra' },
  { name: 'Rohtang Pass - Avalanche Zone', lat: 32.3722, lng: 77.2479, radius: 2000, riskLevel: 'high', description: 'Avalanche risk (Nov-Apr).', city: 'Manali' },
];

// ------------------- HYDERABAD POLYGON ZONES -------------------
// Seeded as polygon AOIs via Nominatim/Overpass. `query` is passed to Nominatim
// to resolve a real-world boundary polygon. If it fails, the circle fallback
// (lat/lng/radius) is used so we always get *something* on the map.
const HYDERABAD_POLYGON_SEEDS = [
  { name: 'Hussain Sagar Lake',   query: 'Hussain Sagar, Hyderabad',      riskLevel: 'high',   category: 'lake',        description: 'Deep lake. No swimming. Drowning risk.',           lat: 17.4239, lng: 78.4738, radius: 450 },
  { name: 'Osman Sagar Lake',     query: 'Osman Sagar, Hyderabad',        riskLevel: 'medium', category: 'lake',        description: 'Reservoir — restricted swimming/boating.',           lat: 17.3833, lng: 78.3000, radius: 900 },
  { name: 'Himayat Sagar Lake',   query: 'Himayat Sagar, Hyderabad',      riskLevel: 'medium', category: 'lake',        description: 'Reservoir — restricted public access.',              lat: 17.3500, lng: 78.3333, radius: 900 },
  { name: 'Durgam Cheruvu Lake',  query: 'Durgam Cheruvu, Hyderabad',     riskLevel: 'medium', category: 'lake',        description: 'Urban lake. Edges unsafe after dark.',              lat: 17.4296, lng: 78.3841, radius: 400 },
  { name: 'Old City (Charminar)', query: 'Charminar, Hyderabad',          riskLevel: 'medium', category: 'market',      description: 'Extremely crowded. Pickpocket risk during festivals.', lat: 17.3616, lng: 78.4747, radius: 600 },
  { name: 'Laad Bazaar',          query: 'Laad Bazaar, Hyderabad',        riskLevel: 'low',    category: 'market',      description: 'Crowded bangle market near Charminar.',             lat: 17.3603, lng: 78.4722, radius: 200 },
  { name: 'Golconda Fort',        query: 'Golconda Fort, Hyderabad',      riskLevel: 'medium', category: 'heritage',    description: 'ASI heritage site. Restricted after 5:30 PM.',      lat: 17.3833, lng: 78.4011, radius: 700 },
  { name: 'Qutub Shahi Tombs',    query: 'Qutb Shahi Tombs, Hyderabad',   riskLevel: 'low',    category: 'heritage',    description: 'Protected heritage complex.',                        lat: 17.3948, lng: 78.3950, radius: 500 },
  { name: 'Chowmahalla Palace',   query: 'Chowmahalla Palace, Hyderabad', riskLevel: 'low',    category: 'heritage',    description: 'Royal palace museum.',                               lat: 17.3578, lng: 78.4718, radius: 300 },
  { name: 'Musi River Banks',     query: 'Musi River, Hyderabad',         riskLevel: 'high',   category: 'river',       description: 'Flash flood risk during monsoon (Jun–Oct).',         lat: 17.3720, lng: 78.4860, radius: 450 },
  { name: 'Secunderabad Railway Area', query: 'Secunderabad Railway Station, Hyderabad', riskLevel: 'medium', category: 'transit', description: 'Crowded transit hub. Petty theft reported.', lat: 17.4344, lng: 78.5013, radius: 400 },
  { name: 'Begum Bazaar',         query: 'Begum Bazaar, Hyderabad',       riskLevel: 'low',    category: 'market',      description: 'Dense wholesale market.',                            lat: 17.3770, lng: 78.4700, radius: 300 },
  { name: 'Banjara Hills',        query: 'Banjara Hills, Hyderabad',      riskLevel: 'low',    category: 'neighborhood',description: 'Upscale neighborhood — generally safe.',             lat: 17.4156, lng: 78.4347, radius: 1200 },
  { name: 'Jubilee Hills',        query: 'Jubilee Hills, Hyderabad',      riskLevel: 'low',    category: 'neighborhood',description: 'Residential area.',                                 lat: 17.4320, lng: 78.4070, radius: 1500 },
  { name: 'HITEC City',           query: 'HITEC City, Hyderabad',         riskLevel: 'low',    category: 'neighborhood',description: 'Tech corridor.',                                    lat: 17.4483, lng: 78.3915, radius: 1800 },
  { name: 'Gachibowli',           query: 'Gachibowli, Hyderabad',         riskLevel: 'low',    category: 'neighborhood',description: 'IT/financial district.',                            lat: 17.4401, lng: 78.3489, radius: 1800 },
  { name: 'KBR National Park',    query: 'Kasu Brahmananda Reddy National Park, Hyderabad', riskLevel: 'medium', category: 'park', description: 'Urban forest reserve — wildlife present.', lat: 17.4213, lng: 78.4148, radius: 900 },
  { name: 'Nehru Zoological Park',query: 'Nehru Zoological Park, Hyderabad', riskLevel: 'low', category: 'park',       description: 'City zoo.',                                          lat: 17.3510, lng: 78.4520, radius: 800 },
  { name: 'Ramoji Film City',     query: 'Ramoji Film City, Hyderabad',   riskLevel: 'low',    category: 'attraction',  description: 'Large film studio complex on city outskirts.',       lat: 17.2543, lng: 78.6808, radius: 2500 },
  { name: 'Tank Bund Road',       query: 'Tank Bund Road, Hyderabad',     riskLevel: 'medium', category: 'road',        description: 'Lakefront road — unsafe edges at night.',            lat: 17.4175, lng: 78.4782, radius: 600 },
];

async function fetchNominatimPolygon(query) {
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&limit=1&q=' +
      encodeURIComponent(query);
    const res = await doFetch(url, { headers: { 'User-Agent': 'WanderMate/1.0 (safety app)' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!arr || !arr.length) return null;
    const hit = arr[0];
    const geo = hit.geojson;
    if (!geo) return null;

    // Extract first ring of coordinates depending on type
    let ring = null;
    if (geo.type === 'Polygon') ring = geo.coordinates[0];
    else if (geo.type === 'MultiPolygon') ring = geo.coordinates[0][0];
    else if (geo.type === 'LineString') ring = geo.coordinates;
    if (!ring || ring.length < 3) return null;

    // Downsample to max ~80 points
    const step = Math.max(1, Math.floor(ring.length / 80));
    const polygon = [];
    for (let i = 0; i < ring.length; i += step) {
      const [lng, lat] = ring[i];
      polygon.push({ lat, lng });
    }
    // Ensure closed
    if (polygon.length < 3) return null;
    return polygon;
  } catch (e) {
    return null;
  }
}

async function seedGeofences() {
  try {
    // Legacy circle seed (other cities) — only if DB empty
    const count = await Geofence.countDocuments();
    if (count === 0) {
      const docs = INDIA_GEOFENCES.map(g => ({ ...g, shape: 'circle', createdBy: 'system', active: true }));
      await Geofence.insertMany(docs);
      console.log('Seeded ' + docs.length + ' legacy circle geofences');
    }

    // Hyderabad polygons — only seed those that don't already exist (by name)
    for (const s of HYDERABAD_POLYGON_SEEDS) {
      const exists = await Geofence.findOne({ name: s.name, city: 'Hyderabad' });
      if (exists) continue;
      const polygon = await fetchNominatimPolygon(s.query);
      // Respect Nominatim 1 req/sec policy
      await new Promise(r => setTimeout(r, 1100));
      if (polygon) {
        await Geofence.create({
          name: s.name, shape: 'polygon', polygon,
          riskLevel: s.riskLevel, category: s.category, description: s.description,
          city: 'Hyderabad', source: 'osm', createdBy: 'system', active: true,
        });
        console.log('Seeded Hyderabad polygon: ' + s.name + ' (' + polygon.length + ' vertices)');
      } else {
        // Fallback: circle
        await Geofence.create({
          name: s.name, shape: 'circle',
          lat: s.lat, lng: s.lng, radius: s.radius,
          riskLevel: s.riskLevel, category: s.category, description: s.description,
          city: 'Hyderabad', source: 'system', createdBy: 'system', active: true,
        });
        console.log('Seeded Hyderabad circle fallback: ' + s.name);
      }
    }
  } catch (err) {
    console.error('Geofence seed error:', err.message);
  }
}

// GET /api/geofence
router.get('/', auth, async (req, res) => {
  try {
    const { city, lat, lng, radius } = req.query;
    const filter = { active: true };
    if (city) filter.city = new RegExp(city, 'i');
    let fences = await Geofence.find(filter).lean();
    fences = fences.map(f => ({ ...f, id: f._id.toString() }));
    if (lat && lng) {
      const maxRadius = parseFloat(radius) || 50000;
      fences = fences.filter((g) => {
        const cLat = g.centroidLat ?? g.lat;
        const cLng = g.centroidLng ?? g.lng;
        if (cLat == null || cLng == null) return false;
        return getDistanceMeters(parseFloat(lat), parseFloat(lng), cLat, cLng) <= maxRadius;
      });
    }
    res.json({ geofences: fences, total: fences.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch geofences' });
  }
});

// POST /api/geofence  — supports circle OR polygon
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, shape = 'circle', lat, lng, radius, polygon, riskLevel, category, description, city } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    let doc;
    if (shape === 'polygon') {
      if (!Array.isArray(polygon) || polygon.length < 3) {
        return res.status(400).json({ error: 'polygon must have at least 3 vertices' });
      }
      doc = await Geofence.create({
        name, shape: 'polygon', polygon,
        riskLevel: riskLevel || 'medium', category: category || '',
        description: description || '', city: city || '',
        source: 'manual', createdBy: req.user.name, active: true,
      });
    } else {
      if (lat == null || lng == null || !radius) {
        return res.status(400).json({ error: 'lat, lng, radius required for circle' });
      }
      doc = await Geofence.create({
        name, shape: 'circle',
        lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius),
        riskLevel: riskLevel || 'medium', category: category || '',
        description: description || '', city: city || '',
        source: 'manual', createdBy: req.user.name, active: true,
      });
    }
    const io = req.app.get('io');
    if (io) io.emit('geofence:created', { ...doc.toObject(), id: doc._id.toString() });
    res.status(201).json({ success: true, geofence: { ...doc.toObject(), id: doc._id.toString() } });
  } catch (err) {
    console.error('Create geofence error:', err);
    res.status(500).json({ error: 'Failed to create geofence' });
  }
});

// POST /api/geofence/check
router.post('/check', auth, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const fences = await Geofence.find({ active: true }).lean();
    const violations = [];
    for (const fence of fences) {
      if (isInsideFence(lat, lng, fence)) {
        violations.push({ ...fence, id: fence._id.toString() });
      }
    }
    if (violations.length > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to('admins').emit('geofence:alert', {
          userId: req.user.id, userName: req.user.name,
          violations: violations.map(v => ({ name: v.name, riskLevel: v.riskLevel, city: v.city, shape: v.shape })),
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
