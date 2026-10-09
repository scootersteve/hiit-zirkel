import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, plannedDurationS, normalizeSettings, PHASE } from '../js/core/plan.js';

const ex = (n, sidesAt = []) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `Übung ${i + 1}`, sides: sidesAt.includes(i) }));
const sumS = (plan) => plan.phases.reduce((acc, p) => acc + p.durationMs, 0) / 1000;
const types = (plan) => plan.phases.map((p) => p.type);

test('Abnahmetest: 6 Übungen, 40/20, 3 Runden, Rundenpause 90, Vorlauf 10 = 1210 s', () => {
  const settings = { rounds: 3, workS: 40, restS: 20, roundRestS: 90, prepS: 10, warmupS: 0, cooldownS: 0 };
  assert.equal(plannedDurationS(settings, 6), 1210);
  const plan = buildPlan(settings, ex(6));
  assert.equal(sumS(plan), 1210);
  // 1 Vorlauf + 18 Belastungen + 15 Pausen + 2 Rundenpausen
  assert.equal(plan.phases.length, 36);
  assert.equal(types(plan).filter((t) => t === PHASE.WORK).length, 18);
  assert.equal(types(plan).filter((t) => t === PHASE.REST).length, 15);
  assert.equal(types(plan).filter((t) => t === PHASE.ROUND_REST).length, 2);
});

test('Rundenpause ersetzt die Pause nach der letzten Übung, nach dem Ende keine Pause', () => {
  const plan = buildPlan({ rounds: 2, workS: 40, restS: 20, roundRestS: 90, prepS: 10 }, ex(3));
  assert.deepEqual(types(plan), [
    'prep',
    'work', 'rest', 'work', 'rest', 'work', 'roundRest',
    'work', 'rest', 'work', 'rest', 'work',
  ]);
});

test('1 Übung × 1 Runde: nur Vorlauf und Belastung', () => {
  const settings = { rounds: 1, workS: 40, restS: 20, roundRestS: 90, prepS: 10 };
  const plan = buildPlan(settings, ex(1));
  assert.deepEqual(types(plan), ['prep', 'work']);
  assert.equal(plannedDurationS(settings, 1), 50);
  assert.equal(sumS(plan), 50);
});

test('Pause 0 s: keine Pausen-Phasen, Rundenpause bleibt', () => {
  const settings = { rounds: 2, workS: 30, restS: 0, roundRestS: 60, prepS: 0 };
  const plan = buildPlan(settings, ex(3));
  assert.deepEqual(types(plan), ['work', 'work', 'work', 'roundRest', 'work', 'work', 'work']);
  assert.equal(plannedDurationS(settings, 3), 240);
  assert.equal(sumS(plan), 240);
});

test('Rundenpause 0 s: nächste Runde startet direkt, auch keine normale Pause dazwischen', () => {
  const settings = { rounds: 2, workS: 30, restS: 10, roundRestS: 0, prepS: 0 };
  const plan = buildPlan(settings, ex(3));
  assert.deepEqual(types(plan), ['work', 'rest', 'work', 'rest', 'work', 'work', 'rest', 'work', 'rest', 'work']);
  assert.equal(plannedDurationS(settings, 3), 220);
  assert.equal(sumS(plan), 220);
});

test('Klassisches Tabata: 1 Übung, 20/10, 8 Runden, Rundenpause 10 = 230 s ohne Vorlauf', () => {
  const settings = { rounds: 8, workS: 20, restS: 10, roundRestS: 10, prepS: 0 };
  assert.equal(plannedDurationS(settings, 1), 230);
  const plan = buildPlan(settings, ex(1));
  assert.equal(sumS(plan), 230);
  assert.equal(types(plan).filter((t) => t === PHASE.WORK).length, 8);
  assert.equal(types(plan).filter((t) => t === PHASE.ROUND_REST).length, 7);
  assert.equal(types(plan).filter((t) => t === PHASE.REST).length, 0);
});

test('Aufwärmen und Cool-down an der richtigen Stelle', () => {
  const settings = { rounds: 1, workS: 20, restS: 10, roundRestS: 0, prepS: 10, warmupS: 60, cooldownS: 120 };
  const plan = buildPlan(settings, ex(2));
  assert.deepEqual(types(plan), ['prep', 'warmup', 'work', 'rest', 'work', 'cooldown']);
  assert.equal(plannedDurationS(settings, 2), 10 + 60 + 20 + 10 + 20 + 120);
  assert.equal(sumS(plan), plannedDurationS(settings, 2));
});

test('Positionen und "Als Nächstes" stimmen', () => {
  const plan = buildPlan({ rounds: 2, workS: 40, restS: 20, roundRestS: 60, prepS: 10 }, ex(3));
  const [prep, w1, r1] = plan.phases;
  assert.equal(prep.next.id, 'e1');
  assert.equal(w1.exercise.id, 'e1');
  assert.equal(w1.next.id, 'e2');
  assert.equal(r1.next.id, 'e2');
  const roundRest = plan.phases.find((p) => p.type === PHASE.ROUND_REST);
  assert.equal(roundRest.round, 1);
  assert.equal(roundRest.next.id, 'e1');
  const last = plan.phases.at(-1);
  assert.equal(last.type, PHASE.WORK);
  assert.equal(last.round, 2);
  assert.equal(last.exerciseIndex, 2);
  assert.equal(last.next, null);
});

test('Formel und Ablaufplan stimmen für viele zufällige Einstellungen überein', () => {
  let seed = 42;
  const rand = (max) => {
    seed = (seed * 1103515245 + 12345) % 2147483648; // deterministic, so failures are reproducible
    return seed % (max + 1);
  };
  for (let i = 0; i < 500; i++) {
    const settings = {
      rounds: 1 + rand(9),
      workS: 1 + rand(120),
      restS: rand(60),
      roundRestS: rand(180),
      prepS: rand(15),
      warmupS: rand(1) ? 0 : rand(300),
      cooldownS: rand(1) ? 0 : rand(300),
    };
    const n = 1 + rand(9);
    assert.equal(sumS(buildPlan(settings, ex(n))), plannedDurationS(settings, n), JSON.stringify({ settings, n }));
  }
});

test('Keine Übungen: leerer Plan, Dauer 0', () => {
  assert.equal(buildPlan({}, []).phases.length, 0);
  assert.equal(plannedDurationS({}, 0), 0);
});

test('normalizeSettings: Standardwerte, ganze Zahlen, Grenzen', () => {
  assert.deepEqual(normalizeSettings({}), {
    rounds: 3, workS: 40, restS: 20, roundRestS: 60, prepS: 10, warmupS: 0, cooldownS: 0,
  });
  const s = normalizeSettings({ rounds: 0, workS: 0, restS: -5, roundRestS: '45', prepS: 7.6, warmupS: 'abc' });
  assert.equal(s.rounds, 1);
  assert.equal(s.workS, 1);
  assert.equal(s.restS, 0);
  assert.equal(s.roundRestS, 45);
  assert.equal(s.prepS, 8);
  assert.equal(s.warmupS, 0);
});
