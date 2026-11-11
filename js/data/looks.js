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

// Every look except "standard" has its own figure (original drawings, img/characters/), in two
// poses: "ready" (start screen, breaks in the training) and "cheer" (end screen).
export const CHARACTER_POSES = Object.freeze(['ready', 'cheer']);
/** Path of a look's figure, or null for the standard design and unknown looks. */
export function characterSrc(look, pose = 'ready') {
  const id = lookById(look).id;
  return id === 'standard' || !CHARACTER_POSES.includes(pose) ? null : `img/characters/${id}-${pose}.svg`;
}
/** The look that is showing right now (set on <html> by platform/theme.js). */
export const currentLook = () => (typeof document === 'undefined' ? 'standard' : document.documentElement.dataset.look || 'standard');
