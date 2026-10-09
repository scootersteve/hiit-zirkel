// Builds the workout plan ("Ablaufplan"): a flat list of phases. Pure logic, no DOM.

export const PHASE = Object.freeze({
  PREP: 'prep',
  WARMUP: 'warmup',
  WORK: 'work',
  REST: 'rest',
  ROUND_REST: 'roundRest',
  COOLDOWN: 'cooldown',
});

export const DEFAULT_SETTINGS = Object.freeze({
  rounds: 3,
  workS: 40,
  restS: 20,
  roundRestS: 60,
  prepS: 10,
  warmupS: 0,
  cooldownS: 0,
});

const MAX_SECONDS = 99 * 60 + 59;
const MAX_ROUNDS = 99;

const clampInt = (value, min, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

/** Fills in defaults and clamps everything to sane whole numbers. */
export function normalizeSettings(settings = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  return {
    rounds: clampInt(s.rounds, 1, MAX_ROUNDS),
    workS: clampInt(s.workS, 1, MAX_SECONDS),
    restS: clampInt(s.restS, 0, MAX_SECONDS),
    roundRestS: clampInt(s.roundRestS, 0, MAX_SECONDS),
    prepS: clampInt(s.prepS, 0, MAX_SECONDS),
    warmupS: clampInt(s.warmupS, 0, MAX_SECONDS),
    cooldownS: clampInt(s.cooldownS, 0, MAX_SECONDS),
  };
}

/**
 * Planned duration in seconds, straight from the formula in the requirements:
 * prep + warmup + rounds × (n × work + (n − 1) × rest) + (rounds − 1) × roundRest + cooldown
 */
export function plannedDurationS(settings, exerciseCount) {
  if (exerciseCount < 1) return 0;
  const s = normalizeSettings(settings);
  const n = exerciseCount;
  return (
    s.prepS +
    s.warmupS +
    s.rounds * (n * s.workS + (n - 1) * s.restS) +
    (s.rounds - 1) * s.roundRestS +
    s.cooldownS
  );
}

/**
 * exercises: [{ id, name, sides }]
 * Returns { phases, rounds, exerciseCount }.
 * Each phase: { type, durationMs, round, exerciseIndex, exercise, next }
 *  - round (1-based) and exerciseIndex (0-based) say where in the workout the phase sits.
 *    Rest phases carry the position of the exercise just finished.
 *  - exercise: the exercise being done (work phases only), next: the upcoming exercise or null.
 * Phases with 0 s are never created.
 */
export function buildPlan(settings, exercises) {
  const s = normalizeSettings(settings);
  const n = exercises.length;
  const phases = [];
  if (n === 0) return { phases, rounds: s.rounds, exerciseCount: 0 };

  const add = (type, seconds, round, exerciseIndex, exercise, next) => {
    if (seconds > 0) phases.push({ type, durationMs: seconds * 1000, round, exerciseIndex, exercise, next });
  };

  add(PHASE.PREP, s.prepS, 1, 0, null, exercises[0]);
  add(PHASE.WARMUP, s.warmupS, 1, 0, null, exercises[0]);

  for (let round = 1; round <= s.rounds; round++) {
    const lastRound = round === s.rounds;
    for (let i = 0; i < n; i++) {
      const lastInRound = i === n - 1;
      const next = !lastInRound ? exercises[i + 1] : !lastRound ? exercises[0] : null;
      add(PHASE.WORK, s.workS, round, i, exercises[i], next);
      if (!lastInRound) add(PHASE.REST, s.restS, round, i, null, next);
      else if (!lastRound) add(PHASE.ROUND_REST, s.roundRestS, round, i, null, next); // replaces the normal rest
      // after the very last exercise: no rest at all
    }
  }

  add(PHASE.COOLDOWN, s.cooldownS, s.rounds, n - 1, null, null);
  return { phases, rounds: s.rounds, exerciseCount: n };
}
