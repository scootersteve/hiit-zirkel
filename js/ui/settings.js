// Settings (tab "Einstellungen"): appearance, sound, a preview of the signals, and the backup
// (download everything as a JSON file / merge a backup back in). Media such as a background
// image or own sounds is device-only and never part of a backup.

import { buildBackup, parseBackup } from '../core/transfer.js';
import { VERSION } from '../version.js';
import * as audio from '../platform/audio.js';
import * as speech from '../platform/speech.js';
import { applyTheme } from '../platform/theme.js';
import { esc, mount, once } from './dom.js';

const THEME_OPTIONS = [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']];
const SOUND_OPTIONS = [['playback', 'Immer hörbar'], ['ambient', 'Musik-Modus']];

const THEME_HINT = {
  auto: 'Folgt der Einstellung deines iPhones.',
  light: 'Immer hell, auch wenn das iPhone dunkel eingestellt ist.',
  dark: 'Immer dunkel, auch wenn das iPhone hell eingestellt ist.',
};
const SOUND_HINT = {
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

const segmented = (name, options, label) => `
  <div class="segmented" role="group" aria-label="${label}" data-segmented="${name}" style="--n:${options.length}">
    ${options.map(([value, text]) => `<button data-value="${value}">${text}</button>`).join('')}
  </div>`;

const toggleCell = (key, label, hint, checked) => `
  <label class="cell">
    <span class="cell-label">${label}${hint ? `<span class="cell-hint">${hint}</span>` : ''}</span>
    <span class="switch"><input type="checkbox" data-toggle="${key}" ${checked ? 'checked' : ''}><span></span></span>
  </label>`;

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const today = () => new Date().toISOString().slice(0, 10);

export function showSettings(root, { db, settings, nav = 'none', onSettingsChange = () => {} }) {
  const screen = mount(root, `
    <main class="page">
      <header class="large-title"><h1>Einstellungen</h1></header>

      <h2 class="group-title">Darstellung</h2>
      ${segmented('theme', THEME_OPTIONS, 'Darstellung')}
      <p class="group-foot" data-el="theme-hint"></p>

      <h2 class="group-title">Ton</h2>
      ${segmented('soundMode', SOUND_OPTIONS, 'Ton-Modus')}
      <p class="group-foot" data-el="sound-hint"></p>

      <div class="group">
        <label class="cell stack">
          <span class="cell-label">Lautstärke der Töne</span>
          <input type="range" min="0.1" max="1" step="0.05" value="${esc(settings.volume)}" data-volume aria-label="Lautstärke der Töne">
        </label>
        ${toggleCell('voice', 'Sprachansage', '', settings.voice)}
        ${toggleCell('countdownBeeps', '3-Sekunden-Töne', '', settings.countdownBeeps)}
        ${toggleCell('halfwayBeep', 'Halbzeit-Ton', 'Der Seitenwechsel wird immer angesagt.', settings.halfwayBeep)}
      </div>
      <p class="group-foot" data-el="voice-hint" hidden>Keine deutsche Stimme gefunden, Ansagen entfallen.</p>

      <h2 class="group-title">Signale anhören</h2>
      <div class="signal-grid">
        ${Object.entries(SIGNAL_LABELS).map(([name, label]) => `<button class="btn" data-signal="${name}">${label}</button>`).join('')}
      </div>

      <h2 class="group-title">Sicherung</h2>
      <div class="group">
        <button class="cell accent" data-action="export">Sicherung herunterladen</button>
        <label class="cell accent file-btn">
          <span class="cell-label">Sicherung importieren</span>
          <input type="file" accept="application/json,.json" data-el="import" aria-label="Sicherung importieren">
        </label>
      </div>
      <p class="group-foot">Eigene Übungen, Zirkel, Verlauf und Einstellungen als Datei. Beim Importieren bleibt Vorhandenes erhalten, gleiche Einträge werden überschrieben.</p>
      <p class="group-foot" data-el="status" role="status" hidden></p>

      <p class="app-version">Zirkel Dojo ${esc(VERSION)}</p>
    </main>`, { nav, tabs: true });

  const $ = (sel) => screen.querySelector(sel);

  // ----- segmented controls -----
  function renderSegmented(name, hints, hintEl) {
    const control = $(`[data-segmented="${name}"]`);
    const buttons = [...control.querySelectorAll('button')];
    const index = Math.max(0, buttons.findIndex((b) => b.dataset.value === settings[name]));
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
    control.style.setProperty('--i', index);
    hintEl.textContent = hints[buttons[index].dataset.value];
  }
  const renderTheme = () => renderSegmented('theme', THEME_HINT, $('[data-el="theme-hint"]'));
  const renderSound = () => renderSegmented('soundMode', SOUND_HINT, $('[data-el="sound-hint"]'));
  renderTheme();
  renderSound();

  // ----- volume slider: the filled part of the track follows the thumb -----
  const volume = $('[data-volume]');
  const paintVolume = () => {
    const pct = ((volume.value - volume.min) / (volume.max - volume.min)) * 100;
    volume.style.setProperty('--pct', `${pct}%`);
  };
  paintVolume();
  volume.addEventListener('input', () => {
    settings.volume = Number(volume.value);
    audio.setVolume(settings.volume);
    paintVolume();
    onSettingsChange();
  });

  screen.querySelectorAll('[data-toggle]').forEach((input) =>
    input.addEventListener('change', () => {
      settings[input.dataset.toggle] = input.checked;
      onSettingsChange();
    }),
  );

  // ----- backup -----
  const status = $('[data-el="status"]');
  const setStatus = (msg, ok = true) => {
    status.textContent = msg;
    status.hidden = false;
    status.classList.toggle('err', !ok);
  };

  const exportBackup = once(async () => {
    try {
      const backup = buildBackup(await db.collectData());
      download(`zirkel-dojo-${today()}.json`, JSON.stringify(backup, null, 2));
      setStatus('Sicherung heruntergeladen.');
    } catch (err) {
      setStatus('Export fehlgeschlagen: ' + err.message, false);
    }
  });

  $('[data-el="import"]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const counts = await db.importData(parseBackup(await file.text()));
      // imported settings apply at once, not only after the next start
      Object.assign(settings, await db.loadSettings());
      applyTheme(settings.theme);
      audio.setMode(settings.soundMode);
      audio.setVolume(settings.volume);
      setStatus(`Importiert: ${counts.customExercises} Übungen, ${counts.templates} Zirkel, ${counts.history} Verlaufseinträge.`);
    } catch (err) {
      setStatus('Import fehlgeschlagen: ' + err.message, false);
    } finally {
      event.target.value = ''; // lets the same file be chosen again
    }
  });

  screen.querySelector('main').addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const group = target.closest('[data-segmented]')?.dataset.segmented;
    if (group === 'theme') {
      settings.theme = applyTheme(target.dataset.value);
      renderTheme();
      onSettingsChange();
    } else if (group === 'soundMode') {
      settings.soundMode = target.dataset.value;
      audio.setMode(settings.soundMode);
      renderSound();
      onSettingsChange();
    } else if (target.dataset.signal) {
      audio.setMode(settings.soundMode);
      audio.setVolume(settings.volume);
      audio.unlock();
      audio.play(target.dataset.signal);
    } else if (target.dataset.action === 'export') {
      exportBackup();
    }
  });

  // The voice list arrives late on iOS, so check again after a moment.
  const voiceHint = $('[data-el="voice-hint"]');
  setTimeout(() => {
    if (screen.contains(voiceHint)) voiceHint.hidden = !!speech.germanVoiceName();
  }, 1000);
}
