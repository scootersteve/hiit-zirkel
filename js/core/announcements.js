// Texts for the German voice announcements. Pure, so the wording is testable.

import { PHASE } from './plan.js';

export const SIDE_SWITCH_TEXT = 'Seite wechseln';
export const FINISHED_TEXT = 'Geschafft';

/** Announcement at the start of a phase, or null if this phase type has none. */
export function phaseStartText(phase, rounds) {
  if (phase.type === PHASE.REST) {
    return phase.next ? `Pause. Als Nächstes: ${phase.next.name}` : 'Pause';
  }
  if (phase.type === PHASE.ROUND_REST) {
    const left = rounds - phase.round;
    return `Runde ${phase.round} geschafft, noch ${left === 1 ? 'eine' : left}`;
  }
  return null;
}
