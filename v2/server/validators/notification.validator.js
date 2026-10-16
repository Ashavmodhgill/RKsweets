const { z } = require('zod');

const notificationIdParamsSchema = z.object({ notificationId: z.string().regex(/^[a-f\d]{64}$/i) });
const notificationLimitSchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default('50').transform(Number).refine((value) => value >= 1 && value <= 50),
});

module.exports = { notificationIdParamsSchema, notificationLimitSchema };
