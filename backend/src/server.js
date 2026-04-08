const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
dotenv.config();

const { connectDB } = require('./config/db');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/location', require('./routes/location'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/geofence', require('./routes/geofence'));
app.use('/api/blockchain', require('./routes/blockchain'));
app.use('/api/anomaly', require('./routes/anomaly'));
app.use('/api/evidence', require('./routes/evidence'));
app.use('/api/places', require('./routes/places'));

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

// Seed default admin accounts
async function seedAdmins() {
  const defaultAdmins = [
    { name: 'Admin One', email: 'admin1@wandermate.com', password: 'admin1', phone: '+91-9000000001' },
    { name: 'Admin Two', email: 'admin2@wandermate.com', password: 'admin2', phone: '+91-9000000002' },
    { name: 'Admin Three', email: 'admin3@wandermate.com', password: 'admin3', phone: '+91-9000000003' },
    { name: 'Admin Four', email: 'admin4@wandermate.com', password: 'admin4', phone: '+91-9000000004' },
    { name: 'Admin Five', email: 'admin5@wandermate.com', password: 'admin5', phone: '+91-9000000005' },
  ];

  const departmentAccounts = [
    { name: 'City Hospital ER',      email: 'medical@wandermate.com',  password: 'medical1',  role: 'medical',  department: 'City Hospital Emergency Room' },
    { name: 'Central Police HQ',     email: 'police@wandermate.com',   password: 'police1',   role: 'police',   department: 'Central Police Headquarters' },
    { name: 'Metro Fire Station',    email: 'fire@wandermate.com',     password: 'fire1',     role: 'fire',     department: 'Metro Fire & Rescue' },
    { name: 'Disaster Response Unit',email: 'disaster@wandermate.com', password: 'disaster1', role: 'disaster', department: 'State Disaster Management' },
  ];

  for (const dept of departmentAccounts) {
    try {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(dept.password, salt);
      await User.findOneAndUpdate(
        { email: dept.email },
        {
          $set: {
            name: dept.name, password: hashed,
            role: dept.role, department: dept.department, profileCompleted: true,
          },
        },
        { upsert: true, new: true }
      );
      console.log('Ensured ' + dept.role + ' account:', dept.email, '/ password:', dept.password);
    } catch (err) {
      if (err.code !== 11000) console.error('Dept seed error', dept.email, err.message);
    }
  }

  for (const admin of defaultAdmins) {
    try {
      const exists = await User.findOne({ email: admin.email });
      if (!exists) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(admin.password, salt);
        await User.create({
          name: admin.name,
          email: admin.email,
          password: hashedPassword,
          phone: admin.phone,
          role: 'admin',
          nationality: 'India',
          profileCompleted: true,
        });
        console.log('Created default admin:', admin.email, '/ password:', admin.password);
      }
    } catch (err) {
      // Ignore duplicate key errors during seeding
      if (err.code !== 11000) {
        console.error('Error seeding admin', admin.email, err.message);
      }
    }
  }
}

const PORT = process.env.PORT || 5001;

// Connect to MongoDB, seed admins, then start server
connectDB().then(async () => {
  await seedAdmins();

  // Seed geofences if the geofence route exports seedGeofences
  try {
    const geofenceRouter = require('./routes/geofence');
    if (geofenceRouter.seedGeofences) {
      await geofenceRouter.seedGeofences();
    }
  } catch (err) {
    console.error('Geofence seed error:', err.message);
  }

  server.listen(PORT, () => {
    console.log("ENV PORT:", process.env.PORT);
    console.log('WanderMate Backend running on http://localhost:' + PORT);
    console.log('Socket.io ready');
    console.log('Default admin accounts: admin1@wandermate.com through admin5@wandermate.com');
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = { app, server, io };
