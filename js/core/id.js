// Short random ids with a type prefix: "c-x7k2" (custom exercise), "t-…" (template), "h-…" (history).
// No look-alike characters (0/o, 1/l/i), so an id is easy to read out loud if ever needed.

const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';

export function makeId(prefix, existingIds = []) {
  const taken = new Set(existingIds);
  let id;
  do {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    id = `${prefix}-${s}`;
  } while (taken.has(id));
  return id;
}
