const express = require('express');
const router = express.Router();
const adminAuth = require('../controllers/owner-auth.controller');
const admin = require('../controllers/admin.controller');
const { requireOwner, redirectIfAuthenticated } = require('../middlewares/auth');
const { loginAttemptLimiter } = require('../middlewares/auth-rate-limit');
const { validate } = require('../middlewares/validate');
const { loginSchema } = require('../validators/auth.validator');
const products = require('../controllers/admin-products.controller');
const categories = require('../controllers/admin-categories.controller');
const { categoryIdParamsSchema, categoryNameSchema, categoryStatusSchema } = require('../validators/product-category.validator');
const { imageSchema } = require('../validators/product.validator');
const ownerOrders = require('../controllers/owner-orders.controller');
const { acceptOrderSchema, orderIdParamsSchema, ownerOrderFilterSchema, rejectOrderSchema } = require('../validators/owner-order.validator');
const { notificationIdParamsSchema, notificationLimitSchema } = require('../validators/notification.validator');
const { createNotificationController } = require('../controllers/notification.controller');
const notifications = createNotificationController('owner');
const showReceipt = require('../controllers/order-receipt.controller').createOrderReceiptController('owner');
const businessDays = require('../controllers/business-day.controller');
const { businessDateParamsSchema, businessDayConfirmSchema } = require('../validators/business-day.validator');

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

router.get('/categories', requireOwner, categories.list);
router.post('/categories', requireOwner, validate(categoryNameSchema), categories.create);
router.post('/categories/:id', requireOwner, validate(categoryIdParamsSchema, 'params'), validate(categoryNameSchema), categories.update);
router.post('/categories/:id/status', requireOwner, validate(categoryIdParamsSchema, 'params'), validate(categoryStatusSchema), categories.setStatus);

router.get('/notifications', requireOwner, notifications.show);
router.get('/notifications/feed', requireOwner, validate(notificationLimitSchema, 'query'), notifications.feed);
router.get('/notifications/unread-count', requireOwner, notifications.unreadCount);
router.post('/notifications/read-all', requireOwner, notifications.markAllRead);
router.post('/notifications/:notificationId/read', requireOwner, validate(notificationIdParamsSchema, 'params'), notifications.markOneRead);

router.get('/business-days', requireOwner, businessDays.index);
router.post('/business-days/open', requireOwner, businessDays.open);
router.post('/business-days/close', requireOwner, validate(businessDayConfirmSchema), businessDays.requestClose);
router.post('/business-days/finalize', requireOwner, validate(businessDayConfirmSchema), businessDays.finalize);
router.get('/business-days/reports', requireOwner, businessDays.reports);
router.get('/business-days/reports/:businessDate', requireOwner, validate(businessDateParamsSchema, 'params'), businessDays.report);

router.get('/orders', requireOwner, validate(ownerOrderFilterSchema, 'query'), ownerOrders.list);
router.get('/orders/:orderId', requireOwner, validate(orderIdParamsSchema, 'params'), ownerOrders.detail);
router.get('/orders/:orderId/receipt', requireOwner, validate(orderIdParamsSchema, 'params'), showReceipt);
router.post('/orders/:orderId/accept', requireOwner, validate(orderIdParamsSchema, 'params'), validate(acceptOrderSchema), ownerOrders.accept);
router.post('/orders/:orderId/reject', requireOwner, validate(orderIdParamsSchema, 'params'), validate(rejectOrderSchema), ownerOrders.reject);
router.post('/orders/:orderId/complete', requireOwner, validate(orderIdParamsSchema, 'params'), ownerOrders.complete);

module.exports = router;
