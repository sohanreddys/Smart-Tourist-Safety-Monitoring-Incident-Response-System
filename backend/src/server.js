const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Middleware
app.use(cors());
app.use(express.json());

// Make io accessible in routes
app.set('io', io);

// Routes
const authRoutes = require('./routes/auth');
const locationRoutes = require('./routes/location');
const alertRoutes = require('./routes/alerts');
const geofenceRoutes = require('./routes/geofence');
const blockchainRoutes = require('./routes/blockchain');
const anomalyRoutes = require('./routes/anomaly');

app.use('/api/auth', authRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/geofence', geofenceRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/anomaly', anomalyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WanderMate API is running',
    timestamp: new Date().toISOString(),
  });
});

// Socket.io connections
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Tourist joins with their user ID
  socket.on('user:join', (userData) => {
    connectedUsers.set(socket.id, userData);
    socket.join(`user:${userData.id}`);
    if (userData.role === 'admin') {
      socket.join('admins');
    }
    console.log(`👤 User joined: ${userData.name} (${userData.role})`);
    io.to('admins').emit('user:online', { ...userData, socketId: socket.id });
  });

  // Tourist sends location update
  socket.on('location:update', (data) => {
    io.to('admins').emit('location:live', {
      userId: data.userId,
      userName: data.userName,
      lat: data.lat,
      lng: data.lng,
      timestamp: new Date().toISOString(),
    });
  });

  // SOS alert — broadcast to all admins
  socket.on('sos:trigger', (alertData) => {
    console.log(`🚨 SOS ALERT from ${alertData.userName}!`);
    io.to('admins').emit('sos:received', {
      ...alertData,
      receivedAt: new Date().toISOString(),
    });
    // Acknowledge to the tourist
    socket.emit('sos:acknowledged', { message: 'Your SOS has been received by authorities' });
  });

  // Admin resolves alert
  socket.on('alert:resolve', (data) => {
    io.to(`user:${data.userId}`).emit('alert:resolved', {
      alertId: data.alertId,
      resolvedBy: data.resolvedBy,
      message: 'Your alert has been acknowledged by authorities',
    });
  });

  // Geofence violation alert
  socket.on('geofence:violation', (data) => {
    io.to('admins').emit('geofence:alert', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  });

  // Anomaly detected
  socket.on('anomaly:detected', (data) => {
    io.to('admins').emit('anomaly:alert', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      io.to('admins').emit('user:offline', { userId: userData.id, name: userData.name });
      connectedUsers.delete(socket.id);
      console.log(`👋 User disconnected: ${userData.name}`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ WanderMate Backend running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.io ready for connections`);
});

module.exports = { app, server, io };
