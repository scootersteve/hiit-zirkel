// Exercise library. Two uses:
//  - tab "Übungen": browse built-in and own exercises, create/edit/delete own ones
//  - picker (pushed from the circuit editor, `pick` given): tap a row to add it to the circuit,
//    recently used exercises first, "Fertig" returns
// Search is diacritic-insensitive; when it finds nothing, the search text can become an own
// exercise in one tap. A built-in exercise opens a detail sheet with the body graphic.

import { CATEGORIES, EQUIPMENT } from '../data/exercises.js';
import { MUSCLES } from '../data/muscles.js';
import {
  combineExercises,
  filterExercises,
  findDuplicate,
  makeCustomExercise,
  updateCustomExercise,
  byName,
} from '../core/library.js';
import { exerciseLevels, LEVEL_MAIN, LEVEL_SECONDARY } from '../core/muscles.js';
import { bodyFigure, muscleNames } from './body.js';
import { esc, icon, mount, once, confirmSheet } from './dom.js';

const options = (map, selected) =>
  Object.entries(map)
    .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');

const muscleChips = (group, selected) =>
  Object.entries(MUSCLES)
    .map(
      ([key, label]) =>
        `<button type="button" class="chip" data-muscle="${group}:${key}" aria-pressed="${selected.has(key) ? 'true' : 'false'}">${esc(label)}</button>`,
    )
    .join('');

function exerciseRow(e, pickMode) {
  const meta = [CATEGORIES[e.category], e.equipment !== 'none' ? EQUIPMENT[e.equipment] : null].filter(Boolean);
  const primary = e.primaryMuscles.map((m) => MUSCLES[m] || m).join(', ');
  const tags = `${e.sides ? '<span class="tag">L/R</span>' : ''}${e.custom ? '<span class="tag accent">Eigene</span>' : ''}`;
  const body = `
    <span class="ex-main">
      <span class="ex-name">${esc(e.name)}${tags}</span>
      <span class="ex-meta">${esc(meta.join(' · '))}${primary ? ` · ${esc(primary)}` : ''}</span>
    </span>`;
  if (pickMode) {
    return `<button class="cell ex-row" data-pick="${esc(e.id)}" aria-label="${esc(e.name)} hinzufügen">${body}<span class="ex-add">${icon('plus')}</span></button>`;
  }
  if (e.custom) {
    return `<button class="cell ex-row" data-edit="${esc(e.id)}" aria-label="${esc(e.name)} bearbeiten">${body}<span class="ex-chevron">${icon('chevronRight')}</span></button>`;
  }
  return `<button class="cell ex-row" data-info="${esc(e.id)}" aria-label="${esc(e.name)}, Muskeln ansehen">${body}<span class="ex-chevron">${icon('chevronRight')}</span></button>`;
}

/**
 * pick(exercise): when given, the screen is the picker. `usage` ({ id: timestamp }) puts recently
 * used exercises first there. `custom` and `usage` are loaded by the caller, so the screen
 * appears at once.
 */
export function showLibrary(root, { db, custom: initialCustom = [], usage = {}, onBack = () => {}, pick = null, nav = 'none' }) {
  const pickMode = typeof pick === 'function';
  let custom = initialCustom;
  const filter = { query: '', category: '', equipment: '' };
  let editing = null; // the custom exercise being edited, or null for a new one

  const head = pickMode
    ? `<header class="navbar">
         <span></span>
         <h1>Übung hinzufügen</h1>
         <button class="nav-btn end strong" data-action="back">Fertig</button>
       </header>`
    : `<header class="large-title title-row">
         <h1>Übungen</h1>
         <button class="round-btn" data-action="add" aria-label="Eigene Übung anlegen">${icon('plus')}</button>
       </header>`;

  const screen = mount(root, `
    <main class="page${pickMode ? ' has-navbar' : ''}" data-screen="${pickMode ? 'picker' : 'library'}">
      ${head}

      <label class="search">
        ${icon('search')}
        <input type="search" class="lib-search" data-field="search" placeholder="Suchen" aria-label="Übung suchen" enterkeyhint="search" autocomplete="off">
      </label>
      <div class="filter-row">
        <label class="select-pill">
          <select data-field="category" aria-label="Kategorie"><option value="">Alle Kategorien</option>${options(CATEGORIES, '')}</select>
          ${icon('chevronDown')}
        </label>
        <label class="select-pill">
          <select data-field="equipment" aria-label="Ausrüstung"><option value="">Alle Geräte</option>${options(EQUIPMENT, '')}</select>
          ${icon('chevronDown')}
        </label>
      </div>

      <p class="group-title" data-el="count"></p>
      <div class="group" data-el="list"></div>
      <div data-el="empty"></div>
      ${pickMode ? `<button class="btn tinted list-after" data-action="add">${icon('plus')}Eigene Übung anlegen</button>` : ''}

      <dialog class="form-sheet" data-el="dialog"></dialog>
    </main>`, { nav, tabs: !pickMode });

  const $ = (sel) => screen.querySelector(sel);
  const listEl = $('[data-el="list"]');
  const countEl = $('[data-el="count"]');
  const emptyEl = $('[data-el="empty"]');
  const dialog = $('[data-el="dialog"]');

  const recency = (e) => usage[e.id] || 0;
  const order = (a, b) => (pickMode ? recency(b) - recency(a) : 0) || byName(a, b);

  function renderList() {
    const all = combineExercises(custom);
    const shown = filterExercises(all, filter).sort(order);
    countEl.textContent = shown.length === all.length ? `${all.length} Übungen` : `${shown.length} von ${all.length} Übungen`;
    listEl.hidden = shown.length === 0;
    listEl.innerHTML = shown.map((e) => exerciseRow(e, pickMode)).join('');

    const query = filter.query.trim();
    emptyEl.innerHTML = shown.length
      ? ''
      : `<div class="card empty-card">
           <h3>Keine Übung gefunden</h3>
           <p>${query ? 'Lege sie als eigene Übung an, sie bleibt dann gespeichert.' : 'Mit diesen Filtern gibt es keine Übung.'}</p>
           ${query ? `<button class="btn primary" data-action="add-query">${icon('plus')}„${esc(query)}" als eigene Übung anlegen</button>` : ''}
         </div>`;
  }

  function pickExercise(id, row) {
    if (row.classList.contains('added')) return; // a double tap must not add the exercise twice
    const exercise = combineExercises(custom).find((e) => e.id === id);
    if (!exercise) return;
    pick(exercise);
    usage[exercise.id] = Date.now();
    db.touchExerciseUsage(exercise.id).catch(() => {});
    const mark = row.querySelector('.ex-add');
    mark.innerHTML = icon('check');
    row.classList.add('added');
    setTimeout(() => {
      if (!screen.contains(row)) return;
      mark.innerHTML = icon('plus');
      row.classList.remove('added');
    }, 1000);
  }

  function openDialog(exercise, presetName = '') {
    editing = exercise;
    const e = exercise || { name: presetName, category: 'full', equipment: 'none', primaryMuscles: [], secondaryMuscles: [], sides: false };
    const primary = new Set(e.primaryMuscles);
    const secondary = new Set(e.secondaryMuscles);
    dialog.innerHTML = `
      <form class="form" data-el="form" method="dialog">
        <header class="form-bar">
          <button type="button" class="nav-btn" data-action="cancel">Abbrechen</button>
          <h2>${exercise ? 'Übung bearbeiten' : 'Eigene Übung'}</h2>
          <button type="submit" class="nav-btn end strong" data-action="save">Sichern</button>
        </header>
        <div class="form-body">
          <div class="group">
            <label class="cell">
              <span class="cell-label fixed">Name</span>
              <input class="cell-input" type="text" data-field="name" value="${esc(e.name)}" maxlength="60" autocomplete="off" enterkeyhint="done" placeholder="z.B. Burpees">
            </label>
          </div>
          <p class="group-foot" data-el="dup" hidden></p>

          <div class="group group-gap">
            <label class="cell">
              <span class="cell-label">Kategorie</span>
              <span class="cell-select"><select data-field="category">${options(CATEGORIES, e.category)}</select>${icon('chevronDown')}</span>
            </label>
            <label class="cell">
              <span class="cell-label">Ausrüstung</span>
              <span class="cell-select"><select data-field="equipment">${options(EQUIPMENT, e.equipment)}</select>${icon('chevronDown')}</span>
            </label>
            <label class="cell">
              <span class="cell-label">Seitenwechsel<span class="cell-hint">Links/rechts, Ansage zur Halbzeit</span></span>
              <span class="switch"><input type="checkbox" data-field="sides" ${e.sides ? 'checked' : ''}><span></span></span>
            </label>
          </div>

          <div class="group group-gap"><div class="ex-detail-fig form-fig" data-el="fig"></div></div>

          <h3 class="group-title">Hauptmuskeln</h3>
          <div class="chip-grid">${muscleChips('primary', primary)}</div>
          <h3 class="group-title">Nebenmuskeln</h3>
          <div class="chip-grid">${muscleChips('secondary', secondary)}</div>

          <p class="group-foot err" data-el="error" hidden></p>
          ${exercise ? '<button type="button" class="btn ghost danger-text form-delete" data-action="delete">Übung löschen</button>' : ''}
        </div>
      </form>`;
    dialog.querySelector('[data-el="form"]').addEventListener('submit', (ev) => {
      ev.preventDefault(); // Enter in the name field and "Sichern" both land here
      save();
    });
    dialog.classList.remove('fit');
    dialog.showModal();
    if (!exercise) dialog.querySelector('[data-field="name"]').focus();
    updateDuplicateWarning();
    updateFormFigure();
  }

  const pickedMuscles = (group) =>
    [...dialog.querySelectorAll(`[data-muscle^="${group}:"][aria-pressed="true"]`)].map((b) => b.dataset.muscle.split(':')[1]);

  // The figure in the form shows what the chips below it select, at once.
  function updateFormFigure() {
    const primaryMuscles = pickedMuscles('primary');
    const secondaryMuscles = pickedMuscles('secondary');
    const label = `Körpergrafik. Hauptmuskeln: ${muscleNames(primaryMuscles) || 'keine'}. Nebenmuskeln: ${muscleNames(secondaryMuscles) || 'keine'}.`;
    dialog.querySelector('[data-el="fig"]').innerHTML = bodyFigure(exerciseLevels({ primaryMuscles, secondaryMuscles }), label);
  }

  // Read-only sheet for a built-in exercise: the figure, then the same facts as text.
  function openDetail(e) {
    editing = null;
    const main = muscleNames(e.primaryMuscles);
    const secondary = muscleNames(e.secondaryMuscles);
    const label = `Körpergrafik. Hauptmuskeln: ${main || 'keine'}. Nebenmuskeln: ${secondary || 'keine'}.`;
    dialog.innerHTML = `
      <div class="form">
        <header class="form-bar">
          <span></span>
          <h2>${esc(e.name)}</h2>
          <button type="button" class="nav-btn end strong" data-action="cancel">Fertig</button>
        </header>
        <div class="form-body">
          <div class="group">
            <div class="ex-detail-fig">${bodyFigure(exerciseLevels(e), label)}</div>
            <div class="cell muscle-cell"><span class="swatch" data-l="${LEVEL_MAIN}"></span><span class="cell-label"><span class="muscle-kind">Hauptmuskeln</span>${esc(main || 'keine')}</span></div>
            <div class="cell muscle-cell"><span class="swatch" data-l="${LEVEL_SECONDARY}"></span><span class="cell-label"><span class="muscle-kind">Nebenmuskeln</span>${esc(secondary || 'keine')}</span></div>
          </div>
          <div class="group group-gap">
            <div class="cell"><span class="cell-label">Kategorie</span><span class="cell-value">${esc(CATEGORIES[e.category])}</span></div>
            <div class="cell"><span class="cell-label">Ausrüstung</span><span class="cell-value">${esc(EQUIPMENT[e.equipment])}</span></div>
            <div class="cell"><span class="cell-label">Seitenwechsel</span><span class="cell-value">${e.sides ? 'ja, zur Halbzeit' : 'nein'}</span></div>
          </div>
        </div>
      </div>`;
    dialog.classList.add('fit');
    dialog.showModal();
    dialog.querySelector('[data-action="cancel"]').focus({ preventScroll: true });
  }

  function updateDuplicateWarning() {
    const name = dialog.querySelector('[data-field="name"]').value.trim();
    const dup = name ? findDuplicate(combineExercises(custom), name) : null;
    const warn = dialog.querySelector('[data-el="dup"]');
    const isSelf = dup && editing && dup.id === editing.id; // editing must not warn about itself
    warn.hidden = !(dup && !isSelf);
    if (!warn.hidden) warn.textContent = `Es gibt schon „${dup.name}"${dup.custom ? ' (eigene)' : ''}. Trotzdem möglich.`;
  }

  const closeDialog = () => {
    dialog.classList.add('closing');
    setTimeout(() => {
      dialog.classList.remove('closing');
      dialog.close();
    }, 200);
  };

  // a second tap on "Sichern" while saving must not create the exercise twice
  const save = once(async () => {
    const read = (f) => dialog.querySelector(`[data-field="${f}"]`);
    const input = {
      name: read('name').value,
      category: read('category').value,
      equipment: read('equipment').value,
      sides: read('sides').checked,
      primaryMuscles: pickedMuscles('primary'),
      secondaryMuscles: pickedMuscles('secondary'),
    };
    try {
      const exercise = editing
        ? updateCustomExercise(editing, input)
        : makeCustomExercise(input, { existingIds: custom.map((c) => c.id) });
      await db.saveCustomExercise(exercise);
      custom = await db.listCustomExercises();
      closeDialog();
      renderList();
    } catch (err) {
      const errorEl = dialog.querySelector('[data-el="error"]');
      errorEl.textContent = err.message || 'Konnte nicht gespeichert werden.';
      errorEl.hidden = false;
    }
  });

  const askDelete = once(async () => {
    if (!editing) return;
    const ok = await confirmSheet({
      title: 'Übung löschen?',
      message: `„${editing.name}" wird entfernt. Zirkel, die sie enthalten, behalten den Namen.`,
      confirmLabel: 'Übung löschen',
    });
    if (!ok) return;
    await db.removeCustomExercise(editing.id);
    custom = await db.listCustomExercises();
    closeDialog();
    renderList();
  });

  $('.lib-search').addEventListener('input', (e) => {
    filter.query = e.target.value;
    renderList();
  });
  $('[data-field="category"]').addEventListener('change', (e) => {
    filter.category = e.target.value;
    renderList();
  });
  $('[data-field="equipment"]').addEventListener('change', (e) => {
    filter.equipment = e.target.value;
    renderList();
  });

  dialog.addEventListener('input', (e) => {
    if (e.target.matches('[data-field="name"]')) updateDuplicateWarning();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });

  // Delegated to this screen's <main> (dies when the screen is left) rather than the persistent #app.
  screen.querySelector('main').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const { action, edit, info, muscle, pick: pickId } = btn.dataset;
    if (action === 'back') onBack();
    else if (action === 'add') openDialog(null);
    else if (action === 'add-query') openDialog(null, filter.query.trim());
    else if (pickId) pickExercise(pickId, btn);
    else if (edit) openDialog(custom.find((c) => c.id === edit));
    else if (info) openDetail(combineExercises(custom).find((e) => e.id === info));
    else if (muscle) {
      btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      updateFormFigure();
    }
    else if (action === 'cancel') closeDialog();
    else if (action === 'delete') askDelete();
  });

  renderList();
}
