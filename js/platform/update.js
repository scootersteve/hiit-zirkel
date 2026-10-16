// Service worker registration and the "new version available" flow.
// A freshly deployed worker installs and then waits; the app is told (onUpdateReady) so it can
// show a hint. When the user taps it, applyUpdate tells the worker to take over; the resulting
// controllerchange reloads the page once onto the new version.

let triggeredUpdate = false;
let reloading = false;

export function registerServiceWorker({ onUpdateReady = () => {} } = {}) {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg);
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // "installed" + an existing controller means this is an update, not the first install.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(reg);
        });
      });
    })
    .catch((err) => console.warn('Service Worker Registrierung fehlgeschlagen:', err));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!triggeredUpdate || reloading) return; // ignore the first-install claim, reload only on a user update
    reloading = true;
    location.reload();
  });
}

export function applyUpdate(reg) {
  if (!reg?.waiting) return;
  triggeredUpdate = true;
  reg.waiting.postMessage({ type: 'skipWaiting' });
}
