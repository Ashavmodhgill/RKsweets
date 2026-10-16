const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  ADMIN_SESSION_SECRET: z.string().min(32, 'ADMIN_SESSION_SECRET must be at least 32 characters'),
  CUSTOMER_SESSION_SECRET: z.string().min(32, 'CUSTOMER_SESSION_SECRET must be at least 32 characters'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
});

function readEnv(source = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid server configuration:\n${messages.join('\n')}`);
  }

  if (result.data.ADMIN_SESSION_SECRET === result.data.CUSTOMER_SESSION_SECRET) {
    throw new Error('Admin and customer session secrets must be different.');
  }

  return Object.freeze(result.data);
}

module.exports = { readEnv };
