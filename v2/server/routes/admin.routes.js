const express = require('express');
const router = express.Router();
const adminAuth = require('../controllers/owner-auth.controller');
const admin = require('../controllers/admin.controller');
const { requireOwner, redirectIfAuthenticated } = require('../middlewares/auth');
const { loginAttemptLimiter } = require('../middlewares/auth-rate-limit');
const { validate } = require('../middlewares/validate');
const { loginSchema } = require('../validators/auth.validator');
const products = require('../controllers/admin-products.controller');
const { imageSchema } = require('../validators/product.validator');
const ownerOrders = require('../controllers/owner-orders.controller');
const { acceptOrderSchema, orderIdParamsSchema, ownerOrderFilterSchema, rejectOrderSchema } = require('../validators/owner-order.validator');

router.get('/login', redirectIfAuthenticated('owner'), adminAuth.showLogin);
router.post('/login', redirectIfAuthenticated('owner'), loginAttemptLimiter, validate(loginSchema), adminAuth.login);

// Protect every registered admin page and state-changing action.
router.get('/', requireOwner, admin.home);
router.post('/logout', requireOwner, adminAuth.logout);

router.get('/products', requireOwner, products.list);
router.get('/products/new', requireOwner, products.newForm);
router.post('/products/images', requireOwner, validate(imageSchema), products.uploadImage);
router.post('/products', requireOwner, products.create);
router.get('/products/:id/edit', requireOwner, products.loadForEdit);
router.post('/products/:id/edit', requireOwner, products.update);
router.post('/products/:id/availability', requireOwner, products.setAvailability);
router.post('/products/:id/delete', requireOwner, products.remove);

router.get('/orders', requireOwner, validate(ownerOrderFilterSchema, 'query'), ownerOrders.list);
router.get('/orders/:orderId', requireOwner, validate(orderIdParamsSchema, 'params'), ownerOrders.detail);
router.post('/orders/:orderId/accept', requireOwner, validate(orderIdParamsSchema, 'params'), validate(acceptOrderSchema), ownerOrders.accept);
router.post('/orders/:orderId/reject', requireOwner, validate(orderIdParamsSchema, 'params'), validate(rejectOrderSchema), ownerOrders.reject);
router.post('/orders/:orderId/complete', requireOwner, validate(orderIdParamsSchema, 'params'), ownerOrders.complete);

module.exports = router;
