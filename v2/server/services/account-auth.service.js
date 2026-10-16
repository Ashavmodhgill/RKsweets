const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const Account = require('../models/account.model');
const { customerRegistrationSchema, loginSchema } = require('../validators/auth.validator');

const BCRYPT_ROUNDS = 12;
let dummyPasswordHashPromise;

function accountError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function toPublicAccount(account) {
  return {
    _id: String(account._id),
    name: account.name,
    mobile: account.mobile,
    role: account.role,
    createdAt: account.createdAt,
  };
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

async function registerCustomer(input) {
  const values = customerRegistrationSchema.parse(input);
  if (await Account.exists({ mobile: values.mobile })) {
    throw accountError('MOBILE_ALREADY_REGISTERED', 'An account already uses this mobile number.');
  }

  const passwordHash = await hashPassword(values.password);
  try {
    const account = await Account.create({
      name: values.name,
      mobile: values.mobile,
      passwordHash,
      role: 'customer',
    });
    return toPublicAccount(account);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw accountError('MOBILE_ALREADY_REGISTERED', 'An account already uses this mobile number.');
    }
    throw error;
  }
}

async function authenticateForRole(input, expectedRole) {
  const values = loginSchema.parse(input);
  const account = await Account.findOne({ mobile: values.mobile, role: expectedRole })
    .select('+passwordHash');
  if (!account) {
    // Keep missing-account and wrong-password failures closer in cost without revealing a stored hash.
    dummyPasswordHashPromise ||= hashPassword(crypto.randomBytes(32).toString('base64url'));
    await verifyPassword(values.password, await dummyPasswordHashPromise);
    return null;
  }
  if (!(await verifyPassword(values.password, account.passwordHash))) return null;
  return toPublicAccount(account);
}

function authenticateCustomer(input) {
  return authenticateForRole(input, 'customer');
}

function authenticateOwner(input) {
  return authenticateForRole(input, 'owner');
}

async function createOwnerAccount(input) {
  const values = customerRegistrationSchema.parse(input);
  if (await Account.exists({ role: 'owner' })) {
    throw accountError('OWNER_EXISTS', 'An owner account already exists; setup will not replace it.');
  }
  if (await Account.exists({ mobile: values.mobile })) {
    throw accountError('OWNER_MOBILE_IN_USE', 'The owner mobile number is already assigned to an account.');
  }

  const passwordHash = await hashPassword(values.password);
  try {
    const account = await Account.create({
      name: values.name,
      mobile: values.mobile,
      passwordHash,
      role: 'owner',
    });
    return toPublicAccount(account);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw accountError('OWNER_EXISTS', 'Owner setup found a conflicting account and did not change any password.');
    }
    throw error;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  registerCustomer,
  authenticateCustomer,
  authenticateOwner,
  createOwnerAccount,
};
