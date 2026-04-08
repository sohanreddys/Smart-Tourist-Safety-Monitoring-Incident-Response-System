const express = require('express');
const { auth } = require('../middleware/auth');
const router = express.Router();

const doFetch = (...args) =>
  (globalThis.fetch ? globalThis.fetch(...args) : import('node-fetch').then(({ default: f }) => f(...args)));

const OSRM_BASE = process.env.OSRM_URL || 'https://router.project-osrm.org';
const NOMINATIM = 'https://nominatim.openstreetmap.org';

// In-memory active trips: userId -> { destination, primaryRoute, alternates, startedAt }
const activeTrips = new Map();

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Min distance from point P to a polyline (array of {lat,lng}) in meters.
// Uses equirectangular projection — fine for short segments.
function distanceToPolyline(lat, lng, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversine(lat, lng, polyline[0].lat, polyline[0].lng);

  const toXY = (la, ln, refLat) => {
    const x = (ln * Math.PI / 180) * Math.cos(refLat * Math.PI / 180) * 6371000;
    const y = (la * Math.PI / 180) * 6371000;
    return { x, y };
  };
  const refLat = lat;
  const p = toXY(lat, lng, refLat);
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = toXY(polyline[i].lat, polyline[i].lng, refLat);
    const b = toXY(polyline[i + 1].lat, polyline[i + 1].lng, refLat);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const projx = a.x + t * dx, projy = a.y + t * dy;
    const d = Math.hypot(p.x - projx, p.y - projy);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// POST /api/route/geocode  { q }
router.post('/geocode', auth, async (req, res) => {
  try {
    const { q } = req.body;
    if (!q) return res.status(400).json({ error: 'q required' });
    const url = NOMINATIM + '/search?format=json&limit=5&q=' + encodeURIComponent(q);
    const r = await doFetch(url, { headers: { 'User-Agent': 'WanderMate/1.0 (safety app)' } });
    const arr = await r.json();
    const results = (arr || []).map(h => ({
      name: h.display_name,
      lat: parseFloat(h.lat),
      lng: parseFloat(h.lon),
    }));
    res.json({ results });
  } catch (err) {
    console.error('Geocode error:', err);
    res.status(500).json({ error: 'Geocode failed' });
  }
});

// POST /api/route/plan  { from:{lat,lng}, to:{lat,lng}, mode? }
router.post('/plan', auth, async (req, res) => {
  try {
    const { from, to, mode = 'driving' } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });
    const url = OSRM_BASE + '/route/v1/' + mode + '/' +
      from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
      '?overview=full&geometries=geojson&alternatives=true&steps=false';
    const r = await doFetch(url);
    if (!r.ok) return res.status(502).json({ error: 'OSRM failed', status: r.status });
    const json = await r.json();
    if (!json.routes || json.routes.length === 0) return res.status(404).json({ error: 'No route found' });

    const routes = json.routes.map((rt, idx) => ({
      id: 'r' + idx,
      distance: rt.distance,
      duration: rt.duration,
      polyline: rt.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    }));

    // Save the primary as active trip for this user
    activeTrips.set(req.user.id, {
      destination: to,
      from,
      primary: routes[0],
      alternates: routes.slice(1),
      startedAt: new Date().toISOString(),
      lastDeviationAlertAt: 0,
    });

    res.json({ routes, primary: routes[0], alternates: routes.slice(1) });
  } catch (err) {
    console.error('Route plan error:', err);
    res.status(500).json({ error: 'Route planning failed' });
  }
});

// POST /api/route/check-deviation  { lat, lng, threshold? }
router.post('/check-deviation', auth, async (req, res) => {
  try {
    const { lat, lng, threshold = 200 } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const trip = activeTrips.get(req.user.id);
    if (!trip) return res.json({ active: false });

    // Check distance against primary AND every alternate. Deviation = min of all.
    const allRoutes = [trip.primary, ...(trip.alternates || [])];
    let bestDist = Infinity;
    let bestRouteId = null;
    for (const rt of allRoutes) {
      const d = distanceToPolyline(lat, lng, rt.polyline);
      if (d < bestDist) { bestDist = d; bestRouteId = rt.id; }
    }

    const isDeviating = bestDist > threshold;
    const severity = bestDist > 1000 ? 'critical' : bestDist > 500 ? 'high' : bestDist > 250 ? 'medium' : 'low';

    if (isDeviating) {
      // Throttle admin alerts to once per 60s per user
      const now = Date.now();
      if (now - (trip.lastDeviationAlertAt || 0) > 60000) {
        trip.lastDeviationAlertAt = now;
        const io = req.app.get('io');
        if (io) {
          io.to('admins').emit('anomaly:alert', {
            type: 'route_deviation',
            severity,
            userId: req.user.id,
            userName: req.user.name,
            message: 'Route deviation: ' + Math.round(bestDist) + 'm off planned path',
            deviationMeters: Math.round(bestDist),
            lat, lng,
            destination: trip.destination,
            startedAt: trip.startedAt,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    res.json({
      active: true,
      deviationMeters: Math.round(bestDist),
      onRoute: !isDeviating,
      bestRouteId,
      severity,
      threshold,
    });
  } catch (err) {
    console.error('Deviation check error:', err);
    res.status(500).json({ error: 'Deviation check failed' });
  }
});

// POST /api/route/end
router.post('/end', auth, async (req, res) => {
  activeTrips.delete(req.user.id);
  res.json({ success: true });
});

// GET /api/route/active
router.get('/active', auth, async (req, res) => {
  const trip = activeTrips.get(req.user.id);
  res.json({ active: !!trip, trip: trip || null });
});

module.exports = router;
