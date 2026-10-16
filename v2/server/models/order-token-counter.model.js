const mongoose = require('mongoose');

const orderTokenCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Local business date YYYY-MM-DD.
  value: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
}, { versionKey: false, strict: 'throw', collection: 'order_token_counters' });

module.exports = mongoose.models.OrderTokenCounter
  || mongoose.model('OrderTokenCounter', orderTokenCounterSchema);
