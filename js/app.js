// App entry point: loads settings, holds them, and routes between the screens (callback style,
// no hash router yet). The circuit editor keeps its working circuit in one object so it survives
// the trip to the exercise picker and back.

import { openDb, DEFAULT_SETTINGS } from './storage/db.js';
import {
  newCircuit,
  circuitFromTemplate,
  exerciseSnapshot,
  makeTemplate,
  updateTemplate,
  historyFromResult,
} from './core/circuit.js';
import { showHome } from './ui/home.js';
import { showLibrary } from './ui/library.js';
import { showEditor } from './ui/editor.js';
import { showHistory } from './ui/history.js';
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

async function home() {
  let templates = [];
  try {
    templates = (await db.listTemplates()).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  } catch (err) {
    console.warn('Vorlagen konnten nicht geladen werden:', err);
  }
  showHome(root, {
    settings,
    templates,
    onSettingsChange: persistSettings,
    onOpenLibrary: () => showLibrary(root, { db, onBack: home }),
    onOpenHistory: () => showHistory(root, { db, onBack: home }),
    onNewCircuit: () => openEditor(newCircuit(), false),
    onEditCircuit: (circuit, kind) => openEditor(circuitFromTemplate(circuit), kind === 'template'),
    onStart: (circuit, kind) => run(circuitFromTemplate(circuit), kind === 'template' ? circuit.id : null),
  });
}

function openEditor(working, isExisting) {
  const rerender = () =>
    showEditor(root, {
      circuit: working,
      isExisting,
      onAddExercise: openPicker,
      onRun: (c) => run(c, isExisting ? c.id : null),
      onSave: saveCircuit,
      onDelete: deleteCircuit,
      onBack: home,
    });

  function openPicker() {
    showLibrary(root, {
      db,
      onBack: rerender,
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
    home();
  }

  async function deleteCircuit(circuit) {
    if (circuit.id) {
      try {
        await db.removeTemplate(circuit.id);
      } catch (err) {
        console.warn('Zirkel konnte nicht gelöscht werden:', err);
      }
    }
    home();
  }

  rerender();
}

// Called synchronously enough from a tap that audio can unlock (iOS rule).
function run(circuit, templateId = null) {
  if (templateId) db.touchTemplate(templateId).catch(() => {});
  showRun(root, {
    circuit,
    settings,
    onEnd: (result) => {
      db.addHistory(historyFromResult(result, { templateId })).catch(() => {});
      showDone(root, { result, onRepeat: () => run(circuit, templateId), onHome: home });
    },
  });
}

home();
