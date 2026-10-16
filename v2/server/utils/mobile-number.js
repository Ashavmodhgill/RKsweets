const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeMobileNumber(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\s().-]/g, '');
}

function isValidMobileNumber(value) {
  return E164_PATTERN.test(value);
}

module.exports = { normalizeMobileNumber, isValidMobileNumber };
