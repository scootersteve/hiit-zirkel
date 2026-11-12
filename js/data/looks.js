// The looks the app offers (Einstellungen → Design), in the order of the list. "flammen" is the
// default (js/storage/db.js); "standard" is the calm iOS-like design the app started with. The
// others are the anime-inspired token sets in css/looks.css, chosen with <html data-look>.
// `bar` is the page background of the look (= its --bg): the colour of the status bar area.
// test/tokens.test.js keeps this list and css/looks.css in step.

export const LOOKS = Object.freeze([
  { id: 'flammen', name: 'Flammen', hint: 'Glut, Orange und Rot', bar: { light: '#fbf1e8', dark: '#140a06' }, swatch: ['#ff7a1a', '#c7300f', '#ffd24a'] },
  { id: 'ninja', name: 'Ninja', hint: 'Nachtblau mit Karmesin', bar: { light: '#eef0f6', dark: '#07080f' }, swatch: ['#3a35c9', '#d0203a', '#9fdcff'] },
  { id: 'wildnis', name: 'Wildnis', hint: 'Waldgrün, Erde und Gold', bar: { light: '#eff5ec', dark: '#060d08' }, swatch: ['#1f7a4a', '#bd3d0c', '#f2c94c'] },
  { id: 'donner', name: 'Donner', hint: 'Gewitterviolett mit Blitzgelb', bar: { light: '#f1f0f8', dark: '#08061a' }, swatch: ['#5a2fc9', '#b81656', '#ffd60a'] },
  { id: 'standard', name: 'Standard', hint: 'Ruhig und klar, wie eine iPhone-App, ohne Figur', bar: { light: '#f2f2f7', dark: '#000000' }, swatch: ['#30d158', '#d42a30', '#0062cc'] },
]);

export const LOOK_IDS = Object.freeze(LOOKS.map((l) => l.id));
// no look on <html> means the standard design, so an unknown id is read as "standard" here
export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS.find((l) => l.id === 'standard');

// Every look except "standard" has its own character in two poses: "ready" (start screen, design
// list, breaks in the training) and "cheer" (end screen). Looks listed in PORTRAIT_LOOKS have a
// painted portrait: a square picture with its own background (img/portraits/<look>-<pose>-<size>.webp,
// "ready" in 640 and 216 px, "cheer" in 640 px). All four looks have one; a look added without a
// portrait would fall back to a drawn figure (img/characters/<look>-<pose>.svg).
export const CHARACTER_POSES = Object.freeze(['ready', 'cheer']);
export const PORTRAIT_LOOKS = Object.freeze(['flammen', 'ninja', 'wildnis', 'donner']);
export const PORTRAIT_SIZES = Object.freeze({ ready: [640, 216], cheer: [640] });

/** True when the look's character is a painted portrait (square, with background). */
export const hasPortrait = (look) => PORTRAIT_LOOKS.includes(lookById(look).id);

/**
 * Path of a look's character picture, or null for the standard design, unknown looks and poses.
 * `size` picks the portrait size ("small" = 216 px for the design list and the training); drawn
 * figures are vector graphics and have one file per pose.
 */
export function characterSrc(look, pose = 'ready', size = 'large') {
  const id = lookById(look).id;
  if (id === 'standard' || !CHARACTER_POSES.includes(pose)) return null;
  if (!hasPortrait(id)) return `img/characters/${id}-${pose}.svg`;
  const px = size === 'small' && PORTRAIT_SIZES[pose].includes(216) ? 216 : 640;
  return `img/portraits/${id}-${pose}-${px}.webp`;
}
/** The look that is showing right now (set on <html> by platform/theme.js). */
export const currentLook = () => (typeof document === 'undefined' ? 'standard' : document.documentElement.dataset.look || 'standard');
