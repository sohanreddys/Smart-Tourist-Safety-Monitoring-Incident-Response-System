const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  radius: { type: Number, required: true },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  description: { type: String, default: '' },
  city: { type: String, default: '' },
  createdBy: { type: String, default: 'system' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Geofence', geofenceSchema);
