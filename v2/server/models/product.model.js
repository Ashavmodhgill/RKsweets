const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  pricePaise: { type: Number, required: true, min: 0, max: 100000000, validate: Number.isSafeInteger },
  unitType: { type: String, required: true, enum: ['piece', 'weight'] },
  weightAmount: { type: Number, min: 1, max: 10000 },
  weightUnit: { type: String, enum: ['g', 'kg'] },
  quantityPerPiece: { type: Number, min: 1, max: 1000 },
  imageUrl: { type: String, default: '', maxlength: 500 },
  imagePublicId: { type: String, default: '', maxlength: 200 },
  prepMinutes: { type: Number, required: true, min: 0, max: 1440, validate: Number.isSafeInteger },
  isAvailable: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' });

productSchema.index({ slug: 1 }, { unique: true, name: 'unique_product_slug' });
productSchema.index({ isAvailable: 1, name: 1 });
productSchema.pre('validate', function validateUnitFields() {
  if (this.unitType === 'weight') {
    this.quantityPerPiece = undefined;
    if (!Number.isFinite(this.weightAmount) || !this.weightUnit) {
      this.invalidate('weightAmount', 'Weight products require a weight amount and unit.');
    }
  } else if (this.unitType === 'piece') {
    this.weightAmount = undefined;
    this.weightUnit = undefined;
    if (!Number.isInteger(this.quantityPerPiece) || this.quantityPerPiece < 1) {
      this.invalidate('quantityPerPiece', 'Piece products require a valid quantity per piece.');
    }
  }
});

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema, 'products');
