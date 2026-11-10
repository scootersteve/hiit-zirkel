// Which body regions an exercise or a whole circuit loads, as levels for the body graphic:
//   3 = main muscle / most of the work     2 = medium     1 = secondary / little     (absent = none)
// Pure logic, no DOM. Region names are the keys of MUSCLES (= the names in the graphic).

import { MUSCLES } from '../data/muscles.js';

export const LEVEL_MAIN = 3;
export const LEVEL_SECONDARY = 1;
const SECONDARY_WEIGHT = 0.4; // a secondary muscle counts this much of the work time

/** { region: level } for one exercise: main muscles 3, secondary muscles 1. */
export function exerciseLevels(exercise) {
  const levels = {};
  for (const m of exercise?.secondaryMuscles || []) if (m in MUSCLES) levels[m] = LEVEL_SECONDARY;
  for (const m of exercise?.primaryMuscles || []) if (m in MUSCLES) levels[m] = LEVEL_MAIN;
  return levels;
}

/**
 * Load of a whole circuit. Every exercise adds its work time to its main muscles and a part of
 * it to its secondary ones; the most loaded region is the reference (level 3).
 * `snapshots` are the circuit's exercises ({ id, workS? }), `lookup(id)` returns the library
 * exercise or undefined (deleted own exercise, shared circuit from another phone).
 * Returns { levels, ranked: [region, …] (most loaded first), known, unknown }.
 */
export function circuitLoad(snapshots, settings, lookup) {
  const score = {};
  let known = 0;
  let unknown = 0;
  for (const snap of snapshots || []) {
    const exercise = lookup(snap.id);
    if (!exercise) {
      unknown++;
      continue;
    }
    known++;
    const seconds = Number(snap.workS ?? settings?.workS) || 0;
    const levels = exerciseLevels(exercise);
    for (const [m, level] of Object.entries(levels)) {
      score[m] = (score[m] || 0) + seconds * (level === LEVEL_MAIN ? 1 : SECONDARY_WEIGHT);
    }
  }
  const order = Object.keys(MUSCLES);
  const ranked = Object.keys(score)
    .filter((m) => score[m] > 0)
    .sort((a, b) => score[b] - score[a] || order.indexOf(a) - order.indexOf(b));
  const max = ranked.length ? score[ranked[0]] : 0;
  const levels = {};
  for (const m of ranked) {
    const share = score[m] / max;
    levels[m] = share >= 2 / 3 ? 3 : share >= 1 / 3 ? 2 : 1;
  }
  return { levels, ranked, known, unknown };
}
