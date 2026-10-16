(() => {
  document.querySelectorAll('[data-print-page]').forEach((button) => {
    button.addEventListener('click', () => window.print());
  });
  const badge = document.querySelector('[data-notification-count]');
  if (!badge) return;
  const status = document.querySelector('#notification-refresh-status');
  let timer;
  let stopped = false;

  async function refresh() {
    if (stopped || document.hidden) return;
    try {
      const response = await fetch(badge.dataset.notificationCountUrl, {
        headers: { accept: 'application/json' }, credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Notification count unavailable');
      const data = await response.json();
      const count = Number.isSafeInteger(data.unreadCount) && data.unreadCount > 0 ? data.unreadCount : 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
      badge.setAttribute('aria-label', `${count} unread notifications`);
      if (status) status.textContent = 'Unread count is up to date. New order updates are checked every 25 seconds while this page is visible.';
    } catch {
      badge.dataset.notificationError = 'true';
      if (status) status.textContent = 'Live notification updates are temporarily unavailable. Reload this page to try again.';
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!stopped && !document.hidden) timer = setTimeout(async () => { await refresh(); schedule(); }, 25_000);
  }

  function onVisibilityChange() {
    if (document.hidden) clearTimeout(timer);
    else { refresh().finally(schedule); }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }, { once: true });
  refresh().finally(schedule);
})();
