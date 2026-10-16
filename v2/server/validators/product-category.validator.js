const { z } = require('zod');

const categoryIdParamsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const categoryNameSchema = z.object({ name: z.string().trim().min(2).max(60) });
const categoryStatusSchema = z.object({ isActive: z.enum(['true', 'false']).transform((value) => value === 'true') });

module.exports = { categoryIdParamsSchema, categoryNameSchema, categoryStatusSchema };
