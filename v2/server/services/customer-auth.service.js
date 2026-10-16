const Customer = require('../models/customer.model');
const { customerRegistrationSchema, loginSchema } = require('../validators/auth.validator');
const { hashPassword, verifyPassword, verifyMissingAccountPassword } = require('./password-auth.service');

function customerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function toPublicCustomer(customer) {
  return {
    _id: String(customer._id),
    name: customer.name,
    mobile: customer.mobile,
    createdAt: customer.createdAt,
  };
}

async function registerCustomer(input) {
  const values = customerRegistrationSchema.parse(input);
  if (await Customer.exists({ mobile: values.mobile })) {
    throw customerError('MOBILE_ALREADY_REGISTERED', 'A customer already uses this mobile number.');
  }

  const passwordHash = await hashPassword(values.password);
  try {
    const customer = await Customer.create({
      name: values.name,
      mobile: values.mobile,
      passwordHash,
    });
    return toPublicCustomer(customer);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw customerError('MOBILE_ALREADY_REGISTERED', 'A customer already uses this mobile number.');
    }
    throw error;
  }
}

async function authenticateCustomer(input) {
  const values = loginSchema.parse(input);
  const customer = await Customer.findOne({ mobile: values.mobile }).select('+passwordHash');
  if (!customer) {
    await verifyMissingAccountPassword(values.password);
    return null;
  }
  if (!(await verifyPassword(values.password, customer.passwordHash))) return null;
  return toPublicCustomer(customer);
}

module.exports = { registerCustomer, authenticateCustomer };
