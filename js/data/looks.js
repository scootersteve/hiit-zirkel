// The looks the app offers (Einstellungen → Design). "standard" is the plain iOS-like design;
// the others are the anime-inspired token sets in css/looks.css, chosen with <html data-look>.
// `bar` is the page background of the look (= its --bg): the colour of the status bar area.
// test/tokens.test.js keeps this list and css/looks.css in step.

export const LOOKS = Object.freeze([
  { id: 'standard', name: 'Standard', hint: 'Ruhig und klar, wie eine iPhone-App', bar: { light: '#f2f2f7', dark: '#000000' }, swatch: ['#30d158', '#d42a30', '#0062cc'] },
  { id: 'flammen', name: 'Flammen', hint: 'Glut, Orange und Rot', bar: { light: '#fbf1e8', dark: '#140a06' }, swatch: ['#ff7a1a', '#c7300f', '#ffd24a'] },
  { id: 'ninja', name: 'Ninja', hint: 'Nachtblau mit Karmesin', bar: { light: '#eef0f6', dark: '#07080f' }, swatch: ['#3a35c9', '#d0203a', '#9fdcff'] },
  { id: 'wildnis', name: 'Wildnis', hint: 'Waldgrün, Erde und Gold', bar: { light: '#eff5ec', dark: '#060d08' }, swatch: ['#1f7a4a', '#bd3d0c', '#f2c94c'] },
  { id: 'donner', name: 'Donner', hint: 'Gewitterviolett mit Blitzgelb', bar: { light: '#f1f0f8', dark: '#08061a' }, swatch: ['#5a2fc9', '#b81656', '#ffd60a'] },
]);

export const LOOK_IDS = Object.freeze(LOOKS.map((l) => l.id));
export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];
