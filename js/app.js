// App entry point: loads the settings and routes between screens (callback style, no hash
// router). Four tabs (Zirkel, Übungen, Verlauf, Einstellungen) sit at the top level; the
// circuit editor, the exercise picker and the training are pushed on top and hide the tab bar.
// The editor keeps its working circuit in one object so it survives the trip to the picker.

import { openDb, DEFAULT_SETTINGS } from './storage/db.js';
import {
  newCircuit,
  circuitFromTemplate,
  exerciseSnapshot,
  makeTemplate,
  updateTemplate,
  historyFromResult,
} from './core/circuit.js';
import { encodeCircuit, decodeCircuit } from './core/transfer.js';
import { combineExercises } from './core/library.js';
import { installTouchBehaviour, toast } from './ui/dom.js';
import { initTabBar, setTab } from './ui/tabbar.js';
import { showHome } from './ui/home.js';
import { showLibrary } from './ui/library.js';
import { showEditor } from './ui/editor.js';
import { showHistory } from './ui/history.js';
import { showSettings } from './ui/settings.js';
import { showRun } from './ui/run.js';
import { showDone } from './ui/done.js';
import { registerServiceWorker, applyUpdate } from './platform/update.js';
import { applyTheme, applyLook } from './platform/theme.js';

const db = await openDb(); // IndexedDB in the browser, in-memory fallback otherwise — never throws
let settings;
try {
  settings = await db.loadSettings();
} catch (err) {
  console.warn('Einstellungen konnten nicht geladen werden, nutze Standardwerte:', err);
  settings = { ...DEFAULT_SETTINGS };
}
applyTheme(settings.theme);
applyLook(settings.look, settings.animations);
installTouchBehaviour();

// Debounced so dragging the volume slider does not write on every pixel.
let saveTimer = null;
function persistSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.saveSettings(settings).catch(() => {}), 300);
}

const root = document.getElementById('app');

// Screens that read from storage load first and then appear. If the user has moved on in the
// meantime, the late result is dropped instead of replacing the screen they are on now.
let navToken = 0;
const safely = async (promise, fallback) => {
  try {
    return await promise;
  } catch (err) {
    console.warn('Daten konnten nicht geladen werden:', err);
    return fallback;
  }
};

// "Neue Version verfügbar" hint: only shown on the start screen, never during a training.
const updateBanner = document.getElementById('update-banner');
let updateReg = null;
let onHome = false;
function refreshBanner() {
  updateBanner.hidden = !(updateReg && onHome);
}
updateBanner.querySelector('[data-action="update"]').addEventListener('click', () => applyUpdate(updateReg));
registerServiceWorker({
  onUpdateReady: (reg) => {
    updateReg = reg;
    refreshBanner();
  },
});

/** Marks which top-level area is showing: tab bar state and the update hint. null = pushed screen. */
function setArea(tab) {
  setTab(tab);
  onHome = tab === 'home';
  refreshBanner();
}

// ---------- tabs ----------

async function showTab(tab, nav = 'none') {
  const token = ++navToken;
  if (tab === 'library') {
    const custom = await safely(db.listCustomExercises(), []);
    if (token !== navToken) return;
    showLibrary(root, { db, custom, nav });
  } else if (tab === 'history') {
    const entries = await safely(db.listHistory(), []);
    if (token !== navToken) return;
    showHistory(root, {
      db,
      entries,
      nav,
      onRepeat: (entry) => run(circuitFromTemplate(entry.circuit), entry.templateId || null),
      onCleared: () => showTab('history'),
    });
  } else if (tab === 'settings') {
    showSettings(root, { db, settings, nav, onSettingsChange: persistSettings });
  } else {
    const templates = (await safely(db.listTemplates(), [])).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    if (token !== navToken) return;
    showHome(root, {
      templates,
      nav,
      onNewCircuit: () => openEditor(newCircuit(), false),
      onEditCircuit: (circuit, kind) => openEditor(circuitFromTemplate(circuit), kind === 'template'),
      onStart: (circuit, kind) => run(circuitFromTemplate(circuit), kind === 'template' ? circuit.id : null),
    });
    tab = 'home';
  }
  setArea(tab);
}

const home = (nav = 'pop') => showTab('home', nav);
initTabBar(document.getElementById('tabbar'), (tab) => showTab(tab));

// ---------- circuit editor (pushed) ----------

async function openEditor(working, isExisting, nav = 'push') {
  const opened = ++navToken;
  let custom = await safely(db.listCustomExercises(), []); // for the muscle overview
  if (opened !== navToken) return;
  setArea(null);
  const show = (direction) =>
    showEditor(root, {
      circuit: working,
      isExisting,
      nav: direction,
      library: combineExercises(custom),
      onAddExercise: openPicker,
      onRun: (c) => run(c, isExisting ? c.id : null),
      onSave: saveCircuit,
      onDelete: deleteCircuit,
      onShare: shareCircuit,
      onBack: () => home(),
    });

  async function openPicker() {
    const token = ++navToken;
    const [list, usage] = await Promise.all([safely(db.listCustomExercises(), []), safely(db.getExerciseUsage(), {})]);
    if (token !== navToken) return;
    custom = list;
    showLibrary(root, {
      db,
      custom,
      usage,
      nav: 'push',
      // an own exercise created in the picker must show up in the muscle overview
      onBack: async () => {
        custom = await safely(db.listCustomExercises(), custom);
        if (token === navToken) show('pop');
      },
      pick: (exercise) => {
        const snap = exerciseSnapshot(exercise);
        if (!working.uniformTime) snap.workS = working.settings.workS; // keep non-uniform consistent
        working.exercises.push(snap);
      },
    });
  }

  async function saveCircuit(circuit) {
    try {
      const templates = await db.listTemplates();
      const existing = isExisting && circuit.id ? templates.find((t) => t.id === circuit.id) : null;
      const record = existing ? updateTemplate(existing, circuit) : makeTemplate(circuit, { existingIds: templates.map((t) => t.id) });
      await db.saveTemplate(record);
    } catch (err) {
      console.warn('Zirkel konnte nicht gespeichert werden:', err);
    }
    await home();
  }

  async function deleteCircuit(circuit) {
    if (circuit.id) {
      try {
        await db.removeTemplate(circuit.id);
      } catch (err) {
        console.warn('Zirkel konnte nicht gelöscht werden:', err);
      }
    }
    await home();
  }

  show(nav);
}

// ---------- training ----------

// Called synchronously enough from a tap that audio can unlock (iOS rule).
function run(circuit, templateId = null) {
  navToken++;
  setArea(null);
  if (templateId) db.touchTemplate(templateId).catch(() => {});
  showRun(root, {
    circuit,
    settings,
    onEnd: (result) => {
      db.addHistory(historyFromResult(result, { templateId })).catch(() => {});
      showDone(root, { result, onRepeat: () => run(circuit, templateId), onHome: () => home('fade') });
    },
  });
}

// ---------- sharing ----------

async function shareCircuit(circuit) {
  const url = `${location.origin}${location.pathname}#share=${encodeCircuit(circuit)}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Circle Champ', text: `Zirkel „${circuit.name || 'Mein Zirkel'}"`, url });
    } catch {
      /* user cancelled the share sheet */
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert');
  } catch {
    toast(url);
  }
}

// A shared circuit arrives as #share=… in the URL: open it in the editor and clear the hash so a
// reload does not re-trigger it. The payload is decoded on the device and never sent anywhere.
function boot() {
  const match = location.hash.match(/[#&]share=([^&]+)/);
  if (match) {
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const circuit = decodeCircuit(match[1]);
      openEditor({ name: circuit.name, exercises: circuit.exercises, settings: circuit.settings }, false, 'none');
      return;
    } catch (err) {
      console.warn('Geteilter Zirkel konnte nicht gelesen werden:', err);
    }
  }
  showTab('home');
}

boot();
