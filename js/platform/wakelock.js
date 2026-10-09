// Keeps the screen on during a workout (Screen Wake Lock API, iOS 18.4+ also in home screen apps).
// The system drops the lock when the page is hidden, so it is requested again on return.

let lock = null;
let wanted = false;

async function request() {
  if (!('wakeLock' in navigator) || lock || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    // Denied (e.g. low power mode or browser policy). The timer works anyway, the screen may turn off.
    lock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') request();
});

export function keepAwake() {
  wanted = true;
  request();
}

export function allowSleep() {
  wanted = false;
  lock?.release().catch(() => {});
  lock = null;
}

export const isAwake = () => !!lock;
