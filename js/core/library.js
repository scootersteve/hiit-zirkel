// Exercise library: combine the built-in list with the user's own exercises, search, filter,
// detect duplicates, and create/validate custom exercises. Pure logic, no DOM, no storage.

import { EXERCISES, CATEGORIES, EQUIPMENT } from '../data/exercises.js';
import { MUSCLES } from '../data/muscles.js';
import { makeId } from './id.js';

/** Fold text for search: lowercase, drop diacritics (ü→u), ß→ss, collapse whitespace. */
export function fold(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

// Key for duplicate detection: like fold, but spaces removed entirely ("Push Up" == "pushup").
const dedupeKey = (name) => fold(name).replace(/ /g, '');

/** German-aware name sort for display. */
export const byName = (a, b) => a.name.localeCompare(b.name, 'de');

/** Built-in exercises (custom: false) followed by the user's own (custom: true), one shape. */
export function combineExercises(custom = []) {
  return [
    ...EXERCISES.map((e) => ({ ...e, custom: false })),
    ...custom.map((e) => ({ ...e, custom: true })),
  ];
}

/** Filters by free-text name (diacritic-insensitive) and by category/equipment. Empty = no filter. */
export function filterExercises(list, { query = '', category = '', equipment = '' } = {}) {
  const q = fold(query);
  return list.filter((e) => {
    if (category && e.category !== category) return false;
    if (equipment && e.equipment !== equipment) return false;
    if (q && !fold(e.name).includes(q)) return false;
    return true;
  });
}

/** The first exercise whose name matches (ignoring case, spaces, diacritics), or null. */
export function findDuplicate(list, name) {
  const key = dedupeKey(name);
  return list.find((e) => dedupeKey(e.name) === key) || null;
}

/** A fresh custom-exercise id like "c-x7k2", guaranteed not to collide with `existingIds`. */
export const generateId = (existingIds = []) => makeId('c', existingIds);

const cleanMuscles = (muscles) =>
  Array.isArray(muscles) ? [...new Set(muscles.filter((m) => m in MUSCLES))] : [];

// Shared validation for create and update. Name required; the rest optional with sane fallbacks.
function validatedFields(input, fallback = {}) {
  const src = input || {};
  const name = String(src.name ?? '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Name ist erforderlich');
  const primaryMuscles = cleanMuscles(src.primaryMuscles);
  return {
    name,
    category: src.category in CATEGORIES ? src.category : fallback.category ?? 'full',
    equipment: src.equipment in EQUIPMENT ? src.equipment : fallback.equipment ?? 'none',
    primaryMuscles,
    secondaryMuscles: cleanMuscles(src.secondaryMuscles).filter((m) => !primaryMuscles.includes(m)),
    sides: Boolean(src.sides),
  };
}

/** Builds a validated new custom exercise with a fresh id. Throws if the name is empty. */
export function makeCustomExercise(input, { existingIds = [], now = Date.now() } = {}) {
  return { id: generateId(existingIds), ...validatedFields(input), custom: true, createdAt: now, updatedAt: now };
}

/** Applies edits to an existing custom exercise, keeping id and createdAt, bumping updatedAt. */
export function updateCustomExercise(existing, input, { now = Date.now() } = {}) {
  return { ...existing, ...validatedFields(input, existing), custom: true, updatedAt: now };
}
