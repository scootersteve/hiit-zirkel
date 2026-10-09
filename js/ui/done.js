// End screen: duration, rounds, circuit name, "Nochmal starten".

import { STATUS } from '../core/timer.js';
import { formatElapsed } from '../core/format.js';
import { esc } from './dom.js';

export function showDone(root, { result, onRepeat, onHome }) {
  const aborted = result.status === STATUS.ABORTED;
  // Show the plan only if reality differed (skips, +10 s, abort)
  const differs = Math.abs(result.actualMs - result.plannedMs) >= 1000;

  root.innerHTML = `
    <main class="page done">
      <p class="done-kicker ${aborted ? 'aborted' : ''}">${aborted ? 'Abgebrochen' : 'Geschafft'}</p>
      <h1>${esc(result.circuit.name)}</h1>
      <dl class="done-stats">
        <div><dt>Dauer</dt><dd>${formatElapsed(result.actualMs)}</dd></div>
        <div><dt>Runden</dt><dd>${result.roundsCompleted}/${result.rounds}</dd></div>
      </dl>
      ${differs ? `<p class="done-planned">Geplant waren ${formatElapsed(result.plannedMs)}</p>` : ''}
      <button class="btn primary" data-action="repeat">Nochmal starten</button>
      <button class="btn ghost" data-action="home">Zur Übersicht</button>
    </main>`;

  root.querySelector('[data-action="repeat"]').addEventListener('click', onRepeat);
  root.querySelector('[data-action="home"]').addEventListener('click', onHome);
}
