// Training history: a list of past runs (newest first), each with date, circuit name, duration,
// rounds and whether it was finished or aborted. Clear-all behind a confirm.

import { formatDuration } from '../core/format.js';
import { esc, mount, once } from './dom.js';

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

// `entries` is loaded by the caller, so the screen appears at once. onCleared reloads the tab.
export function showHistory(root, { db, entries: loaded = [], nav = 'none', onCleared = () => {} }) {
  const entries = [...loaded].sort((a, b) => b.startedAt - a.startedAt);

  const screen = mount(root, `
    <main class="page" data-screen="history">
      <header class="large-title"><h1>Verlauf</h1></header>
      ${entries.length
        ? entries.map(entryCard).join('') + '<button class="btn ghost danger-text" data-action="clear">Verlauf leeren</button>'
        : `<div class="card empty-card">
             <h3>Noch kein Training</h3>
             <p>Sobald du einen Zirkel startest, erscheint er hier mit Datum, Dauer und Runden.</p>
           </div>`}

      <dialog class="confirm" data-el="dialog">
        <h2>Verlauf leeren?</h2>
        <p>Alle aufgezeichneten Trainings werden gelöscht. Das lässt sich nicht rückgängig machen.</p>
        <button class="btn danger" data-action="clear-confirm">Ja, leeren</button>
        <button class="btn ghost" data-action="clear-cancel">Abbrechen</button>
      </dialog>
    </main>`, { nav, tabs: true });

  const dialog = screen.querySelector('[data-el="dialog"]');
  const clear = once(async () => {
    dialog.close();
    await db.clearHistory();
    onCleared();
  });

  screen.querySelector('main').addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'clear') dialog.showModal();
    else if (action === 'clear-cancel') dialog.close();
    else if (action === 'clear-confirm') clear();
  });
}
