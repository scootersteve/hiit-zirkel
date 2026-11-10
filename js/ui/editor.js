// Circuit editor: name, exercises (add, reorder, remove, optional time per exercise), timing
// with steppers and direct entry, live total duration, start or save as template.
// The working circuit is mutated in place so it survives the trip to the exercise picker.
// The screen is built once; later changes touch only the part that changed, so the keyboard
// focus and the scroll position stay where they are.

import { plannedDurationS } from '../core/plan.js';
import { formatDuration } from '../core/format.js';
import { isUniform, moveItem, removeAt, applyUniformTimes, setExerciseWorkS } from '../core/circuit.js';
import { circuitLoad } from '../core/muscles.js';
import { bodyFigure, muscleNames } from './body.js';
import { esc, icon, mount, once, confirmSheet } from './dom.js';

// [key, label, minimum, step of the plus/minus buttons]
const SETTINGS_FIELDS = [
  ['rounds', 'Runden', 1, 1],
  ['workS', 'Belastung', 1, 5],
  ['restS', 'Pause', 0, 5],
  ['roundRestS', 'Rundenpause', 0, 15],
  ['prepS', 'Vorlauf', 0, 5],
  ['warmupS', 'Aufwärmen', 0, 15],
  ['cooldownS', 'Cool-down', 0, 15],
];
const MAX_VALUE = 5999;

export function showEditor(root, { circuit, isExisting = false, nav = 'push', library = [], onAddExercise, onRun, onSave, onDelete, onShare, onBack }) {
  if (circuit.uniformTime === undefined) circuit.uniformTime = isUniform(circuit);

  const settingCell = ([key, label, min, step]) => `
    <div class="cell stepper-cell">
      <span class="cell-label">${label}${key === 'rounds' ? '' : '<span class="cell-hint">Sekunden</span>'}</span>
      <span class="stepper">
        <button class="step-btn" data-step="${-step}" data-for="${key}" aria-label="${label} verringern">${icon('minus')}</button>
        <input class="num" type="number" inputmode="numeric" min="${min}" max="${MAX_VALUE}" data-setting="${key}" value="${esc(circuit.settings[key])}" aria-label="${label}">
        <button class="step-btn" data-step="${step}" data-for="${key}" aria-label="${label} erhöhen">${icon('plus')}</button>
      </span>
    </div>`;

  function exerciseItem(e, i, last) {
    const time = circuit.uniformTime
      ? ''
      : `<label class="edit-ex-time"><input class="num" type="number" inputmode="numeric" min="1" max="${MAX_VALUE}" data-time="${i}" value="${esc(e.workS)}" aria-label="Belastung ${esc(e.name)} in Sekunden"><span>s</span></label>`;
    return `
      <li class="cell edit-ex">
        <span class="edit-ex-name"><span class="edit-ex-no num">${i + 1}</span><span>${esc(e.name)}</span>${e.sides ? '<span class="tag">L/R</span>' : ''}</span>
        <span class="edit-ex-tools">
          ${time}
          <button class="tool-btn" data-move="up" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${esc(e.name)} nach oben">${icon('arrowUp')}</button>
          <button class="tool-btn" data-move="down" data-index="${i}" ${last ? 'disabled' : ''} aria-label="${esc(e.name)} nach unten">${icon('arrowDown')}</button>
          <button class="tool-btn danger" data-remove="${i}" aria-label="${esc(e.name)} entfernen">${icon('trash')}</button>
        </span>
      </li>`;
  }

  const screen = mount(root, `
    <main class="page has-navbar" data-screen="editor">
      <header class="navbar">
        <button class="nav-btn" data-action="back">${icon('chevronLeft')}Zurück</button>
        <h1>${isExisting ? 'Zirkel bearbeiten' : 'Neuer Zirkel'}</h1>
        <button class="nav-btn end" data-action="share" aria-label="Zirkel teilen">${icon('share')}</button>
      </header>

      <div class="group">
        <label class="cell">
          <span class="cell-label fixed">Name</span>
          <input class="cell-input" type="text" data-el="name" maxlength="60" value="${esc(circuit.name)}" placeholder="Mein Zirkel" enterkeyhint="done" autocomplete="off">
        </label>
        <div class="cell">
          <span class="cell-label">Voraussichtliche Dauer</span>
          <strong class="edit-duration num" data-el="duration"></strong>
        </div>
      </div>

      <h2 class="group-title">Übungen</h2>
      <div class="group">
        <ol class="edit-ex-list" data-el="list"></ol>
        <button class="cell accent" data-action="add">${icon('plus')}Übung hinzufügen</button>
      </div>
      <p class="group-foot" data-el="list-hint" hidden></p>

      <div class="group group-gap">
        <label class="cell">
          <span class="cell-label">Jede Übung gleich lang<span class="cell-hint" data-el="uniform-hint"></span></span>
          <span class="switch"><input type="checkbox" data-el="uniform" ${circuit.uniformTime ? 'checked' : ''}><span></span></span>
        </label>
      </div>

      <div data-el="muscles" hidden></div>

      <h2 class="group-title">Zeiten</h2>
      <div class="group">${SETTINGS_FIELDS.map(settingCell).join('')}</div>

      <div class="edit-actions">
        <button class="btn primary" data-action="start">${icon('play')}Starten</button>
        <button class="btn" data-action="save">${isExisting ? 'Speichern' : 'Als Vorlage speichern'}</button>
        ${isExisting ? '<button class="btn ghost danger-text" data-action="delete">Zirkel löschen</button>' : ''}
      </div>
    </main>`, { nav });

  const $ = (sel) => screen.querySelector(sel);
  const list = $('[data-el="list"]');

  // a second tap while saving, sharing or deleting is still running must not repeat it
  const save = once(() => onSave(circuit));
  const share = once(() => onShare(circuit));
  const askDelete = once(async () => {
    const ok = await confirmSheet({
      title: 'Zirkel löschen?',
      message: `„${circuit.name || 'Mein Zirkel'}" wird entfernt. Der Verlauf bleibt erhalten.`,
      confirmLabel: 'Zirkel löschen',
    });
    if (ok) await onDelete(circuit);
  });

  // Which regions the whole circuit loads, weighted by work time. Rebuilt only when the result
  // changes, so typing a time does not redraw the figure on every key.
  const byId = new Map(library.map((e) => [e.id, e]));
  let musclesKey = '';
  function updateMuscles() {
    const { levels, ranked, unknown } = circuitLoad(circuit.exercises, circuit.settings, (id) => byId.get(id));
    const key = JSON.stringify([levels, ranked, unknown]);
    if (key === musclesKey) return;
    musclesKey = key;
    const box = $('[data-el="muscles"]');
    box.hidden = ranked.length === 0;
    if (box.hidden) return;
    const top = ranked.filter((m) => levels[m] === 3);
    const also = ranked.filter((m) => levels[m] < 3);
    const label = `Körpergrafik des Zirkels. Schwerpunkt: ${muscleNames(top)}.${also.length ? ` Auch belastet: ${muscleNames(also)}.` : ''}`;
    box.innerHTML = `
      <h2 class="group-title">Muskeln</h2>
      <div class="group">
        <div class="muscle-over">
          ${bodyFigure(levels, label)}
          <div class="muscle-info">
            <h3>Schwerpunkt</h3>
            <p class="muscle-top">${esc(muscleNames(top))}</p>
            ${also.length ? `<p class="muscle-also">Auch belastet: ${esc(muscleNames(also))}</p>` : ''}
            <div class="muscle-scale" aria-hidden="true"><span>wenig</span><span class="swatch" data-l="1"></span><span class="swatch" data-l="2"></span><span class="swatch" data-l="3"></span><span>viel</span></div>
          </div>
        </div>
      </div>
      ${unknown ? `<p class="group-foot">${unknown === 1 ? 'Eine Übung ist' : `${unknown} Übungen sind`} nicht in deiner Übungsliste und fehlt in der Grafik.</p>` : ''}`;
  }

  function updateDuration() {
    $('[data-el="duration"]').textContent = formatDuration(plannedDurationS(circuit.settings, circuit.exercises));
    updateMuscles();
  }

  // Rebuilds only the exercise rows and what depends on their number.
  function renderList() {
    const n = circuit.exercises.length;
    list.innerHTML = circuit.exercises.map((e, i) => exerciseItem(e, i, i === n - 1)).join('');
    const hint = $('[data-el="list-hint"]');
    hint.hidden = n > 0;
    hint.textContent = 'Mindestens eine Übung hinzufügen, dann lässt sich der Zirkel starten und speichern.';
    $('[data-el="uniform-hint"]').textContent = circuit.uniformTime ? 'Die Belastung unten gilt für alle.' : 'Zeit pro Übung oben in der Liste.';
    for (const action of ['start', 'save', 'share']) $(`[data-action="${action}"]`).disabled = n === 0;
    updateDuration();
  }

  function setSetting(key, value) {
    const [, , min] = SETTINGS_FIELDS.find(([k]) => k === key);
    const clamped = Math.min(MAX_VALUE, Math.max(min, Math.round(Number(value) || 0)));
    circuit.settings[key] = clamped;
    updateDuration();
    return clamped;
  }

  $('[data-el="name"]').addEventListener('input', (e) => {
    circuit.name = e.target.value;
  });

  screen.querySelectorAll('[data-setting]').forEach((input) => {
    input.addEventListener('input', () => {
      if (input.value === '') return; // wait until a number is typed
      const value = Number(input.value);
      if (Number.isFinite(value)) setSetting(input.dataset.setting, value);
    });
    // leaving the field shows the value that really applies (empty or out of range is corrected)
    input.addEventListener('blur', () => {
      input.value = setSetting(input.dataset.setting, input.value);
    });
  });

  list.addEventListener('input', (e) => {
    if (!e.target.matches('[data-time]') || e.target.value === '') return;
    circuit.exercises = setExerciseWorkS(circuit.exercises, Number(e.target.dataset.time), e.target.value);
    updateDuration();
  });

  $('[data-el="uniform"]').addEventListener('change', (e) => {
    circuit.uniformTime = e.target.checked;
    circuit.exercises = applyUniformTimes(circuit.exercises, circuit.uniformTime, circuit.settings.workS);
    renderList();
  });

  screen.querySelector('main').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn || btn.disabled) return;
    const { action, move, index, step } = btn.dataset;
    if (action === 'back') onBack();
    else if (action === 'add') onAddExercise();
    else if (action === 'start') onRun(circuit);
    else if (action === 'save') save();
    else if (action === 'share') share();
    else if (action === 'delete') askDelete();
    else if (step) {
      const input = $(`[data-setting="${btn.dataset.for}"]`);
      input.value = setSetting(btn.dataset.for, (Number(input.value) || 0) + Number(step));
    } else if (move) {
      const to = Number(index) + (move === 'up' ? -1 : 1);
      circuit.exercises = moveItem(circuit.exercises, Number(index), move === 'up' ? -1 : 1);
      renderList();
      // keep the focus on the moved row, so it can be moved again right away
      const again = list.querySelector(`[data-move="${move}"][data-index="${to}"]:not([disabled])`)
        || list.querySelector(`[data-index="${to}"]:not([disabled])`);
      again?.focus({ preventScroll: true });
    } else if (btn.dataset.remove !== undefined) {
      circuit.exercises = removeAt(circuit.exercises, Number(btn.dataset.remove));
      renderList();
    }
  });

  renderList();
}
