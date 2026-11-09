// Bottom tab bar: the four top-level areas. It lives outside #app (see index.html) so it stays
// put while screens change, and hides on pushed screens (editor, picker, training).

import { icon } from './dom.js';

const TABS = [
  ['home', 'Zirkel', 'tabCircuits'],
  ['library', 'Übungen', 'tabExercises'],
  ['history', 'Verlauf', 'tabHistory'],
  ['settings', 'Einstellungen', 'tabSettings'],
];

let bar = null;

export function initTabBar(el, onSelect) {
  bar = el;
  bar.innerHTML = TABS.map(
    ([id, label, iconName]) => `<button class="tab" data-nav="${id}">${icon(iconName)}<span>${label}</span></button>`,
  ).join('');
  bar.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-nav]');
    // tapping the tab you are on does nothing (it would only rebuild the same screen)
    if (tab && tab.getAttribute('aria-current') !== 'page') onSelect(tab.dataset.nav);
  });
}

/** Shows the bar with `active` highlighted, or hides it when `active` is null. */
export function setTab(active) {
  if (!bar) return;
  bar.hidden = !active;
  document.documentElement.toggleAttribute('data-tabbar', !!active); // lifts toast and update hint above the bar
  for (const tab of bar.children) {
    if (tab.dataset.nav === active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}
