// What the run screen shows for a phase. Pure, so it is testable without a browser.

import { PHASE } from './plan.js';

export const PHASE_LABEL = Object.freeze({
  [PHASE.PREP]: 'Vorlauf',
  [PHASE.WARMUP]: 'Aufwärmen',
  [PHASE.WORK]: 'Belastung',
  [PHASE.REST]: 'Pause',
  [PHASE.ROUND_REST]: 'Rundenpause',
  [PHASE.COOLDOWN]: 'Cool-down',
});

/**
 * "Runde x/y · Übung n/m". In breaks it already shows the upcoming exercise,
 * matching the "Als Nächstes" line.
 */
export function displayPosition(phase, plan) {
  const { rounds, exerciseCount } = plan;
  let round = phase.round;
  let number = phase.exerciseIndex + 1;
  if (phase.type === PHASE.REST) number += 1;
  if (phase.type === PHASE.ROUND_REST) {
    round += 1;
    number = 1;
  }
  return { round, rounds, number, exerciseCount };
}

/**
 * Main text under the countdown.
 * Work: the current exercise. Breaks, prep, warm-up: "Als Nächstes" + upcoming exercise.
 * sideLabel: "Seite 1" / "Seite 2" for exercises with a side switch, else null.
 * The switch is at half the planned work time, like the cue ("+10 s" only extends side 2).
 */
export function exerciseLine(phase, phaseElapsedMs) {
  if (phase.type === PHASE.WORK) {
    const side = phase.exercise.sides ? (phaseElapsedMs >= phase.durationMs / 2 ? 'Seite 2' : 'Seite 1') : null;
    return { label: null, name: phase.exercise.name, sideLabel: side };
  }
  if (phase.next) return { label: 'Als Nächstes', name: phase.next.name, sideLabel: null };
  return { label: null, name: '', sideLabel: null };
}
