const express = require('express');
const Location = require('../models/Location');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Haversine distance in meters
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (meters < 1000) return Math.round(meters) + ' m';
  return (meters / 1000).toFixed(1) + ' km';
}

// Real emergency services database — major Indian cities
const INDIA_EMERGENCY_SERVICES = [
  // === HYDERABAD ===
  { id: 'hyd-h1', name: 'Osmania General Hospital', type: 'hospital', lat: 17.3616, lng: 78.4747, phone: '040-24600146', city: 'Hyderabad', address: 'Afzalgunj, Hyderabad' },
  { id: 'hyd-h2', name: 'Gandhi Hospital', type: 'hospital', lat: 17.4010, lng: 78.4722, phone: '040-27505566', city: 'Hyderabad', address: 'Musheerabad, Secunderabad' },
  { id: 'hyd-h3', name: 'NIMS Hospital', type: 'hospital', lat: 17.3930, lng: 78.3940, phone: '040-23390202', city: 'Hyderabad', address: 'Punjagutta, Hyderabad' },
  { id: 'hyd-h4', name: 'Apollo Hospital Jubilee Hills', type: 'hospital', lat: 17.4156, lng: 78.4075, phone: '040-23607777', city: 'Hyderabad', address: 'Jubilee Hills, Hyderabad' },
  { id: 'hyd-h5', name: 'KIMS Hospital', type: 'hospital', lat: 17.3505, lng: 78.5508, phone: '040-44885000', city: 'Hyderabad', address: 'Minister Road, Secunderabad' },
  { id: 'hyd-p1', name: 'Hyderabad City Police HQ', type: 'police', lat: 17.3950, lng: 78.4754, phone: '100', city: 'Hyderabad', address: 'Purani Haveli, Hyderabad' },
  { id: 'hyd-p2', name: 'Abids Police Station', type: 'police', lat: 17.3920, lng: 78.4750, phone: '040-24532400', city: 'Hyderabad', address: 'Abids Road, Hyderabad' },
  { id: 'hyd-p3', name: 'Banjara Hills Police Station', type: 'police', lat: 17.4100, lng: 78.4460, phone: '040-23541491', city: 'Hyderabad', address: 'Road No 12, Banjara Hills' },
  { id: 'hyd-p4', name: 'Cyberabad Police Commissionerate', type: 'police', lat: 17.4435, lng: 78.3772, phone: '040-27853574', city: 'Hyderabad', address: 'Gachibowli, Hyderabad' },
  { id: 'hyd-f1', name: 'Hyderabad Fire Station Abids', type: 'fire', lat: 17.3900, lng: 78.4730, phone: '101', city: 'Hyderabad', address: 'Abids, Hyderabad' },
  { id: 'hyd-f2', name: 'Secunderabad Fire Station', type: 'fire', lat: 17.4340, lng: 78.5000, phone: '101', city: 'Hyderabad', address: 'Secunderabad' },
  { id: 'hyd-t1', name: 'TSIIC Tourist Info - Charminar', type: 'info', lat: 17.3616, lng: 78.4747, phone: '1363', city: 'Hyderabad', address: 'Near Charminar, Hyderabad' },
  { id: 'hyd-ph1', name: 'MedPlus Pharmacy (24x7)', type: 'pharmacy', lat: 17.4350, lng: 78.4480, phone: '040-67006700', city: 'Hyderabad', address: 'Ameerpet, Hyderabad' },
  { id: 'hyd-ph2', name: 'Apollo Pharmacy Banjara Hills', type: 'pharmacy', lat: 17.4120, lng: 78.4420, phone: '040-23558800', city: 'Hyderabad', address: 'Banjara Hills Road No 1' },
  // === DELHI ===
  { id: 'del-h1', name: 'AIIMS New Delhi', type: 'hospital', lat: 28.5672, lng: 77.2100, phone: '011-26588500', city: 'Delhi', address: 'Ansari Nagar, New Delhi' },
  { id: 'del-h2', name: 'Safdarjung Hospital', type: 'hospital', lat: 28.5687, lng: 77.2065, phone: '011-26707437', city: 'Delhi', address: 'Ring Road, New Delhi' },
  { id: 'del-h3', name: 'Ram Manohar Lohia Hospital', type: 'hospital', lat: 28.6267, lng: 77.2012, phone: '011-23365525', city: 'Delhi', address: 'Baba Kharak Singh Marg, New Delhi' },
  { id: 'del-h4', name: 'Sir Ganga Ram Hospital', type: 'hospital', lat: 28.6394, lng: 77.1913, phone: '011-25722233', city: 'Delhi', address: 'Rajinder Nagar, New Delhi' },
  { id: 'del-p1', name: 'Delhi Police HQ', type: 'police', lat: 28.6227, lng: 77.2416, phone: '100', city: 'Delhi', address: 'ITO, New Delhi' },
  { id: 'del-p2', name: 'Connaught Place Police Station', type: 'police', lat: 28.6315, lng: 77.2167, phone: '011-23741000', city: 'Delhi', address: 'Connaught Place, New Delhi' },
  { id: 'del-p3', name: 'Tourist Police Help Desk - Red Fort', type: 'police', lat: 28.6562, lng: 77.2410, phone: '011-23360160', city: 'Delhi', address: 'Near Red Fort, Old Delhi' },
  { id: 'del-f1', name: 'Delhi Fire Station Connaught Place', type: 'fire', lat: 28.6329, lng: 77.2195, phone: '101', city: 'Delhi', address: 'Connaught Place, New Delhi' },
  { id: 'del-t1', name: 'India Tourism Delhi Office', type: 'info', lat: 28.6266, lng: 77.2196, phone: '011-23320005', city: 'Delhi', address: 'Janpath, New Delhi' },
  // === MUMBAI ===
  { id: 'mum-h1', name: 'KEM Hospital', type: 'hospital', lat: 19.0006, lng: 72.8418, phone: '022-24136051', city: 'Mumbai', address: 'Parel, Mumbai' },
  { id: 'mum-h2', name: 'JJ Hospital', type: 'hospital', lat: 18.9631, lng: 72.8354, phone: '022-23735555', city: 'Mumbai', address: 'Byculla, Mumbai' },
  { id: 'mum-h3', name: 'Lilavati Hospital', type: 'hospital', lat: 19.0509, lng: 72.8294, phone: '022-26751000', city: 'Mumbai', address: 'Bandra West, Mumbai' },
  { id: 'mum-p1', name: 'Mumbai Police HQ', type: 'police', lat: 18.9367, lng: 72.8347, phone: '100', city: 'Mumbai', address: 'Crawford Market, Mumbai' },
  { id: 'mum-p2', name: 'Colaba Police Station', type: 'police', lat: 18.9067, lng: 72.8147, phone: '022-22822038', city: 'Mumbai', address: 'Colaba, Mumbai' },
  { id: 'mum-f1', name: 'Mumbai Fire Brigade HQ', type: 'fire', lat: 18.9440, lng: 72.8340, phone: '101', city: 'Mumbai', address: 'Byculla, Mumbai' },
  { id: 'mum-t1', name: 'MTDC Tourist Office', type: 'info', lat: 18.9256, lng: 72.8327, phone: '022-22044040', city: 'Mumbai', address: 'Near Gateway of India' },
  // === GOA ===
  { id: 'goa-h1', name: 'Goa Medical College Hospital', type: 'hospital', lat: 15.4095, lng: 73.8755, phone: '0832-2458727', city: 'Goa', address: 'Bambolim, Goa' },
  { id: 'goa-h2', name: 'Manipal Hospital Goa', type: 'hospital', lat: 15.3961, lng: 73.8814, phone: '0832-2882555', city: 'Goa', address: 'Dona Paula, Goa' },
  { id: 'goa-p1', name: 'Calangute Police Station', type: 'police', lat: 15.5437, lng: 73.7555, phone: '0832-2276043', city: 'Goa', address: 'Calangute, North Goa' },
  { id: 'goa-p2', name: 'Panjim Police Station', type: 'police', lat: 15.4989, lng: 73.8278, phone: '0832-2225816', city: 'Goa', address: 'Panjim, Goa' },
  { id: 'goa-t1', name: 'Goa Tourism GTDC', type: 'info', lat: 15.4960, lng: 73.8280, phone: '0832-2437132', city: 'Goa', address: 'Patto Plaza, Panjim' },
  { id: 'goa-f1', name: 'Fire & Emergency Panjim', type: 'fire', lat: 15.4966, lng: 73.8273, phone: '101', city: 'Goa', address: 'Panjim, Goa' },
  // === JAIPUR ===
  { id: 'jai-h1', name: 'SMS Hospital Jaipur', type: 'hospital', lat: 26.9071, lng: 75.8038, phone: '0141-2518373', city: 'Jaipur', address: 'JLN Marg, Jaipur' },
  { id: 'jai-p1', name: 'Jaipur Police Commissionerate', type: 'police', lat: 26.9124, lng: 75.7873, phone: '100', city: 'Jaipur', address: 'Lal Kothi, Jaipur' },
  { id: 'jai-p2', name: 'Hawa Mahal Tourist Police', type: 'police', lat: 26.9239, lng: 75.8267, phone: '0141-2610379', city: 'Jaipur', address: 'Near Hawa Mahal, Jaipur' },
  { id: 'jai-t1', name: 'RTDC Tourist Info Center', type: 'info', lat: 26.9160, lng: 75.8010, phone: '0141-5110598', city: 'Jaipur', address: 'MI Road, Jaipur' },
  // === VARANASI ===
  { id: 'var-h1', name: 'BHU Hospital (Sir Sunderlal)', type: 'hospital', lat: 25.2677, lng: 82.9913, phone: '0542-2307565', city: 'Varanasi', address: 'BHU Campus, Varanasi' },
  { id: 'var-p1', name: 'Varanasi Police', type: 'police', lat: 25.3176, lng: 83.0107, phone: '100', city: 'Varanasi', address: 'Sigra, Varanasi' },
  { id: 'var-p2', name: 'Tourist Police - Dashashwamedh Ghat', type: 'police', lat: 25.3109, lng: 83.0107, phone: '0542-2506170', city: 'Varanasi', address: 'Dashashwamedh Ghat' },
  { id: 'var-t1', name: 'UP Tourism Varanasi Office', type: 'info', lat: 25.3220, lng: 83.0068, phone: '0542-2501784', city: 'Varanasi', address: 'Varanasi Junction' },
  // === KERALA ===
  { id: 'ker-h1', name: 'Medical College Trivandrum', type: 'hospital', lat: 8.5132, lng: 76.9420, phone: '0471-2528386', city: 'Kerala', address: 'Thiruvananthapuram' },
  { id: 'ker-h2', name: 'Amrita Hospital Kochi', type: 'hospital', lat: 10.0261, lng: 76.3125, phone: '0484-2851234', city: 'Kerala', address: 'Edappally, Kochi' },
  { id: 'ker-p1', name: 'Kerala Tourism Police', type: 'police', lat: 8.5241, lng: 76.9366, phone: '100', city: 'Kerala', address: 'Thiruvananthapuram' },
  { id: 'ker-t1', name: 'KTDC Tourist Info Kovalam', type: 'info', lat: 8.3988, lng: 76.9783, phone: '0471-2480085', city: 'Kerala', address: 'Kovalam Beach' },
  // === AGRA ===
  { id: 'agr-h1', name: 'SN Medical College Hospital', type: 'hospital', lat: 27.1867, lng: 78.0095, phone: '0562-2526649', city: 'Agra', address: 'Hospital Road, Agra' },
  { id: 'agr-p1', name: 'Taj Ganj Police Post', type: 'police', lat: 27.1751, lng: 78.0421, phone: '0562-2330015', city: 'Agra', address: 'Near Taj Mahal, Agra' },
  { id: 'agr-p2', name: 'Tourist Police Agra', type: 'police', lat: 27.1751, lng: 78.0421, phone: '0562-2421204', city: 'Agra', address: 'Taj East Gate, Agra' },
  { id: 'agr-t1', name: 'UP Tourism Agra Office', type: 'info', lat: 27.1975, lng: 78.0145, phone: '0562-2226431', city: 'Agra', address: 'Taj Road, Agra' },
  // === RISHIKESH ===
  { id: 'rsh-h1', name: 'AIIMS Rishikesh', type: 'hospital', lat: 30.0669, lng: 78.3150, phone: '0135-2462960', city: 'Rishikesh', address: 'Virbhadra Road, Rishikesh' },
  { id: 'rsh-p1', name: 'Rishikesh Police Station', type: 'police', lat: 30.1086, lng: 78.2952, phone: '0135-2430220', city: 'Rishikesh', address: 'Rishikesh' },
  { id: 'rsh-t1', name: 'GMVN Tourist Office', type: 'info', lat: 30.1086, lng: 78.2952, phone: '0135-2430799', city: 'Rishikesh', address: 'Muni Ki Reti, Rishikesh' },
  // === MANALI ===
  { id: 'man-h1', name: 'Lady Willingdon Hospital', type: 'hospital', lat: 32.2432, lng: 77.1892, phone: '01902-252066', city: 'Manali', address: 'Manali' },
  { id: 'man-p1', name: 'Manali Police Station', type: 'police', lat: 32.2432, lng: 77.1892, phone: '01902-252012', city: 'Manali', address: 'Manali' },
  { id: 'man-t1', name: 'HPTDC Tourist Info', type: 'info', lat: 32.2432, lng: 77.1892, phone: '01902-252116', city: 'Manali', address: 'The Mall, Manali' },
];

const NATIONAL_HELPLINES = [
  { id: 'nat-1', name: 'National Emergency Number', type: 'emergency', phone: '112', description: 'All emergencies' },
  { id: 'nat-2', name: 'Police', type: 'police', phone: '100', description: 'Police emergency' },
  { id: 'nat-3', name: 'Ambulance', type: 'hospital', phone: '108', description: 'Free ambulance across India' },
  { id: 'nat-4', name: 'Fire', type: 'fire', phone: '101', description: 'Fire emergency' },
  { id: 'nat-5', name: 'Tourist Helpline (24x7)', type: 'info', phone: '1363', description: 'Ministry of Tourism India' },
  { id: 'nat-6', name: 'Women Helpline', type: 'emergency', phone: '1091', description: 'Women safety helpline' },
  { id: 'nat-7', name: 'Disaster Management', type: 'emergency', phone: '1078', description: 'NDMA' },
  { id: 'nat-8', name: 'Road Accident Emergency', type: 'emergency', phone: '1073', description: 'Highway accident response' },
];

router.post('/update', auth, async (req, res) => {
  try {
    const { lat, lng, accuracy, speed, heading } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });
    const entry = await Location.create({
      userId: req.user.id,
      userName: req.user.name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      accuracy: accuracy || null,
      speed: speed || null,
      heading: heading || null,
    });
    // Update user's lastLocation
    await User.findByIdAndUpdate(req.user.id, {
      lastLocation: { lat: entry.lat, lng: entry.lng, speed: entry.speed, timestamp: entry.timestamp },
    });
    res.json({ success: true, location: { ...entry.toObject(), id: entry._id.toString() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = await Location.find({ userId: req.user.id })
      .sort({ timestamp: -1 }).limit(limit).lean();
    res.json({ locations: history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/all-users', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const users = await User.find({ role: 'tourist' })
      .select('name email phone lastLocation isOnline')
      .lean();
    const mapped = users.map(u => ({ ...u, id: u._id.toString() }));
    res.json({ users: mapped });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Dynamic nearby services
router.get('/nearby-services', auth, (req, res) => {
  const userLat = parseFloat(req.query.lat) || 17.385;
  const userLng = parseFloat(req.query.lng) || 78.4867;
  const maxDistKm = parseFloat(req.query.radius) || 50;
  const typeFilter = req.query.type;

  let services = INDIA_EMERGENCY_SERVICES.map((s) => {
    const distMeters = getDistanceMeters(userLat, userLng, s.lat, s.lng);
    return { ...s, distanceMeters: distMeters, distance: formatDistance(distMeters) };
  });

  services = services.filter((s) => s.distanceMeters <= maxDistKm * 1000);
  if (typeFilter) services = services.filter((s) => s.type === typeFilter);
  services.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const topServices = services.slice(0, 20);

  res.json({
    services: topServices,
    total: topServices.length,
    nationalHelplines: NATIONAL_HELPLINES,
    searchRadius: maxDistKm + ' km',
    userLocation: { lat: userLat, lng: userLng },
  });
});

module.exports = router;
