const test = require('node:test');
const assert = require('node:assert/strict');
const DiningTable = require('../models/dining-table.model');
const DiningVisit = require('../models/dining-visit.model');
const { clearDiningVisit, credentialHash, createOrReuseVisit, newCredential, verifyCredential } = require('../services/dining.service');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { establishAuthenticatedSession } = require('../services/auth-session.service');

const TABLE_ID = '65a000000000000000000020';
const CUSTOMER_ID = '65a000000000000000000010';
const OTHER_CUSTOMER_ID = '65a000000000000000000011';

test('secure table QR credentials are random, hashed at rest, and schema indexes preserve table identity', async () => {
  const credential = newCredential();
  assert.match(credential, /^[A-Za-z0-9_-]{40,50}$/);
  assert.notEqual(credentialHash(credential), credential);
  assert.notEqual(credential, newCredential());
  const tableIndexes = DiningTable.schema.indexes();
  const visitIndexes = DiningVisit.schema.indexes();
  assert.ok(tableIndexes.some(([keys, options]) => keys.tableNumber === 1 && options.unique));
  assert.ok(tableIndexes.some(([keys, options]) => keys.qrCredentialHash === 1 && options.unique && options.sparse));
  assert.ok(visitIndexes.some(([keys, options]) => keys.activeVisitKey === 1 && options.unique && options.sparse));
  assert.equal(DiningTable.schema.path('qrCredentialHash').options.select, false);
});

test('QR verification accepts only well-formed active credentials and queries using a digest', async () => {
  let requested;
  const Model = { findOne(filter) { requested = filter; return { select() { return { lean: async () => ({ _id: TABLE_ID }) }; } }; } };
  assert.equal(await verifyCredential({ credential: 'short', TableModel: Model }), null);
  assert.equal(requested, undefined);
  const credential = newCredential();
  const table = await verifyCredential({ credential, TableModel: Model });
  assert.equal(String(table._id), TABLE_ID);
  assert.deepEqual(requested, { qrCredentialHash: credentialHash(credential), isActive: true });
});

test('one table visit accepts repeat orders from its customer but rejects account switching', async () => {
  const table = { _id: TABLE_ID, tableNumber: 'T-04', isActive: true, qrCredentialHash: 'digest', currentVisitId: null };
  const visits = new Map();
  let nextVisit = 1;
  const TableModel = {
    findOneAndUpdate(filter) {
      return { select() { return { lean: async () => filter.qrCredentialHash === table.qrCredentialHash && table.isActive ? { ...table } : null }; } };
    },
    async updateOne(filter, update) {
      if ((table.currentVisitId || null) !== filter.currentVisitId) return { modifiedCount: 0 };
      table.currentVisitId = update.$set.currentVisitId;
      return { modifiedCount: 1 };
    },
  };
  const VisitModel = {
    findById(id) { return { session() { return { lean: async () => visits.get(String(id)) || null }; } }; },
    async create([visit]) {
      const created = { ...visit, _id: `visit-${nextVisit++}` };
      visits.set(created._id, created);
      return [{ ...created, toObject: () => ({ ...created }) }];
    },
  };
  const first = await createOrReuseVisit({ tableId: TABLE_ID, credentialDigest: 'digest', customerId: CUSTOMER_ID, TableModel, VisitModel, session: {} });
  const second = await createOrReuseVisit({ tableId: TABLE_ID, credentialDigest: 'digest', customerId: CUSTOMER_ID, TableModel, VisitModel, session: {} });
  assert.equal(first.visit._id, second.visit._id);
  assert.equal(first.visit.status, 'pending');
  await assert.rejects(createOrReuseVisit({ tableId: TABLE_ID, credentialDigest: 'digest', customerId: OTHER_CUSTOMER_ID, TableModel, VisitModel, session: {} }), { code: 'DINING_TABLE_IN_USE' });
});

test('manual table clearance blocks unresolved orders and preserves order history and statuses', async () => {
  const table = { _id: TABLE_ID, currentVisitId: 'visit-1' };
  const visit = { _id: 'visit-1', tableId: TABLE_ID, status: 'occupied', activeVisitKey: TABLE_ID };
  let orders = [{ _id: 'order-1', status: 'accepted' }];
  let visitUpdates = 0;
  const TableModel = {
    findOneAndUpdate() { return { lean: async () => ({ ...table }) }; },
    async updateOne(_filter, update) { if (update.$set.currentVisitId === null) table.currentVisitId = null; return { modifiedCount: 1 }; },
  };
  const VisitModel = {
    findOne() { return { session() { return { lean: async () => ({ ...visit }) }; } }; },
    findOneAndUpdate(_filter, update) {
      return { lean: async () => { visitUpdates += 1; Object.assign(visit, update.$set); delete visit.activeVisitKey; return { ...visit }; } };
    },
  };
  const OrderModel = {
    find() {
      return {
        sort() {
          return { session() { return { lean: async () => orders.filter((order) => ['pending_owner_acceptance', 'accepted', 'preparing', 'ready'].includes(order.status)) }; } };
        },
      };
    },
  };
  const startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} });
  const blocked = await clearDiningVisit({ tableId: TABLE_ID, ownerId: 'owner', TableModel, VisitModel, OrderModel, startSession });
  assert.equal(blocked.reason, 'unresolved-orders');
  assert.equal(table.currentVisitId, 'visit-1');
  assert.equal(visit.status, 'occupied');
  assert.equal(visitUpdates, 0);

  orders = [{ _id: 'order-1', status: 'completed' }];
  const cleared = await clearDiningVisit({ tableId: TABLE_ID, ownerId: 'owner', TableModel, VisitModel, OrderModel, startSession });
  assert.equal(cleared.cleared, true, JSON.stringify(cleared));
  assert.equal(visit.status, 'cleared');
  assert.equal(table.currentVisitId, null);
  assert.equal(orders[0].status, 'completed');
});

test('owner dining mutations are owner guarded and use validated CSRF-protected POST routes', () => {
  const routes = readFileSync(join(__dirname, '..', 'routes', 'admin.routes.js'), 'utf8');
  for (const path of ['/dining/tables', '/dining/tables/:tableId/status', '/dining/tables/:tableId/qr', '/dining/tables/:tableId/clear']) {
    const line = routes.split('\n').find((value) => value.includes(`'${path}'`));
    assert.match(line, /requireOwner/);
    assert.match(line, /validate/);
  }
  assert.match(routes, /router\.post\('\/dining\/tables\/:tableId\/clear'/);
  assert.match(routes, /router\.get\('\/dining'/);
});

test('customer authentication session regeneration preserves only verified dining context', async () => {
  const session = {
    dineInTableId: TABLE_ID,
    dineInCredentialHash: 'a'.repeat(64),
    dineInVisitId: 'visit-1',
    dineInTableVersion: 7,
    arbitraryReturnUrl: 'https://attacker.invalid',
    regenerate(callback) {
      for (const key of Object.keys(this)) if (!['regenerate', 'save'].includes(key)) delete this[key];
      callback();
    },
    save(callback) { callback(); },
  };
  await establishAuthenticatedSession({ session }, { _id: CUSTOMER_ID });
  assert.equal(session.auth.accountId, CUSTOMER_ID);
  assert.equal(session.dineInTableId, TABLE_ID);
  assert.equal(session.dineInCredentialHash, 'a'.repeat(64));
  assert.equal(session.dineInVisitId, 'visit-1');
  assert.equal(session.dineInTableVersion, 7);
  assert.equal(session.arbitraryReturnUrl, undefined);
});
