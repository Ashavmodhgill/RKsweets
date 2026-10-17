const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeMobileNumber(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\s().-]/g, '');
}

function normalizeLoginMobileNumber(mobile, countryCode) {
  const normalizedMobile = normalizeMobileNumber(mobile);
  if (normalizedMobile.startsWith('+')) return normalizedMobile;
  if (typeof countryCode !== 'string' || !countryCode.trim()) return normalizedMobile;

  const normalizedCode = normalizeMobileNumber(countryCode);
  const internationalCode = normalizedCode.startsWith('+') ? normalizedCode : `+${normalizedCode}`;
  return `${internationalCode}${normalizedMobile}`;
}

function mobileLookupCandidates(value) {
  const normalized = normalizeMobileNumber(value);
  if (!E164_PATTERN.test(normalized)) return [normalized];
  return [...new Set([normalized, normalized.slice(1)])];
}

function isValidMobileNumber(value) {
  return E164_PATTERN.test(value);
}

module.exports = { normalizeMobileNumber, normalizeLoginMobileNumber, mobileLookupCandidates, isValidMobileNumber };
