const express = require('express');
const router = express.Router();
const adminAuth = require('../controllers/owner-auth.controller');
const admin = require('../controllers/admin.controller');
const { requireOwner, redirectIfAuthenticated } = require('../middlewares/auth');
const { loginAttemptLimiter } = require('../middlewares/auth-rate-limit');
const { validate } = require('../middlewares/validate');
const { loginSchema } = require('../validators/auth.validator');

router.get('/login', redirectIfAuthenticated('owner'), adminAuth.showLogin);
router.post('/login', redirectIfAuthenticated('owner'), loginAttemptLimiter, validate(loginSchema), adminAuth.login);

// Protect every registered admin page and state-changing action.
router.get('/', requireOwner, admin.home);
router.post('/logout', requireOwner, adminAuth.logout);

module.exports = router;
