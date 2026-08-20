const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, min: 0, max: 100, default: 0 },
  discountAmount: { type: Number, min: 0, default: 0 },
  minFare: { type: Number, min: 0, default: 0 },
  maxDiscount: { type: Number, min: 0, default: 0 },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  usageLimit: { type: Number, default: 0 },
  usedCount: { type: Number, default: 0 },
  applicableRoutes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Routes' }],
  applicableBusTypes: [String],
  targetAudience: { type: String, enum: ['all', 'new_users', 'existing_users'], default: 'all' },
  imageUrl: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Offer', offerSchema);
