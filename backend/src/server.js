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

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log("ENV PORT:", process.env.PORT);
  console.log('WanderMate Backend running on http://localhost:' + PORT);
  console.log('Socket.io ready');
});

module.exports = { app, server, io };
