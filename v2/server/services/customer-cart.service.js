const MAX_ITEM_QUANTITY = 99;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function normalizeCart(lines) {
  if (!Array.isArray(lines)) return [];

  const merged = new Map();
  for (const line of lines) {
    const productId = typeof line?.productId === 'string' ? line.productId.toLowerCase() : '';
    const quantity = line?.quantity;
    if (!OBJECT_ID_PATTERN.test(productId) || !Number.isInteger(quantity) || quantity < 1) continue;

    const previous = merged.get(productId) || 0;
    merged.set(productId, Math.min(MAX_ITEM_QUANTITY, previous + quantity));
  }

  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

function ensureCustomerCart(session, customerId) {
  const authenticatedCustomerId = String(customerId);
  if (session.cartCustomerId !== authenticatedCustomerId) {
    session.cartCustomerId = authenticatedCustomerId;
    session.cart = [];
  } else {
    session.cart = normalizeCart(session.cart);
  }
  return session.cart;
}

function addCartItem(lines, productId, quantity) {
  const cart = normalizeCart(lines);
  const existing = cart.find((line) => line.productId === String(productId));
  if (existing && existing.quantity + quantity > MAX_ITEM_QUANTITY) {
    const error = new Error('Cart quantity cannot exceed 99 for one product.');
    error.code = 'CART_QUANTITY_LIMIT';
    throw error;
  }

  if (existing) existing.quantity += quantity;
  else cart.push({ productId: String(productId), quantity });
  return cart;
}

function updateCartItem(lines, productId, quantity) {
  const cart = normalizeCart(lines);
  const item = cart.find((line) => line.productId === String(productId));
  if (!item) return cart;
  item.quantity = quantity;
  return cart;
}

function removeCartItem(lines, productId) {
  return normalizeCart(lines).filter((line) => line.productId !== String(productId));
}

function productUnitLabel(product) {
  if (product.unitType === 'weight'
    && Number.isInteger(product.weightAmount)
    && ['g', 'kg'].includes(product.weightUnit)) {
    return `${product.weightAmount} ${product.weightUnit} pack`;
  }
  if (product.unitType === 'piece'
    && Number.isInteger(product.quantityPerPiece)
    && product.quantityPerPiece >= 1) {
    return `${product.quantityPerPiece} per piece`;
  }
  return null;
}

function isPurchasableProduct(product) {
  return product?.isAvailable === true
    && !(product.categoryId && typeof product.categoryId === 'object'
      && 'isActive' in product.categoryId && product.categoryId.isActive !== true)
    && productUnitLabel(product) !== null
    && Number.isSafeInteger(product.pricePaise)
    && product.pricePaise >= 0;
}

function buildCartView(lines, products) {
  const cart = normalizeCart(lines);
  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const items = [];

  for (const line of cart) {
    const product = productsById.get(line.productId);
    const unitLabel = product && productUnitLabel(product);
    if (!isPurchasableProduct(product)) continue;

    items.push({
      productId: line.productId,
      quantity: line.quantity,
      name: product.name,
      imageUrl: product.imageUrl || '',
      slug: product.slug,
      unitType: product.unitType,
      unitLabel,
      pricePaise: product.pricePaise,
      lineSubtotalPaise: product.pricePaise * line.quantity,
    });
  }

  const validIds = new Set(items.map((item) => item.productId));
  const retainedCart = cart.filter((line) => validIds.has(line.productId));
  return {
    cart: retainedCart,
    items,
    totalPaise: items.reduce((total, item) => total + item.lineSubtotalPaise, 0),
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    removedCount: cart.length - retainedCart.length,
  };
}

module.exports = {
  MAX_ITEM_QUANTITY,
  addCartItem,
  buildCartView,
  ensureCustomerCart,
  isPurchasableProduct,
  normalizeCart,
  productUnitLabel,
  removeCartItem,
  updateCartItem,
};
