const { z } = require('zod');

const integerString = (min, max) => z.string().trim().regex(/^\d+$/, 'Enter a whole number.')
  .transform(Number).pipe(z.number().int().min(min).max(max));

const productFields = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(1).max(2000),
  categoryId: z.string().trim().regex(/^[a-f\d]{24}$/i).optional().default(''),
  priceRupees: z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/, 'Enter a valid INR price.')
    .transform((value) => Math.round(Number(value) * 100)).pipe(z.number().int().min(0).max(100000000)),
  unitType: z.enum(['piece', 'weight']),
  weightAmount: z.string().optional().default(''),
  weightUnit: z.enum(['g', 'kg']).optional().or(z.literal('')),
  quantityPerPiece: z.string().optional().default(''),
  prepMinutes: integerString(0, 1440),
}).superRefine((data, ctx) => {
  if (data.unitType === 'weight') {
    const amount = /^\d+$/.test(data.weightAmount) ? Number(data.weightAmount) : NaN;
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) {
      ctx.addIssue({ code: 'custom', path: ['weightAmount'], message: 'Enter a weight from 1 to 10000.' });
    }
    if (!['g', 'kg'].includes(data.weightUnit)) {
      ctx.addIssue({ code: 'custom', path: ['weightUnit'], message: 'Choose grams or kilograms.' });
    }
  } else {
    const quantity = /^\d+$/.test(data.quantityPerPiece) ? Number(data.quantityPerPiece) : NaN;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      ctx.addIssue({ code: 'custom', path: ['quantityPerPiece'], message: 'Enter a quantity from 1 to 1000.' });
    }
  }
}).transform((data) => ({
  name: data.name,
  description: data.description,
  categoryId: data.categoryId || '',
  pricePaise: data.priceRupees,
  unitType: data.unitType,
  ...(data.unitType === 'weight'
    ? { weightAmount: Number(data.weightAmount), weightUnit: data.weightUnit }
    : { quantityPerPiece: Number(data.quantityPerPiece) }),
  prepMinutes: data.prepMinutes,
}));

const imageSchema = z.object({
  dataUrl: z.string().max(5_600_000),
});

module.exports = { productFields, imageSchema };
