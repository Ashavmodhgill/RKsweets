const Order = require('../models/order.model');
const Owner = require('../models/owner.model');
const { loadOrderReceipt } = require('../services/order-receipt.service');

function createOrderReceiptController(recipientType) {
  return async function showReceipt(req, res, next) {
    try {
      const receipt = await loadOrderReceipt({
        OrderModel: Order,
        OwnerModel: Owner,
        recipientType,
        recipientId: req.authAccount._id,
        orderId: req.validated.params.orderId,
      });
      if (!receipt) {
        const error = new Error('Order receipt not found.');
        error.statusCode = 404;
        error.code = 'NOT_FOUND';
        return next(error);
      }
      return res.render(`${recipientType === 'owner' ? 'admin' : 'customer'}/views/pages/order-receipt`, {
        pageTitle: receipt.receiptTitle,
        account: req.authAccount,
        isOwner: recipientType === 'owner',
        ...receipt,
      });
    } catch (error) { return next(error); }
  };
}

module.exports = { createOrderReceiptController };
