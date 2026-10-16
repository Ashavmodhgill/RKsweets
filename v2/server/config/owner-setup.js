const { z } = require('zod');
const { mobileNumberSchema, passwordSchema } = require('../validators/auth.validator');

const ownerSetupSchema = z.object({
  MONGODB_URI: z.string().min(1),
  OWNER_SETUP_NAME: z.string().trim().min(2).max(80),
  OWNER_SETUP_MOBILE: mobileNumberSchema,
  OWNER_SETUP_PASSWORD: passwordSchema,
});

function readOwnerSetupEnv(source = process.env) {
  const result = ownerSetupSchema.safeParse(source);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid owner setup configuration. Check required fields: ${fields}.`);
  }
  return result.data;
}

module.exports = { readOwnerSetupEnv };
