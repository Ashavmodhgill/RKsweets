// Customer portal browser code belongs here; keep order validation authoritative on the server.
const storeMenuToggle = document.querySelector('#store-menu-toggle');
const storeNavigation = document.querySelector('#store-navigation');
const loginCountryCode = document.querySelector('#country-code');

if (loginCountryCode) {
  const storageKey = 'rk-sweets.login-country-code';
  const normalizeCountryCode = (value) => {
    const compact = value.trim().replace(/[\s().-]/g, '');
    return compact.startsWith('+') ? compact : `+${compact}`;
  };
  const isCountryCode = (value) => /^\+[1-9]\d{0,2}$/.test(value);

  try {
    const remembered = localStorage.getItem(storageKey);
    if (remembered && isCountryCode(remembered)) loginCountryCode.value = remembered;
  } catch {}

  const rememberCountryCode = () => {
    const normalized = normalizeCountryCode(loginCountryCode.value);
    if (!isCountryCode(normalized)) return;
    loginCountryCode.value = normalized;
    try { localStorage.setItem(storageKey, normalized); } catch {}
  };
  loginCountryCode.addEventListener('change', rememberCountryCode);
  loginCountryCode.form?.addEventListener('submit', rememberCountryCode);
}

if (storeMenuToggle && storeNavigation) {
  const closeStoreMenu = () => {
    storeNavigation.classList.remove('is-open');
    storeMenuToggle.setAttribute('aria-expanded', 'false');
    storeMenuToggle.setAttribute('aria-label', 'Open store navigation');
  };

  storeMenuToggle.addEventListener('click', () => {
    const isOpen = storeNavigation.classList.toggle('is-open');
    storeMenuToggle.setAttribute('aria-expanded', String(isOpen));
    storeMenuToggle.setAttribute('aria-label', isOpen ? 'Close store navigation' : 'Open store navigation');
  });
  storeNavigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeStoreMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStoreMenu();
  });
}
