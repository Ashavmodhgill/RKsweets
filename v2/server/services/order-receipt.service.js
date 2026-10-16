const { ORDER_STATUS } = require('../constants/order-status');

const STATUS_LABELS = Object.freeze({
  [ORDER_STATUS.PENDING]: 'Awaiting owner acceptance',
  [ORDER_STATUS.ACCEPTED]: 'Accepted',
  [ORDER_STATUS.REJECTED]: 'Rejected',
  [ORDER_STATUS.PREPARING]: 'Preparing',
  [ORDER_STATUS.READY]: 'Ready for collection',
  [ORDER_STATUS.COMPLETED]: 'Completed',
  [ORDER_STATUS.CANCELLED]: 'Cancelled',
});

function formatPaise(paise) {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new TypeError('Receipt amounts must be non-negative integer paise.');
  const rupees = Math.floor(paise / 100);
  const remainder = String(paise % 100).padStart(2, '0');
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(rupees)}.${remainder}`;
}

function buildReceiptView(order, restaurant = null) {
  if (!order || !Array.isArray(order.items) || order.items.length === 0) {
    throw new TypeError('A persisted order snapshot is required for a receipt.');
  }
  let calculatedTotalPaise = 0;
  const items = order.items.map((item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1
      || !Number.isSafeInteger(item.unitPricePaise) || item.unitPricePaise < 0
      || !Number.isSafeInteger(item.lineTotalPaise)
      || item.quantity * item.unitPricePaise !== item.lineTotalPaise) {
      throw new TypeError('The stored order item totals are inconsistent.');
    }
    calculatedTotalPaise += item.lineTotalPaise;
    return {
      name: item.name,
      unitLabel: item.unitLabel,
      quantity: item.quantity,
      unitPrice: formatPaise(item.unitPricePaise),
      lineTotal: formatPaise(item.lineTotalPaise),
    };
  });
  if (!Number.isSafeInteger(calculatedTotalPaise) || calculatedTotalPaise !== order.totalPaise) {
    throw new TypeError('The stored order total is inconsistent.');
  }

  return {
    items,
    order: {
      ...order,
      totalFormatted: formatPaise(order.totalPaise),
      statusLabel: STATUS_LABELS[order.status] || 'Order status unavailable',
      tokenDisplay: Number.isSafeInteger(order.officialToken) && order.tokenDate
        ? `${order.tokenDate} · ${order.officialToken}` : '',
      fulfillmentLabel: order.fulfillmentMethod === 'dine_in'
        ? `Dine-in · Table ${order.tableSnapshot?.tableNumber || '—'}` : 'Pickup',
    },
    restaurant: {
      name: restaurant?.restaurantName?.trim() || 'RK Sweets',
      phone: restaurant?.businessPhone || '',
      address: restaurant?.businessAddress || null,
    },
    paymentLabel: order.fulfillmentMethod === 'dine_in'
      ? 'Payment not recorded — pay the staff at the counter.'
      : 'Payment not recorded — pay at the counter on collection.',
    receiptTitle: 'Order Receipt',
  };
}

async function loadOrderReceipt({ OrderModel, OwnerModel, recipientType, recipientId, orderId }) {
  const orderQuery = recipientType === 'customer'
    ? OrderModel.findOne({ _id: orderId, customerId: recipientId })
    : OrderModel.findById(orderId);
  const order = await orderQuery.lean();
  if (!order) return null;
  const owner = await OwnerModel.findOne({ ownerKey: 'primary' })
    .select('restaurantName businessPhone businessAddress').lean();
  return buildReceiptView(order, owner);
}

module.exports = { buildReceiptView, formatPaise, loadOrderReceipt };
