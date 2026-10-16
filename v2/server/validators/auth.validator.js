const { z } = require('zod');
const { normalizeMobileNumber } = require('../utils/mobile-number');

const mobileNumberSchema = z.string()
  .trim()
  .transform(normalizeMobileNumber)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a mobile number in international format, such as +14155550123.'));

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be no more than 72 UTF-8 bytes.');

const customerRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mobile: mobileNumberSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  mobile: mobileNumberSchema,
  password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
});

module.exports = { mobileNumberSchema, passwordSchema, customerRegistrationSchema, loginSchema };
