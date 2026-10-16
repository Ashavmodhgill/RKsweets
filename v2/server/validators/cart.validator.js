const { z } = require('zod');

const productId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid product.')
  .transform((value) => value.toLowerCase());
const quantity = z.string().trim().regex(/^\d+$/, 'Enter a whole-number quantity.')
  .transform(Number)
  .pipe(z.number().int().min(1, 'Quantity must be at least 1.').max(99, 'Quantity cannot exceed 99.'));

const cartProductParamsSchema = z.object({ productId });
const cartQuantitySchema = z.object({ quantity });

module.exports = { cartProductParamsSchema, cartQuantitySchema };
