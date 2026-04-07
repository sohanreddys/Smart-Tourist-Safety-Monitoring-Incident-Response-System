const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userName: { type: String, required: true },
  userEmail: { type: String },
  type: { type: String, enum: ['sos', 'geofence', 'anomaly', 'manual'], default: 'sos' },
  message: { type: String, default: 'Emergency SOS triggered!' },
  lat: Number,
  lng: Number,
  accuracy: Number,
  altitude: Number,
  speed: Number,
  heading: Number,
  status: { type: String, enum: ['active', 'resolved', 'cancelled'], default: 'active', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'critical' },
  resolvedAt: Date,
  resolvedBy: String,
  cancelledAt: Date,
  cancelledBy: { type: String, enum: ['user', 'admin'], default: null },
  offlineSync: { type: Boolean, default: false },

  // Device info at time of alert
  deviceInfo: {
    model: { type: String, default: '' },
    os: { type: String, default: '' },
    battery: { type: Number, default: null },
    isCharging: { type: Boolean, default: false },
    networkType: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },

  // User profile snapshot at time of alert
  userSnapshot: {
    phone: { type: String, default: '' },
    bloodGroup: { type: String, default: '' },
    nationality: { type: String, default: '' },
    gender: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    medicalConditions: { type: String, default: '' },
    emergencyContactName: { type: String, default: '' },
    emergencyContactPhone: { type: String, default: '' },
    emergencyContactRelation: { type: String, default: '' },
    address: { type: String, default: '' },
  },

  // Evidence tracking
  recordingActive: { type: Boolean, default: false },
  evidenceCount: { type: Number, default: 0 },

  // Department assignment by main admin
  assignedRole: { type: String, enum: ['medical', 'police', 'fire', 'disaster', null], default: null, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  assignedAt: { type: Date, default: null },
  assignedBy: { type: String, default: '' },
  assignmentNote: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Alert', alertSchema);
