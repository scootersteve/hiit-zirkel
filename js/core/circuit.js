// Circuit model for the editor, templates and history. Pure logic, no DOM, no storage.
//
// Circuit (editor/runtime shape): { id?, name, exercises: [snapshot], settings }
//   snapshot = { id, name, sides, workS? }  — the name travels with the circuit, so renaming or
//   deleting an exercise later never orphans a saved circuit. workS is the per-exercise override.
// A circuit has "uniform time" exactly when no exercise carries workS.

import { DEFAULT_SETTINGS, normalizeSettings } from './plan.js';
import { makeId } from './id.js';

const MAX_SECONDS = 99 * 60 + 59;
const clampWorkS = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_SECONDS, Math.max(1, n)) : 1;
};

export function newCircuit() {
  return { name: '', exercises: [], settings: { ...DEFAULT_SETTINGS } };
}

/** A circuit snapshot of a full library exercise (only the fields a circuit needs). */
export const exerciseSnapshot = (exercise) => ({ id: exercise.id, name: exercise.name, sides: !!exercise.sides });

/** True while every exercise shares the global work time (none has its own). */
export const isUniform = (circuit) => !circuit.exercises.some((e) => e.workS != null);

// ---- editor operations (pure, return new arrays) ----

export function moveItem(list, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(to, 0, item);
  return copy;
}

export const removeAt = (list, index) => list.filter((_, i) => i !== index);

/**
 * Switches per-exercise times on or off for the whole list.
 * uniform=true drops every workS; uniform=false gives each exercise a concrete workS
 * (its own, or the given default) so the editor can show one input per exercise.
 */
export function applyUniformTimes(list, uniform, defaultWorkS) {
  if (uniform) return list.map(({ workS, ...rest }) => rest);
  return list.map((e) => (e.workS != null ? e : { ...e, workS: clampWorkS(defaultWorkS) }));
}

export const setExerciseWorkS = (list, index, workS) =>
  list.map((e, i) => (i === index ? { ...e, workS: clampWorkS(workS) } : e));

// ---- persistence shapes ----

function normalizeForSave(circuit) {
  return {
    name: (circuit.name || '').trim() || 'Mein Zirkel',
    exercises: circuit.exercises.map((e) => {
      const snap = { id: e.id, name: e.name, sides: !!e.sides };
      if (e.workS != null) snap.workS = clampWorkS(e.workS);
      return snap;
    }),
    settings: normalizeSettings(circuit.settings),
  };
}

/** Builds a new template from the editor's circuit. */
export function makeTemplate(circuit, { existingIds = [], now = Date.now() } = {}) {
  return { id: makeId('t', existingIds), ...normalizeForSave(circuit), createdAt: now, updatedAt: now, lastUsedAt: now, sample: false };
}

/** Applies editor changes to an existing template, keeping id/createdAt/lastUsedAt. */
export function updateTemplate(existing, circuit, { now = Date.now() } = {}) {
  return { ...existing, ...normalizeForSave(circuit), updatedAt: now };
}

/** The editable/runnable circuit behind a template or sample (drops template metadata). */
export const circuitFromTemplate = (t) => ({
  id: t.id,
  name: t.name,
  exercises: t.exercises.map((e) => ({ ...e })),
  settings: { ...t.settings },
});

/**
 * A history record from a finished run (result comes from the run screen's onEnd).
 * The id is left to the storage layer so it can avoid collisions against what is stored.
 */
export function historyFromResult(result, { templateId = null, now = Date.now() } = {}) {
  return {
    startedAt: result.startedAt ?? now,
    endedAt: result.endedAt ?? now,
    templateId,
    circuit: {
      name: result.circuit.name,
      exercises: result.circuit.exercises.map((e) => {
        const snap = { id: e.id, name: e.name, sides: !!e.sides };
        if (e.workS != null) snap.workS = e.workS;
        return snap;
      }),
      settings: { ...result.circuit.settings },
    },
    plannedS: Math.round((result.plannedMs ?? 0) / 1000),
    actualS: Math.round((result.actualMs ?? 0) / 1000),
    roundsCompleted: result.roundsCompleted ?? 0,
    status: result.status === 'aborted' ? 'aborted' : 'completed',
  };
}
