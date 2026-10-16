// Training history: a list of past runs (newest first), each with date, circuit name, duration,
// rounds and whether it was finished or aborted. Clear-all behind a confirm.

import { formatDuration } from '../core/format.js';
import { esc } from './dom.js';

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function entryCard(h) {
  const aborted = h.status === 'aborted';
  const rounds = h.circuit?.settings?.rounds;
  const meta = [
    `${h.circuit?.exercises?.length ?? 0} Übungen`,
    rounds ? `${h.roundsCompleted}/${rounds} Runden` : `${h.roundsCompleted} Runden`,
  ].join(' · ');
  return `
    <article class="card hist-row">
      <div class="hist-main">
        <h3>${esc(h.circuit?.name || 'Zirkel')}</h3>
        <p class="circuit-meta">${esc(dateFmt.format(new Date(h.startedAt)))}</p>
        <p class="circuit-exercises">${esc(meta)}</p>
      </div>
      <div class="hist-side">
        <span class="hist-duration">${formatDuration(h.actualS)}</span>
        <span class="hist-status ${aborted ? 'aborted' : ''}">${aborted ? 'Abgebrochen' : 'Geschafft'}</span>
      </div>
    </article>`;
}

export async function showHistory(root, { db, onBack }) {
  const entries = (await db.listHistory()).sort((a, b) => b.startedAt - a.startedAt);

  root.innerHTML = `
    <main class="page">
      <header class="lib-head">
        <button class="icon-btn" data-action="back" aria-label="Zurück">‹ Zurück</button>
        <h1>Verlauf</h1>
        <span></span>
      </header>
      ${entries.length
        ? entries.map(entryCard).join('') + '<button class="btn ghost" data-action="clear">Verlauf leeren</button>'
        : '<p class="lib-empty">Noch keine Trainings aufgezeichnet.</p>'}

      <dialog class="confirm" data-el="dialog">
        <h2>Verlauf leeren?</h2>
        <p>Alle aufgezeichneten Trainings werden gelöscht. Das lässt sich nicht rückgängig machen.</p>
        <button class="btn danger" data-action="clear-confirm">Ja, leeren</button>
        <button class="btn ghost" data-action="clear-cancel">Abbrechen</button>
      </dialog>
    </main>`;

  const dialog = root.querySelector('[data-el="dialog"]');

  root.querySelector('main').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const { action } = btn.dataset;
    if (action === 'back') onBack();
    else if (action === 'clear') dialog.showModal();
    else if (action === 'clear-cancel') dialog.close();
    else if (action === 'clear-confirm') {
      dialog.close();
      db.clearHistory().then(() => showHistory(root, { db, onBack }));
    }
  });
}
