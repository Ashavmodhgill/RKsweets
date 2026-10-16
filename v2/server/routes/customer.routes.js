const express = require('express');
const router = express.Router();
const customerAuth = require('../controllers/customer-auth.controller');
const customer = require('../controllers/customer.controller');
const { requireLoggedInCustomer, redirectIfAuthenticated } = require('../middlewares/auth');
const { loginAttemptLimiter } = require('../middlewares/auth-rate-limit');
const { validate } = require('../middlewares/validate');
const { customerRegistrationSchema, loginSchema } = require('../validators/auth.validator');
const products = require('../controllers/customer-products.controller');
const cart = require('../controllers/customer-cart.controller');
const orders = require('../controllers/customer-orders.controller');
const { loadCustomerCart } = require('../middlewares/customer-cart');
const { cartProductParamsSchema, cartQuantitySchema } = require('../validators/cart.validator');
const { checkoutOrderSchema, customerOrderHistorySchema, orderIdParamsSchema } = require('../validators/order.validator');

router.get('/login', redirectIfAuthenticated('customer'), customerAuth.showLogin);
router.post('/login', redirectIfAuthenticated('customer'), loginAttemptLimiter, validate(loginSchema), customerAuth.login);
router.get('/register', redirectIfAuthenticated('customer'), customerAuth.showRegistration);
router.post('/register', redirectIfAuthenticated('customer'), validate(customerRegistrationSchema), customerAuth.register);

router.get('/', requireLoggedInCustomer, loadCustomerCart, customer.home);
router.get('/profile', requireLoggedInCustomer, loadCustomerCart, customer.profile);
router.post('/logout', requireLoggedInCustomer, loadCustomerCart, customerAuth.logout);
router.get('/cart', requireLoggedInCustomer, loadCustomerCart, cart.show);
router.post('/cart/items/:productId', requireLoggedInCustomer, loadCustomerCart, validate(cartProductParamsSchema, 'params'), validate(cartQuantitySchema), cart.add);
router.post('/cart/items/:productId/update', requireLoggedInCustomer, loadCustomerCart, validate(cartProductParamsSchema, 'params'), validate(cartQuantitySchema), cart.update);
router.post('/cart/items/:productId/remove', requireLoggedInCustomer, loadCustomerCart, validate(cartProductParamsSchema, 'params'), cart.remove);
router.get('/checkout', requireLoggedInCustomer, loadCustomerCart, orders.showCheckout);
router.post('/checkout', requireLoggedInCustomer, loadCustomerCart, validate(checkoutOrderSchema), orders.place);
router.get('/orders', requireLoggedInCustomer, validate(customerOrderHistorySchema, 'query'), orders.history);
router.get('/orders/:orderId', requireLoggedInCustomer, validate(orderIdParamsSchema, 'params'), orders.confirmation);
router.get('/products', requireLoggedInCustomer, loadCustomerCart, products.list);
router.get('/products/:slug', requireLoggedInCustomer, loadCustomerCart, products.detail);

module.exports = router;
