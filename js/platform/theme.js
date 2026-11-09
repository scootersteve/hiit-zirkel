// Appearance: "auto" follows the device, "light"/"dark" force a scheme. The choice lives in
// the settings (IndexedDB); a copy in localStorage lets index.html apply it before the first
// paint, so a forced scheme never flashes the other one at start.

export const THEMES = ['auto', 'light', 'dark'];
const STORAGE_KEY = 'zd-theme';
// Must match --bg in css/tokens.css: the colour at the very top of every page.
const BAR_COLOR = { light: '#f2f2f7', dark: '#000000' };

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'auto';
  const root = document.documentElement;
  if (value === 'auto') delete root.dataset.theme;
  else root.dataset.theme = value;

  // Browser chrome / status bar: one colour per scheme while following the device, the same
  // colour in both when a scheme is forced.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = BAR_COLOR[value === 'auto' ? scheme : value];
  }

  try {
    if (value === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode: the setting still applies for this visit */
  }
  return value;
}
