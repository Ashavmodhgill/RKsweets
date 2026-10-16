const mongoose = require('mongoose');
const addressSchema = require('./address.schema');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  mobile: { type: String, required: true, immutable: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  address: { type: addressSchema, default: undefined },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    transform(_doc, ret) {
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    },
  },
});

customerSchema.index({ mobile: 1 }, { unique: true, name: 'unique_customer_mobile' });

module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema, 'customers');
