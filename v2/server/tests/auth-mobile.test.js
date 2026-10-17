const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
const Customer = require('../models/customer.model');
const Owner = require('../models/owner.model');
const { customerRegistrationSchema, loginSchema, ownerCreationSchema } = require('../validators/auth.validator');
const { mobileLookupCandidates } = require('../utils/mobile-number');
const { authenticateCustomer } = require('../services/customer-auth.service');
const { authenticateOwner } = require('../services/owner-auth.service');

const PASSWORD = 'sample-login-password';
const INDIAN_MOBILE = '9876543210';
const CANONICAL_MOBILE = '+919876543210';

test('login numbers combine a remembered country code with a national number', () => {
  assert.equal(loginSchema.parse({ mobile: '98765-43210', countryCode: '+91', password: PASSWORD }).mobile, CANONICAL_MOBILE);
  assert.equal(loginSchema.parse({ mobile: '98765 43210', countryCode: '91', password: PASSWORD }).mobile, CANONICAL_MOBILE);
});

test('full international mobile input remains supported and takes precedence over the remembered code', () => {
  assert.equal(loginSchema.parse({ mobile: '+1 (415) 555-0123', countryCode: '+91', password: PASSWORD }).mobile, '+14155550123');
  assert.equal(loginSchema.parse({ mobile: '+44 20 7946 0958', password: PASSWORD }).mobile, '+442079460958');
});

test('login validation rejects ambiguous national input without a country code and malformed values', () => {
  for (const input of [
    { mobile: INDIAN_MOBILE, password: PASSWORD },
    { mobile: INDIAN_MOBILE, countryCode: '+0', password: PASSWORD },
    { mobile: 'not-a-number', countryCode: '+91', password: PASSWORD },
    { mobile: '123456789012345678', countryCode: '+91', password: PASSWORD },
  ]) assert.throws(() => loginSchema.parse(input));
});

test('registration and owner creation still require full international E.164 numbers', () => {
  const password = 'sample-registration-password';
  assert.equal(customerRegistrationSchema.parse({ name: 'Customer', mobile: CANONICAL_MOBILE, password }).mobile, CANONICAL_MOBILE);
  assert.equal(ownerCreationSchema.parse({ name: 'Owner', mobile: CANONICAL_MOBILE, password }).mobile, CANONICAL_MOBILE);
  assert.throws(() => customerRegistrationSchema.parse({ name: 'Customer', mobile: INDIAN_MOBILE, password }));
});

test('lookup candidates preserve canonical plus and legacy no-plus stored numbers', () => {
  assert.deepEqual(mobileLookupCandidates(CANONICAL_MOBILE), [CANONICAL_MOBILE, '919876543210']);
  assert.deepEqual(mobileLookupCandidates('+14155550123'), ['+14155550123', '14155550123']);
});

test('customer login queries normalized numbers and accepts a legacy 91-prefixed record', async (t) => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const originalFindOne = Customer.findOne;
  let query;
  Customer.findOne = (filter) => {
    query = filter;
    return { select: async () => ({ _id: 'customer-id', name: 'Riya Shah', mobile: '919876543210', passwordHash }) };
  };
  t.after(() => { Customer.findOne = originalFindOne; });

  const customer = await authenticateCustomer({ mobile: '98765 43210', countryCode: '+91', password: PASSWORD });
  assert.deepEqual(query, { mobile: { $in: [CANONICAL_MOBILE, '919876543210'] } });
  assert.equal(customer.mobile, '919876543210');
});

test('owner login queries normalized numbers and accepts an existing +91 record', async (t) => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const originalFindOne = Owner.findOne;
  let query;
  Owner.findOne = (filter) => {
    query = filter;
    return { select: async () => ({ _id: 'owner-id', name: 'Owner', mobile: CANONICAL_MOBILE, passwordHash }) };
  };
  t.after(() => { Owner.findOne = originalFindOne; });

  const owner = await authenticateOwner({ mobile: '+91 98765-43210', countryCode: '+1', password: PASSWORD });
  assert.deepEqual(query, { ownerKey: 'primary', mobile: { $in: [CANONICAL_MOBILE, '919876543210'] } });
  assert.equal(owner.mobile, CANONICAL_MOBILE);
});

test('both login forms expose country code and national number fields', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  for (const file of ['customer/views/pages/login.ejs', 'admin/views/pages/login.ejs']) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    assert.match(source, /name="countryCode"/);
    assert.match(source, /name="mobile"/);
    assert.match(source, /autocomplete="tel-national"/);
    assert.match(source, /Country code is remembered on this device/);
    assert.match(source, /action="\/login"/);
  }
});
