// Derives sound/speech cues from two timer snapshots (see view() in timer.js). Pure logic.
// Only covers time simply passing. User actions (skip, back) trigger their phase-start sound
// in the UI directly, because they are not "time passing".

import { PHASE } from './plan.js';
import { STATUS } from './timer.js';

export const CUE = Object.freeze({
  PHASE_START: 'phaseStart',
  COUNTDOWN: 'countdown', // n = 3, 2, 1
  HALFWAY: 'halfway',
  SIDE_SWITCH: 'sideSwitch',
  FINISHED: 'finished',
});

export const COUNTDOWN_MS = [3000, 2000, 1000];
export const MAX_GAP_MS = 1500; // larger gap = we were in the background, don't replay old cues
const HALFWAY_MIN_MS = 3500; // halfway point must lie before the countdown window

function countdownCues(prevRemaining, nextRemaining) {
  return COUNTDOWN_MS.filter((t) => prevRemaining > t && nextRemaining <= t).map((t) => ({
    type: CUE.COUNTDOWN,
    n: t / 1000,
  }));
}

function halfwayCues(phase, durationMs, prevElapsed, nextElapsed) {
  if (phase.type !== PHASE.WORK) return [];
  const half = durationMs / 2;
  if (half < HALFWAY_MIN_MS) return [];
  if (!(prevElapsed < half && nextElapsed >= half)) return [];
  return [{ type: phase.exercise?.sides ? CUE.SIDE_SWITCH : CUE.HALFWAY }];
}

/**
 * prev, next: snapshots from view(), taken at prev.now and next.now.
 * Returns cues in the order they should sound.
 */
export function cuesBetween(prev, next, maxGapMs = MAX_GAP_MS) {
  if (prev.status !== STATUS.RUNNING) return [];
  if (next.now - prev.now > maxGapMs) return [];
  if (next.status !== STATUS.RUNNING && next.status !== STATUS.FINISHED) return [];

  if (next.phaseIndex === prev.phaseIndex) {
    const cues = [
      ...halfwayCues(prev.phase, next.phaseDurationMs, prev.phaseElapsedMs, next.phaseElapsedMs),
      ...countdownCues(prev.phaseRemainingMs, next.phaseRemainingMs),
    ];
    if (next.status === STATUS.FINISHED) cues.push({ type: CUE.FINISHED });
    return cues;
  }

  // Crossed into a new phase: finish the old one, start the new one, then whatever
  // already happened inside the new phase.
  const cues = [
    ...halfwayCues(prev.phase, prev.phaseDurationMs, prev.phaseElapsedMs, prev.phaseDurationMs),
    ...countdownCues(prev.phaseRemainingMs, 0),
    { type: CUE.PHASE_START, phaseIndex: next.phaseIndex },
    ...halfwayCues(next.phase, next.phaseDurationMs, 0, next.phaseElapsedMs),
    ...countdownCues(next.phaseDurationMs, next.phaseRemainingMs),
  ];
  if (next.status === STATUS.FINISHED) cues.push({ type: CUE.FINISHED });
  return cues;
}

/**
 * Speech only at the start of a phase and only if it fits before the countdown:
 * phase length >= estimated speech + 3 s countdown + 1 s buffer.
 * msPerChar is a conservative guess; the iPhone test measures the real value.
 */
export function canAnnounce(phaseDurationMs, text, msPerChar = 110) {
  const speechMs = 500 + text.length * msPerChar;
  return phaseDurationMs >= speechMs + 3000 + 1000;
}
