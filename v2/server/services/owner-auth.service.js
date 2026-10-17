const Owner = require('../models/owner.model');
const { loginSchema, ownerCreationSchema } = require('../validators/auth.validator');
const { mobileLookupCandidates } = require('../utils/mobile-number');
const { hashPassword, verifyPassword, verifyMissingAccountPassword } = require('./password-auth.service');

function ownerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isDuplicateKey(error) {
  return error?.code === 11000;
}

function toPublicOwner(owner) {
  return {
    _id: String(owner._id),
    name: owner.name,
    mobile: owner.mobile,
    restaurantName: owner.restaurantName,
    businessPhone: owner.businessPhone,
    businessAddress: owner.businessAddress,
    createdAt: owner.createdAt,
  };
}

async function authenticateOwner(input) {
  const values = loginSchema.parse(input);
  const owner = await Owner.findOne({ ownerKey: 'primary', mobile: { $in: mobileLookupCandidates(values.mobile) } }).select('+passwordHash');
  if (!owner) {
    await verifyMissingAccountPassword(values.password);
    return null;
  }
  if (!(await verifyPassword(values.password, owner.passwordHash))) return null;
  return toPublicOwner(owner);
}

async function createOwnerAccount(input) {
  const values = ownerCreationSchema.parse(input);
  if (await Owner.exists({ ownerKey: 'primary' })) {
    throw ownerError('OWNER_EXISTS', 'An owner account already exists; setup will not replace it.');
  }

  const passwordHash = await hashPassword(values.password);
  try {
    const owner = await Owner.create({
      ownerKey: 'primary',
      name: values.name,
      mobile: values.mobile,
      passwordHash,
    });
    return toPublicOwner(owner);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw ownerError('OWNER_EXISTS', 'Owner setup found a conflicting record and did not change any password.');
    }
    throw error;
  }
}

module.exports = { authenticateOwner, createOwnerAccount };
