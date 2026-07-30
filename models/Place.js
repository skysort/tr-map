const mongoose = require('mongoose');

const placeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  address: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  phone: { type: String, default: '' },
  website: { type: String, default: '' },
  image: { type: String, default: '' },
  status: { type: String, default: 'approved' },
  reportCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

placeSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Place', placeSchema);
