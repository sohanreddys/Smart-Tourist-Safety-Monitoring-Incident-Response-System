const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['video', 'audio', 'photo'], default: 'video' },
  filename: { type: String, required: true },
  originalName: { type: String },
  size: { type: Number },
  duration: { type: Number },
  cameraType: { type: String, enum: ['front', 'back', 'unknown'], default: 'back' },
  mimeType: { type: String },
  clipIndex: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Evidence', evidenceSchema);
