// DOM helpers shared by all screens: escaping, own icons, mounting a screen with its
// transition, press feedback, and the short-lived toast.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Sets textContent only if it changed, so an unchanged value costs no style or layout work. */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// ---------- icons: drawn for this app (24 × 24, 2 px round strokes), no icon font ----------

const STROKE = {
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrowUp: '<path d="M12 19V5.5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v13.5M6 13l6 6 6-6"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7M10 11v5M14 11v5"/>',
  share: '<path d="M12 14.5V3.5M8 7l4-3.5L16 7M7.5 10.5H5.5v10h13v-10h-2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  // tab bar
  tabCircuits: '<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path d="M19.5 3.5v4.3h-4.3"/>',
  tabExercises: '<path d="M7 7.5v9M17 7.5v9M3.5 10v4M20.5 10v4M7 12h10"/>',
  tabHistory: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tabSettings: '<path d="M4 7.5h8M18 7.5h2M4 16.5h2M12 16.5h8"/><circle cx="15" cy="7.5" r="2.5"/><circle cx="9" cy="16.5" r="2.5"/>',
};
const SOLID = {
  play: '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.3-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>',
  pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>',
  back: '<path d="M5 5h2.5v14H5zM20 5v14L9 12z"/>',
  skip: '<path d="M16.5 5H19v14h-2.5zM4 5l11 7-11 7z"/>',
};

export function icon(name) {
  const solid = name in SOLID;
  const body = solid ? SOLID[name] : STROKE[name];
  if (!body) throw new Error(`Unbekanntes Icon: ${name}`);
  return `<svg class="icon${solid ? ' solid' : ''}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// ---------- screens ----------

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let ignoreTapsUntil = 0;

/**
 * Replaces the visible screen. `nav` picks the transition:
 *   'push' / 'pop'  going deeper / coming back (the screens slide)
 *   'fade'          a quick cross-over (start and end of a training)
 *   'none'          instant (tab change, first screen)
 * The new screen is in the DOM when this returns, so the caller can wire it right away.
 * Focus moves to its heading; for 350 ms real taps are ignored so a double tap on the control
 * that caused the change cannot hit whatever now sits under the finger.
 */
export function mount(root, html, { nav = 'none', tabs = false } = {}) {
  const old = root.querySelector(':scope > .screen:not(.is-leaving)');
  const screen = document.createElement('div');
  screen.className = `screen${tabs ? ' has-tabs' : ''}`;
  screen.innerHTML = html;

  const slides = old && (nav === 'push' || nav === 'pop');
  if (old) {
    if (slides && !reducedMotion()) leave(old, nav);
    else old.remove();
  }
  root.append(screen);
  window.scrollTo(0, 0);

  if (old && nav !== 'none') {
    const cls = slides ? `enter-${nav}` : 'enter-fade';
    screen.classList.add(cls);
    screen.addEventListener('animationend', () => screen.classList.remove(cls), { once: true });
  }

  ignoreTapsUntil = performance.now() + 350;
  const heading = screen.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  return screen;
}

// The outgoing screen keeps its scroll position while it slides away, pinned to the viewport.
function leave(old, nav) {
  old.style.top = `${-window.scrollY}px`;
  old.inert = true;
  old.classList.add('is-leaving', `leave-${nav}`);
  const remove = () => old.remove();
  old.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, 600); // safety net if the animation never runs
}

// ---------- touch behaviour (installed once) ----------

/**
 * Press feedback and tap hygiene for every control:
 * - `.is-pressed` from pointer-down, held for at least 120 ms, so even the quickest tap shows.
 * - Real taps right after a screen change are dropped (see mount).
 * - An empty touchstart listener: without one, iOS Safari does not apply :active reliably.
 */
export function installTouchBehaviour() {
  document.addEventListener('touchstart', () => {}, { passive: true });

  document.addEventListener('pointerdown', (event) => {
    const el = event.target.closest?.('button, .btn, .file-btn');
    if (!el || el.disabled) return;
    const downAt = performance.now();
    el.classList.add('is-pressed');
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      setTimeout(() => el.classList.remove('is-pressed'), Math.max(0, 120 - (performance.now() - downAt)));
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  });

  document.addEventListener(
    'click',
    (event) => {
      if (event.isTrusted && performance.now() < ignoreTapsUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
}

/**
 * Guards an async action against a second tap while the first is still running (saving twice,
 * two downloads). Returns a function that ignores calls until the pending one has settled.
 */
export function once(fn) {
  let busy = false;
  return async (...args) => {
    if (busy) return undefined;
    busy = true;
    try {
      return await fn(...args);
    } finally {
      busy = false;
    }
  };
}

// ---------- toast ----------

export function toast(message) {
  document.querySelectorAll('.toast').forEach((el) => el.remove()); // one at a time
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  void el.offsetWidth; // start state is committed, the transition can run
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}
