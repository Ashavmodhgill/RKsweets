const { z } = require('zod');
const { normalizeMobileNumber, normalizeLoginMobileNumber } = require('../utils/mobile-number');

const e164MobileNumberSchema = z.string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid mobile number and country code.');

const mobileNumberSchema = z.string()
  .trim()
  .transform(normalizeMobileNumber)
  .pipe(e164MobileNumberSchema);

const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be no more than 72 UTF-8 bytes.');

const ownerCreationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  mobile: mobileNumberSchema,
  password: passwordSchema,
});

const customerRegistrationSchema = ownerCreationSchema;

const loginSchema = z.object({
  mobile: z.string().trim().min(1),
  countryCode: z.string().trim().optional(),
  password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
}).transform(({ mobile, countryCode, password }) => ({
  mobile: normalizeLoginMobileNumber(mobile, countryCode),
  password,
})).pipe(z.object({
  mobile: e164MobileNumberSchema,
  password: z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
}));

module.exports = { mobileNumberSchema, passwordSchema, customerRegistrationSchema, ownerCreationSchema, loginSchema };
