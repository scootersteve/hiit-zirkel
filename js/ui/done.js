// End screen: circuit name, duration, rounds, "Nochmal starten".

import { STATUS } from '../core/timer.js';
import { formatElapsed } from '../core/format.js';
import { esc, icon, mount } from './dom.js';

export function showDone(root, { result, onRepeat, onHome }) {
  const aborted = result.status === STATUS.ABORTED;
  // Show the plan only if reality differed (skips, +10 s, abort)
  const differs = Math.abs(result.actualMs - result.plannedMs) >= 1000;

  const screen = mount(root, `
    <main class="page done" data-screen="done">
      <div class="done-badge ${aborted ? 'aborted' : ''}" aria-hidden="true">${icon(aborted ? 'close' : 'check')}</div>
      <p class="done-kicker">${aborted ? 'Abgebrochen' : 'Geschafft'}</p>
      <h1>${esc(result.circuit.name || 'Zirkel')}</h1>
      <dl class="done-stats">
        <div><dt>Dauer</dt><dd class="num">${formatElapsed(result.actualMs)}</dd></div>
        <div><dt>Runden</dt><dd class="num">${result.roundsCompleted}/${result.rounds}</dd></div>
      </dl>
      ${differs ? `<p class="group-foot done-planned">Geplant waren ${formatElapsed(result.plannedMs)}.</p>` : ''}
      <div class="done-actions">
        <button class="btn primary" data-action="repeat">${icon('repeat')}Nochmal starten</button>
        <button class="btn" data-action="home">Fertig</button>
      </div>
    </main>`, { nav: 'fade' });

  screen.querySelector('[data-action="repeat"]').addEventListener('click', onRepeat);
  screen.querySelector('[data-action="home"]').addEventListener('click', onHome);
}
