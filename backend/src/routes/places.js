const express = require('express');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Node 18+ has global fetch; fall back to dynamic import otherwise.
const doFetch = (...args) =>
  (globalThis.fetch ? globalThis.fetch(...args) : import('node-fetch').then(({ default: f }) => f(...args)));

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// Simple in-memory cache (12 hours)
const cache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000;
const cacheKey = (lat, lng, radius, type, source) =>
  `${source}:${type}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;

// Map our types to OSM tag filters
const OSM_QUERIES = {
  hospital: '["amenity"~"hospital|clinic|doctors"]',
  police: '["amenity"="police"]',
  fire: '["amenity"="fire_station"]',
  pharmacy: '["amenity"="pharmacy"]',
};

const GOOGLE_TYPES = {
  hospital: 'hospital',
  police: 'police',
  fire: 'fire_station',
  pharmacy: 'pharmacy',
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchOverpass(lat, lng, radius, type) {
  const filter = OSM_QUERIES[type];
  if (!filter) return [];
  const q = `[out:json][timeout:25];
  (
    node${filter}(around:${radius},${lat},${lng});
    way${filter}(around:${radius},${lat},${lng});
    relation${filter}(around:${radius},${lat},${lng});
  );
  out center tags 50;`;
  const res = await doFetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!res.ok) throw new Error('Overpass ' + res.status);
  const json = await res.json();
  return (json.elements || []).map((el) => {
    const t = el.tags || {};
    const plat = el.lat || el.center?.lat;
    const plng = el.lon || el.center?.lon;
    if (plat == null || plng == null) return null;
    return {
      id: type + '_' + el.id,
      name: t.name || t['name:en'] || (type.charAt(0).toUpperCase() + type.slice(1)),
      type,
      lat: plat,
      lng: plng,
      address: [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:city']].filter(Boolean).join(', '),
      phone: t.phone || t['contact:phone'] || '',
      website: t.website || t['contact:website'] || '',
      emergency: t.emergency || '',
      distance: Math.round(haversine(lat, lng, plat, plng)),
      source: 'osm',
    };
  }).filter(Boolean);
}

async function fetchGoogle(lat, lng, radius, type) {
  if (!GOOGLE_KEY) return [];
  const gType = GOOGLE_TYPES[type];
  if (!gType) return [];
  const url =
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
    '?location=' + lat + ',' + lng +
    '&radius=' + radius +
    '&type=' + gType +
    '&key=' + GOOGLE_KEY;
  const res = await doFetch(url);
  if (!res.ok) throw new Error('Google Places ' + res.status);
  const json = await res.json();
  return (json.results || []).map((r) => ({
    id: 'g_' + r.place_id,
    name: r.name,
    type,
    lat: r.geometry?.location?.lat,
    lng: r.geometry?.location?.lng,
    address: r.vicinity || '',
    rating: r.rating,
    userRatingsTotal: r.user_ratings_total,
    openNow: r.opening_hours?.open_now,
    distance: r.geometry?.location ? Math.round(haversine(lat, lng, r.geometry.location.lat, r.geometry.location.lng)) : null,
    source: 'google',
  }));
}

// GET /api/places/nearby?lat=..&lng=..&radius=5000&types=hospital,police,fire,pharmacy&limit=10
router.get('/nearby', auth, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = Math.min(parseInt(req.query.radius || '5000', 10), 20000);
    const limit = parseInt(req.query.limit || '10', 10);
    const types = (req.query.types || 'hospital,police,fire,pharmacy').split(',').map((s) => s.trim());
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });

    const grouped = {};
    const preferGoogle = !!GOOGLE_KEY && req.query.source !== 'osm';

    await Promise.all(types.map(async (type) => {
      const primarySource = preferGoogle ? 'google' : 'osm';
      const primary = primarySource === 'google' ? fetchGoogle : fetchOverpass;
      const fallback = primarySource === 'google' ? fetchOverpass : fetchGoogle;
      const key = cacheKey(lat, lng, radius, type, primarySource);
      const cached = cache.get(key);
      let items = [];
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        items = cached.data;
      } else {
        try {
          items = await primary(lat, lng, radius, type);
        } catch (e) {
          console.error('Primary POI fetch failed for ' + type + ':', e.message);
        }
        if (!items || items.length === 0) {
          try { items = await fallback(lat, lng, radius, type); } catch (e) {}
        }
        cache.set(key, { ts: Date.now(), data: items || [] });
      }
      items.sort((a, b) => (a.distance || 9e9) - (b.distance || 9e9));
      grouped[type] = items.slice(0, limit);
    }));

    res.json({ lat, lng, radius, grouped, source: preferGoogle ? 'google+osm' : 'osm+google' });
  } catch (err) {
    console.error('Places error:', err);
    res.status(500).json({ error: 'Failed to fetch nearby places', details: err.message });
  }
});

module.exports = router;
