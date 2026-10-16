const mongoose = require('mongoose');

const diningVisitSchema = new mongoose.Schema({
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiningTable', required: true, immutable: true },
  tableNumber: { type: String, required: true, trim: true, maxlength: 32, immutable: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
  activeVisitKey: { type: String, select: false },
  status: { type: String, enum: ['pending', 'occupied', 'cleared'], required: true, default: 'pending' },
  openedAt: { type: Date, required: true, immutable: true },
  occupiedAt: Date,
  clearedAt: Date,
  clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
}, { timestamps: true, strict: 'throw', collection: 'dining_visits' });

diningVisitSchema.index({ activeVisitKey: 1 }, { unique: true, sparse: true, name: 'one_current_visit_per_table' });
diningVisitSchema.index({ customerId: 1, openedAt: -1 }, { name: 'customer_dining_visits' });

module.exports = mongoose.models.DiningVisit || mongoose.model('DiningVisit', diningVisitSchema);
