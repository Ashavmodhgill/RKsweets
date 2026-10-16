const crypto = require('node:crypto');

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const FORMATS = Object.freeze({
  'image/jpeg': { ext: 'jpg', check: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b.at(-2) === 0xff && b.at(-1) === 0xd9 },
  'image/png': { ext: 'png', check: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { ext: 'webp', check: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
});

function imageError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function signature(params, secret) {
  const normalized = Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
  return crypto.createHash('sha1').update(`${normalized}${secret}`).digest('hex');
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw imageError('Choose a JPEG, PNG, or WebP image.', 400, 'INVALID_PRODUCT_IMAGE');
  const [, mime, encoded] = match;
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw imageError('Image must be 4 MiB or smaller.', 413, 'INVALID_PRODUCT_IMAGE');
  if (!buffer.length || !FORMATS[mime].check(buffer)) {
    throw imageError('The image content does not match its supported format.', 400, 'INVALID_PRODUCT_IMAGE');
  }
  return { mime, buffer };
}

function ensureCredentials(env) {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env;
  if (!cloud || !key || !secret) {
    throw imageError('Image uploads are not configured. Contact the administrator.', 503, 'IMAGE_UPLOAD_UNAVAILABLE');
  }
  return { cloud, key, secret };
}

async function cloudinaryRequest(path, fields, credentials, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  if (file) form.append('file', new Blob([file.buffer], { type: file.mime }), `product.${FORMATS[file.mime].ext}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(credentials.cloud)}/image/${path}`, {
      method: 'POST', body: form, signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('Cloud image service rejected the request.');
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadProductImage(dataUrl, env) {
  const credentials = ensureCredentials(env);
  const file = parseDataUrl(dataUrl);
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `product-${crypto.randomUUID()}`;
  const params = { public_id: publicId, timestamp };
  const result = await cloudinaryRequest('upload', {
    ...params, api_key: credentials.key, signature: signature(params, credentials.secret),
  }, credentials, file);
  let imageUrl;
  try { imageUrl = new URL(result.secure_url); } catch (_error) { imageUrl = null; }
  if (!imageUrl || imageUrl.protocol !== 'https:' || !imageUrl.hostname.endsWith('.cloudinary.com')
    || !result.public_id || result.public_id !== publicId) {
    throw new Error('Cloud image service returned an invalid upload result.');
  }
  return { imageUrl: imageUrl.toString(), imagePublicId: result.public_id };
}

async function deleteProductImage(publicId, env) {
  if (!publicId) return;
  const credentials = ensureCredentials(env);
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  await cloudinaryRequest('destroy', {
    ...params, api_key: credentials.key, signature: signature(params, credentials.secret),
  }, credentials);
}

module.exports = { MAX_IMAGE_BYTES, parseDataUrl, uploadProductImage, deleteProductImage };
