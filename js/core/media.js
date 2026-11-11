// Personal media: an own background picture for the training screen and own sounds for
// "Runde geschafft" and "Ende". They live only on this device (media store of IndexedDB), are
// never part of a backup and never part of a share link. This file holds the rules, without
// DOM or storage: which slots exist, what a file must look like, how a picture is scaled.

/** slot → what it is. `signal` names the built-in signal an own sound replaces. */
export const MEDIA_SLOTS = Object.freeze({
  background: { kind: 'image', label: 'Hintergrundbild' },
  'sound-roundDone': { kind: 'sound', label: 'Ton „Runde geschafft"', signal: 'roundRestStart' },
  'sound-end': { kind: 'sound', label: 'Ton „Ende"', signal: 'finished' },
});
export const MEDIA_KEYS = Object.freeze(Object.keys(MEDIA_SLOTS));

export const IMAGE_MAX_EDGE = 1600; // longer side of the stored picture, in pixels
export const IMAGE_MAX_BYTES = 30 * 1024 * 1024; // what may be read at all (phone photos)
export const SOUND_MAX_BYTES = 3 * 1024 * 1024;
export const SOUND_MAX_S = 8; // longer would run into the next announcement and countdown

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/** Throws a readable German error if the chosen file cannot be used for the slot. */
export function checkFile(slot, { type = '', size = 0 } = {}) {
  const def = MEDIA_SLOTS[slot];
  if (!def) throw new Error('Unbekannter Speicherplatz');
  if (!size) throw new Error('Die Datei ist leer.');
  if (def.kind === 'image') {
    if (!/^image\//.test(type)) throw new Error('Das ist kein Bild.');
    if (size > IMAGE_MAX_BYTES) throw new Error(`Das Bild ist zu groß (${mb(size)}, höchstens ${mb(IMAGE_MAX_BYTES)}).`);
  } else {
    // iOS reports some recordings without a type; the decoder decides in that case
    if (type && !/^(audio|video)\//.test(type)) throw new Error('Das ist keine Tondatei.');
    if (size > SOUND_MAX_BYTES) throw new Error(`Die Tondatei ist zu groß (${mb(size)}, höchstens ${mb(SOUND_MAX_BYTES)}).`);
  }
}

/** Throws if a decoded sound is too long (or has no length at all). */
export function checkSoundLength(seconds) {
  if (!(seconds > 0)) throw new Error('Die Tondatei lässt sich nicht abspielen.');
  if (seconds > SOUND_MAX_S) {
    throw new Error(`Der Ton ist ${seconds.toFixed(1).replace('.', ',')} s lang, höchstens ${SOUND_MAX_S} s. Sonst überdeckt er die nächste Ansage.`);
  }
}

/** Size of a picture scaled down so its longer side is at most `max` (never scaled up). */
export function fitWithin(width, height, max = IMAGE_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) throw new Error('Das Bild hat keine Größe.');
  const scale = Math.min(1, max / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The record as it is stored: bytes plus what is needed to show or play them again. */
export function makeMediaRecord({ type, bytes, name = '', seconds = null, now = Date.now() }) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new Error('Keine Daten');
  const record = { type: String(type || ''), bytes, name: String(name).slice(0, 80), savedAt: now };
  if (seconds > 0) record.seconds = Math.round(seconds * 10) / 10; // sounds: length, for the settings screen
  return record;
}

/** "240 kB" / "1,3 MB" for the settings screen. */
export function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : mb(bytes);
}
