const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  mobile: { type: String, required: true, immutable: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ['customer', 'owner'], immutable: true },
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

accountSchema.index({ mobile: 1 }, { unique: true, name: 'unique_account_mobile' });
accountSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'owner' }, name: 'single_owner_account' },
);

module.exports = mongoose.models.Account || mongoose.model('Account', accountSchema);
