const ORDER_STATUS = Object.freeze({
  PENDING: 'pending_owner_acceptance',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));
const COMPLETABLE_ORDER_STATUSES = Object.freeze([
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY,
]);

module.exports = { COMPLETABLE_ORDER_STATUSES, ORDER_STATUS, ORDER_STATUSES };
