// Circuit editor: name, timing settings, the "same length for every exercise?" toggle with
// per-exercise times, add/reorder/remove exercises, live total duration, start or save as template.
// The working circuit is mutated in place so it survives the trip to the exercise picker and back.

import { plannedDurationS } from '../core/plan.js';
import { formatDuration } from '../core/format.js';
import { isUniform, moveItem, removeAt, applyUniformTimes, setExerciseWorkS } from '../core/circuit.js';
import { esc } from './dom.js';

const SETTINGS_FIELDS = [
  ['rounds', 'Runden', 1],
  ['workS', 'Belastung (s)', 1],
  ['restS', 'Pause (s)', 0],
  ['roundRestS', 'Rundenpause (s)', 0],
  ['prepS', 'Vorlauf (s)', 0],
  ['warmupS', 'Aufwärmen (s)', 0],
  ['cooldownS', 'Cool-down (s)', 0],
];

export function showEditor(root, { circuit, isExisting = false, onAddExercise, onRun, onSave, onDelete, onBack }) {
  if (circuit.uniformTime === undefined) circuit.uniformTime = isUniform(circuit);

  function settingField([key, label, min]) {
    return `
      <label class="field">
        <span>${label}</span>
        <input type="number" inputmode="numeric" min="${min}" max="5999" data-setting="${key}" value="${esc(circuit.settings[key])}">
      </label>`;
  }

  function exerciseItem(e, i, last) {
    const time = circuit.uniformTime
      ? ''
      : `<label class="edit-ex-time"><input type="number" inputmode="numeric" min="1" max="5999" data-time="${i}" value="${esc(e.workS)}" aria-label="Belastung ${esc(e.name)}"> s</label>`;
    return `
      <li class="edit-ex">
        <span class="edit-ex-name">${esc(e.name)}${e.sides ? '<span class="ex-tag">L/R</span>' : ''}</span>
        ${time}
        <span class="edit-ex-ctrl">
          <button class="icon-btn" data-move="up" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="nach oben">↑</button>
          <button class="icon-btn" data-move="down" data-index="${i}" ${last ? 'disabled' : ''} aria-label="nach unten">↓</button>
          <button class="icon-btn danger-text" data-remove="${i}" aria-label="entfernen">✕</button>
        </span>
      </li>`;
  }

  function render() {
    const has = circuit.exercises.length > 0;
    root.innerHTML = `
      <main class="page">
        <header class="lib-head">
          <button class="icon-btn" data-action="back" aria-label="Abbrechen">‹ Abbrechen</button>
          <h1>${isExisting ? 'Zirkel bearbeiten' : 'Neuer Zirkel'}</h1>
          <span></span>
        </header>

        <label class="field edit-name">
          <span>Name</span>
          <input type="text" data-el="name" maxlength="60" value="${esc(circuit.name)}" placeholder="Mein Zirkel" enterkeyhint="done">
        </label>

        <div class="card edit-duration-card">
          <span>Voraussichtliche Dauer</span>
          <strong class="edit-duration" data-el="duration"></strong>
        </div>

        <h2>Übungen</h2>
        ${has ? `<ol class="edit-ex-list">${circuit.exercises.map((e, i) => exerciseItem(e, i, i === circuit.exercises.length - 1)).join('')}</ol>`
              : '<p class="lib-empty">Noch keine Übung. Unten hinzufügen.</p>'}
        <button class="btn ghost" data-action="add">+ Übung hinzufügen</button>

        <label class="row edit-uniform">
          <span class="row-label">Jede Übung gleich lang<span class="row-hint">${circuit.uniformTime ? 'Belastung oben gilt für alle' : 'pro Übung einstellbar'}</span></span>
          <span class="switch"><input type="checkbox" data-el="uniform" ${circuit.uniformTime ? 'checked' : ''}><span></span></span>
        </label>

        <h2>Einstellungen</h2>
        <div class="card"><div class="field-grid edit-settings">${SETTINGS_FIELDS.map(settingField).join('')}</div></div>

        <div class="edit-actions">
          <button class="btn primary" data-action="start" ${has ? '' : 'disabled'}>Starten</button>
          <button class="btn" data-action="save" ${has ? '' : 'disabled'}>${isExisting ? 'Speichern' : 'Als Vorlage speichern'}</button>
          ${has ? '' : '<p class="mode-hint">Mindestens eine Übung hinzufügen.</p>'}
        </div>

        ${isExisting ? `
        <div class="edit-delete">
          <button class="btn ghost danger-text" data-action="delete">Zirkel löschen</button>
          <div class="lib-del-confirm" data-el="del-confirm" hidden>
            <p>Diesen Zirkel wirklich löschen?</p>
            <button class="btn danger" data-action="delete-confirm">Ja, löschen</button>
            <button class="btn ghost" data-action="delete-cancel">Abbrechen</button>
          </div>
        </div>` : ''}
      </main>`;
    updateDuration();
    wire();
  }

  function updateDuration() {
    root.querySelector('[data-el="duration"]').textContent = formatDuration(plannedDurationS(circuit.settings, circuit.exercises));
  }

  function wire() {
    root.querySelector('[data-el="name"]').addEventListener('input', (e) => {
      circuit.name = e.target.value;
    });

    root.querySelectorAll('[data-setting]').forEach((input) =>
      input.addEventListener('input', (e) => {
        const value = e.target.value === '' ? 0 : Number(e.target.value);
        if (Number.isFinite(value)) circuit.settings[e.target.dataset.setting] = value;
        updateDuration();
      }),
    );

    root.querySelectorAll('[data-time]').forEach((input) =>
      input.addEventListener('input', (e) => {
        if (e.target.value === '') return; // wait until a number is typed
        circuit.exercises = setExerciseWorkS(circuit.exercises, Number(e.target.dataset.time), e.target.value);
        updateDuration();
      }),
    );

    root.querySelector('[data-el="uniform"]').addEventListener('change', (e) => {
      circuit.uniformTime = e.target.checked;
      circuit.exercises = applyUniformTimes(circuit.exercises, circuit.uniformTime, circuit.settings.workS);
      render();
    });

    // Delegated to the fresh <main>, not the persistent #app, so it dies with this render
    // (and when the screen is left) instead of stacking.
    root.querySelector('main').addEventListener('click', onClick);
  }

  function onClick(event) {
    const btn = event.target.closest('button');
    if (!btn) return;
    const { action, move, index, remove } = btn.dataset;
    if (action === 'back') onBack();
    else if (action === 'add') onAddExercise();
    else if (action === 'start') onRun(circuit);
    else if (action === 'save') onSave(circuit);
    else if (action === 'delete') root.querySelector('[data-el="del-confirm"]').hidden = false;
    else if (action === 'delete-cancel') root.querySelector('[data-el="del-confirm"]').hidden = true;
    else if (action === 'delete-confirm') onDelete(circuit);
    else if (move) {
      circuit.exercises = moveItem(circuit.exercises, Number(index), move === 'up' ? -1 : 1);
      render();
    } else if (remove !== undefined) {
      circuit.exercises = removeAt(circuit.exercises, Number(remove));
      render();
    }
  }

  render();
}
