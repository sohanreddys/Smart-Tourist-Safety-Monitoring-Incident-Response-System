const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  role: { type: String, enum: ['tourist', 'admin', 'medical', 'police', 'fire', 'disaster'], default: 'tourist' },
  department: { type: String, default: '' }, // human-readable: "City Hospital", "Central Police HQ", etc.
  // Extended profile fields
  nationality: { type: String, default: '' },
  passportNumber: { type: String, default: '' },
  dateOfBirth: { type: String, default: '' },
  gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
  emergencyContactName: { type: String, default: '' },
  emergencyContactPhone: { type: String, default: '' },
  emergencyContactRelation: { type: String, default: '' },
  address: { type: String, default: '' },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''], default: '' },
  medicalConditions: { type: String, default: '' },
  preferredLanguage: { type: String, default: 'English' },
  travelPurpose: { type: String, default: '' },
  // Status fields
  isOnline: { type: Boolean, default: false },
  lastLocation: {
    lat: Number,
    lng: Number,
    speed: Number,
    timestamp: Date,
  },
  profileCompleted: { type: Boolean, default: false },
}, { timestamps: true });

// Don't return password in JSON
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.id = obj._id.toString();
  return obj;
};

module.exports = mongoose.model('User', userSchema);
