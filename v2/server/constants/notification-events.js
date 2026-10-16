const NOTIFICATION_EVENT = Object.freeze({
  ORDER_PLACED: 'order_placed',
  ORDER_ACCEPTED: 'order_accepted',
  TOKEN_ASSIGNED: 'token_assigned',
  PREP_ESTIMATE_CONFIRMED: 'prep_estimate_confirmed',
  ORDER_REJECTED: 'order_rejected',
  ORDER_READY: 'order_ready',
  ORDER_COMPLETED: 'order_completed',
});

const NOTIFICATION_EVENTS = Object.freeze(Object.values(NOTIFICATION_EVENT));

function makeOrderNotificationEvent({
  orderId, recipientType, recipientId, eventType, title, message,
  orderToken, createdAt = new Date(),
}) {
  return {
    eventKey: `${String(orderId)}:${eventType}`,
    recipientType,
    ...(recipientId ? { recipientId } : {}),
    eventType,
    title,
    message,
    ...(Number.isSafeInteger(orderToken) ? { orderToken } : {}),
    createdAt,
    deliveredAt: null,
  };
}

function ownerOrderPlacedEvent(order) {
  return makeOrderNotificationEvent({
    orderId: order._id,
    recipientType: 'owner',
    eventType: NOTIFICATION_EVENT.ORDER_PLACED,
    title: 'New customer order',
    message: 'A customer order is waiting for owner review.',
    createdAt: order.createdAt || new Date(),
  });
}

function acceptedOrderEvents(order) {
  const common = {
    orderId: order._id,
    recipientType: 'customer',
    recipientId: order.customerId,
    orderToken: order.officialToken,
    createdAt: order.acceptedAt,
  };
  return [
    makeOrderNotificationEvent({ ...common, eventType: NOTIFICATION_EVENT.ORDER_ACCEPTED, title: 'Order accepted', message: 'The owner accepted your order.' }),
    makeOrderNotificationEvent({ ...common, eventType: NOTIFICATION_EVENT.TOKEN_ASSIGNED, title: 'Your order token is ready', message: `Your official token is ${order.officialToken} for ${order.tokenDate}.` }),
    makeOrderNotificationEvent({ ...common, eventType: NOTIFICATION_EVENT.PREP_ESTIMATE_CONFIRMED, title: 'Preparation estimate confirmed', message: `The confirmed preparation estimate is ${order.confirmedPrepMinutes} minutes. This is an estimate, not an exact ready time.` }),
  ];
}

function customerOrderEvent(order, eventType, title, message, createdAt = new Date()) {
  return makeOrderNotificationEvent({
    orderId: order._id, recipientType: 'customer', recipientId: order.customerId,
    eventType, title, message, orderToken: order.officialToken, createdAt,
  });
}

module.exports = { NOTIFICATION_EVENT, NOTIFICATION_EVENTS, acceptedOrderEvents, customerOrderEvent, makeOrderNotificationEvent, ownerOrderPlacedEvent };
