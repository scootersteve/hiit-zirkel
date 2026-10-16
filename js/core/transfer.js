// Backup (export/import) and share-link codec. Pure, no DOM, no storage.
// Uses btoa/atob + TextEncoder/TextDecoder, which exist in both the browser and Node.

import { normalizeSettings } from './plan.js';

export const BACKUP_FORMAT = 'hiit-zirkel-backup';
export const BACKUP_VERSION = 1;

// ---- full backup ----

/** Wraps the gathered data in the versioned backup envelope. */
export function buildBackup(data, { now = Date.now() } = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    customExercises: data.customExercises || [],
    exerciseUsage: data.exerciseUsage || {},
    templates: data.templates || [],
    history: data.history || [],
    settings: data.settings || {},
  };
}

/** Validates a backup (object or JSON string) and returns its sections. Throws a readable error. */
export function parseBackup(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      throw new Error('Datei ist kein gültiges JSON');
    }
  }
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT) throw new Error('Keine Zirkel-Dojo-Sicherung');
  if (data.version !== BACKUP_VERSION) throw new Error(`Unbekannte Sicherungs-Version: ${data.version}`);
  return {
    customExercises: Array.isArray(data.customExercises) ? data.customExercises : [],
    exerciseUsage: data.exerciseUsage && typeof data.exerciseUsage === 'object' ? data.exerciseUsage : {},
    templates: Array.isArray(data.templates) ? data.templates : [],
    history: Array.isArray(data.history) ? data.history : [],
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  };
}

// ---- share link ----

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const isValidSnapshot = (e) => e && e.id != null && e.name != null;
const shareSnapshot = (e) => {
  const snap = { id: String(e.id), name: String(e.name), sides: !!e.sides };
  if (e.workS != null) snap.workS = e.workS;
  return snap;
};

/** Encodes a circuit (name, exercises, settings) as a base64url string for the URL hash. */
export function encodeCircuit(circuit) {
  const payload = {
    name: circuit.name || '',
    exercises: (circuit.exercises || []).filter(isValidSnapshot).map(shareSnapshot),
    settings: { ...circuit.settings },
  };
  return toBase64Url(JSON.stringify(payload));
}

/** Decodes a share string back into a sanitised, runnable circuit. Throws on anything invalid. */
export function decodeCircuit(str) {
  let data;
  try {
    data = JSON.parse(fromBase64Url(str));
  } catch {
    throw new Error('Link konnte nicht gelesen werden');
  }
  if (!data || typeof data.name !== 'string' || !Array.isArray(data.exercises)) throw new Error('Link enthält keinen gültigen Zirkel');
  return {
    name: data.name,
    exercises: data.exercises.filter(isValidSnapshot).map(shareSnapshot),
    settings: normalizeSettings(data.settings || {}),
  };
}
