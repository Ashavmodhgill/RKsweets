const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');

const BCRYPT_ROUNDS = 12;
let dummyPasswordHashPromise;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

async function verifyMissingAccountPassword(password) {
  dummyPasswordHashPromise ||= hashPassword(crypto.randomBytes(32).toString('base64url'));
  await verifyPassword(password, await dummyPasswordHashPromise);
}

module.exports = { hashPassword, verifyPassword, verifyMissingAccountPassword };
