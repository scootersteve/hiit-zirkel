// Start screen (preview): sample circuits and sound settings.
// Later the settings move to their own page and the circuits come from saved templates.

import { plannedDurationS } from '../core/plan.js';
import { formatDuration } from '../core/format.js';
import { SAMPLE_CIRCUITS } from '../data/samples.js';
import { VERSION } from '../version.js';
import * as audio from '../platform/audio.js';
import * as speech from '../platform/speech.js';
import { esc } from './dom.js';

const MODE_HINT = {
  playback: 'Töne kommen auch bei Stummschalter. Andere Musik (z.B. Spotify) wird dabei pausiert.',
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

function circuitCard(c) {
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
        <span class="circuit-duration">${formatDuration(plannedDurationS(s, n))}</span>
      </div>
      <p class="circuit-meta">${meta.join(' · ')}</p>
      <p class="circuit-exercises">${c.exercises.map((e) => esc(e.name)).join(', ')}</p>
      <button class="btn primary" data-start="${esc(c.id)}">Start</button>
    </article>`;
}

const toggleRow = (key, label, hint, checked) => `
  <label class="row">
    <span class="row-label">${label}${hint ? `<span class="row-hint">${hint}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" data-toggle="${key}" ${checked ? 'checked' : ''}><span></span></span>
  </label>`;

export function showHome(root, { settings, onStart }) {
  document.body.classList.remove('running');
  root.innerHTML = `
    <main class="page">
      <header class="page-head">
        <h1>Zirkel Dojo</h1>
        <p class="muted">Vorschau: Timer mit Beispiel-Zirkeln. Editor, eigene Vorlagen und Verlauf folgen.</p>
      </header>

      <h2>Zirkel</h2>
      ${SAMPLE_CIRCUITS.map(circuitCard).join('')}

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
    if (target.dataset.start) {
      const circuit = SAMPLE_CIRCUITS.find((c) => c.id === target.dataset.start);
      if (circuit) onStart(circuit);
    } else if (target.dataset.mode) {
      settings.soundMode = target.dataset.mode;
      audio.setMode(settings.soundMode);
      renderMode();
    } else if (target.dataset.signal) {
      audio.setMode(settings.soundMode);
      audio.setVolume(settings.volume);
      audio.unlock();
      audio.play(target.dataset.signal);
    }
  });

  root.querySelector('[data-volume]').addEventListener('input', (event) => {
    settings.volume = Number(event.target.value);
    audio.setVolume(settings.volume);
  });

  root.querySelectorAll('[data-toggle]').forEach((input) =>
    input.addEventListener('change', () => {
      settings[input.dataset.toggle] = input.checked;
    }),
  );

  // The voice list arrives late on iOS, so check again after a moment.
  const voiceHint = root.querySelector('[data-voice-hint]');
  setTimeout(() => {
    if (root.contains(voiceHint)) voiceHint.hidden = !!speech.germanVoiceName();
  }, 1000);
}
