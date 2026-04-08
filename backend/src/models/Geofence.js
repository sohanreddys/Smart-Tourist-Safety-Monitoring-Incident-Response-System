const mongoose = require('mongoose');

const geofenceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // 'circle' (legacy) or 'polygon'
  shape: { type: String, enum: ['circle', 'polygon'], default: 'circle' },
  // Circle fields (required for circle shape)
  lat: { type: Number },
  lng: { type: Number },
  radius: { type: Number },
  // Polygon fields: array of { lat, lng } vertices
  polygon: { type: [{ lat: Number, lng: Number, _id: false }], default: undefined },
  // Cached centroid so map markers / proximity queries work for both shapes
  centroidLat: { type: Number },
  centroidLng: { type: Number },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  category: { type: String, default: '' }, // e.g. lake, neighborhood, heritage, market
  description: { type: String, default: '' },
  city: { type: String, default: '' },
  source: { type: String, default: 'manual' }, // 'manual' | 'osm' | 'system'
  osmId: { type: String, default: '' },
  createdBy: { type: String, default: 'system' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

// Backfill lat/lng for legacy circle docs
geofenceSchema.pre('save', function (next) {
  if (this.shape === 'polygon' && Array.isArray(this.polygon) && this.polygon.length > 0) {
    const sum = this.polygon.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
    this.centroidLat = sum.lat / this.polygon.length;
    this.centroidLng = sum.lng / this.polygon.length;
    if (this.lat == null) this.lat = this.centroidLat;
    if (this.lng == null) this.lng = this.centroidLng;
    if (this.radius == null) this.radius = 0;
  } else if (this.shape === 'circle') {
    this.centroidLat = this.lat;
    this.centroidLng = this.lng;
  }
  next();
});

module.exports = mongoose.model('Geofence', geofenceSchema);
