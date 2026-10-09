// Timer engine. Pure functions over plain state objects; the current time is always passed in.
// Time is derived from timestamps, never counted up by an interval, so app switches,
// jank or a 2-minute WhatsApp break cannot make the timer drift.
//
// ready ──start──▶ running ──pause──▶ paused ──resume──▶ running
// running ── time past last phase / skip on last phase ──▶ finished
// running | paused ── abort ──▶ aborted

import { PHASE } from './plan.js';

export const STATUS = Object.freeze({
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  FINISHED: 'finished',
  ABORTED: 'aborted',
});

export const BACK_RESTART_THRESHOLD_MS = 3000;
export const ADD_TIME_MS = 10000;

/**
 * State fields:
 *  phaseIndex, phaseElapsedMs  position inside the plan, valid at timestamp `since`
 *  activeMs                    workout time so far (everything except time spent paused), valid at `since`
 *  since                       timestamp of the last settle while running, null otherwise
 *  extraMs                     per-phase extensions from "+10 s"
 *  startedAt, endedAt          wall-clock timestamps for the history
 */
export function createTimer(plan) {
  if (!plan.phases.length) throw new Error('Plan has no phases');
  return {
    plan,
    status: STATUS.READY,
    phaseIndex: 0,
    phaseElapsedMs: 0,
    activeMs: 0,
    since: null,
    extraMs: plan.phases.map(() => 0),
    startedAt: null,
    endedAt: null,
  };
}

const durationOf = (state, i) => state.plan.phases[i].durationMs + state.extraMs[i];
const isLast = (state, i) => i === state.plan.phases.length - 1;
const isOpen = (state) => state.status === STATUS.RUNNING || state.status === STATUS.PAUSED;

/**
 * Brings a running state up to `now`: moves through as many phases as have passed.
 * Ends exactly at the end of the last phase, so the recorded duration has no overshoot.
 */
export function settle(state, now) {
  if (state.status !== STATUS.RUNNING) return state;
  const delta = Math.max(0, now - state.since); // ignore clocks that jump backwards
  let phaseIndex = state.phaseIndex;
  let phaseElapsedMs = state.phaseElapsedMs + delta;
  const activeMs = state.activeMs + delta;

  while (phaseElapsedMs >= durationOf(state, phaseIndex)) {
    if (isLast(state, phaseIndex)) {
      const overshoot = phaseElapsedMs - durationOf(state, phaseIndex);
      return {
        ...state,
        status: STATUS.FINISHED,
        phaseIndex,
        phaseElapsedMs: durationOf(state, phaseIndex),
        activeMs: activeMs - overshoot,
        since: null,
        endedAt: now - overshoot,
      };
    }
    phaseElapsedMs -= durationOf(state, phaseIndex);
    phaseIndex++;
  }
  return { ...state, phaseIndex, phaseElapsedMs, activeMs, since: now };
}

export function start(state, now) {
  if (state.status !== STATUS.READY) return state;
  return { ...state, status: STATUS.RUNNING, since: now, startedAt: now };
}

export function pause(state, now) {
  if (state.status !== STATUS.RUNNING) return state;
  const s = settle(state, now);
  if (s.status !== STATUS.RUNNING) return s; // finished in the meantime
  return { ...s, status: STATUS.PAUSED, since: null };
}

export function resume(state, now) {
  if (state.status !== STATUS.PAUSED) return state;
  return { ...state, status: STATUS.RUNNING, since: now };
}

const finishNow = (s, now) => ({
  ...s,
  status: STATUS.FINISHED,
  phaseElapsedMs: durationOf(s, s.phaseIndex),
  since: null,
  endedAt: now,
});

/** Jumps to the start of the next phase. Works while running or paused, the status stays. */
export function skip(state, now) {
  if (!isOpen(state)) return state;
  const s = settle(state, now);
  if (!isOpen(s)) return s;
  if (isLast(s, s.phaseIndex)) return finishNow(s, now);
  return { ...s, phaseIndex: s.phaseIndex + 1, phaseElapsedMs: 0 };
}

/** More than 3 s into the phase: restart it. Otherwise: go to the start of the previous phase. */
export function back(state, now) {
  if (!isOpen(state)) return state;
  const s = settle(state, now);
  if (!isOpen(s)) return s;
  const restart = s.phaseElapsedMs > BACK_RESTART_THRESHOLD_MS || s.phaseIndex === 0;
  return { ...s, phaseIndex: restart ? s.phaseIndex : s.phaseIndex - 1, phaseElapsedMs: 0 };
}

/** Extends only the current phase; the total shifts accordingly. */
export function addTime(state, now, ms = ADD_TIME_MS) {
  if (!isOpen(state)) return state;
  const s = settle(state, now);
  if (!isOpen(s)) return s;
  const extraMs = s.extraMs.slice();
  extraMs[s.phaseIndex] += ms;
  return { ...s, extraMs };
}

export function abort(state, now) {
  if (!isOpen(state)) return state;
  const s = settle(state, now);
  if (!isOpen(s)) return s;
  return { ...s, status: STATUS.ABORTED, since: null, endedAt: now };
}

/** Rounds whose last work phase has ended (by time or by skipping). */
function roundsCompleted(state) {
  const { phases, exerciseCount } = state.plan;
  const doneBefore = state.status === STATUS.FINISHED ? phases.length : state.phaseIndex;
  let count = 0;
  for (let i = 0; i < doneBefore; i++) {
    if (phases[i].type === PHASE.WORK && phases[i].exerciseIndex === exerciseCount - 1) count++;
  }
  return count;
}

/** Read-only snapshot for the display and the sound layer. */
export function view(state, now) {
  const s = settle(state, now);
  const { phases } = s.plan;
  let positionMs = s.phaseElapsedMs;
  let totalMs = 0;
  for (let i = 0; i < phases.length; i++) {
    const d = durationOf(s, i);
    totalMs += d;
    if (i < s.phaseIndex) positionMs += d;
  }
  const phaseDurationMs = durationOf(s, s.phaseIndex);
  return {
    now,
    status: s.status,
    phaseIndex: s.phaseIndex,
    phase: phases[s.phaseIndex],
    phaseDurationMs,
    phaseElapsedMs: s.phaseElapsedMs,
    phaseRemainingMs: phaseDurationMs - s.phaseElapsedMs,
    activeMs: s.activeMs,
    positionMs,
    totalMs,
    progress: totalMs ? positionMs / totalMs : 0,
    round: phases[s.phaseIndex].round,
    rounds: s.plan.rounds,
    exerciseNumber: phases[s.phaseIndex].exerciseIndex + 1,
    exerciseCount: s.plan.exerciseCount,
    roundsCompleted: roundsCompleted(s),
  };
}
