const { z } = require('zod');

const businessDateParamsSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const businessDayConfirmSchema = z.object({ confirm: z.literal('yes') });

module.exports = { businessDateParamsSchema, businessDayConfirmSchema };
