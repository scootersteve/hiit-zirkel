// Time formatting for display. Pure.

const pad = (n) => String(n).padStart(2, '0');

/** Seconds → "m:ss" or "h:mm:ss". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * Remaining phase time for the big countdown. Rounds up, so a fresh 40 s phase shows 0:40
 * and the last second shows 0:01 (never 0:00 while the phase is still running).
 */
export function formatRemaining(ms) {
  return formatDuration(Math.ceil(Math.max(0, ms) / 1000));
}

/** Elapsed time rounds down: 59.9 s is still 0:59. */
export function formatElapsed(ms) {
  return formatDuration(Math.floor(Math.max(0, ms) / 1000));
}
