// Start screen (tab "Zirkel"): own circuits first, then the examples. Never empty: without own
// circuits it explains the next step and the examples can be started right away.

import { plannedDurationS } from '../core/plan.js';
import { formatDuration } from '../core/format.js';
import { SAMPLE_CIRCUITS } from '../data/samples.js';
import { esc, icon, mount } from './dom.js';

function circuitCard(c, kind) {
  const s = c.settings;
  const n = c.exercises.length;
  const meta = [
    `${n} ${n === 1 ? 'Übung' : 'Übungen'}`,
    `${s.rounds} ${s.rounds === 1 ? 'Runde' : 'Runden'}`,
    `${s.workS}/${s.restS} s`,
  ];
  const id = esc(c.id);
  return `
    <article class="card circuit">
      <div class="circuit-head">
        <div>
          <h3>${esc(c.name)}</h3>
          <p class="circuit-meta">${meta.join(' · ')}</p>
        </div>
        <span class="circuit-duration num" aria-label="Dauer ${formatDuration(plannedDurationS(s, c.exercises))} Minuten">${formatDuration(plannedDurationS(s, c.exercises))}</span>
      </div>
      <p class="circuit-exercises">${c.exercises.map((e) => esc(e.name)).join(', ')}</p>
      <div class="circuit-actions">
        <button class="btn primary" data-card="start" data-kind="${kind}" data-id="${id}">${icon('play')}Start</button>
        <button class="btn" data-card="edit" data-kind="${kind}" data-id="${id}">Bearbeiten</button>
      </div>
    </article>`;
}

export function showHome(root, {
  templates = [],
  nav = 'none',
  onStart,
  onNewCircuit = () => {},
  onEditCircuit = () => {},
}) {
  const own = templates.length
    ? `${templates.map((t) => circuitCard(t, 'template')).join('')}
       <button class="btn tinted" data-nav="new">${icon('plus')}Neuer Zirkel</button>`
    : `<div class="card empty-card">
         <h3>Noch kein eigener Zirkel</h3>
         <p>Stell dir aus den Übungen deinen eigenen Zirkel zusammen, oder starte gleich mit einem Beispiel.</p>
         <button class="btn primary" data-nav="new">${icon('plus')}Zirkel erstellen</button>
       </div>`;

  const screen = mount(root, `
    <main class="page">
      <header class="large-title"><h1>Circle Champ</h1></header>

      <h2 class="section-title">Meine Zirkel</h2>
      ${own}

      <h2 class="section-title">Beispiele</h2>
      ${SAMPLE_CIRCUITS.map((c) => circuitCard(c, 'sample')).join('')}
    </main>`, { nav, tabs: true });

  screen.querySelector('main').addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const { card, kind, id } = target.dataset;
    if (target.dataset.nav === 'new') {
      onNewCircuit();
    } else if (card) {
      const circuit = kind === 'template' ? templates.find((t) => t.id === id) : SAMPLE_CIRCUITS.find((c) => c.id === id);
      if (!circuit) return;
      if (card === 'start') onStart(circuit, kind);
      else onEditCircuit(circuit, kind);
    }
  });
}
