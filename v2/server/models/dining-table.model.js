const mongoose = require('mongoose');

const diningTableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, trim: true, maxlength: 32 },
  qrCredentialHash: { type: String, required: true, match: /^[a-f\d]{64}$/i, select: false },
  isActive: { type: Boolean, default: true },
  currentVisitId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiningVisit', default: null },
  lifecycleVersion: { type: Number, default: 0, min: 0 },
}, { timestamps: true, strict: 'throw' });

diningTableSchema.index({ tableNumber: 1 }, { unique: true, name: 'unique_dining_table_number' });
diningTableSchema.index({ qrCredentialHash: 1 }, { unique: true, sparse: true, name: 'unique_dining_qr_credential' });

module.exports = mongoose.models.DiningTable
  || mongoose.model('DiningTable', diningTableSchema, 'dining_tables');
