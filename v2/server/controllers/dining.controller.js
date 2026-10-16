const DiningTable = require('../models/dining-table.model');
const DiningVisit = require('../models/dining-visit.model');
const {
  clearDiningVisit, createTable, listDiningOverview, renameTable, rotateCredential, setTableActive, verifyCredential,
} = require('../services/dining.service');

function qrUrl(credential) {
  return `/dine/${encodeURIComponent(credential)}`;
}

async function index(req, res, next) {
  try {
    const allTables = await listDiningOverview({});
    const filter = ['available', 'occupied', 'pending', 'inactive', 'outstanding'].includes(req.query.filter) ? req.query.filter : 'all';
    const tables = allTables.filter((table) => {
      const outstanding = [...table.orders, ...table.legacyOrders].some((order) => ['pending_owner_acceptance', 'accepted', 'preparing', 'ready'].includes(order.status));
      if (filter === 'available') return table.isActive && !table.visit;
      if (filter === 'occupied') return table.isActive && table.visit?.status === 'occupied';
      if (filter === 'pending') return table.isActive && table.visit?.status === 'pending';
      if (filter === 'inactive') return !table.isActive;
      if (filter === 'outstanding') return outstanding;
      return true;
    });
    const issuedQrUrl = req.session.issuedQrUrl || '';
    delete req.session.issuedQrUrl;
    return res.render('admin/views/pages/dining', {
      pageTitle: 'Dining tables', account: req.authAccount, tables,
      notice: req.query.notice || '', issuedQrUrl, filter,
    });
  } catch (error) { return next(error); }
}

async function create(req, res, next) {
  try {
    const created = await createTable({ tableNumber: req.validated.body.tableNumber });
    req.session.issuedQrUrl = qrUrl(created.credential);
    return req.session.save((error) => error ? next(error) : res.redirect(303, '/dining?notice=created'));
  } catch (error) {
    if (error.code === 'DINING_TABLE_DUPLICATE') return res.status(409).render('admin/views/pages/dining', {
      pageTitle: 'Dining tables', account: req.authAccount, tables: await listDiningOverview({}), notice: 'duplicate', issuedQrUrl: '', filter: 'all',
    });
    return next(error);
  }
}

async function activate(req, res, next) {
  try {
    await setTableActive({ tableId: req.validated.params.tableId, isActive: req.validated.body.isActive });
    return res.redirect(303, '/dining?notice=updated');
  } catch (error) {
    if (['DINING_TABLE_HAS_VISIT', 'DINING_TABLE_HAS_ORDERS'].includes(error.code)) return res.redirect(303, '/dining?notice=deactivation-blocked');
    return next(error);
  }
}

async function rename(req, res, next) {
  try {
    await renameTable({ tableId: req.validated.params.tableId, tableNumber: req.validated.body.tableNumber });
    return res.redirect(303, '/dining?notice=updated');
  } catch (error) {
    if (error.code === 'DINING_TABLE_DUPLICATE') return res.redirect(303, '/dining?notice=duplicate');
    return next(error);
  }
}

async function regenerateQr(req, res, next) {
  try {
    const rotated = await rotateCredential({ tableId: req.validated.params.tableId });
    req.session.issuedQrUrl = qrUrl(rotated.credential);
    return req.session.save((error) => error ? next(error) : res.redirect(303, '/dining?notice=qr-regenerated'));
  } catch (error) { return next(error); }
}

async function clear(req, res, next) {
  try {
    const result = await clearDiningVisit({ tableId: req.validated.params.tableId, ownerId: req.authAccount._id });
    const notice = result.cleared ? 'cleared' : result.reason;
    return res.redirect(303, `/dining?notice=${encodeURIComponent(notice)}`);
  } catch (error) { return next(error); }
}

async function scan(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
    const table = await verifyCredential({ credential: req.params.credential });
    if (!table) return res.status(404).render('server/views/shared/error', {
      pageTitle: 'Table QR unavailable', statusCode: 404,
      message: 'This table QR is invalid, inactive, or has been replaced. Ask the owner for the current QR code.',
      details: [], portalPath: '/products',
    });
    if (table.currentVisitId) {
      const visit = await DiningVisit.findById(table.currentVisitId).lean();
      if (visit && req.session.auth?.accountId && String(visit.customerId) !== String(req.session.auth.accountId)) {
        return res.status(409).render('server/views/shared/error', {
          pageTitle: 'Table in use', statusCode: 409,
          message: 'This table is already associated with another customer visit. Please ask the owner for help.',
          details: [], portalPath: '/products',
        });
      }
    }
    req.session.dineInTableId = String(table._id);
    req.session.dineInCredentialHash = table.qrCredentialHash;
    req.session.dineInVisitId = table.currentVisitId ? String(table.currentVisitId) : null;
    req.session.dineInTableVersion = Number.isSafeInteger(table.lifecycleVersion) ? table.lifecycleVersion : 0;
    return req.session.save((error) => {
      if (error) return next(error);
      return res.redirect(303, req.session.auth?.accountId ? '/checkout' : '/login');
    });
  } catch (error) { return next(error); }
}

module.exports = { activate, clear, create, index, regenerateQr, rename, scan };
