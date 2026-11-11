// Appearance. Two independent choices:
//   theme  "auto" follows the device, "light" / "dark" force a scheme
//   look   "standard" or one of the anime-inspired looks (js/data/looks.js, css/looks.css),
//          plus "animations": whether the looks' effects move
// Both live in the settings (IndexedDB); copies in localStorage let index.html apply them before
// the first paint, so the app never flashes the wrong scheme or the standard design at start.

import { lookById } from '../data/looks.js';

export const THEMES = ['auto', 'light', 'dark'];
const THEME_KEY = 'zd-theme';
const LOOK_KEY = 'zd-look';
const ANIM_KEY = 'zd-anim';

const store = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: the setting still applies for this visit */
  }
};

// Browser chrome / status bar: the page background of the look, one colour per scheme while
// following the device, the same colour in both when a scheme is forced.
function paintBar() {
  const root = document.documentElement;
  const forced = root.dataset.theme;
  const bar = lookById(root.dataset.look).bar;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = bar[forced || scheme];
  }
}

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'auto';
  const root = document.documentElement;
  if (value === 'auto') delete root.dataset.theme;
  else root.dataset.theme = value;
  paintBar();
  store(THEME_KEY, value === 'auto' ? null : value);
  return value;
}

/** Sets the look and whether its effects move. Returns the look id that applies. */
export function applyLook(look, animations = true) {
  const id = lookById(look).id;
  const root = document.documentElement;
  if (id === 'standard') delete root.dataset.look;
  else root.dataset.look = id;
  if (animations) delete root.dataset.anim;
  else root.dataset.anim = 'off';
  paintBar();
  store(LOOK_KEY, id === 'standard' ? null : id);
  store(ANIM_KEY, animations ? null : 'off');
  return id;
}
