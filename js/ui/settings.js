// Settings (tab "Einstellungen"): appearance, sound, a preview of the signals, the backup
// (download everything as a JSON file / merge a backup back in), licences and sources. Media such as a background
// image or own sounds is device-only and never part of a backup.

import { buildBackup, parseBackup } from '../core/transfer.js';
import { VERSION } from '../version.js';
import * as audio from '../platform/audio.js';
import * as speech from '../platform/speech.js';
import { applyTheme, applyLook } from '../platform/theme.js';
import { LOOKS, characterSrc } from '../data/looks.js';
import { MEDIA_SLOTS, MEDIA_KEYS, checkFile, checkSoundLength, makeMediaRecord, formatBytes } from '../core/media.js';
import { photoToJpeg, recordUrl } from '../platform/media.js';
import { EXERCISES } from '../data/exercises.js';
import { BODY_GRAPHIC, DISPLAY_FONT } from '../data/licenses.js';
import { esc, icon, mount, once, confirmSheet } from './dom.js';

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

// One row per look: three colour dots, name, a line of description, a check on the chosen one.
const lookCell = (look) => `
  <button class="cell look-cell" data-look="${look.id}" aria-pressed="false">
    ${characterSrc(look.id) ? `<span class="look-face" aria-hidden="true" style="background-image:url('${characterSrc(look.id)}')"></span>` : ''}
    <span class="look-dots" aria-hidden="true">${look.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
    <span class="cell-label">${look.name}<span class="cell-hint">${look.hint}</span></span>
    <span class="look-check" aria-hidden="true">${icon('check')}</span>
  </button>`;

// One group per personal medium: what is stored, choose a file, (sound) listen, remove.
const mediaGroup = (key) => {
  const { kind, label } = MEDIA_SLOTS[key];
  const image = kind === 'image';
  return `
  <div class="group media-group" data-media="${key}">
    <div class="cell">
      ${image ? '<span class="media-thumb" data-el="thumb" hidden></span>' : ''}
      <span class="cell-label">${esc(label)}<span class="cell-hint" data-el="state"></span></span>
    </div>
    <label class="cell accent file-btn">
      <span class="cell-label" data-el="pick"></span>
      <input type="file" accept="${image ? 'image/*' : 'audio/*'}" data-media-input="${key}" aria-label="${esc(label)} wählen">
    </label>
    ${image ? '' : `<button class="cell accent" data-media-play="${key}" hidden>Anhören</button>`}
    <button class="cell danger-text" data-media-remove="${key}" hidden>Entfernen</button>
  </div>`;
};

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

// where the muscle assignment of the built-in exercises comes from (see js/data/exercises.js)
const fromDb = EXERCISES.filter((e) => e.ref).length;
const adjusted = EXERCISES.filter((e) => e.ref?.[1]).length;

/** Sheet with a licence text, as tall as its content; closed by "Fertig", Escape or a tap outside. */
function licenseSheet({ name, url, license }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'form-sheet fit';
  dialog.innerHTML = `
    <div class="form">
      <header class="form-bar">
        <span></span>
        <h2>Lizenz</h2>
        <button type="button" class="nav-btn end strong" data-action="close">Fertig</button>
      </header>
      <div class="form-body">
        <p class="license-source">${esc(name)}<br>${esc(url)}</p>
        <p class="license-text">${esc(license)}</p>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    dialog.classList.add('closing');
    setTimeout(() => {
      dialog.close();
      dialog.remove();
    }, 200);
  };
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-action="close"]')) close();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.showModal();
  dialog.querySelector('[data-action="close"]').focus({ preventScroll: true });
}

export function showSettings(root, { db, settings, media = {}, nav = 'none', onSettingsChange = () => {}, onMediaChange = () => {} }) {
  const screen = mount(root, `
    <main class="page">
      <header class="large-title"><h1>Einstellungen</h1></header>

      <h2 class="group-title">Darstellung</h2>
      ${segmented('theme', THEME_OPTIONS, 'Darstellung')}
      <p class="group-foot" data-el="theme-hint"></p>

      <h2 class="group-title">Design</h2>
      <div class="group" data-el="looks" role="group" aria-label="Design">${LOOKS.map(lookCell).join('')}</div>
      <div class="group group-gap">
        ${toggleCell('animations', 'Bewegte Effekte', 'Aura und Linien im Training bewegen sich. Aus: Sie stehen still.', settings.animations)}
      </div>
      <p class="group-foot">Die Designs ändern Farben, Titelschrift und den Trainingsbildschirm. Hell und Dunkel gilt für jedes Design.</p>

      <h2 class="group-title">Persönlich</h2>
      ${MEDIA_KEYS.map(mediaGroup).join('')}
      <p class="group-foot">Bild und Töne bleiben nur auf diesem Gerät: Sie stehen nicht in der Sicherung und nicht im Teilen-Link. Das Bild liegt abgedunkelt hinter dem Training, damit die Restzeit lesbar bleibt.</p>
      <p class="group-foot" data-el="media-status" role="status" hidden></p>

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

      <h2 class="group-title">Lizenzen und Quellen</h2>
      <div class="group" data-el="licenses">
        <button class="cell" data-action="body-license">
          <span class="cell-label">Körpergrafik<span class="cell-hint">Zeichnung der Figur aus react-native-body-highlighter, © 2022 ELABBASSI Hicham, MIT-Lizenz. Lizenztext ansehen.</span></span>
          <span class="ex-chevron">${icon('chevronRight')}</span>
        </button>
        <button class="cell" data-action="font-license">
          <span class="cell-label">Titelschrift der Designs<span class="cell-hint">Bangers, © 2010 The Bangers Project Authors, SIL Open Font License 1.1. Lizenztext ansehen.</span></span>
          <span class="ex-chevron">${icon('chevronRight')}</span>
        </button>
        <div class="cell">
          <span class="cell-label">Muskelzuordnung der Übungen<span class="cell-hint">Bei ${fromDb} von ${EXERCISES.length} Übungen aus free-exercise-db (gemeinfrei), ${adjusted} davon angepasst. Die übrigen sind eigene Angaben.</span></span>
        </div>
        <div class="cell">
          <span class="cell-label">Diese App<span class="cell-hint">Eigener Code, eigene Figuren der Designs und eigenes App-Symbol unter MIT-Lizenz. Die Figuren sind für diese App gezeichnet und stellen keine Figur aus einer Serie oder einem Spiel dar. Quelltext auf GitHub: scootersteve/hiit-zirkel.</span></span>
        </div>
      </div>

      <p class="app-version">Circle Champ ${esc(VERSION)}</p>
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
  const renderLooks = () =>
    screen.querySelectorAll('[data-look]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.look === settings.look)));
  renderTheme();
  renderSound();
  renderLooks();

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
      if (input.dataset.toggle === 'animations') applyLook(settings.look, settings.animations);
      onSettingsChange();
    }),
  );

  // ----- personal media: own picture, own sounds (device only) -----
  const mediaStatus = $('[data-el="media-status"]');
  const setMediaStatus = (msg, ok = true) => {
    mediaStatus.textContent = msg;
    mediaStatus.hidden = false;
    mediaStatus.classList.toggle('err', !ok);
  };
  let thumbUrl = null;
  function renderMedia(key) {
    const group = $(`[data-media="${key}"]`);
    const record = media[key];
    const image = MEDIA_SLOTS[key].kind === 'image';
    const state = group.querySelector('[data-el="state"]');
    if (image) {
      state.textContent = record ? `Eigenes Bild, ${formatBytes(record.bytes.byteLength)}` : 'Kein Bild gewählt';
      const thumb = group.querySelector('[data-el="thumb"]');
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = record ? recordUrl(record) : null;
      thumb.hidden = !record;
      thumb.style.backgroundImage = record ? `url("${thumbUrl}")` : '';
    } else {
      const length = record?.seconds ? `, ${String(record.seconds).replace('.', ',')} s` : '';
      state.textContent = record ? `${record.name || 'Eigener Ton'}${length}` : 'Eingebauter Ton';
      group.querySelector('[data-media-play]').hidden = !record;
    }
    group.querySelector('[data-el="pick"]').textContent = image ? (record ? 'Anderes Bild wählen' : 'Bild wählen') : (record ? 'Andere Tondatei wählen' : 'Tondatei wählen');
    group.querySelector('[data-media-remove]').hidden = !record;
  }
  MEDIA_KEYS.forEach(renderMedia);

  // a second file chosen while the first is still being stored is ignored
  const storeMedia = once(async (key, input) => {
    const file = input.files?.[0];
    if (!file) return;
    const { kind, label } = MEDIA_SLOTS[key];
    setMediaStatus('Wird gespeichert …');
    try {
      checkFile(key, file);
      let record;
      if (kind === 'image') {
        record = makeMediaRecord({ ...(await photoToJpeg(file)), name: file.name });
      } else {
        const bytes = await file.arrayBuffer();
        audio.setMode(settings.soundMode);
        const seconds = await audio.probe(bytes).catch(() => {
          throw new Error('Die Tondatei lässt sich nicht abspielen.');
        });
        checkSoundLength(seconds);
        record = makeMediaRecord({ type: file.type, bytes, name: file.name, seconds });
      }
      await db.saveMedia(key, record);
      media[key] = record;
      onMediaChange(key, record);
      renderMedia(key);
      setMediaStatus(`${label} gespeichert.`);
    } catch (err) {
      setMediaStatus(err.message || 'Konnte nicht gespeichert werden.', false);
    } finally {
      input.value = ''; // lets the same file be chosen again
    }
  });
  screen.querySelectorAll('[data-media-input]').forEach((input) =>
    input.addEventListener('change', () => storeMedia(input.dataset.mediaInput, input)));

  const removeMedia = once(async (key) => {
    const { kind, label } = MEDIA_SLOTS[key];
    const ok = await confirmSheet({
      title: `${label} entfernen?`,
      message: kind === 'image' ? 'Das Training zeigt wieder nur die Phasenfarbe.' : 'Es gilt wieder der eingebaute Ton.',
      confirmLabel: 'Entfernen',
    });
    if (!ok) return;
    try {
      await db.removeMedia(key);
      media[key] = null;
      onMediaChange(key, null);
      renderMedia(key);
      setMediaStatus(`${label} entfernt.`);
    } catch (err) {
      setMediaStatus('Konnte nicht entfernt werden: ' + err.message, false);
    }
  });

  // The font's licence is the text file next to the font (in the offline cache as well).
  const showFontLicense = once(async () => {
    if (document.querySelector('dialog.form-sheet[open]')) return;
    let license = `${DISPLAY_FONT.copyright}\n\nSIL Open Font License, Version 1.1`;
    try {
      const res = await fetch(DISPLAY_FONT.licenseFile);
      if (res.ok) license = await res.text();
    } catch {
      /* offline without cache: the short form above still names licence and holder */
    }
    licenseSheet({ name: DISPLAY_FONT.name, url: DISPLAY_FONT.url, license });
  });

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
      download(`circle-champ-${today()}.json`, JSON.stringify(backup, null, 2));
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
      applyLook(settings.look, settings.animations);
      renderTheme();
      renderLooks();
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
    if (target.dataset.mediaRemove) {
      removeMedia(target.dataset.mediaRemove);
    } else if (target.dataset.mediaPlay) {
      audio.setMode(settings.soundMode);
      audio.setVolume(settings.volume);
      audio.unlock();
      audio.play(MEDIA_SLOTS[target.dataset.mediaPlay].signal);
    } else if (target.dataset.look) {
      settings.look = applyLook(target.dataset.look, settings.animations);
      renderLooks();
      onSettingsChange();
    } else if (group === 'theme') {
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
    } else if (target.dataset.action === 'body-license') {
      if (!document.querySelector('dialog.form-sheet[open]')) licenseSheet(BODY_GRAPHIC); // double tap opens one
    } else if (target.dataset.action === 'font-license') {
      showFontLicense();
    }
  });

  // The voice list arrives late on iOS, so check again after a moment.
  const voiceHint = $('[data-el="voice-hint"]');
  setTimeout(() => {
    if (screen.contains(voiceHint)) voiceHint.hidden = !!speech.germanVoiceName();
  }, 1000);
}
