// Weekly overview for the history: trainings and training time per calendar week (Monday to
// Sunday, local time). Pure logic, no DOM.

/** Local midnight of the Monday that starts the week containing `ts`. */
export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7; // getDay: 0 = Sunday
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/**
 * The last `weeks` calendar weeks, newest first, including weeks without training:
 * [{ start, end, count, seconds }]. Aborted trainings count too; their time is what was done.
 */
export function weeklySummary(entries, { now = Date.now(), weeks = 4 } = {}) {
  const result = [];
  let start = weekStart(now);
  for (let i = 0; i < weeks; i++) {
    // step back by whole days via the calendar, so a DST change does not shift the week
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    result.push({ start, end: end.getTime(), count: 0, seconds: 0 });
    const prev = new Date(start);
    prev.setDate(prev.getDate() - 7);
    start = prev.getTime();
  }
  for (const e of entries) {
    const week = result.find((w) => e.startedAt >= w.start && e.startedAt < w.end);
    if (!week) continue;
    week.count += 1;
    week.seconds += Math.max(0, Math.round(e.actualS || 0));
  }
  return result;
}

