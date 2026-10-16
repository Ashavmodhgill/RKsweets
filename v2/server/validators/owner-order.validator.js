const { z } = require('zod');
const { ORDER_STATUSES } = require('../constants/order-status');
const orderIdParamsSchema = z.object({ orderId: z.string().regex(/^[a-f\d]{24}$/i) });
const ownerOrderFilterSchema = z.object({
  status: z.union([z.literal(''), z.enum(ORDER_STATUSES)]).optional().default(''),
  page: z.string().regex(/^\d+$/).optional().default('1').transform(Number).refine((n) => n >= 1 && n <= 10000),
});
const acceptOrderSchema = z.object({
  confirmedPrepMinutes: z.string().regex(/^\d{1,4}$/).transform(Number).refine((n) => n <= 1440),
  adjustmentReason: z.string().trim().max(300).optional().default(''),
});
const rejectOrderSchema = z.object({ reason: z.string().trim().min(1).max(500) });
module.exports = { acceptOrderSchema, orderIdParamsSchema, ownerOrderFilterSchema, rejectOrderSchema };
