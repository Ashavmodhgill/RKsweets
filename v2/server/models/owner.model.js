const mongoose = require('mongoose');
const addressSchema = require('./address.schema');

const ownerSchema = new mongoose.Schema({
  // A fixed unique key enforces one owner document without a shared role field.
  ownerKey: { type: String, required: true, default: 'primary', enum: ['primary'], immutable: true, select: false },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  mobile: { type: String, required: true, immutable: true },
  passwordHash: { type: String, required: true, select: false },
  restaurantName: { type: String, trim: true, maxlength: 100 },
  businessPhone: { type: String, trim: true, maxlength: 32 },
  businessAddress: { type: addressSchema, default: undefined },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.ownerKey;
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.ownerKey;
      delete ret.__v;
      return ret;
    },
  },
});

ownerSchema.index({ ownerKey: 1 }, { unique: true, name: 'single_owner' });
ownerSchema.index({ mobile: 1 }, { unique: true, name: 'unique_owner_mobile' });

module.exports = mongoose.models.Owner || mongoose.model('Owner', ownerSchema, 'owners');
