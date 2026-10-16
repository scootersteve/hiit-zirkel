// Exercise library screen: browse the built-in + own exercises, filter/search, and manage
// (create, edit, delete) custom exercises. Muscles are shown as text chips — the body graphic
// is step 9. No circuit picking yet; that arrives with the editor.

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
import { esc } from './dom.js';

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
  const muscles = [
    ...e.primaryMuscles.map((m) => `<span class="chip sm">${esc(MUSCLES[m] || m)}</span>`),
    ...e.secondaryMuscles.map((m) => `<span class="chip sm muted">${esc(MUSCLES[m] || m)}</span>`),
  ].join('');
  const action = pickMode
    ? `<button class="btn primary ex-add" data-pick="${esc(e.id)}">+ Hinzufügen</button>`
    : e.custom
      ? `<button class="icon-btn" data-edit="${esc(e.id)}" aria-label="${esc(e.name)} bearbeiten">Bearbeiten</button>`
      : '';
  return `
    <article class="ex-row">
      <div class="ex-main">
        <h3 class="ex-name">${esc(e.name)}${e.sides ? '<span class="ex-tag">L/R</span>' : ''}${e.custom ? '<span class="ex-tag own">Eigen</span>' : ''}</h3>
        <p class="ex-meta">${meta.map(esc).join(' · ')}</p>
        ${muscles ? `<p class="ex-muscles">${muscles}</p>` : ''}
      </div>
      ${action}
    </article>`;
}

// pick(exercise): optional. When given, the screen is a picker for the circuit editor; each row
// adds an exercise and "Fertig" (onBack) returns. Without it, the screen just manages exercises.
export async function showLibrary(root, { db, onBack, pick = null }) {
  const pickMode = typeof pick === 'function';
  let custom = await db.listCustomExercises();
  const filter = { query: '', category: '', equipment: '' };
  let editing = null; // the custom exercise being edited, or null for a new one

  root.innerHTML = `
    <main class="page">
      <header class="lib-head">
        <button class="icon-btn" data-action="back" aria-label="${pickMode ? 'Fertig' : 'Zurück'}">${pickMode ? '‹ Fertig' : '‹ Zurück'}</button>
        <h1>${pickMode ? 'Übung hinzufügen' : 'Übungen'}</h1>
        <button class="btn primary lib-add" data-action="add">+ Eigene</button>
      </header>

      <div class="lib-filters card">
        <input type="search" class="lib-search" data-field="search" placeholder="Übung suchen" aria-label="Übung suchen" enterkeyhint="search">
        <div class="lib-selects">
          <select data-field="category" aria-label="Kategorie"><option value="">Alle Kategorien</option>${options(CATEGORIES, '')}</select>
          <select data-field="equipment" aria-label="Ausrüstung"><option value="">Alle Geräte</option>${options(EQUIPMENT, '')}</select>
        </div>
      </div>

      <p class="lib-count" data-el="count"></p>
      <div data-el="list"></div>

      <dialog class="confirm lib-dialog" data-el="dialog"></dialog>
    </main>`;

  const listEl = root.querySelector('[data-el="list"]');
  const countEl = root.querySelector('[data-el="count"]');
  const dialog = root.querySelector('[data-el="dialog"]');

  function renderList() {
    const all = combineExercises(custom);
    const shown = filterExercises(all, filter).sort(byName);
    countEl.textContent = `${shown.length} von ${all.length} Übungen`;
    listEl.innerHTML = shown.length
      ? shown.map((e) => exerciseRow(e, pickMode)).join('')
      : `<p class="lib-empty">Keine Übung gefunden. ${custom.length || filter.query || filter.category || filter.equipment ? 'Filter ändern' : ''}</p>`;
  }

  function pickExercise(id, btn) {
    const exercise = combineExercises(custom).find((e) => e.id === id);
    if (!exercise) return;
    pick(exercise);
    btn.textContent = '✓ Hinzugefügt';
    btn.classList.add('added');
    setTimeout(() => {
      if (root.contains(btn)) {
        btn.textContent = '+ Hinzufügen';
        btn.classList.remove('added');
      }
    }, 1200);
  }

  function openDialog(exercise) {
    editing = exercise;
    const e = exercise || { name: '', category: 'full', equipment: 'none', primaryMuscles: [], secondaryMuscles: [], sides: false };
    const primary = new Set(e.primaryMuscles);
    const secondary = new Set(e.secondaryMuscles);
    dialog.innerHTML = `
      <h2>${exercise ? 'Übung bearbeiten' : 'Eigene Übung'}</h2>
      <form class="lib-form" data-el="form">
        <label class="field">
          <span>Name</span>
          <input type="text" data-field="name" value="${esc(e.name)}" maxlength="60" required autocomplete="off" enterkeyhint="done">
        </label>
        <p class="field-warn" data-el="dup" hidden></p>
        <div class="field-grid">
          <label class="field"><span>Kategorie</span><select data-field="category">${options(CATEGORIES, e.category)}</select></label>
          <label class="field"><span>Ausrüstung</span><select data-field="equipment">${options(EQUIPMENT, e.equipment)}</select></label>
        </div>
        <label class="row lib-sides">
          <span class="row-label">Seitenwechsel<span class="row-hint">links/rechts, Ansage zur Halbzeit</span></span>
          <span class="switch"><input type="checkbox" data-field="sides" ${e.sides ? 'checked' : ''}><span></span></span>
        </label>
        <fieldset class="field"><legend>Hauptmuskeln</legend><div class="chip-grid">${muscleChips('primary', primary)}</div></fieldset>
        <fieldset class="field"><legend>Nebenmuskeln</legend><div class="chip-grid">${muscleChips('secondary', secondary)}</div></fieldset>
        <p class="field-warn" data-el="error" hidden></p>
        <div class="lib-actions" data-el="actions">
          <button type="button" class="btn primary" data-action="save">Speichern</button>
          <button type="button" class="btn ghost" data-action="cancel">Abbrechen</button>
          ${exercise ? '<button type="button" class="btn danger" data-action="delete">Löschen</button>' : ''}
        </div>
        <div class="lib-del-confirm" data-el="del-confirm" hidden>
          <p>„${esc(e.name)}" wirklich löschen?</p>
          <button type="button" class="btn danger" data-action="delete-confirm">Ja, löschen</button>
          <button type="button" class="btn ghost" data-action="delete-cancel">Abbrechen</button>
        </div>
      </form>`;
    // Enter in the name field submits the form; keep it from navigating and route it to save.
    dialog.querySelector('[data-el="form"]').addEventListener('submit', (e) => {
      e.preventDefault();
      save();
    });
    dialog.showModal();
    const nameInput = dialog.querySelector('[data-field="name"]');
    nameInput.focus();
    updateDuplicateWarning();
  }

  function updateDuplicateWarning() {
    const name = dialog.querySelector('[data-field="name"]').value.trim();
    const dup = name ? findDuplicate(combineExercises(custom), name) : null;
    const warn = dialog.querySelector('[data-el="dup"]');
    // Editing an exercise should not warn about itself.
    const isSelf = dup && editing && dup.id === editing.id;
    if (dup && !isSelf) {
      warn.textContent = `Es gibt schon „${dup.name}"${dup.custom ? ' (eigene)' : ''}. Trotzdem möglich.`;
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }
  }

  async function save() {
    const read = (f) => dialog.querySelector(`[data-field="${f}"]`);
    const picked = (group) =>
      [...dialog.querySelectorAll(`[data-muscle^="${group}:"][aria-pressed="true"]`)].map((b) => b.dataset.muscle.split(':')[1]);
    const input = {
      name: read('name').value,
      category: read('category').value,
      equipment: read('equipment').value,
      sides: read('sides').checked,
      primaryMuscles: picked('primary'),
      secondaryMuscles: picked('secondary'),
    };
    try {
      const exercise = editing
        ? updateCustomExercise(editing, input)
        : makeCustomExercise(input, { existingIds: custom.map((c) => c.id) });
      await db.saveCustomExercise(exercise);
      custom = await db.listCustomExercises();
      dialog.close();
      renderList();
    } catch (err) {
      const errorEl = dialog.querySelector('[data-el="error"]');
      errorEl.textContent = err.message || 'Konnte nicht gespeichert werden.';
      errorEl.hidden = false;
    }
  }

  async function doDelete() {
    if (!editing) return;
    await db.removeCustomExercise(editing.id);
    custom = await db.listCustomExercises();
    dialog.close();
    renderList();
  }

  const toggleDeleteConfirm = (show) => {
    dialog.querySelector('[data-el="actions"]').hidden = show;
    dialog.querySelector('[data-el="del-confirm"]').hidden = !show;
  };

  root.querySelector('.lib-search').addEventListener('input', (e) => {
    filter.query = e.target.value;
    renderList();
  });
  root.querySelector('[data-field="category"]').addEventListener('change', (e) => {
    filter.category = e.target.value;
    renderList();
  });
  root.querySelector('[data-field="equipment"]').addEventListener('change', (e) => {
    filter.equipment = e.target.value;
    renderList();
  });

  dialog.addEventListener('input', (e) => {
    if (e.target.matches('[data-field="name"]')) updateDuplicateWarning();
  });
  // Native dialog closes on Escape/backdrop; make sure the delete-confirm never sticks for next open.
  dialog.addEventListener('close', () => toggleDeleteConfirm(false));

  // Delegated to this screen's <main> (dies when the screen is left) rather than the persistent #app.
  root.querySelector('main').addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const { action, edit, muscle } = btn.dataset;
    if (action === 'back') onBack();
    else if (action === 'add') openDialog(null);
    else if (btn.dataset.pick) pickExercise(btn.dataset.pick, btn);
    else if (edit) openDialog(custom.find((c) => c.id === edit));
    else if (muscle) btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    else if (action === 'save') save();
    else if (action === 'cancel') dialog.close();
    else if (action === 'delete') toggleDeleteConfirm(true);
    else if (action === 'delete-cancel') toggleDeleteConfirm(false);
    else if (action === 'delete-confirm') doDelete();
  });

  renderList();
}
