// Tiny DOM helpers. Screens build their HTML with template strings; every user text goes through esc().

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Sets textContent only if it changed (the run screen redraws up to 60 times per second). */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// Own simple icons (inline SVG, no icon font)
const ICONS = {
  pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  back: '<path d="M5 5h2.5v14H5zM20 5v14L9 12z"/>',
  skip: '<path d="M16.5 5H19v14h-2.5zM4 5l11 7-11 7z"/>',
};
export const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
