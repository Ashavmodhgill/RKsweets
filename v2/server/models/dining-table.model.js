const mongoose = require('mongoose');

const diningTableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, trim: true, maxlength: 32, immutable: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' });

diningTableSchema.index({ tableNumber: 1 }, { unique: true, name: 'unique_dining_table_number' });

module.exports = mongoose.models.DiningTable
  || mongoose.model('DiningTable', diningTableSchema, 'dining_tables');
