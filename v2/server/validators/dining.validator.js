const { z } = require('zod');

const diningTableParamsSchema = z.object({ tableId: z.string().regex(/^[a-f\d]{24}$/i) });
const diningTableSchema = z.object({ tableNumber: z.string().trim().min(1).max(32).regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u) });
const diningTableStatusSchema = z.object({ isActive: z.enum(['true', 'false']).transform((value) => value === 'true') });
const diningClearSchema = z.object({ confirm: z.literal('yes') });

module.exports = { diningClearSchema, diningTableParamsSchema, diningTableSchema, diningTableStatusSchema };
