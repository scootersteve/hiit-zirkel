import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, weeklySummary } from '../js/core/stats.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('Woche beginnt am Montag 0 Uhr', () => {
  const monday = at(2026, 11, 9, 0); // Mo 09.11.2026
  assert.equal(weekStart(at(2026, 11, 9, 7)), monday);
  assert.equal(weekStart(at(2026, 11, 15, 23)), monday); // Sonntag gehört noch dazu
  assert.equal(weekStart(at(2026, 11, 16, 0)), at(2026, 11, 16, 0));
});

test('Trainings und Zeit pro Woche, neueste zuerst, leere Wochen bleiben sichtbar', () => {
  const now = at(2026, 11, 10);
  const entries = [
    { startedAt: at(2026, 11, 9, 18), actualS: 1210 },
    { startedAt: at(2026, 11, 10, 8), actualS: 600, status: 'aborted' },
    { startedAt: at(2026, 10, 27, 18), actualS: 900 }, // zwei Wochen vorher
    { startedAt: at(2026, 9, 1), actualS: 999 }, // außerhalb der 4 Wochen
  ];
  const weeks = weeklySummary(entries, { now, weeks: 4 });
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks.map((w) => [w.count, w.seconds]), [[2, 1810], [0, 0], [1, 900], [0, 0]]);
  assert.equal(weeks[0].start, at(2026, 11, 9, 0));
});

test('Zeitumstellung (25.10.2026) verschiebt die Wochengrenze nicht', () => {
  const weeks = weeklySummary([], { now: at(2026, 10, 28), weeks: 2 });
  assert.equal(new Date(weeks[1].start).getHours(), 0);
  assert.equal(new Date(weeks[1].start).getDay(), 1);
});
