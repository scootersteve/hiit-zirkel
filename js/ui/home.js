// Start screen: own circuits (templates), example circuits, sound settings, and nav to the
// exercise library and the history. Templates are passed in; app.js loads them.

import { plannedDurationS } from '../core/plan.js';
import { formatDuration } from '../core/format.js';
import { SAMPLE_CIRCUITS } from '../data/samples.js';
import { VERSION } from '../version.js';
import * as audio from '../platform/audio.js';
import * as speech from '../platform/speech.js';
import { esc } from './dom.js';

const MODE_HINT = {
  playback: 'Töne kommen auch bei Stummschalter. Spotify wird beim ersten Ton pausiert und läuft danach nicht von selbst weiter.',
  ambient: 'Töne mischen sich mit Spotify. Stummschalter ausschalten, sonst sind die Töne stumm.',
};

const SIGNAL_LABELS = {
  workStart: 'Belastung',
  restStart: 'Pause',
  roundRestStart: 'Rundenpause',
  countdown: 'Countdown',
  halfway: 'Halbzeit',
  sideSwitch: 'Seitenwechsel',
  finished: 'Ende',
};

function circuitCard(c, kind) {
  const s = c.settings;
  const n = c.exercises.length;
  const meta = [
    `${n} ${n === 1 ? 'Übung' : 'Übungen'}`,
    `${s.rounds} Runden`,
    `${s.workS}/${s.restS} s`,
    s.roundRestS ? `Rundenpause ${s.roundRestS} s` : null,
  ].filter(Boolean);
  return `
    <article class="card">
      <div class="circuit-head">
        <h3>${esc(c.name)}</h3>
        <span class="circuit-duration">${formatDuration(plannedDurationS(s, c.exercises))}</span>
      </div>
      <p class="circuit-meta">${meta.join(' · ')}</p>
      <p class="circuit-exercises">${c.exercises.map((e) => esc(e.name)).join(', ')}</p>
      <div class="circuit-actions">
        <button class="btn primary" data-card="start" data-kind="${kind}" data-id="${esc(c.id)}">Start</button>
        <button class="btn ghost" data-card="edit" data-kind="${kind}" data-id="${esc(c.id)}">Bearbeiten</button>
      </div>
    </article>`;
}

const toggleRow = (key, label, hint, checked) => `
  <label class="row">
    <span class="row-label">${label}${hint ? `<span class="row-hint">${hint}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" data-toggle="${key}" ${checked ? 'checked' : ''}><span></span></span>
  </label>`;

export function showHome(root, {
  settings,
  templates = [],
  onStart,
  onSettingsChange = () => {},
  onOpenLibrary = () => {},
  onOpenHistory = () => {},
  onNewCircuit = () => {},
  onEditCircuit = () => {},
}) {
  document.body.classList.remove('running');
  root.innerHTML = `
    <main class="page">
      <header class="page-head">
        <h1>Zirkel Dojo</h1>
        <p class="muted">Zirkel zusammenstellen, speichern und starten.</p>
      </header>

      <div class="home-nav">
        <button class="btn ghost" data-nav="library">Übungen verwalten</button>
        <button class="btn ghost" data-nav="history">Verlauf</button>
      </div>

      <h2>Meine Zirkel</h2>
      ${templates.length
        ? templates.map((t) => circuitCard(t, 'template')).join('')
        : '<p class="muted home-empty">Noch keine eigenen Zirkel. Erstelle deinen ersten.</p>'}
      <button class="btn primary" data-nav="new">+ Neuer Zirkel</button>

      <h2>Beispiele</h2>
      ${SAMPLE_CIRCUITS.map((c) => circuitCard(c, 'sample')).join('')}

      <h2>Ton</h2>
      <section class="card">
        <div class="segmented" role="group" aria-label="Ton-Modus">
          <button data-mode="playback">Immer hörbar</button>
          <button data-mode="ambient">Musik-Modus</button>
        </div>
        <p class="mode-hint" data-mode-hint></p>
        <label class="row">
          <span class="row-label">Lautstärke der Töne</span>
          <input type="range" min="0.1" max="1" step="0.05" value="${settings.volume}" data-volume aria-label="Lautstärke">
        </label>
        ${toggleRow('voice', 'Sprachansage', '', settings.voice)}
        <p class="mode-hint" data-voice-hint hidden>Keine deutsche Stimme gefunden, Ansagen entfallen.</p>
        ${toggleRow('countdownBeeps', '3-Sekunden-Töne', '', settings.countdownBeeps)}
        ${toggleRow('halfwayBeep', 'Halbzeit-Ton', 'Seitenwechsel wird immer angesagt', settings.halfwayBeep)}
      </section>

      <h2>Signale anhören</h2>
      <section class="card">
        <p class="mode-hint">So klingen die Signale beim Training.</p>
        <div class="signal-grid">
          ${Object.entries(SIGNAL_LABELS)
            .map(([name, label]) => `<button class="btn" data-signal="${name}">${label}</button>`)
            .join('')}
        </div>
      </section>

      <p class="footer">Version ${esc(VERSION)}</p>
    </main>`;

  const modeButtons = root.querySelectorAll('[data-mode]');
  const renderMode = () => {
    modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === settings.soundMode)));
    root.querySelector('[data-mode-hint]').textContent = MODE_HINT[settings.soundMode];
  };
  renderMode();

  root.querySelector('.page').addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const { nav, card, kind, id, mode, signal } = target.dataset;
    if (nav === 'library') {
      onOpenLibrary();
    } else if (nav === 'history') {
      onOpenHistory();
    } else if (nav === 'new') {
      onNewCircuit();
    } else if (card) {
      const circuit = kind === 'template' ? templates.find((t) => t.id === id) : SAMPLE_CIRCUITS.find((c) => c.id === id);
      if (!circuit) return;
      if (card === 'start') onStart(circuit, kind);
      else onEditCircuit(circuit, kind);
    } else if (mode) {
      settings.soundMode = mode;
      audio.setMode(settings.soundMode);
      renderMode();
      onSettingsChange();
    } else if (signal) {
      audio.setMode(settings.soundMode);
      audio.setVolume(settings.volume);
      audio.unlock();
      audio.play(signal);
    }
  });

  root.querySelector('[data-volume]').addEventListener('input', (event) => {
    settings.volume = Number(event.target.value);
    audio.setVolume(settings.volume);
    onSettingsChange();
  });

  root.querySelectorAll('[data-toggle]').forEach((input) =>
    input.addEventListener('change', () => {
      settings[input.dataset.toggle] = input.checked;
      onSettingsChange();
    }),
  );

  // The voice list arrives late on iOS, so check again after a moment.
  const voiceHint = root.querySelector('[data-voice-hint]');
  setTimeout(() => {
    if (root.contains(voiceHint)) voiceHint.hidden = !!speech.germanVoiceName();
  }, 1000);
}
