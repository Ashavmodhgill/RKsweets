const { authenticateOwner } = require('../services/owner-auth.service');
const { establishAuthenticatedSession, invalidateAuthenticatedSession } = require('../services/auth-session.service');

function showLogin(_req, res) {
  res.render('admin/views/pages/login', { pageTitle: 'Owner login', errorMessage: '' });
}

async function login(req, res, next) {
  try {
    const account = await authenticateOwner(req.validated.body);
    if (!account) {
      return res.status(401).render('admin/views/pages/login', {
        pageTitle: 'Owner login',
        errorMessage: 'Invalid mobile number or password.',
      });
    }
    await establishAuthenticatedSession(req, account);
    return res.redirect(303, '/');
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    await invalidateAuthenticatedSession(req, res, 'rk_admin.sid');
    return res.redirect(303, '/login');
  } catch (error) {
    return next(error);
  }
}

module.exports = { showLogin, login, logout };
