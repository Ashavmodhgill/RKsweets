const Customer = require('../models/customer.model');
const Owner = require('../models/owner.model');

const LOGIN_PATH = Object.freeze({ customer: '/login', owner: '/login' });
const SESSION_COOKIE = Object.freeze({ customer: 'rk_customer.sid', owner: 'rk_admin.sid' });

async function findSessionAccount(req, role) {
  const accountId = req.session?.auth?.accountId;
  if (!accountId) return null;
  const Model = role === 'owner' ? Owner : Customer;
  return Model.findById(accountId).select('_id name mobile').lean();
}

function clearSession(req, res, role, next) {
  if (!req.session) return next();
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(SESSION_COOKIE[role], { path: '/' });
    return next();
  });
}

function requireRole(role) {
  if (!LOGIN_PATH[role]) throw new TypeError('Unsupported account role.');
  return async (req, res, next) => {
    try {
      const account = await findSessionAccount(req, role);
      if (!account) {
        return clearSession(req, res, role, () => res.redirect(LOGIN_PATH[role]));
      }
      req.authAccount = account;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function redirectIfAuthenticated(role) {
  if (!LOGIN_PATH[role]) throw new TypeError('Unsupported account role.');
  return async (req, res, next) => {
    try {
      const account = await findSessionAccount(req, role);
      if (!account) return next();
      req.authAccount = account;
      return res.redirect('/');
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  requireLoggedInCustomer: requireRole('customer'),
  requireOwner: requireRole('owner'),
  redirectIfAuthenticated,
};
