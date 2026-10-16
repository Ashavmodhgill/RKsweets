const crypto = require('node:crypto');
const mongoose = require('mongoose');
const DiningTable = require('../models/dining-table.model');
const DiningVisit = require('../models/dining-visit.model');
const Order = require('../models/order.model');
const { UNRESOLVED_STATUSES } = require('./business-day.service');

function credentialHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function newCredential() {
  return crypto.randomBytes(32).toString('base64url');
}

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function createTable({ tableNumber, TableModel = DiningTable, credential = newCredential() }) {
  try {
    const table = await TableModel.create({ tableNumber: tableNumber.trim(), qrCredentialHash: credentialHash(credential), isActive: true });
    return { table: table.toObject(), credential };
  } catch (error) {
    if (error?.code === 11000) throw conflict('DINING_TABLE_DUPLICATE', 'A table already uses that number.');
    throw error;
  }
}

async function rotateCredential({ tableId, TableModel = DiningTable, credential = newCredential() }) {
  const table = await TableModel.findOneAndUpdate({ _id: tableId }, { $set: { qrCredentialHash: credentialHash(credential) }, $inc: { lifecycleVersion: 1 } }, { new: true, runValidators: true }).lean();
  if (!table) throw conflict('DINING_TABLE_NOT_FOUND', 'The table was not found.');
  return { table, credential };
}

async function renameTable({ tableId, tableNumber, TableModel = DiningTable }) {
  try {
    const table = await TableModel.findOneAndUpdate({ _id: tableId }, { $set: { tableNumber: tableNumber.trim() } }, { new: true, runValidators: true }).lean();
    if (!table) throw conflict('DINING_TABLE_NOT_FOUND', 'The table was not found.');
    return table;
  } catch (error) {
    if (error?.code === 11000) throw conflict('DINING_TABLE_DUPLICATE', 'A table already uses that number.');
    throw error;
  }
}

async function verifyCredential({ credential, TableModel = DiningTable }) {
  if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(credential)) return null;
  return TableModel.findOne({ qrCredentialHash: credentialHash(credential), isActive: true }).select('+qrCredentialHash').lean();
}

async function createOrReuseVisit({ tableId, credentialDigest, customerId, expectedVisitId = null, expectedTableVersion = null, TableModel = DiningTable, VisitModel = DiningVisit, session }) {
  const tableGuard = expectedVisitId ? {} : {
    currentVisitId: null,
    ...(Number.isSafeInteger(expectedTableVersion) ? { lifecycleVersion: expectedTableVersion } : {}),
  };
  const table = await TableModel.findOneAndUpdate(
    { _id: tableId, isActive: true, qrCredentialHash: credentialDigest, ...tableGuard },
    { $inc: { lifecycleVersion: 1 } }, { new: true, session },
  ).select('+qrCredentialHash').lean();
  if (!table) throw conflict('DINING_QR_INVALID', 'This table QR is no longer valid. Scan the current QR code.');
  let visit = table.currentVisitId ? await VisitModel.findById(table.currentVisitId).session(session).lean() : null;
  if (expectedVisitId && (!visit || String(visit._id) !== String(expectedVisitId))) {
    throw conflict('DINING_VISIT_CHANGED', 'This table visit has ended. Scan the table QR again before starting another visit.');
  }
  if (visit?.status === 'cleared') throw conflict('DINING_VISIT_CHANGED', 'This table visit has ended. Scan the table QR again before starting another visit.');
  if (visit && visit.status !== 'cleared') {
    if (String(visit.customerId) !== String(customerId)) {
      throw conflict('DINING_TABLE_IN_USE', 'This table is already associated with another customer visit. Please ask the owner for help.');
    }
    return { table, visit };
  }
  const [created] = await VisitModel.create([{
    tableId: table._id, tableNumber: table.tableNumber, customerId,
    status: 'pending', activeVisitKey: String(table._id), openedAt: new Date(),
  }], { session });
  const linked = await TableModel.updateOne(
    { _id: table._id, currentVisitId: table.currentVisitId || null, isActive: true },
    { $set: { currentVisitId: created._id } }, { session },
  );
  if (!linked.modifiedCount) throw conflict('DINING_VISIT_CONFLICT', 'The table visit changed. Refresh checkout and try again.');
  return { table, visit: created.toObject() };
}

async function confirmVisitOnAcceptance({ visitId, customerId, now, TableModel = DiningTable, VisitModel = DiningVisit, session }) {
  let visit = await VisitModel.findOneAndUpdate(
    { _id: visitId, customerId, status: 'pending' },
    { $set: { status: 'occupied', occupiedAt: now } },
    { new: true, runValidators: true, session },
  ).lean();
  if (!visit) {
    let query = VisitModel.findOne({ _id: visitId, customerId, status: 'occupied' });
    if (session) query = query.session(session);
    visit = await query.lean();
  }
  if (!visit) throw conflict('DINING_VISIT_CONFLICT', 'The dine-in table visit is no longer active.');
  const table = await TableModel.findOneAndUpdate(
    { _id: visit.tableId, currentVisitId: visit._id, isActive: true }, { $inc: { lifecycleVersion: 1 } }, { new: true, session },
  ).lean();
  if (!table) throw conflict('DINING_VISIT_CONFLICT', 'The dine-in table was cleared or changed.');
  return visit;
}

async function listDiningOverview({ TableModel = DiningTable, VisitModel = DiningVisit, OrderModel = Order }) {
  const tables = await TableModel.find({}).sort({ tableNumber: 1 }).lean();
  const visits = await VisitModel.find({ status: { $in: ['pending', 'occupied'] } }).lean();
  const visitsById = new Map(visits.map((visit) => [String(visit._id), visit]));
  const ids = visits.map((visit) => visit._id);
  const tableIds = tables.map((table) => table._id);
  const orders = tableIds.length ? await OrderModel.find({ 'tableSnapshot.tableId': { $in: tableIds } }).sort({ createdAt: 1 }).lean() : [];
  const ordersByVisit = new Map();
  const legacyOrdersByTable = new Map();
  for (const order of orders) {
    if (!order.tableSnapshot?.visitId) {
      const tableKey = String(order.tableSnapshot?.tableId);
      if (!legacyOrdersByTable.has(tableKey)) legacyOrdersByTable.set(tableKey, []);
      legacyOrdersByTable.get(tableKey).push(order);
      continue;
    }
    const key = String(order.tableSnapshot.visitId);
    if (!ordersByVisit.has(key)) ordersByVisit.set(key, []);
    ordersByVisit.get(key).push(order);
  }
  return tables.map((table) => {
    const visit = visitsById.get(String(table.currentVisitId));
    return {
      ...table,
      visit: visit || null,
      orders: visit ? ordersByVisit.get(String(visit._id)) || [] : [],
      legacyOrders: legacyOrdersByTable.get(String(table._id)) || [],
    };
  });
}

async function clearDiningVisit({ tableId, ownerId, now = new Date(), TableModel = DiningTable, VisitModel = DiningVisit, OrderModel = Order, startSession = () => mongoose.startSession() }) {
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const table = await TableModel.findOneAndUpdate(
        { _id: tableId, currentVisitId: { $ne: null } }, { $inc: { lifecycleVersion: 1 } }, { new: true, session },
      ).lean();
      if (!table) { result = { cleared: false, reason: 'not-occupied', orders: [] }; return; }
      const visit = await VisitModel.findOne({ _id: table.currentVisitId, status: { $in: ['pending', 'occupied'] } }).session(session).lean();
      if (!visit) {
        await TableModel.updateOne({ _id: table._id, currentVisitId: table.currentVisitId }, { $set: { currentVisitId: null } }, { session });
        result = { cleared: false, reason: 'already-cleared', orders: [] };
        return;
      }
      const outstanding = await OrderModel.find({
        status: { $in: UNRESOLVED_STATUSES },
        $or: [
          { 'tableSnapshot.visitId': visit._id },
          { 'tableSnapshot.tableId': table._id, 'tableSnapshot.visitId': { $exists: false } },
        ],
      }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
      if (outstanding.length) { result = { cleared: false, reason: 'unresolved-orders', orders: outstanding }; return; }
      const changed = await VisitModel.findOneAndUpdate(
        { _id: visit._id, status: { $in: ['pending', 'occupied'] }, activeVisitKey: String(table._id) },
        { $set: { status: 'cleared', clearedAt: now, clearedBy: ownerId }, $unset: { activeVisitKey: 1 } },
        { new: true, session, runValidators: true },
      ).lean();
      if (!changed) throw conflict('DINING_CLEAR_CONFLICT', 'The table visit changed while it was being cleared. Refresh and try again.');
      await TableModel.updateOne({ _id: table._id, currentVisitId: visit._id }, { $set: { currentVisitId: null } }, { session });
      result = { cleared: true, reason: '', orders: [] };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally { await session.endSession(); }
}

async function setTableActive({ tableId, isActive, TableModel = DiningTable, OrderModel = Order }) {
  if (!isActive) {
    const table = await TableModel.findById(tableId).lean();
    if (!table) throw conflict('DINING_TABLE_NOT_FOUND', 'The table was not found.');
    if (table.currentVisitId) throw conflict('DINING_TABLE_HAS_VISIT', 'Clear the current table visit before deactivating this table.');
    const activeOrder = await OrderModel.exists({ 'tableSnapshot.tableId': table._id, status: { $in: UNRESOLVED_STATUSES } });
    if (activeOrder) throw conflict('DINING_TABLE_HAS_ORDERS', 'Resolve outstanding orders before deactivating this table.');
  }
  const filter = isActive ? { _id: tableId } : { _id: tableId, currentVisitId: null };
  const table = await TableModel.findOneAndUpdate(filter, { $set: { isActive }, $inc: { lifecycleVersion: 1 } }, { new: true, runValidators: true }).lean();
  if (!table && !isActive) {
    const current = await TableModel.findById(tableId).lean();
    if (current?.currentVisitId) throw conflict('DINING_TABLE_HAS_VISIT', 'Clear the current table visit before deactivating this table.');
  }
  if (!table) throw conflict('DINING_TABLE_NOT_FOUND', 'The table was not found.');
  return table;
}

module.exports = {
  clearDiningVisit, confirmVisitOnAcceptance, createOrReuseVisit, createTable,
  credentialHash, listDiningOverview, newCredential, renameTable, rotateCredential, setTableActive, verifyCredential,
};
