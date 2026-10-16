const { z } = require('zod');

const checkoutOrderSchema = z.object({
  fulfillmentMethod: z.enum(['pickup', 'dine_in']),
  idempotencyKey: z.string().uuid(),
});

const orderIdParamsSchema = z.object({
  orderId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid order.'),
});

const customerOrderHistorySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1').transform(Number).refine((n) => n >= 1 && n <= 10000),
});

module.exports = { checkoutOrderSchema, customerOrderHistorySchema, orderIdParamsSchema };
