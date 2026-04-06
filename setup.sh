#!/bin/bash
# WanderMate Full Project Setup Script
# Run from the wandermate/ root folder:
#   chmod +x setup.sh && ./setup.sh

set -e
echo "=== WanderMate Setup Script ==="
echo "Creating all project files..."

# ──────────────────────────────────────
# BACKEND
# ──────────────────────────────────────
mkdir -p backend/src/routes backend/src/middleware backend/src/config

# ── .env ──
cat > backend/.env << 'ENDOFFILE'
PORT=5000
JWT_SECRET=wandermate_secret_key_change_in_production
NODE_ENV=development
ENDOFFILE

# ── package.json ──
cat > backend/package.json << 'ENDOFFILE'
{
  "name": "wandermate-backend",
  "version": "1.0.0",
  "description": "WanderMate Backend API",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "socket.io": "^4.7.5",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.4"
  }
}
ENDOFFILE

# ── config/db.js ──
cat > backend/src/config/db.js << 'ENDOFFILE'
const db = {
  users: [],
  locations: [],
  alerts: [],
  geofences: [],
  blockchainLogs: [],
  incidents: [],
};

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

module.exports = { db, generateId };
ENDOFFILE

# ── middleware/auth.js ──
cat > backend/src/middleware/auth.js << 'ENDOFFILE'
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { auth, adminOnly };
ENDOFFILE

# ── routes/auth.js ──
cat > backend/src/routes/auth.js << 'ENDOFFILE'
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    const existing = db.users.find((u) => u.email === email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = {
      id: generateId(), name, email, password: hashedPassword,
      phone: phone || '', role: role === 'admin' ? 'admin' : 'tourist',
      createdAt: new Date().toISOString(), lastLocation: null, isOnline: false,
    };
    db.users.push(user);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET, { expiresIn: '7d' }
    );
    const { password: _, ...safeUser } = user;
    res.status(201).json({ user: safeUser, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = db.users.find((u) => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });
    user.isOnline = true;
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET, { expiresIn: '7d' }
    );
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.get('/me', auth, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...safeUser } = user;
  res.json({ user: safeUser });
});

module.exports = router;
ENDOFFILE

# ── routes/location.js ──
cat > backend/src/routes/location.js << 'ENDOFFILE'
const express = require('express');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.post('/update', auth, (req, res) => {
  try {
    const { lat, lng, accuracy } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng are required' });
    const entry = {
      id: generateId(), userId: req.user.id, userName: req.user.name,
      lat: parseFloat(lat), lng: parseFloat(lng), accuracy: accuracy || null,
      timestamp: new Date().toISOString(),
    };
    db.locations.push(entry);
    const user = db.users.find((u) => u.id === req.user.id);
    if (user) user.lastLocation = { lat: entry.lat, lng: entry.lng, timestamp: entry.timestamp };
    res.json({ success: true, location: entry });
  } catch (err) { res.status(500).json({ error: 'Failed to update location' }); }
});

router.get('/history', auth, (req, res) => {
  const history = db.locations.filter((l) => l.userId === req.user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 100);
  res.json({ locations: history });
});

router.get('/all-users', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const users = db.users.filter((u) => u.role === 'tourist' && u.lastLocation)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, lastLocation: u.lastLocation, isOnline: u.isOnline }));
  res.json({ users });
});

router.get('/nearby-services', auth, (req, res) => {
  const baseLat = parseFloat(req.query.lat) || 17.385;
  const baseLng = parseFloat(req.query.lng) || 78.4867;
  res.json({ services: [
    { id: 1, name: 'City General Hospital', type: 'hospital', lat: baseLat + 0.005, lng: baseLng + 0.003, phone: '108', distance: '0.6 km' },
    { id: 2, name: 'Central Police Station', type: 'police', lat: baseLat - 0.003, lng: baseLng + 0.006, phone: '100', distance: '0.7 km' },
    { id: 3, name: 'Fire & Rescue Station', type: 'fire', lat: baseLat + 0.008, lng: baseLng - 0.004, phone: '101', distance: '0.9 km' },
    { id: 4, name: 'Tourist Info Center', type: 'info', lat: baseLat - 0.002, lng: baseLng - 0.005, phone: '1363', distance: '0.5 km' },
    { id: 5, name: 'Pharmacy 24x7', type: 'pharmacy', lat: baseLat + 0.001, lng: baseLng + 0.008, phone: '+91-9876543210', distance: '0.8 km' },
  ]});
});

module.exports = router;
ENDOFFILE

# ── routes/alerts.js ──
cat > backend/src/routes/alerts.js << 'ENDOFFILE'
const express = require('express');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

router.post('/sos', auth, (req, res) => {
  try {
    const { lat, lng, message, type } = req.body;
    const alert = {
      id: generateId(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
      type: type || 'sos', message: message || 'Emergency SOS triggered!',
      lat: parseFloat(lat) || null, lng: parseFloat(lng) || null,
      status: 'active', priority: type === 'sos' ? 'critical' : 'high',
      createdAt: new Date().toISOString(), resolvedAt: null, resolvedBy: null,
    };
    db.alerts.push(alert);
    res.status(201).json({ success: true, alert });
  } catch (err) { res.status(500).json({ error: 'Failed to create SOS alert' }); }
});

router.get('/', auth, (req, res) => {
  let alerts = req.user.role === 'admin'
    ? db.alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : db.alerts.filter((a) => a.userId === req.user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ alerts });
});

router.patch('/:id/resolve', auth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const alert = db.alerts.find((a) => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  alert.resolvedBy = req.user.name;
  res.json({ success: true, alert });
});

router.post('/batch', auth, (req, res) => {
  try {
    const { alerts: offlineAlerts } = req.body;
    if (!Array.isArray(offlineAlerts)) return res.status(400).json({ error: 'alerts must be an array' });
    const created = [];
    for (const a of offlineAlerts) {
      const alert = {
        id: generateId(), userId: req.user.id, userName: req.user.name, userEmail: req.user.email,
        type: a.type || 'sos', message: a.message || 'Offline SOS alert',
        lat: a.lat || null, lng: a.lng || null, status: 'active', priority: 'critical',
        createdAt: a.createdAt || new Date().toISOString(), resolvedAt: null, resolvedBy: null, offlineSync: true,
      };
      db.alerts.push(alert);
      created.push(alert);
    }
    res.status(201).json({ success: true, synced: created.length, alerts: created });
  } catch (err) { res.status(500).json({ error: 'Failed to sync alerts' }); }
});

module.exports = router;
ENDOFFILE

# ── routes/geofence.js ──
cat > backend/src/routes/geofence.js << 'ENDOFFILE'
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

if (db.geofences.length === 0) {
  db.geofences.push(
    { id: generateId(), name: 'Flood-Prone River Zone', lat: 17.39, lng: 78.49, radius: 500, riskLevel: 'high', description: 'Flash flood risk area.', createdBy: 'system', active: true },
    { id: generateId(), name: 'Wildlife Sanctuary Buffer', lat: 17.375, lng: 78.475, radius: 800, riskLevel: 'medium', description: 'Wild animal sightings.', createdBy: 'system', active: true },
    { id: generateId(), name: 'Restricted Heritage Site', lat: 17.362, lng: 78.474, radius: 300, riskLevel: 'low', description: 'Protected heritage area.', createdBy: 'system', active: true },
    { id: generateId(), name: 'Night Unsafe Zone', lat: 17.395, lng: 78.505, radius: 600, riskLevel: 'high', description: 'Unsafe after dark.', createdBy: 'system', active: true }
  );
}

router.get('/', auth, (req, res) => {
  res.json({ geofences: db.geofences.filter((g) => g.active) });
});

router.post('/', auth, adminOnly, (req, res) => {
  const { name, lat, lng, radius, riskLevel, description } = req.body;
  if (!name || !lat || !lng || !radius) return res.status(400).json({ error: 'name, lat, lng, radius required' });
  const geofence = { id: generateId(), name, lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius), riskLevel: riskLevel || 'medium', description: description || '', createdBy: req.user.name, active: true };
  db.geofences.push(geofence);
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
  res.json({ insideGeofence: violations.length > 0, violations });
});

router.delete('/:id', auth, adminOnly, (req, res) => {
  const fence = db.geofences.find((g) => g.id === req.params.id);
  if (!fence) return res.status(404).json({ error: 'Geofence not found' });
  fence.active = false;
  res.json({ success: true });
});

module.exports = router;
ENDOFFILE

# ── routes/anomaly.js ──
cat > backend/src/routes/anomaly.js << 'ENDOFFILE'
const express = require('express');
const { db } = require('../config/db');
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

router.post('/check', auth, (req, res) => {
  const targetId = req.body.userId || req.user.id;
  const locations = db.locations.filter((l) => l.userId === targetId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const anomalies = [];

  if (locations.length >= 2) {
    const last = locations[locations.length - 1];
    const prev = locations[locations.length - 2];
    const timeDiff = (new Date(last.timestamp) - new Date(prev.timestamp)) / 60000;
    const dist = getDistanceMeters(last.lat, last.lng, prev.lat, prev.lng);
    if (timeDiff > 30 && dist < 50) anomalies.push({ type: 'stationary', severity: 'medium', message: 'User stationary for ' + Math.round(timeDiff) + ' minutes' });
    const timeDiffH = timeDiff / 60;
    if (timeDiffH > 0) {
      const speed = (dist / 1000) / timeDiffH;
      if (speed > 120) anomalies.push({ type: 'erratic_movement', severity: 'high', message: 'Unusual speed: ' + Math.round(speed) + ' km/h' });
    }
  }

  if (locations.length > 0) {
    const last = locations[locations.length - 1];
    for (const fence of db.geofences.filter((g) => g.active)) {
      if (getDistanceMeters(last.lat, last.lng, fence.lat, fence.lng) <= fence.radius)
        anomalies.push({ type: 'geofence_violation', severity: fence.riskLevel === 'high' ? 'critical' : 'medium', message: 'Inside: ' + fence.name });
    }
    const hour = new Date(last.timestamp).getHours();
    if (hour >= 23 || hour < 5) anomalies.push({ type: 'late_night', severity: 'low', message: 'Late night activity (11PM-5AM)' });
  }

  const recentSOS = db.alerts.filter((a) => a.userId === targetId && a.type === 'sos' && (new Date() - new Date(a.createdAt)) < 3600000);
  if (recentSOS.length > 2) anomalies.push({ type: 'frequent_sos', severity: 'critical', message: recentSOS.length + ' SOS in last hour' });

  res.json({ userId: targetId, anomalies, anomalyCount: anomalies.length, checkedAt: new Date().toISOString() });
});

module.exports = router;
ENDOFFILE

# ── routes/blockchain.js ──
cat > backend/src/routes/blockchain.js << 'ENDOFFILE'
const express = require('express');
const crypto = require('crypto');
const { db, generateId } = require('../config/db');
const { auth } = require('../middleware/auth');
const router = express.Router();

function createHash(data) { return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'); }

router.post('/digital-id', auth, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existing = db.blockchainLogs.find((b) => b.userId === req.user.id && b.type === 'digital_id');
  if (existing) return res.json({ digitalId: existing });
  const prevHash = db.blockchainLogs.length > 0 ? db.blockchainLogs[db.blockchainLogs.length - 1].hash : '0'.repeat(64);
  const blockData = { index: db.blockchainLogs.length + 1, type: 'digital_id', userId: user.id, userName: user.name, userEmail: user.email, userPhone: user.phone, issuedAt: new Date().toISOString(), previousHash: prevHash };
  const hash = createHash(blockData);
  const block = { ...blockData, id: generateId(), hash, verified: true };
  db.blockchainLogs.push(block);
  res.status(201).json({ digitalId: block });
});

router.post('/log', auth, (req, res) => {
  const { action, details } = req.body;
  if (!action) return res.status(400).json({ error: 'action required' });
  const prevHash = db.blockchainLogs.length > 0 ? db.blockchainLogs[db.blockchainLogs.length - 1].hash : '0'.repeat(64);
  const blockData = { index: db.blockchainLogs.length + 1, type: 'log', userId: req.user.id, userName: req.user.name, action, details: details || '', timestamp: new Date().toISOString(), previousHash: prevHash };
  const hash = createHash(blockData);
  const block = { ...blockData, id: generateId(), hash };
  db.blockchainLogs.push(block);
  res.status(201).json({ success: true, block });
});

router.get('/logs', auth, (req, res) => {
  const logs = req.user.role === 'admin' ? db.blockchainLogs : db.blockchainLogs.filter((b) => b.userId === req.user.id);
  res.json({ logs, chainLength: logs.length });
});

router.get('/verify', auth, (req, res) => {
  let valid = true;
  for (let i = 1; i < db.blockchainLogs.length; i++) {
    if (db.blockchainLogs[i].previousHash !== db.blockchainLogs[i - 1].hash) { valid = false; break; }
  }
  res.json({ valid, blocksChecked: db.blockchainLogs.length });
});

module.exports = router;
ENDOFFILE

# ── server.js ──
cat > backend/src/server.js << 'ENDOFFILE'
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/location', require('./routes/location'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/geofence', require('./routes/geofence'));
app.use('/api/blockchain', require('./routes/blockchain'));
app.use('/api/anomaly', require('./routes/anomaly'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'WanderMate API running', timestamp: new Date().toISOString() });
});

const connectedUsers = new Map();
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('user:join', (userData) => {
    connectedUsers.set(socket.id, userData);
    socket.join('user:' + userData.id);
    if (userData.role === 'admin') socket.join('admins');
    io.to('admins').emit('user:online', { ...userData, socketId: socket.id });
  });
  socket.on('location:update', (data) => { io.to('admins').emit('location:live', { ...data, timestamp: new Date().toISOString() }); });
  socket.on('sos:trigger', (data) => {
    console.log('SOS from', data.userName);
    io.to('admins').emit('sos:received', { ...data, receivedAt: new Date().toISOString() });
    socket.emit('sos:acknowledged', { message: 'SOS received by authorities' });
  });
  socket.on('alert:resolve', (data) => { io.to('user:' + data.userId).emit('alert:resolved', { alertId: data.alertId, resolvedBy: data.resolvedBy, message: 'Alert acknowledged by authorities' }); });
  socket.on('geofence:violation', (data) => { io.to('admins').emit('geofence:alert', { ...data, timestamp: new Date().toISOString() }); });
  socket.on('anomaly:detected', (data) => { io.to('admins').emit('anomaly:alert', { ...data, timestamp: new Date().toISOString() }); });
  socket.on('disconnect', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) { io.to('admins').emit('user:offline', { userId: userData.id, name: userData.name }); connectedUsers.delete(socket.id); }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('WanderMate Backend running on http://localhost:' + PORT);
  console.log('Socket.io ready');
});

module.exports = { app, server, io };
ENDOFFILE

echo ""
echo "=== Backend files created ==="
echo ""

# ──────────────────────────────────────
# FRONTEND
# ──────────────────────────────────────
mkdir -p frontend/src/context frontend/src/utils frontend/src/services frontend/src/components frontend/src/pages frontend/public

# ── frontend/src/context/AuthContext.jsx ──
cat > frontend/src/context/AuthContext.jsx << 'ENDOFFILE'
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('wandermate_token');
    const savedUser = localStorage.getItem('wandermate_user');
    if (savedToken && savedUser) { setToken(savedToken); setUser(JSON.parse(savedUser)); }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: u, token: t } = res.data;
    setUser(u); setToken(t);
    localStorage.setItem('wandermate_token', t);
    localStorage.setItem('wandermate_user', JSON.stringify(u));
    return u;
  };

  const register = async (name, email, password, phone, role) => {
    const res = await api.post('/auth/register', { name, email, password, phone, role });
    const { user: u, token: t } = res.data;
    setUser(u); setToken(t);
    localStorage.setItem('wandermate_token', t);
    localStorage.setItem('wandermate_user', JSON.stringify(u));
    return u;
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('wandermate_token');
    localStorage.removeItem('wandermate_user');
  };

  return <AuthContext.Provider value={{ user, token, loading, login, register, logout, isAuthenticated: !!token }}>{children}</AuthContext.Provider>;
};
ENDOFFILE

# ── frontend/src/components/ProtectedRoute.jsx ──
cat > frontend/src/components/ProtectedRoute.jsx << 'ENDOFFILE'
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}><p>Loading...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && user?.role !== requiredRole) return <Navigate to="/dashboard" replace />;
  return children;
};

export default ProtectedRoute;
ENDOFFILE

# ── frontend/src/services/socket.js ──
cat > frontend/src/services/socket.js << 'ENDOFFILE'
import { io } from 'socket.io-client';
const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
let socket = null;

export const connectSocket = (user) => {
  if (socket?.connected) return socket;
  socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
  socket.on('connect', () => { socket.emit('user:join', { id: user.id, name: user.name, email: user.email, role: user.role }); });
  return socket;
};
export const getSocket = () => socket;
export const disconnectSocket = () => { if (socket) { socket.disconnect(); socket = null; } };
ENDOFFILE

# ── frontend/src/utils/offline.js ──
cat > frontend/src/utils/offline.js << 'ENDOFFILE'
const KEY = 'wandermate_offline_alerts';
export const isOnline = () => navigator.onLine;
export const saveOfflineAlert = (alert) => {
  const q = getOfflineQueue();
  q.push({ ...alert, createdAt: new Date().toISOString(), offlineId: Date.now().toString(36) });
  try { window.localStorage.setItem(KEY, JSON.stringify(q)); } catch(e) {}
};
export const getOfflineQueue = () => { try { const d = window.localStorage.getItem(KEY); return d ? JSON.parse(d) : []; } catch { return []; } };
export const clearOfflineQueue = () => { try { window.localStorage.removeItem(KEY); } catch(e) {} };
export const syncOfflineAlerts = async (api) => {
  const q = getOfflineQueue();
  if (q.length === 0) return { synced: 0 };
  try { const r = await api.post('/alerts/batch', { alerts: q }); clearOfflineQueue(); return { synced: r.data.synced }; }
  catch(e) { return { synced: 0, error: e.message }; }
};
ENDOFFILE

# ── frontend/src/pages/Login.jsx ──
cat > frontend/src/pages/Login.jsx << 'ENDOFFILE'
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const u = await login(email, password); navigate(u.role === 'admin' ? '/admin' : '/dashboard'); }
    catch (err) { setError(err.response?.data?.error || 'Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8"><h2 className="text-2xl font-bold text-gray-800">Welcome Back</h2><p className="text-gray-500 text-sm mt-1">Sign in to WanderMate</p></div>
        {error && <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Signing In...' : 'Sign In'}</button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">No account? <Link to="/register" className="text-blue-600 font-medium hover:underline">Register</Link></p>
      </div>
    </div>
  );
};
export default Login;
ENDOFFILE

# ── frontend/src/pages/Register.jsx ──
cat > frontend/src/pages/Register.jsx << 'ENDOFFILE'
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'tourist' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { const u = await register(form.name, form.email, form.password, form.phone, form.role); navigate(u.role === 'admin' ? '/admin' : '/dashboard'); }
    catch (err) { setError(err.response?.data?.error || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8"><h2 className="text-2xl font-bold text-gray-800">Create Account</h2><p className="text-gray-500 text-sm mt-1">Join WanderMate</p></div>
        {error && <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Full Name" required />
          <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Email" required />
          <input type="password" name="password" value={form.password} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Password (min 6)" required minLength={6} />
          <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg" placeholder="Phone (optional)" />
          <select name="role" value={form.role} onChange={handleChange} className="w-full px-4 py-3 border rounded-lg">
            <option value="tourist">Tourist</option><option value="admin">Admin / Authority</option>
          </select>
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create Account'}</button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-6">Have an account? <Link to="/login" className="text-blue-600 font-medium hover:underline">Sign In</Link></p>
      </div>
    </div>
  );
};
export default Register;
ENDOFFILE

echo "=== Frontend auth + utils files created ==="

# ──────────────────────────────────────
# VERIFY
# ──────────────────────────────────────

# ──────────────────────────────────────
# FRONTEND — MISSING FILES
# ──────────────────────────────────────
mkdir -p frontend/public frontend/src/pages frontend/src/components frontend/src/services frontend/src/context frontend/src/utils

# ── frontend/package.json ──
cat > frontend/package.json << 'ENDOFFILE'
{
  "name": "wandermate-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "react-scripts": "5.0.1",
    "axios": "^1.7.4",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "socket.io-client": "^4.7.5"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  },
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
  }
}
ENDOFFILE

# ── frontend/public/index.html ──
cat > frontend/public/index.html << 'ENDOFFILE'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1e40af" />
    <meta name="description" content="WanderMate - Smart Tourist Safety Monitoring & Incident Response System" />
    <title>WanderMate - Explore More, Worry Less</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
      crossorigin=""
    />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              primary: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
              danger: { 50: '#fef2f2', 100: '#fee2e2', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
              success: { 50: '#f0fdf4', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
              warning: { 50: '#fffbeb', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
            }
          }
        }
      }
    </script>
  </head>
  <body class="bg-gray-50">
    <noscript>You need to enable JavaScript to run WanderMate.</noscript>
    <div id="root"></div>
  </body>
</html>
ENDOFFILE

# ── frontend/src/index.js ──
cat > frontend/src/index.js << 'ENDOFFILE'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
ENDOFFILE

# ── frontend/src/App.js ──
cat > frontend/src/App.js << 'ENDOFFILE'
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
ENDOFFILE

# ── frontend/src/services/api.js ──
cat > frontend/src/services/api.js << 'ENDOFFILE'
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wandermate_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('wandermate_token');
      localStorage.removeItem('wandermate_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
ENDOFFILE

# ── frontend/src/components/Navbar.jsx ──
cat > frontend/src/components/Navbar.jsx << 'ENDOFFILE'
import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <nav className="bg-primary-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-2xl">🛡️</span>
            <span className="text-xl font-bold tracking-tight">WanderMate</span>
          </Link>
          <div className="flex items-center space-x-4">
            <Link
              to="/login"
              className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="px-4 py-2 bg-white text-primary-800 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
ENDOFFILE

# ── frontend/src/pages/Home.jsx ──
cat > frontend/src/pages/Home.jsx << 'ENDOFFILE'
import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <div className="text-6xl mb-6">🛡️</div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
            WanderMate
          </h1>
          <p className="text-xl md:text-2xl text-primary-200 mb-2">
            Explore More — Worry Less
          </p>
          <p className="text-md text-primary-300 max-w-2xl mx-auto mb-10">
            Smart Tourist Safety Monitoring & Incident Response System powered by
            AI, Geo-Fencing & Blockchain Digital ID
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="px-8 py-3 bg-white text-primary-800 font-bold rounded-xl text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl"
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 border-2 border-white text-white font-bold rounded-xl text-lg hover:bg-white hover:text-primary-800 transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '🚨',
              title: 'SOS Panic Button',
              desc: 'Instant emergency alerts with location, audio & video evidence sent to authorities in real-time.',
            },
            {
              icon: '📍',
              title: 'Live Geo-Tracking',
              desc: 'Real-time location monitoring with geo-fence alerts when entering restricted or danger zones.',
            },
            {
              icon: '🤖',
              title: 'AI Anomaly Detection',
              desc: 'Rule-based AI detects unusual patterns — stationary too long, entering risk zones, or erratic movement.',
            },
            {
              icon: '🔗',
              title: 'Blockchain Digital ID',
              desc: 'Tamper-proof tourist identity with immutable logs for secure verification by authorities.',
            },
            {
              icon: '📡',
              title: 'Offline Support',
              desc: 'Works without internet — stores alerts locally and syncs automatically when reconnected.',
            },
            {
              icon: '🏥',
              title: 'Nearby Services',
              desc: 'Find closest hospitals, police stations, and emergency services on the map instantly.',
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-primary-200 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 py-6 text-center text-primary-300 text-sm">
        WanderMate © 2025 — Team WanderBytes | Smart India Hackathon
      </div>
    </div>
  );
};

export default Home;
ENDOFFILE


# ── frontend/src/pages/Dashboard.jsx ──
cat > frontend/src/pages/Dashboard.jsx << 'ENDOFFILE'
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import { isOnline, saveOfflineAlert, getOfflineQueue, syncOfflineAlerts } from '../utils/offline';
import api from '../services/api';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const serviceMarkersRef = useRef([]);
  const geofenceCirclesRef = useRef([]);
  const [location, setLocation] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [services, setServices] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [geofenceWarning, setGeofenceWarning] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [digitalId, setDigitalId] = useState(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [networkStatus, setNetworkStatus] = useState(navigator.onLine);
  const [resolvedNotif, setResolvedNotif] = useState(null);
  const [activeTab, setActiveTab] = useState('map');

  useEffect(() => {
    if (user) {
      const socket = connectSocket(user);
      socket.on('sos:acknowledged', (data) => {
        console.log('SOS Acknowledged:', data.message);
      });
      socket.on('alert:resolved', (data) => {
        setResolvedNotif(data.message);
        setTimeout(() => setResolvedNotif(null), 5000);
        loadAlerts();
      });
    }
    return () => disconnectSocket();
  }, [user]);

  useEffect(() => {
    const handleOnline = async () => {
      setNetworkStatus(true);
      const result = await syncOfflineAlerts(api);
      if (result.synced > 0) {
        setOfflineCount(0);
        loadAlerts();
      }
    };
    const handleOffline = () => setNetworkStatus(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOfflineCount(getOfflineQueue().length);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;
    const map = L.map(mapRef.current).setView([17.385, 78.4867], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [activeTab]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setLocation(loc);
        updateLocationOnMap(loc);
        sendLocationToServer(loc);
        checkGeofences(loc);
      },
      (err) => {
        console.error('Geolocation error:', err);
        const fallback = { lat: 17.385, lng: 78.4867, accuracy: 100 };
        setLocation(fallback);
        updateLocationOnMap(fallback);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const updateLocationOnMap = useCallback((loc) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([loc.lat, loc.lng]);
    } else {
      const icon = L.divIcon({
        html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(0,0,0,0.3)"></div>',
        iconSize: [16, 16],
        className: '',
      });
      markerRef.current = L.marker([loc.lat, loc.lng], { icon }).addTo(mapInstance.current);
      markerRef.current.bindPopup('<b>You are here</b>');
      mapInstance.current.setView([loc.lat, loc.lng], 15);
    }
  }, []);

  const sendLocationToServer = async (loc) => {
    try {
      if (isOnline()) {
        await api.post('/location/update', loc);
        const socket = getSocket();
        if (socket) {
          socket.emit('location:update', { userId: user.id, userName: user.name, ...loc });
        }
      }
    } catch (err) {
      console.error('Failed to send location:', err);
    }
  };

  const checkGeofences = async (loc) => {
    try {
      if (!isOnline()) return;
      const res = await api.post('/geofence/check', { lat: loc.lat, lng: loc.lng });
      if (res.data.insideGeofence) {
        const violation = res.data.violations[0];
        setGeofenceWarning(violation);
        const socket = getSocket();
        if (socket) {
          socket.emit('geofence:violation', {
            userId: user.id, userName: user.name,
            geofence: violation.name, riskLevel: violation.riskLevel,
            lat: loc.lat, lng: loc.lng,
          });
        }
      } else {
        setGeofenceWarning(null);
      }
    } catch (err) {
      console.error('Geofence check error:', err);
    }
  };

  const loadAlerts = async () => {
    try { const res = await api.get('/alerts'); setAlerts(res.data.alerts || []); } catch {}
  };

  const loadGeofences = async () => {
    try {
      const res = await api.get('/geofence');
      setGeofences(res.data.geofences || []);
      renderGeofencesOnMap(res.data.geofences);
    } catch {}
  };

  const loadServices = async () => {
    try {
      const lat = location?.lat || 17.385;
      const lng = location?.lng || 78.4867;
      const res = await api.get('/location/nearby-services?lat=' + lat + '&lng=' + lng);
      setServices(res.data.services || []);
      renderServicesOnMap(res.data.services);
    } catch {}
  };

  const loadDigitalId = async () => {
    try { const res = await api.post('/blockchain/digital-id'); setDigitalId(res.data.digitalId); } catch {}
  };

  const checkAnomalies = async () => {
    try { const res = await api.post('/anomaly/check', { userId: user.id }); setAnomalies(res.data.anomalies || []); } catch {}
  };

  useEffect(() => {
    loadAlerts();
    loadGeofences();
    loadDigitalId();
    const interval = setInterval(() => { checkAnomalies(); }, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderGeofencesOnMap = (fences) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    geofenceCirclesRef.current.forEach((c) => c.remove());
    geofenceCirclesRef.current = [];
    fences.forEach((f) => {
      const color = f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6';
      const circle = L.circle([f.lat, f.lng], { radius: f.radius, color, fillColor: color, fillOpacity: 0.15, weight: 2 })
        .addTo(mapInstance.current);
      circle.bindPopup('<b>' + f.name + '</b><br>Risk: ' + f.riskLevel + '<br>' + f.description);
      geofenceCirclesRef.current.push(circle);
    });
  };

  const renderServicesOnMap = (svcs) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    serviceMarkersRef.current.forEach((m) => m.remove());
    serviceMarkersRef.current = [];
    const icons = { hospital: '&#x1f3e5;', police: '&#x1f46e;', fire: '&#x1f692;', info: '&#x2139;&#xfe0f;', pharmacy: '&#x1f48a;' };
    svcs.forEach((s) => {
      const icon = L.divIcon({
        html: '<div style="font-size:20px;text-align:center">' + (icons[s.type] || 'Pin') + '</div>',
        iconSize: [28, 28], className: '',
      });
      const marker = L.marker([s.lat, s.lng], { icon }).addTo(mapInstance.current);
      marker.bindPopup('<b>' + s.name + '</b><br>Phone: ' + s.phone + '<br>' + s.distance);
      serviceMarkersRef.current.push(marker);
    });
  };

  const handleSOS = async () => {
    setSosActive(true);
    const alertData = {
      type: 'sos',
      message: 'Emergency SOS triggered!',
      lat: location?.lat,
      lng: location?.lng,
    };

    if (isOnline()) {
      try {
        await api.post('/alerts/sos', alertData);
        const socket = getSocket();
        if (socket) {
          socket.emit('sos:trigger', { ...alertData, userId: user.id, userName: user.name });
        }
        await api.post('/blockchain/log', { action: 'SOS_TRIGGERED', details: 'SOS at ' + (location?.lat?.toFixed(4)) + ', ' + (location?.lng?.toFixed(4)) });
        loadAlerts();
      } catch (err) {
        console.error('SOS API error:', err);
      }
    } else {
      saveOfflineAlert(alertData);
      setOfflineCount(getOfflineQueue().length);
    }

    setTimeout(() => setSosActive(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center space-x-2">
            <span className="text-xl">&#x1f6e1;&#xfe0f;</span>
            <span className="font-bold">WanderMate</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className={'inline-block w-2 h-2 rounded-full ' + (networkStatus ? 'bg-green-400' : 'bg-red-400')}></span>
            <span className="text-sm">{user?.name}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="text-sm bg-white/20 px-3 py-1 rounded hover:bg-white/30">Logout</button>
          </div>
        </div>
      </nav>

      {geofenceWarning && (
        <div className="bg-red-600 text-white px-4 py-3 text-center font-medium animate-pulse">
          WARNING: You are inside a restricted zone — <b>{geofenceWarning.name}</b> (Risk: {geofenceWarning.riskLevel})
        </div>
      )}

      {resolvedNotif && (
        <div className="bg-green-600 text-white px-4 py-3 text-center font-medium">{resolvedNotif}</div>
      )}

      {offlineCount > 0 && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm">
          {offlineCount} offline alert(s) pending sync. Will sync when back online.
        </div>
      )}

      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex space-x-1 overflow-x-auto">
          {[
            { key: 'map', label: 'Map' },
            { key: 'alerts', label: 'Alerts' },
            { key: 'id', label: 'Digital ID' },
            { key: 'services', label: 'Services' },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ' +
                (activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="mb-4">
          <button onClick={handleSOS} disabled={sosActive}
            className={'w-full py-4 rounded-2xl text-white text-xl font-extrabold shadow-lg transition-all ' +
              (sosActive ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-95 hover:shadow-xl')}>
            {sosActive ? 'SOS SENT — Help is on the way!' : 'SOS — EMERGENCY PANIC BUTTON'}
          </button>
        </div>

        {activeTab === 'map' && (
          <div>
            <div ref={mapRef} className="w-full h-96 rounded-2xl shadow-lg border border-gray-200 z-0" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={loadServices} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Show Nearby Services</button>
              <button onClick={loadGeofences} className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600">Show Risk Zones</button>
              <button onClick={checkAnomalies} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">Run AI Check</button>
            </div>
            {location && (
              <p className="text-xs text-gray-400 mt-2">Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)} | Accuracy: +/-{Math.round(location.accuracy || 0)}m</p>
            )}
            {anomalies.length > 0 && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
                <h3 className="font-bold text-purple-800 mb-2">AI Anomaly Detection Results</h3>
                {anomalies.map((a, i) => (
                  <div key={i} className={'p-3 rounded-lg mb-2 text-sm ' +
                    (a.severity === 'critical' ? 'bg-red-100 text-red-800' :
                     a.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                     a.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800')}>
                    <span className="font-medium">[{a.severity.toUpperCase()}]</span> {a.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800">Your Alerts</h2>
            {alerts.length === 0 ? (
              <p className="text-gray-500 text-sm">No alerts yet. Stay safe!</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={'p-4 rounded-xl border ' + (a.status === 'active' ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200')}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={'text-xs font-bold px-2 py-1 rounded ' + (a.status === 'active' ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800')}>
                        {a.status === 'active' ? 'ACTIVE' : 'RESOLVED'}
                      </span>
                      <p className="mt-2 text-sm text-gray-700">{a.message}</p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                  {a.resolvedBy && <p className="text-xs text-green-600 mt-1">Resolved by {a.resolvedBy}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'id' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Blockchain Digital Tourist ID</h2>
            {digitalId ? (
              <div className="bg-gradient-to-br from-blue-800 to-blue-600 text-white rounded-2xl p-6 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-blue-200">DIGITAL TOURIST ID</p>
                    <h3 className="text-2xl font-bold mt-1">{digitalId.userName}</h3>
                    <p className="text-sm text-blue-200 mt-1">{digitalId.userEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-blue-200">Block #{digitalId.index}</p>
                    <span className="inline-block mt-1 bg-green-500 text-white text-xs px-2 py-1 rounded">VERIFIED</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/20 space-y-1">
                  <p className="text-xs"><span className="text-blue-300">Hash:</span> {digitalId.hash?.substring(0, 32)}...</p>
                  <p className="text-xs"><span className="text-blue-300">Previous:</span> {digitalId.previousHash?.substring(0, 32)}...</p>
                  <p className="text-xs"><span className="text-blue-300">Issued:</span> {new Date(digitalId.issuedAt).toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <button onClick={loadDigitalId} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl">Generate Digital ID</button>
            )}
          </div>
        )}

        {activeTab === 'services' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Nearby Emergency Services</h2>
              <button onClick={loadServices} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
            </div>
            <div className="grid gap-3">
              {services.length === 0 ? (
                <button onClick={loadServices} className="p-8 bg-gray-100 rounded-xl text-gray-500 hover:bg-gray-200">Click to load nearby services</button>
              ) : (
                services.map((s) => (
                  <div key={s.id} className="bg-white p-4 rounded-xl border shadow-sm flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-800">{s.name}</h4>
                      <p className="text-sm text-gray-500">{s.type} - {s.distance}</p>
                    </div>
                    <a href={'tel:' + s.phone} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                      Call {s.phone}
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
ENDOFFILE


# ── frontend/src/pages/AdminDashboard.jsx ──
cat > frontend/src/pages/AdminDashboard.jsx << 'ENDOFFILE'
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { connectSocket, disconnectSocket } from '../services/socket';
import api from '../services/api';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const userMarkersRef = useRef({});
  const geofenceCirclesRef = useRef([]);
  const [alerts, setAlerts] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [blockchainLogs, setBlockchainLogs] = useState([]);
  const [chainValid, setChainValid] = useState(null);
  const [stats, setStats] = useState({ totalAlerts: 0, active: 0, resolved: 0, users: 0 });
  const [activeTab, setActiveTab] = useState('overview');
  const [newFence, setNewFence] = useState({ name: '', lat: '', lng: '', radius: 500, riskLevel: 'medium', description: '' });

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket(user);
    socket.on('sos:received', (alertData) => {
      setLiveAlerts((prev) => [alertData, ...prev].slice(0, 50));
      loadAlerts();
      playAlertSound();
    });
    socket.on('location:live', (data) => { updateUserOnMap(data); });
    socket.on('user:online', (userData) => {
      setOnlineUsers((prev) => {
        const filtered = prev.filter((u) => u.id !== userData.id);
        return [...filtered, userData];
      });
    });
    socket.on('user:offline', (data) => {
      setOnlineUsers((prev) => prev.filter((u) => u.id !== data.userId));
      removeUserFromMap(data.userId);
    });
    socket.on('geofence:alert', (data) => {
      setLiveAlerts((prev) => [
        { ...data, type: 'geofence', message: 'Geofence violation: ' + data.userName + ' entered ' + data.geofence },
        ...prev,
      ].slice(0, 50));
    });
    socket.on('anomaly:alert', (data) => {
      setLiveAlerts((prev) => [
        { ...data, type: 'anomaly', message: 'Anomaly detected for ' + data.userName },
        ...prev,
      ].slice(0, 50));
    });
    return () => disconnectSocket();
  }, [user]);

  const playAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 300);
    } catch (e) {}
  };

  useEffect(() => {
    if (activeTab !== 'map' || !mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;
    const map = L.map(mapRef.current).setView([17.385, 78.4867], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    mapInstance.current = map;
    loadGeofences();
    loadAllUsers();
    return () => { map.remove(); mapInstance.current = null; };
  }, [activeTab]);

  const updateUserOnMap = useCallback((data) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    if (userMarkersRef.current[data.userId]) {
      userMarkersRef.current[data.userId].setLatLng([data.lat, data.lng]);
    } else {
      const icon = L.divIcon({
        html: '<div style="background:#22c55e;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [12, 12], className: '',
      });
      const marker = L.marker([data.lat, data.lng], { icon }).addTo(mapInstance.current);
      marker.bindPopup('<b>' + (data.userName || 'Tourist') + '</b>');
      userMarkersRef.current[data.userId] = marker;
    }
  }, []);

  const removeUserFromMap = (userId) => {
    if (userMarkersRef.current[userId]) {
      userMarkersRef.current[userId].remove();
      delete userMarkersRef.current[userId];
    }
  };

  const loadAlerts = async () => {
    try {
      const res = await api.get('/alerts');
      const allAlerts = res.data.alerts || [];
      setAlerts(allAlerts);
      setStats((prev) => ({
        ...prev,
        totalAlerts: allAlerts.length,
        active: allAlerts.filter((a) => a.status === 'active').length,
        resolved: allAlerts.filter((a) => a.status === 'resolved').length,
      }));
    } catch (e) {}
  };

  const loadGeofences = async () => {
    try {
      const res = await api.get('/geofence');
      setGeofences(res.data.geofences || []);
      renderGeofencesOnMap(res.data.geofences);
    } catch (e) {}
  };

  const loadAllUsers = async () => {
    try {
      const res = await api.get('/location/all-users');
      const users = res.data.users || [];
      setStats((prev) => ({ ...prev, users: users.length }));
      users.forEach((u) => {
        if (u.lastLocation) {
          updateUserOnMap({ userId: u.id, userName: u.name, lat: u.lastLocation.lat, lng: u.lastLocation.lng });
        }
      });
    } catch (e) {}
  };

  const loadBlockchainLogs = async () => {
    try {
      const [logsRes, verifyRes] = await Promise.all([
        api.get('/blockchain/logs'),
        api.get('/blockchain/verify'),
      ]);
      setBlockchainLogs(logsRes.data.logs || []);
      setChainValid(verifyRes.data.valid);
    } catch (e) {}
  };

  const resolveAlert = async (alertId) => {
    try { await api.patch('/alerts/' + alertId + '/resolve'); loadAlerts(); } catch (e) {}
  };

  const createGeofence = async (e) => {
    e.preventDefault();
    try {
      await api.post('/geofence', newFence);
      setNewFence({ name: '', lat: '', lng: '', radius: 500, riskLevel: 'medium', description: '' });
      loadGeofences();
    } catch (e) {}
  };

  const deleteGeofence = async (id) => {
    try { await api.delete('/geofence/' + id); loadGeofences(); } catch (e) {}
  };

  const renderGeofencesOnMap = (fences) => {
    const L = window.L;
    if (!L || !mapInstance.current) return;
    geofenceCirclesRef.current.forEach((c) => c.remove());
    geofenceCirclesRef.current = [];
    fences.forEach((f) => {
      const color = f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6';
      const circle = L.circle([f.lat, f.lng], { radius: f.radius, color, fillColor: color, fillOpacity: 0.15, weight: 2 })
        .addTo(mapInstance.current);
      circle.bindPopup('<b>' + f.name + '</b><br>Risk: ' + f.riskLevel);
      geofenceCirclesRef.current.push(circle);
    });
  };

  useEffect(() => {
    loadAlerts();
    loadBlockchainLogs();
    const interval = setInterval(() => { loadAlerts(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-gray-900 text-white shadow-lg">
        <div className="max-w-full mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg">WanderMate Admin</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-300">{user?.name}</span>
            <button onClick={() => { logout(); navigate('/'); }} className="text-sm bg-white/20 px-3 py-1 rounded hover:bg-white/30">Logout</button>
          </div>
        </div>
      </nav>

      {liveAlerts.length > 0 && liveAlerts[0].type === 'sos' && (
        <div className="bg-red-600 text-white px-4 py-3 text-center font-bold animate-pulse">
          LIVE SOS: {liveAlerts[0].userName} triggered emergency! — Lat: {liveAlerts[0].lat?.toFixed(4)}, Lng: {liveAlerts[0].lng?.toFixed(4)}
        </div>
      )}

      <div className="bg-white border-b shadow-sm">
        <div className="max-w-full mx-auto px-4 flex space-x-1 overflow-x-auto">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'map', label: 'Live Map' },
            { key: 'alerts', label: 'Alerts (' + stats.active + ')' },
            { key: 'geofences', label: 'Geofences' },
            { key: 'blockchain', label: 'Blockchain' },
            { key: 'logs', label: 'Activity Log' },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ' +
                (activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-full mx-auto px-4 py-4">
        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Active Alerts', value: stats.active, color: 'bg-red-500' },
                { label: 'Total Alerts', value: stats.totalAlerts, color: 'bg-orange-500' },
                { label: 'Resolved', value: stats.resolved, color: 'bg-green-500' },
                { label: 'Tracked Users', value: stats.users, color: 'bg-blue-500' },
              ].map((s, i) => (
                <div key={i} className={s.color + ' text-white rounded-2xl p-5 shadow-lg'}>
                  <div className="text-3xl font-extrabold">{s.value}</div>
                  <div className="text-sm opacity-80">{s.label}</div>
                </div>
              ))}
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-3">Recent Live Feed</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {liveAlerts.length === 0 ? (
                <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No live alerts yet. Monitoring...</p>
              ) : (
                liveAlerts.map((a, i) => (
                  <div key={i} className={'p-3 rounded-xl text-sm ' +
                    (a.type === 'sos' ? 'bg-red-50 border border-red-200' :
                     a.type === 'geofence' ? 'bg-yellow-50 border border-yellow-200' :
                     'bg-purple-50 border border-purple-200')}>
                    <span className="font-medium">{a.userName || 'System'}</span>: {a.message}
                    <span className="text-xs text-gray-400 ml-2">
                      {a.receivedAt ? new Date(a.receivedAt).toLocaleTimeString() : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div>
            <div ref={mapRef} style={{ width: '100%', height: '500px' }} className="rounded-2xl shadow-lg border border-gray-200" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => { loadAllUsers(); }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Refresh Users</button>
              <button onClick={loadGeofences} className="px-4 py-2 bg-yellow-500 text-white text-sm rounded-lg">Show Geofences</button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Green dots = tracked tourists | Red circles = risk zones</p>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800">All Alerts</h2>
              <button onClick={loadAlerts} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
            </div>
            {alerts.length === 0 && <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No alerts yet.</p>}
            {alerts.map((a) => (
              <div key={a.id} className={'p-4 rounded-xl border bg-white shadow-sm ' +
                (a.status === 'active' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500')}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={'text-xs font-bold px-2 py-1 rounded ' +
                        (a.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800')}>
                        {a.status === 'active' ? 'ACTIVE' : 'RESOLVED'}
                      </span>
                      <span className={'text-xs font-medium px-2 py-0.5 rounded ' +
                        (a.priority === 'critical' ? 'bg-red-200 text-red-900' : 'bg-yellow-200 text-yellow-900')}>
                        {a.priority}
                      </span>
                      {a.offlineSync && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Offline Sync</span>}
                    </div>
                    <p className="font-medium text-gray-800 mt-2">{a.userName} — {a.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {a.userEmail} | {a.lat?.toFixed(4)}, {a.lng?.toFixed(4)} | {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {a.status === 'active' && (
                    <button onClick={() => resolveAlert(a.id)}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex-shrink-0">
                      Resolve
                    </button>
                  )}
                </div>
                {a.resolvedBy && (
                  <p className="text-xs text-green-600 mt-2">Resolved by {a.resolvedBy} at {new Date(a.resolvedAt).toLocaleString()}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'geofences' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Geofence Management</h2>
            <form onSubmit={createGeofence} className="bg-white p-4 rounded-xl border shadow-sm mb-6">
              <h3 className="font-bold text-gray-700 mb-3">Create New Geofence</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={newFence.name} onChange={(e) => setNewFence({ ...newFence, name: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Zone name" required />
                <input value={newFence.lat} onChange={(e) => setNewFence({ ...newFence, lat: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Latitude" required type="number" step="any" />
                <input value={newFence.lng} onChange={(e) => setNewFence({ ...newFence, lng: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Longitude" required type="number" step="any" />
                <input value={newFence.radius} onChange={(e) => setNewFence({ ...newFence, radius: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Radius (m)" type="number" />
                <select value={newFence.riskLevel} onChange={(e) => setNewFence({ ...newFence, riskLevel: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm">
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
                <input value={newFence.description} onChange={(e) => setNewFence({ ...newFence, description: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" placeholder="Description" />
              </div>
              <button type="submit" className="mt-3 px-6 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600">
                + Create Geofence
              </button>
            </form>
            <div className="space-y-3">
              {geofences.map((f) => (
                <div key={f.id} className={'p-4 rounded-xl border bg-white shadow-sm flex justify-between items-center ' +
                  (f.riskLevel === 'high' ? 'border-l-4 border-l-red-500' :
                   f.riskLevel === 'medium' ? 'border-l-4 border-l-yellow-500' : 'border-l-4 border-l-blue-500')}>
                  <div>
                    <h4 className="font-bold text-gray-800">{f.name}</h4>
                    <p className="text-sm text-gray-500">{f.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{f.lat.toFixed(4)}, {f.lng.toFixed(4)} | Radius: {f.radius}m | Risk: {f.riskLevel}</p>
                  </div>
                  <button onClick={() => deleteGeofence(f.id)} className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'blockchain' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">Blockchain Ledger</h2>
              <div className="flex items-center gap-3">
                <span className={'text-sm font-medium px-3 py-1 rounded-lg ' +
                  (chainValid ? 'bg-green-100 text-green-800' : chainValid === false ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600')}>
                  {chainValid ? 'Chain Valid' : chainValid === false ? 'Chain Broken' : 'Checking...'}
                </span>
                <button onClick={loadBlockchainLogs} className="text-sm px-3 py-1 bg-blue-600 text-white rounded-lg">Refresh</button>
              </div>
            </div>
            <div className="space-y-2">
              {blockchainLogs.map((block) => (
                <div key={block.id} className="bg-white p-4 rounded-xl border shadow-sm">
                  <div className="flex justify-between">
                    <span className="text-xs font-bold text-blue-600">Block #{block.index}</span>
                    <span className={'text-xs px-2 py-0.5 rounded ' +
                      (block.type === 'digital_id' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600')}>
                      {block.type === 'digital_id' ? 'Digital ID' : 'Log'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-1">{block.userName} — {block.action || 'Digital ID Issued'}</p>
                  <p className="text-xs text-gray-400 mt-1 font-mono truncate">Hash: {block.hash}</p>
                  <p className="text-xs text-gray-300 font-mono truncate">Prev: {block.previousHash}</p>
                </div>
              ))}
              {blockchainLogs.length === 0 && <p className="text-gray-500 text-sm p-4 bg-white rounded-xl">No blockchain entries yet.</p>}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">All Activity Log</h2>
            <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Time</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">User</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Type</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Message</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {alerts.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">{a.userName}</td>
                      <td className="px-4 py-3">
                        <span className={'text-xs px-2 py-0.5 rounded ' +
                          (a.type === 'sos' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')}>{a.type}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.message}</td>
                      <td className="px-4 py-3">
                        <span className={'text-xs font-medium ' + (a.status === 'active' ? 'text-red-600' : 'text-green-600')}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alerts.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No activity logs yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
ENDOFFILE


# ──────────────────────────────────────
# MOBILE (React Native + Expo)
# ──────────────────────────────────────
mkdir -p mobile/src/screens mobile/src/services mobile/src/context mobile/src/utils mobile/assets

# ── mobile/package.json ──
cat > mobile/package.json << 'ENDOFFILE'
{
  "name": "wandermate-mobile",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-asset": "~11.0.0",
    "expo-constants": "~17.0.0",
    "expo-font": "~13.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-location": "~18.0.0",
    "expo-contacts": "~14.0.0",
    "expo-device": "~7.0.0",
    "expo-battery": "~9.0.0",
    "expo-network": "~7.0.0",
    "expo-sensors": "~14.0.0",
    "react": "18.3.1",
    "react-native": "0.76.6",
    "react-native-maps": "1.20.1",
    "react-native-safe-area-context": "4.14.1",
    "react-native-screens": "~4.4.0",
    "@react-navigation/native": "^7.0.0",
    "@react-navigation/native-stack": "^7.0.0",
    "@react-navigation/bottom-tabs": "^7.0.0",
    "axios": "^1.7.4",
    "socket.io-client": "^4.7.5",
    "@react-native-async-storage/async-storage": "2.1.2"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2"
  }
}
ENDOFFILE

# ── mobile/app.json ──
cat > mobile/app.json << 'ENDOFFILE'
{
  "expo": {
    "name": "WanderMate",
    "slug": "wandermate",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#1e40af"
    },
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "WanderMate needs your location for safety tracking and geofence alerts.",
        "NSLocationAlwaysUsageDescription": "WanderMate needs background location for continuous safety monitoring.",
        "NSContactsUsageDescription": "WanderMate accesses contacts so you can set emergency contacts."
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1e40af"
      },
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "READ_CONTACTS",
        "VIBRATE"
      ]
    },
    "plugins": [
      "expo-location",
      "expo-contacts"
    ]
  }
}
ENDOFFILE

# ── mobile/babel.config.js ──
cat > mobile/babel.config.js << 'ENDOFFILE'
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
ENDOFFILE

# ── mobile/index.js ──
cat > mobile/index.js << 'ENDOFFILE'
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
ENDOFFILE

# ── mobile/App.js ──
cat > mobile/App.js << 'ENDOFFILE'
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import MapScreen from './src/screens/MapScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({ label, focused }) => {
  const icons = { Map: '📍', Alerts: '🚨', Profile: '👤' };
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 20 }}>{icons[label] || '•'}</Text>
      <Text style={{ fontSize: 10, color: focused ? '#2563eb' : '#9ca3af', fontWeight: focused ? '700' : '400' }}>
        {label}
      </Text>
    </View>
  );
};

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
      tabBarShowLabel: false,
      tabBarStyle: {
        height: 70,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
      },
    })}
  >
    <Tab.Screen name="Map" component={MapScreen} />
    <Tab.Screen name="Alerts" component={AlertsScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>
);

const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Register" component={RegisterScreen} />
  </Stack.Navigator>
);

const RootNavigator = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading WanderMate...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e40af',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
});
ENDOFFILE

# ── mobile/src/context/AuthContext.js ──
cat > mobile/src/context/AuthContext.js << 'ENDOFFILE'
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { collectDeviceInfo } from '../services/deviceInfo';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem('wandermate_token');
        const savedUser = await AsyncStorage.getItem('wandermate_user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          const info = await collectDeviceInfo();
          setDeviceInfo(info);
        }
      } catch (e) {
        console.error('Failed to restore auth:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    await AsyncStorage.setItem('wandermate_token', newToken);
    await AsyncStorage.setItem('wandermate_user', JSON.stringify(userData));

    const info = await collectDeviceInfo();
    setDeviceInfo(info);

    try {
      await api.post('/blockchain/log', {
        action: 'DEVICE_LOGIN',
        details: JSON.stringify({
          device: info.device.modelName,
          os: info.device.osName + ' ' + info.device.osVersion,
          battery: info.battery.level + '%',
          network: info.network.type,
          ip: info.network.ipAddress,
          location: info.location ? info.location.lat.toFixed(4) + ', ' + info.location.lng.toFixed(4) : 'unavailable',
        }),
      });
    } catch (e) {}

    return userData;
  };

  const register = async (name, email, password, phone, role) => {
    const res = await api.post('/auth/register', { name, email, password, phone, role });
    const { user: userData, token: newToken } = res.data;
    setUser(userData);
    setToken(newToken);
    await AsyncStorage.setItem('wandermate_token', newToken);
    await AsyncStorage.setItem('wandermate_user', JSON.stringify(userData));

    const info = await collectDeviceInfo();
    setDeviceInfo(info);

    try { await api.post('/blockchain/digital-id'); } catch (e) {}

    return userData;
  };

  const logout = async () => {
    setUser(null);
    setToken(null);
    setDeviceInfo(null);
    await AsyncStorage.removeItem('wandermate_token');
    await AsyncStorage.removeItem('wandermate_user');
  };

  const value = {
    user, token, loading, deviceInfo,
    login, register, logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
ENDOFFILE

# ── mobile/src/services/api.js ──
cat > mobile/src/services/api.js << 'ENDOFFILE'
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// IMPORTANT: Change this to your computer's local IP when testing on a real device
// e.g., 'http://192.168.1.100:5000'
const API_BASE_URL = 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL + '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('wandermate_token');
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('wandermate_token');
      await AsyncStorage.removeItem('wandermate_user');
    }
    return Promise.reject(error);
  }
);

export const API_BASE = API_BASE_URL;
export default api;
ENDOFFILE

# ── mobile/src/services/deviceInfo.js ──
cat > mobile/src/services/deviceInfo.js << 'ENDOFFILE'
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Location from 'expo-location';

export const collectDeviceInfo = async () => {
  const info = {
    device: {
      brand: Device.brand,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      deviceName: Device.deviceName,
      isDevice: Device.isDevice,
      totalMemory: Device.totalMemory,
    },
    battery: {},
    network: {},
    location: null,
  };

  try {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    const batteryState = await Battery.getBatteryStateAsync();
    info.battery = {
      level: Math.round(batteryLevel * 100),
      charging: batteryState === Battery.BatteryState.CHARGING,
    };
  } catch (e) {
    info.battery = { level: null, charging: null };
  }

  try {
    const networkState = await Network.getNetworkStateAsync();
    const ip = await Network.getIpAddressAsync();
    info.network = {
      isConnected: networkState.isConnected,
      type: networkState.type,
      isInternetReachable: networkState.isInternetReachable,
      ipAddress: ip,
    };
  } catch (e) {
    info.network = { isConnected: null, type: null };
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      info.location = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        altitude: loc.coords.altitude,
        accuracy: loc.coords.accuracy,
        speed: loc.coords.speed,
        heading: loc.coords.heading,
        timestamp: loc.timestamp,
      };
    }
  } catch (e) {
    info.location = null;
  }

  return info;
};
ENDOFFILE

# ── mobile/src/services/socket.js ──
cat > mobile/src/services/socket.js << 'ENDOFFILE'
import { io } from 'socket.io-client';
import { API_BASE } from './api';

let socket = null;

export const connectSocket = (user) => {
  if (socket?.connected) return socket;

  socket = io(API_BASE, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('user:join', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
ENDOFFILE

# ── mobile/src/utils/offline.js ──
cat > mobile/src/utils/offline.js << 'ENDOFFILE'
import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_KEY = 'wandermate_offline_alerts';

export const saveOfflineAlert = async (alert) => {
  try {
    const queue = await getOfflineQueue();
    queue.push({
      ...alert,
      createdAt: new Date().toISOString(),
      offlineId: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    });
    await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline alert:', e);
  }
};

export const getOfflineQueue = async () => {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const clearOfflineQueue = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_KEY);
  } catch (e) {
    console.error('Failed to clear offline queue:', e);
  }
};

export const syncOfflineAlerts = async (api) => {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0 };

  try {
    const res = await api.post('/alerts/batch', { alerts: queue });
    await clearOfflineQueue();
    return { synced: res.data.synced };
  } catch (err) {
    return { synced: 0, error: err.message };
  }
};
ENDOFFILE


# ── mobile/src/screens/LoginScreen.js ──
cat > mobile/src/screens/LoginScreen.js << 'ENDOFFILE'
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Login Failed', err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>WanderMate</Text>
          <Text style={styles.subtitle}>Explore More — Worry Less</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>

          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail}
            keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
          <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword}
            secureTextEntry placeholderTextColor="#9ca3af" />

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Signing In...' : 'Sign In'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.link}>
            <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Register</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e40af' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  logo: { fontSize: 36, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 16, color: '#93c5fd', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2937', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 14, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#6b7280', fontSize: 14 },
  linkBold: { color: '#2563eb', fontWeight: '600' },
});

export default LoginScreen;
ENDOFFILE

# ── mobile/src/screens/RegisterScreen.js ──
cat > mobile/src/screens/RegisterScreen.js << 'ENDOFFILE'
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const RegisterScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Name, email and password are required');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password, phone, 'tourist');
    } catch (err) {
      Alert.alert('Registration Failed', err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>WanderMate</Text>
          <Text style={styles.subtitle}>Create Your Account</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Register</Text>

          <TextInput style={styles.input} placeholder="Full Name" value={name} onChangeText={setName} placeholderTextColor="#9ca3af" />
          <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#9ca3af" />
          <TextInput style={styles.input} placeholder="Password (min 6 chars)" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#9ca3af" />
          <TextInput style={styles.input} placeholder="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#9ca3af" />

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Create Account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e40af' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  header: { alignItems: 'center', marginBottom: 30 },
  logo: { fontSize: 36, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 16, color: '#93c5fd', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2937', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 14, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
  button: { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#6b7280', fontSize: 14 },
  linkBold: { color: '#2563eb', fontWeight: '600' },
});

export default RegisterScreen;
ENDOFFILE

# ── mobile/src/screens/MapScreen.js ──
cat > mobile/src/screens/MapScreen.js << 'ENDOFFILE'
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, Dimensions,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useAuth } from '../context/AuthContext';
import { connectSocket, getSocket, disconnectSocket } from '../services/socket';
import { saveOfflineAlert, getOfflineQueue, syncOfflineAlerts } from '../utils/offline';
import api from '../services/api';

const { width } = Dimensions.get('window');

const MapScreen = () => {
  const { user } = useAuth();
  const mapRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [geofences, setGeofences] = useState([]);
  const [services, setServices] = useState([]);
  const [geofenceWarning, setGeofenceWarning] = useState(null);
  const [showServices, setShowServices] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);

  useEffect(() => {
    if (user) { connectSocket(user); }
    return () => disconnectSocket();
  }, [user]);

  useEffect(() => {
    let subscription;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for WanderMate to work.');
        return;
      }
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 10000 },
        (loc) => {
          const pos = {
            lat: loc.coords.latitude, lng: loc.coords.longitude,
            accuracy: loc.coords.accuracy, speed: loc.coords.speed, heading: loc.coords.heading,
          };
          setLocation(pos);
          sendLocationToServer(pos);
          checkGeofences(pos);
        }
      );
    })();
    return () => { if (subscription) subscription.remove(); };
  }, []);

  useEffect(() => {
    loadGeofences();
    checkOfflineQueue();
  }, []);

  const checkOfflineQueue = async () => {
    const queue = await getOfflineQueue();
    setOfflineCount(queue.length);
    if (queue.length > 0) {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected) {
        const result = await syncOfflineAlerts(api);
        if (result.synced > 0) {
          setOfflineCount(0);
          Alert.alert('Synced', result.synced + ' offline alert(s) synced successfully.');
        }
      }
    }
  };

  const sendLocationToServer = async (loc) => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return;
      await api.post('/location/update', loc);
      const socket = getSocket();
      if (socket) { socket.emit('location:update', { userId: user.id, userName: user.name, ...loc }); }
    } catch (e) {}
  };

  const checkGeofences = async (loc) => {
    try {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return;
      const res = await api.post('/geofence/check', { lat: loc.lat, lng: loc.lng });
      if (res.data.insideGeofence) {
        const v = res.data.violations[0];
        if (!geofenceWarning || geofenceWarning.name !== v.name) {
          setGeofenceWarning(v);
          Vibration.vibrate([0, 500, 200, 500]);
          Alert.alert('Danger Zone', 'You entered: ' + v.name + '\nRisk Level: ' + v.riskLevel.toUpperCase());
          const socket = getSocket();
          if (socket) {
            socket.emit('geofence:violation', {
              userId: user.id, userName: user.name,
              geofence: v.name, riskLevel: v.riskLevel,
              lat: loc.lat, lng: loc.lng,
            });
          }
        }
      } else { setGeofenceWarning(null); }
    } catch (e) {}
  };

  const loadGeofences = async () => {
    try { const res = await api.get('/geofence'); setGeofences(res.data.geofences || []); } catch (e) {}
  };

  const loadNearbyServices = async () => {
    try {
      const lat = location?.lat || 17.385;
      const lng = location?.lng || 78.4867;
      const res = await api.get('/location/nearby-services?lat=' + lat + '&lng=' + lng);
      setServices(res.data.services || []);
      setShowServices(true);
    } catch (e) {}
  };

  const handleSOS = async () => {
    setSosActive(true);
    Vibration.vibrate([0, 300, 100, 300, 100, 300]);
    const alertData = {
      type: 'sos', message: 'Emergency SOS triggered from mobile!',
      lat: location?.lat, lng: location?.lng,
    };
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected) {
      try {
        await api.post('/alerts/sos', alertData);
        const socket = getSocket();
        if (socket) { socket.emit('sos:trigger', { ...alertData, userId: user.id, userName: user.name }); }
        await api.post('/blockchain/log', {
          action: 'SOS_TRIGGERED_MOBILE',
          details: 'SOS from ' + (location?.lat?.toFixed(4)) + ', ' + (location?.lng?.toFixed(4)),
        });
        Alert.alert('SOS Sent', 'Your emergency alert has been sent to authorities. Help is on the way.');
      } catch (e) {
        Alert.alert('Error', 'Failed to send SOS. Saved offline.');
        await saveOfflineAlert(alertData);
      }
    } else {
      await saveOfflineAlert(alertData);
      const queue = await getOfflineQueue();
      setOfflineCount(queue.length);
      Alert.alert('Offline SOS', 'No internet. Alert saved locally and will sync when connected.');
    }
    setTimeout(() => setSosActive(false), 3000);
  };

  const region = location ? {
    latitude: location.lat, longitude: location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02,
  } : {
    latitude: 17.385, longitude: 78.4867, latitudeDelta: 0.05, longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      {geofenceWarning && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>WARNING: Inside {geofenceWarning.name} (Risk: {geofenceWarning.riskLevel})</Text>
        </View>
      )}
      {offlineCount > 0 && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>{offlineCount} offline alert(s) pending sync</Text>
        </View>
      )}
      <MapView ref={mapRef} style={styles.map} provider={PROVIDER_DEFAULT} initialRegion={region}
        showsUserLocation showsMyLocationButton>
        {geofences.map((f) => (
          <Circle key={f.id} center={{ latitude: f.lat, longitude: f.lng }} radius={f.radius}
            strokeColor={f.riskLevel === 'high' ? '#ef4444' : f.riskLevel === 'medium' ? '#f59e0b' : '#3b82f6'}
            fillColor={f.riskLevel === 'high' ? 'rgba(239,68,68,0.15)' : f.riskLevel === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}
            strokeWidth={2} />
        ))}
        {geofences.map((f) => (
          <Marker key={'label-' + f.id} coordinate={{ latitude: f.lat, longitude: f.lng }}
            title={f.name} description={f.riskLevel + ' risk — ' + f.description}
            pinColor={f.riskLevel === 'high' ? 'red' : f.riskLevel === 'medium' ? 'orange' : 'blue'} />
        ))}
        {showServices && services.map((s) => (
          <Marker key={'svc-' + s.id} coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={s.name} description={s.type + ' — ' + s.phone + ' — ' + s.distance}
            pinColor="green" />
        ))}
      </MapView>
      <View style={styles.controls}>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnServices} onPress={loadNearbyServices}>
            <Text style={styles.btnSmallText}>Nearby Services</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnZones} onPress={loadGeofences}>
            <Text style={styles.btnSmallText}>Risk Zones</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.sosButton, sosActive && styles.sosDisabled]} onPress={handleSOS}
          disabled={sosActive} activeOpacity={0.7}>
          <Text style={styles.sosText}>{sosActive ? 'SOS SENT!' : 'SOS EMERGENCY'}</Text>
        </TouchableOpacity>
        {location && (
          <Text style={styles.coordsText}>
            {location.lat.toFixed(6)}, {location.lng.toFixed(6)} | ±{Math.round(location.accuracy || 0)}m
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  warningBanner: { backgroundColor: '#dc2626', padding: 10, alignItems: 'center' },
  warningText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 6, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  map: { flex: 1 },
  controls: { padding: 16, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
  buttonRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  btnServices: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnZones: { flex: 1, backgroundColor: '#d97706', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnSmallText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sosButton: { backgroundColor: '#dc2626', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  sosDisabled: { backgroundColor: '#9ca3af' },
  sosText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  coordsText: { textAlign: 'center', color: '#9ca3af', fontSize: 11, marginTop: 8 },
});

export default MapScreen;
ENDOFFILE

# ── mobile/src/screens/AlertsScreen.js ──
cat > mobile/src/screens/AlertsScreen.js << 'ENDOFFILE'
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import api from '../services/api';

const AlertsScreen = () => {
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = async () => {
    try { const res = await api.get('/alerts'); setAlerts(res.data.alerts || []); } catch (e) {}
  };

  useEffect(() => { loadAlerts(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  }, []);

  const renderAlert = ({ item }) => (
    <View style={[styles.alertCard, item.status === 'active' ? styles.activeCard : styles.resolvedCard]}>
      <View style={styles.alertHeader}>
        <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeResolved]}>
          <Text style={styles.badgeText}>{item.status === 'active' ? 'ACTIVE' : 'RESOLVED'}</Text>
        </View>
        <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.message}>{item.message}</Text>
      {item.lat && (
        <Text style={styles.coords}>Location: {item.lat.toFixed(4)}, {item.lng.toFixed(4)}</Text>
      )}
      {item.resolvedBy && (
        <Text style={styles.resolvedText}>Resolved by {item.resolvedBy}</Text>
      )}
      {item.offlineSync && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>Synced from offline</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlert}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No alerts yet. Stay safe!</Text>
          </View>
        }
        contentContainerStyle={alerts.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  alertCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  activeCard: { borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  resolvedCard: { borderLeftWidth: 4, borderLeftColor: '#22c55e' },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeActive: { backgroundColor: '#fee2e2' },
  badgeResolved: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  time: { fontSize: 11, color: '#9ca3af' },
  message: { fontSize: 15, color: '#374151', marginBottom: 6 },
  coords: { fontSize: 12, color: '#6b7280' },
  resolvedText: { fontSize: 12, color: '#16a34a', marginTop: 4 },
  offlineBadge: { backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 6 },
  offlineBadgeText: { fontSize: 11, color: '#1d4ed8', fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#9ca3af' },
  emptyContainer: { flex: 1 },
});

export default AlertsScreen;
ENDOFFILE

# ── mobile/src/screens/ProfileScreen.js ──
cat > mobile/src/screens/ProfileScreen.js << 'ENDOFFILE'
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { collectDeviceInfo } from '../services/deviceInfo';
import api from '../services/api';

const ProfileScreen = () => {
  const { user, deviceInfo, logout } = useAuth();
  const [digitalId, setDigitalId] = useState(null);
  const [freshDeviceInfo, setFreshDeviceInfo] = useState(deviceInfo);

  useEffect(() => { loadDigitalId(); }, []);

  const loadDigitalId = async () => {
    try { const res = await api.post('/blockchain/digital-id'); setDigitalId(res.data.digitalId); } catch (e) {}
  };

  const refreshDeviceInfo = async () => {
    const info = await collectDeviceInfo();
    setFreshDeviceInfo(info);
    Alert.alert('Refreshed', 'Device information updated.');
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  const info = freshDeviceInfo || deviceInfo;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user?.role?.toUpperCase()}</Text>
        </View>
      </View>

      {digitalId && (
        <View style={styles.idCard}>
          <Text style={styles.sectionLabel}>BLOCKCHAIN DIGITAL ID</Text>
          <Text style={styles.idName}>{digitalId.userName}</Text>
          <Text style={styles.idEmail}>{digitalId.userEmail}</Text>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Block #</Text>
            <Text style={styles.idValue}>{digitalId.index}</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Hash</Text>
            <Text style={styles.idHash}>{digitalId.hash?.substring(0, 24)}...</Text>
          </View>
          <View style={styles.idRow}>
            <Text style={styles.idLabel}>Issued</Text>
            <Text style={styles.idValue}>{new Date(digitalId.issuedAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>VERIFIED</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Device Details</Text>
          <TouchableOpacity onPress={refreshDeviceInfo}>
            <Text style={styles.refreshBtn}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {info?.device && (
          <View style={styles.infoCard}>
            <InfoRow label="Device" value={info.device.brand + ' ' + info.device.modelName} />
            <InfoRow label="OS" value={info.device.osName + ' ' + info.device.osVersion} />
            <InfoRow label="Device Name" value={info.device.deviceName || 'N/A'} />
            <InfoRow label="Physical Device" value={info.device.isDevice ? 'Yes' : 'No (Emulator)'} />
          </View>
        )}

        {info?.battery && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Battery</Text>
            <InfoRow label="Level" value={info.battery.level != null ? info.battery.level + '%' : 'N/A'} />
            <InfoRow label="Charging" value={info.battery.charging ? 'Yes' : 'No'} />
          </View>
        )}

        {info?.network && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Network</Text>
            <InfoRow label="Connected" value={info.network.isConnected ? 'Yes' : 'No'} />
            <InfoRow label="Type" value={info.network.type || 'N/A'} />
            <InfoRow label="IP Address" value={info.network.ipAddress || 'N/A'} />
          </View>
        )}

        {info?.location && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Location</Text>
            <InfoRow label="Latitude" value={info.location.lat?.toFixed(6)} />
            <InfoRow label="Longitude" value={info.location.lng?.toFixed(6)} />
            <InfoRow label="Altitude" value={info.location.altitude ? Math.round(info.location.altitude) + 'm' : 'N/A'} />
            <InfoRow label="Accuracy" value={'±' + Math.round(info.location.accuracy || 0) + 'm'} />
            <InfoRow label="Speed" value={info.location.speed ? (info.location.speed * 3.6).toFixed(1) + ' km/h' : 'Stationary'} />
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>WanderMate v1.0 — Team WanderBytes</Text>
    </ScrollView>
  );
};

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scroll: { padding: 16, paddingBottom: 40 },
  userCard: { backgroundColor: '#1e40af', borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 22, fontWeight: '700', color: '#fff' },
  userEmail: { fontSize: 14, color: '#93c5fd', marginTop: 2 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  roleText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  idCard: { backgroundColor: '#0f172a', borderRadius: 16, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 10, color: '#64748b', fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  idName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  idEmail: { fontSize: 13, color: '#94a3b8', marginBottom: 12 },
  idRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  idLabel: { fontSize: 12, color: '#64748b' },
  idValue: { fontSize: 12, color: '#e2e8f0', fontWeight: '600' },
  idHash: { fontSize: 11, color: '#94a3b8', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  verifiedBadge: { backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginTop: 10 },
  verifiedText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  refreshBtn: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  infoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  infoCardTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { fontSize: 14, color: '#6b7280' },
  infoValue: { fontSize: 14, color: '#1f2937', fontWeight: '600' },
  logoutBtn: { backgroundColor: '#fee2e2', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 10 },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 10 },
});

export default ProfileScreen;
ENDOFFILE


# ──────────────────────────────────────
# VERIFICATION
# ──────────────────────────────────────
echo ""
echo "=== Verifying ALL files ==="
for f in \
  backend/.env \
  backend/package.json \
  backend/src/config/db.js \
  backend/src/middleware/auth.js \
  backend/src/routes/auth.js \
  backend/src/routes/location.js \
  backend/src/routes/alerts.js \
  backend/src/routes/geofence.js \
  backend/src/routes/anomaly.js \
  backend/src/routes/blockchain.js \
  backend/src/server.js \
  frontend/package.json \
  frontend/public/index.html \
  frontend/src/index.js \
  frontend/src/App.js \
  frontend/src/context/AuthContext.jsx \
  frontend/src/components/ProtectedRoute.jsx \
  frontend/src/components/Navbar.jsx \
  frontend/src/services/api.js \
  frontend/src/services/socket.js \
  frontend/src/utils/offline.js \
  frontend/src/pages/Home.jsx \
  frontend/src/pages/Login.jsx \
  frontend/src/pages/Register.jsx \
  frontend/src/pages/Dashboard.jsx \
  frontend/src/pages/AdminDashboard.jsx \
  mobile/package.json \
  mobile/app.json \
  mobile/babel.config.js \
  mobile/index.js \
  mobile/App.js \
  mobile/src/context/AuthContext.js \
  mobile/src/services/api.js \
  mobile/src/services/deviceInfo.js \
  mobile/src/services/socket.js \
  mobile/src/utils/offline.js \
  mobile/src/screens/LoginScreen.js \
  mobile/src/screens/RegisterScreen.js \
  mobile/src/screens/MapScreen.js \
  mobile/src/screens/AlertsScreen.js \
  mobile/src/screens/ProfileScreen.js; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
  fi
done

echo ""
echo "============================================"
echo "  🎉 WanderMate Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo ""
echo "  1. Kill any old backend process:"
echo "     lsof -ti:5000 | xargs kill -9 2>/dev/null"
echo ""
echo "  2. Start backend:"
echo "     cd backend && npm install && npm run dev"
echo ""
echo "  3. In a NEW terminal, start frontend:"
echo "     cd frontend && npm install && npm start"
echo ""
echo "  4. In another NEW terminal, start mobile:"
echo "     cd mobile && rm -rf node_modules && npm install && npx expo start"
echo ""
echo "  Test accounts:"
echo "     Register as tourist: any email/password"
echo "     Register as admin:  use role=admin in the API"
echo ""
