// App entry point: loads the settings, holds them, and switches between the screens.

import { openDb, DEFAULT_SETTINGS } from './storage/db.js';
import { showHome } from './ui/home.js';
import { showLibrary } from './ui/library.js';
import { showRun } from './ui/run.js';
import { showDone } from './ui/done.js';

const db = await openDb(); // IndexedDB in the browser, in-memory fallback otherwise — never throws
let settings;
try {
  settings = await db.loadSettings();
} catch (err) {
  console.warn('Einstellungen konnten nicht geladen werden, nutze Standardwerte:', err);
  settings = { ...DEFAULT_SETTINGS };
}

// Debounced so dragging the volume slider does not write on every pixel.
let saveTimer = null;
function persistSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.saveSettings(settings).catch(() => {}), 300);
}

const root = document.getElementById('app');

function home() {
  showHome(root, {
    settings,
    onSettingsChange: persistSettings,
    onStart: run,
    onOpenLibrary: () => showLibrary(root, { db, onBack: home }),
  });
}

// Called synchronously from the Start tap, so audio can be unlocked (iOS rule).
function run(circuit) {
  showRun(root, {
    circuit,
    settings,
    onEnd: (result) => showDone(root, { result, onRepeat: () => run(circuit), onHome: home }),
  });
}

home();
