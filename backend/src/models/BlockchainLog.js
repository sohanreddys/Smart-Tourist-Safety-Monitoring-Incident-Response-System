const mongoose = require('mongoose');

const blockchainLogSchema = new mongoose.Schema({
  index: { type: Number, required: true },
  type: { type: String, enum: ['digital_id', 'log'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userName: { type: String, required: true },
  userEmail: String,
  userPhone: String,
  touristIdNumber: String,
  action: String,
  details: String,
  issuedAt: Date,
  issuedBy: String,
  validity: String,
  expiresAt: Date,
  nationality: String,
  emergencyContact: String,
  bloodGroup: String,
  previousHash: { type: String, required: true },
  nonce: Number,
  hash: { type: String, required: true, index: true },
  verificationCode: String,
  verified: { type: Boolean, default: false },
  merkleRoot: String,
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BlockchainLog', blockchainLogSchema);
