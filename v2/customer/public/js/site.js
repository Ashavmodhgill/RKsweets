// Customer portal browser code belongs here; keep order validation authoritative on the server.
const storeMenuToggle = document.querySelector('#store-menu-toggle');
const storeNavigation = document.querySelector('#store-navigation');

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
