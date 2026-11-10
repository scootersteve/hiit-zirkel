// Training history (tab "Verlauf"): the last four weeks as an overview (trainings and time per
// week), then every run, newest first, with "Nochmal starten". Clearing asks first.

import { formatDuration } from '../core/format.js';
import { weeklySummary } from '../core/stats.js';
import { esc, icon, mount, once, confirmSheet } from './dom.js';

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric' });

// "1:05 h" from 3900 s, "25 min" below an hour
function hoursMinutes(seconds) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h` : `${m} min`;
}

function weekLabel(week, i) {
  if (i === 0) return 'Diese Woche';
  if (i === 1) return 'Letzte Woche';
  return `${dayFmt.format(week.start)} bis ${dayFmt.format(week.end - 1)}`;
}

function weeksCard(weeks) {
  const max = Math.max(...weeks.map((w) => w.seconds), 1);
  return `
    <div class="group week-list">
      ${weeks.map((w, i) => `
        <div class="cell week-row">
          <span class="cell-label">${weekLabel(w, i)}<span class="cell-hint">${w.count} ${w.count === 1 ? 'Training' : 'Trainings'}</span></span>
          <span class="week-bar" aria-hidden="true"><span style="--w:${(w.seconds / max).toFixed(3)}"></span></span>
          <span class="week-time num">${hoursMinutes(w.seconds)}</span>
        </div>`).join('')}
    </div>`;
}

function entryRow(h) {
  const aborted = h.status === 'aborted';
  const rounds = h.circuit?.settings?.rounds;
  const when = new Date(h.startedAt);
  return `
    <div class="cell hist-row">
      <span class="hist-main">
        <span class="hist-name">${esc(h.circuit?.name || 'Zirkel')}</span>
        <span class="cell-hint">${esc(dateFmt.format(when))}, ${esc(timeFmt.format(when))} · ${rounds ? `${h.roundsCompleted}/${rounds}` : h.roundsCompleted} Runden${aborted ? ' · <span class="hist-aborted">abgebrochen</span>' : ''}</span>
      </span>
      <span class="hist-duration num">${formatDuration(h.actualS)}</span>
      <button class="tool-btn" data-repeat="${esc(h.id)}" aria-label="${esc(h.circuit?.name || 'Zirkel')} nochmal starten">${icon('repeat')}</button>
    </div>`;
}

// `entries` is loaded by the caller, so the screen appears at once. onCleared reloads the tab.
export function showHistory(root, { db, entries: loaded = [], nav = 'none', onRepeat = () => {}, onCleared = () => {} }) {
  const entries = [...loaded].sort((a, b) => b.startedAt - a.startedAt);

  const screen = mount(root, `
    <main class="page" data-screen="history">
      <header class="large-title"><h1>Verlauf</h1></header>
      ${entries.length ? `
        <h2 class="group-title">Wochen</h2>
        ${weeksCard(weeklySummary(entries))}
        <h2 class="group-title">Trainings</h2>
        <div class="group">${entries.map(entryRow).join('')}</div>
        <button class="btn ghost danger-text list-after" data-action="clear">Verlauf löschen</button>`
      : `<div class="card empty-card">
           <h3>Noch kein Training</h3>
           <p>Sobald du einen Zirkel startest, erscheint er hier mit Datum, Dauer und Runden, dazu deine Wochenübersicht.</p>
         </div>`}
    </main>`, { nav, tabs: true });

  const clear = once(async () => {
    const ok = await confirmSheet({
      title: 'Verlauf löschen?',
      message: 'Alle aufgezeichneten Trainings werden gelöscht. Das lässt sich nicht rückgängig machen.',
      confirmLabel: 'Verlauf löschen',
    });
    if (!ok) return;
    await db.clearHistory();
    onCleared();
  });

  screen.querySelector('main').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.dataset.action === 'clear') clear();
    else if (btn.dataset.repeat) {
      const entry = entries.find((e) => e.id === btn.dataset.repeat);
      if (entry?.circuit) onRepeat(entry);
    }
  });
}
