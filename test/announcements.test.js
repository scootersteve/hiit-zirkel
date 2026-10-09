import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, PHASE } from '../js/core/plan.js';
import { phaseStartText } from '../js/core/announcements.js';

const ex = (names) => names.map((name, i) => ({ id: `e${i}`, name, sides: false }));

test('Pause kündigt die nächste Übung an', () => {
  const plan = buildPlan({ rounds: 2, workS: 40, restS: 20, roundRestS: 60, prepS: 10 }, ex(['Burpees', 'Kniebeugen']));
  const rest = plan.phases.find((p) => p.type === PHASE.REST);
  assert.equal(phaseStartText(rest, plan.rounds), 'Pause. Als Nächstes: Kniebeugen');
});

test('Rundenpause: "Runde x geschafft, noch y"', () => {
  const plan = buildPlan({ rounds: 3, workS: 40, restS: 20, roundRestS: 60, prepS: 0 }, ex(['Burpees']));
  const [first, second] = plan.phases.filter((p) => p.type === PHASE.ROUND_REST);
  assert.equal(phaseStartText(first, plan.rounds), 'Runde 1 geschafft, noch 2');
  assert.equal(phaseStartText(second, plan.rounds), 'Runde 2 geschafft, noch eine');
});

test('Belastung, Vorlauf, Cool-down: keine Ansage', () => {
  const plan = buildPlan({ rounds: 1, workS: 40, prepS: 10, cooldownS: 60 }, ex(['Burpees']));
  for (const p of plan.phases) assert.equal(phaseStartText(p, plan.rounds), null);
});
