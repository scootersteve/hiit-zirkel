import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, PHASE } from '../js/core/plan.js';
import { displayPosition, exerciseLine } from '../js/core/display.js';

const ex = [
  { id: 'a', name: 'Burpees', sides: false },
  { id: 'b', name: 'Seitstütz', sides: true },
];
const plan = buildPlan({ rounds: 2, workS: 40, restS: 20, roundRestS: 60, prepS: 10 }, ex);
const byType = (type) => plan.phases.filter((p) => p.type === type);

test('Position: Belastung zeigt die aktuelle, Pausen zeigen die kommende Übung', () => {
  const [prep] = byType(PHASE.PREP);
  const [w1, w2] = byType(PHASE.WORK);
  const [rest] = byType(PHASE.REST);
  const [roundRest] = byType(PHASE.ROUND_REST);
  assert.deepEqual(displayPosition(prep, plan), { round: 1, rounds: 2, number: 1, exerciseCount: 2 });
  assert.deepEqual(displayPosition(w1, plan), { round: 1, rounds: 2, number: 1, exerciseCount: 2 });
  assert.deepEqual(displayPosition(rest, plan), { round: 1, rounds: 2, number: 2, exerciseCount: 2 });
  assert.deepEqual(displayPosition(w2, plan), { round: 1, rounds: 2, number: 2, exerciseCount: 2 });
  assert.deepEqual(displayPosition(roundRest, plan), { round: 2, rounds: 2, number: 1, exerciseCount: 2 });
});

test('Text unter der Restzeit', () => {
  const [prep] = byType(PHASE.PREP);
  const [w1, w2] = byType(PHASE.WORK);
  const [rest] = byType(PHASE.REST);
  assert.deepEqual(exerciseLine(prep, 0), { label: 'Als Nächstes', name: 'Burpees', sideLabel: null });
  assert.deepEqual(exerciseLine(w1, 5_000), { label: null, name: 'Burpees', sideLabel: null });
  assert.deepEqual(exerciseLine(rest, 0), { label: 'Als Nächstes', name: 'Seitstütz', sideLabel: null });
  assert.equal(exerciseLine(w2, 19_999).sideLabel, 'Seite 1');
  assert.equal(exerciseLine(w2, 20_000).sideLabel, 'Seite 2');
  const last = plan.phases.at(-1);
  assert.equal(exerciseLine(last, 0).name, 'Seitstütz');
});
