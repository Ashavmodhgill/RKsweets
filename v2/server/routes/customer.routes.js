const express = require('express');
const router = express.Router();
const customerAuth = require('../controllers/customer-auth.controller');
const customer = require('../controllers/customer.controller');
const { requireLoggedInCustomer, redirectIfAuthenticated } = require('../middlewares/auth');
const { loginAttemptLimiter } = require('../middlewares/auth-rate-limit');
const { validate } = require('../middlewares/validate');
const { customerRegistrationSchema, loginSchema } = require('../validators/auth.validator');

router.get('/login', redirectIfAuthenticated('customer'), customerAuth.showLogin);
router.post('/login', redirectIfAuthenticated('customer'), loginAttemptLimiter, validate(loginSchema), customerAuth.login);
router.get('/register', redirectIfAuthenticated('customer'), customerAuth.showRegistration);
router.post('/register', redirectIfAuthenticated('customer'), validate(customerRegistrationSchema), customerAuth.register);

router.get('/', requireLoggedInCustomer, customer.home);
router.get('/profile', requireLoggedInCustomer, customer.profile);
router.post('/logout', requireLoggedInCustomer, customerAuth.logout);

module.exports = router;
