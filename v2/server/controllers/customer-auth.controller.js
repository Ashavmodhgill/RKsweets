const { registerCustomer, authenticateCustomer } = require('../services/customer-auth.service');
const { establishAuthenticatedSession, invalidateAuthenticatedSession } = require('../services/auth-session.service');

function showLogin(_req, res) {
  res.render('customer/views/pages/login', { pageTitle: 'Customer login', errorMessage: '' });
}

function showRegistration(_req, res) {
  res.render('customer/views/pages/register', { pageTitle: 'Create customer account', errors: [], form: {} });
}

async function login(req, res, next) {
  try {
    const account = await authenticateCustomer(req.validated.body);
    if (!account) {
      return res.status(401).render('customer/views/pages/login', {
        pageTitle: 'Customer login',
        errorMessage: 'Invalid mobile number or password.',
      });
    }
    await establishAuthenticatedSession(req, account);
    return res.redirect(303, '/');
  } catch (error) {
    return next(error);
  }
}

async function register(req, res, next) {
  try {
    const account = await registerCustomer(req.validated.body);
    await establishAuthenticatedSession(req, account);
    return res.redirect(303, '/');
  } catch (error) {
    if (error.code === 'MOBILE_ALREADY_REGISTERED') {
      return res.status(409).render('customer/views/pages/register', {
        pageTitle: 'Create customer account',
        errors: ['An account already uses this mobile number.'],
        form: { name: req.validated.body.name, mobile: req.validated.body.mobile },
      });
    }
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await invalidateAuthenticatedSession(req, res, 'rk_customer.sid');
    return res.redirect(303, '/login');
  } catch (error) {
    return next(error);
  }
}

module.exports = { showLogin, showRegistration, login, register, logout };
