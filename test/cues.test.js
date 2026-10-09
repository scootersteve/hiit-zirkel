import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../js/core/plan.js';
import { createTimer, settle, start, view, pause } from '../js/core/timer.js';
import { cuesBetween, canAnnounce, CUE } from '../js/core/cues.js';

const ex = (n, sidesAt = []) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `Übung ${i + 1}`, sides: sidesAt.includes(i) }));
const ACCEPTANCE = { rounds: 3, workS: 40, restS: 20, roundRestS: 90, prepS: 10, warmupS: 0, cooldownS: 0 };
const T0 = 5_000_000;

/** Simulates the UI loop: tick every `stepMs`, collect all cues. */
function run(settings, exercises, { stepMs = 250, untilMs = 3_600_000, jitter = false } = {}) {
  let t = start(createTimer(buildPlan(settings, exercises)), T0);
  let prev = view(t, T0);
  const cues = [];
  let now = T0;
  let i = 0;
  while (t.status === 'running' && now - T0 < untilMs) {
    now += jitter ? stepMs + ((i++ * 37) % 60) - 30 : stepMs;
    t = settle(t, now);
    const next = view(t, now);
    for (const c of cuesBetween(prev, next)) cues.push({ ...c, at: now - T0 });
    prev = next;
  }
  return { cues, state: t };
}

const count = (cues, type) => cues.filter((c) => c.type === type).length;

test('Abnahmetest komplett: jede Phase startet einmal, je Phase 3-2-1, einmal Ende', () => {
  const { cues, state } = run(ACCEPTANCE, ex(6));
  assert.equal(state.status, 'finished');
  assert.equal(count(cues, CUE.PHASE_START), 35); // 36 phases, the first one starts with the start button
  assert.equal(count(cues, CUE.COUNTDOWN), 36 * 3);
  assert.equal(count(cues, CUE.FINISHED), 1);
  assert.equal(cues.at(-1).type, CUE.FINISHED);
});

test('Countdown kommt in der Reihenfolge 3, 2, 1, dann Phasenstart', () => {
  const { cues } = run({ rounds: 1, workS: 10, restS: 5, roundRestS: 0, prepS: 5 }, ex(2));
  const firstFour = cues.slice(0, 4).map((c) => c.type === CUE.COUNTDOWN ? c.n : c.type);
  assert.deepEqual(firstFour, [3, 2, 1, CUE.PHASE_START]);
  // the countdown "3" sounds at 2 s into the 5 s prep (with 250 ms ticks, exactly at 2000 ms)
  assert.equal(cues[0].at, 2000);
});

test('Ungleichmäßige Ticks (Ruckeln) ergeben dieselben Signale', () => {
  const a = run(ACCEPTANCE, ex(6)).cues.map((c) => c.type + (c.n ?? ''));
  const b = run(ACCEPTANCE, ex(6), { jitter: true }).cues.map((c) => c.type + (c.n ?? ''));
  assert.deepEqual(b, a);
});

test('Lücke über 1,5 s (Rückkehr aus dem Hintergrund): keine nachgeholten Signale', () => {
  let t = start(createTimer(buildPlan(ACCEPTANCE, ex(6))), T0);
  const prev = view(t, T0 + 1000);
  t = settle(t, T0 + 120_000);
  assert.deepEqual(cuesBetween(prev, view(t, T0 + 120_000)), []);
});

test('Halbzeit-Signal bei normaler Übung, Seitenwechsel bei Übung mit Seiten', () => {
  const { cues } = run({ rounds: 1, workS: 40, restS: 10, roundRestS: 0, prepS: 0 }, ex(2, [1]));
  const mid = cues.filter((c) => c.type === CUE.HALFWAY || c.type === CUE.SIDE_SWITCH);
  assert.deepEqual(mid.map((c) => c.type), [CUE.HALFWAY, CUE.SIDE_SWITCH]);
  assert.equal(mid[0].at, 20_000);
  assert.equal(mid[1].at, 40_000 + 10_000 + 20_000);
});

test('Kein Halbzeit-Signal, wenn die Phase zu kurz ist (würde mit dem Countdown kollidieren)', () => {
  const { cues } = run({ rounds: 1, workS: 6, restS: 0, roundRestS: 0, prepS: 0 }, ex(1, [0]));
  assert.equal(count(cues, CUE.SIDE_SWITCH), 0);
  assert.equal(count(cues, CUE.HALFWAY), 0);
});

test('Im pausierten Zustand entstehen keine Signale', () => {
  let t = start(createTimer(buildPlan(ACCEPTANCE, ex(6))), T0);
  t = pause(t, T0 + 7500);
  const prev = view(t, T0 + 7500);
  assert.deepEqual(cuesBetween(prev, view(t, T0 + 8000)), []);
});

test('Phase kürzer als 3 s: kein Countdown-Ton direkt beim Phasenstart', () => {
  const { cues } = run({ rounds: 1, workS: 2, restS: 0, roundRestS: 0, prepS: 0 }, ex(1));
  assert.deepEqual(
    cues.map((c) => c.type + (c.n ?? '')),
    ['countdown1', 'finished'], // no "2": it would collide with the start of the phase
  );
});

test('Ansage nur, wenn sie vor den Countdown passt', () => {
  const text = 'Pause. Als Nächstes: Kniebeugen'; // 31 Zeichen
  assert.equal(canAnnounce(20_000, text), true);
  assert.equal(canAnnounce(5_000, text), false);
  // with a faster voice (measured on the iPhone later) shorter phases work too
  assert.equal(canAnnounce(7_000, text, 70), true);
});
