import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, PHASE } from '../js/core/plan.js';
import { createTimer, settle, start, pause, resume, skip, back, addTime, abort, view, STATUS } from '../js/core/timer.js';

const ex = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `Übung ${i + 1}`, sides: false }));
const ACCEPTANCE = { rounds: 3, workS: 40, restS: 20, roundRestS: 90, prepS: 10, warmupS: 0, cooldownS: 0 };
const T0 = 1_000_000; // arbitrary start timestamp
const s = (sec) => sec * 1000;

function started(settings = ACCEPTANCE, n = 6) {
  return start(createTimer(buildPlan(settings, ex(n))), T0);
}

test('Startzustand und Restzeit der ersten Phase', () => {
  const t = started();
  const v = view(t, T0 + s(3));
  assert.equal(v.status, STATUS.RUNNING);
  assert.equal(v.phase.type, PHASE.PREP);
  assert.equal(v.phaseRemainingMs, s(7));
  assert.equal(v.activeMs, s(3));
  assert.equal(v.totalMs, s(1210));
});

test('Zeit läuft durch mehrere Phasen (z.B. 2 min WhatsApp), Restzeit stimmt', () => {
  const t = started();
  // 10 Vorlauf + 40 Ü1 + 20 Pause + 40 Ü2 = 110 s, dann 10 s in Pause nach Ü2
  const v = view(t, T0 + s(120));
  assert.equal(v.phase.type, PHASE.REST);
  assert.equal(v.exerciseNumber, 2);
  assert.equal(v.phaseRemainingMs, s(10));
  assert.equal(v.round, 1);
  assert.equal(v.positionMs, s(120));
});

test('Ungleichmäßige Abfragen ändern nichts am Ergebnis', () => {
  const smooth = view(started(), T0 + s(500));
  let t = started();
  for (const ms of [17, 333, 1, 9999, 45000, 120000, 2, 77777]) t = settle(t, t.since + ms);
  const jerky = view(t, T0 + s(500));
  assert.equal(jerky.phaseIndex, smooth.phaseIndex);
  assert.equal(jerky.phaseRemainingMs, smooth.phaseRemainingMs);
  assert.equal(jerky.activeMs, smooth.activeMs);
});

test('Abnahmetest läuft durch: Ende genau nach 1210 s, kein Überschuss', () => {
  let t = started();
  t = settle(t, T0 + s(1300)); // first look 90 s after the end
  assert.equal(t.status, STATUS.FINISHED);
  assert.equal(t.activeMs, s(1210));
  assert.equal(t.endedAt, T0 + s(1210));
  const v = view(t, T0 + s(1300));
  assert.equal(v.roundsCompleted, 3);
  assert.equal(v.progress, 1);
  assert.equal(v.phaseRemainingMs, 0);
});

test('Pause: Uhr steht, Pausenzeit zählt nicht, Phasen-Pausen schon', () => {
  let t = started();
  t = pause(t, T0 + s(100)); // mitten in Ü2 (10 Vorlauf + 40 + 20 Pause + 30 s in Ü2)
  assert.equal(t.status, STATUS.PAUSED);
  const during = view(t, T0 + s(220));
  assert.equal(during.activeMs, s(100));
  assert.equal(during.positionMs, s(100));
  t = resume(t, T0 + s(220)); // 120 s Pause-Taste
  const after = view(t, T0 + s(230));
  assert.equal(after.activeMs, s(110));
  assert.equal(after.positionMs, s(110));
  // finish: actual duration = full workout incl. rest phases, excl. the 120 s on the pause button
  t = settle(t, T0 + s(2000));
  assert.equal(t.status, STATUS.FINISHED);
  assert.equal(t.activeMs, s(1210));
  assert.equal(t.endedAt - t.startedAt, s(1330));
});

test('Überspringen: Anfang der nächsten Phase, Trainingszeit läuft normal weiter', () => {
  let t = started();
  t = skip(t, T0 + s(4)); // Vorlauf nach 4 s übersprungen
  const v = view(t, T0 + s(4));
  assert.equal(v.phase.type, PHASE.WORK);
  assert.equal(v.phaseElapsedMs, 0);
  assert.equal(v.activeMs, s(4));
  assert.equal(v.positionMs, s(10));
  assert.equal(view(t, T0 + s(14)).phaseRemainingMs, s(30));
});

test('Überspringen im pausierten Zustand bleibt pausiert', () => {
  let t = pause(started(), T0 + s(5));
  t = skip(t, T0 + s(50));
  assert.equal(t.status, STATUS.PAUSED);
  const v = view(t, T0 + s(80));
  assert.equal(v.phase.type, PHASE.WORK);
  assert.equal(v.phaseRemainingMs, s(40));
  assert.equal(v.activeMs, s(5));
});

test('Überspringen der letzten Phase beendet das Training', () => {
  let t = started({ rounds: 1, workS: 20, restS: 0, roundRestS: 0, prepS: 0 }, 1);
  t = skip(t, T0 + s(5));
  assert.equal(t.status, STATUS.FINISHED);
  assert.equal(t.activeMs, s(5));
  assert.equal(view(t, T0 + s(5)).roundsCompleted, 1);
});

test('Zurück nach mehr als 3 s: aktuelle Phase beginnt neu', () => {
  let t = started();
  t = back(t, T0 + s(25)); // 15 s in Ü1
  const v = view(t, T0 + s(25));
  assert.equal(v.phase.type, PHASE.WORK);
  assert.equal(v.exerciseNumber, 1);
  assert.equal(v.phaseRemainingMs, s(40));
  assert.equal(v.activeMs, s(25));
});

test('Zurück innerhalb von 3 s: Anfang der vorherigen Phase', () => {
  let t = started();
  t = back(t, T0 + s(12)); // 2 s in Ü1
  const v = view(t, T0 + s(12));
  assert.equal(v.phase.type, PHASE.PREP);
  assert.equal(v.phaseRemainingMs, s(10));
});

test('Zurück genau bei 3 s geht zur vorherigen Phase, knapp drüber startet neu', () => {
  assert.equal(view(back(started(), T0 + s(13)), T0 + s(13)).phase.type, PHASE.PREP);
  assert.equal(view(back(started(), T0 + s(13) + 1), T0 + s(13) + 1).phase.type, PHASE.WORK);
});

test('Zurück in der ersten Phase startet sie neu', () => {
  const v = view(back(started(), T0 + s(1)), T0 + s(1));
  assert.equal(v.phaseIndex, 0);
  assert.equal(v.phaseRemainingMs, s(10));
});

test('+10 s verlängert nur die aktuelle Phase, Gesamtdauer verschiebt sich', () => {
  let t = started();
  t = addTime(t, T0 + s(20)); // 10 s in Ü1
  const v = view(t, T0 + s(20));
  assert.equal(v.phaseRemainingMs, s(40));
  assert.equal(v.totalMs, s(1220));
  // the following rest still has 20 s
  const later = view(t, T0 + s(60)); // Ü1 now ends at 10 + 50 = 60 s, the rest still has its full 20 s
  assert.equal(later.phase.type, PHASE.REST);
  assert.equal(later.phaseRemainingMs, s(20));
  t = settle(t, T0 + s(5000));
  assert.equal(t.activeMs, s(1220));
});

test('+10 s zweimal in derselben Phase addiert sich', () => {
  let t = started();
  t = addTime(t, T0 + s(1));
  t = addTime(t, T0 + s(2));
  assert.equal(view(t, T0 + s(2)).phaseRemainingMs, s(28));
});

test('Abbrechen speichert Zeit und Runden bis dahin', () => {
  let t = started();
  // Runde 1 = 340 s + 10 s Vorlauf, dann 30 s Rundenpause
  t = abort(t, T0 + s(380));
  assert.equal(t.status, STATUS.ABORTED);
  assert.equal(t.activeMs, s(380));
  assert.equal(t.endedAt, T0 + s(380));
  assert.equal(view(t, T0 + s(999)).roundsCompleted, 1);
  // further actions do nothing
  assert.equal(skip(t, T0 + s(999)), t);
  assert.equal(resume(t, T0 + s(999)), t);
});

test('Uhr springt rückwärts: keine negative Zeit', () => {
  let t = started();
  t = settle(t, T0 + s(5));
  t = settle(t, T0 + s(2));
  assert.equal(t.activeMs, s(5));
});

test('Runden zählen erst, wenn die letzte Belastung der Runde vorbei ist', () => {
  const t = started();
  assert.equal(view(t, T0 + s(349)).roundsCompleted, 0); // last second of round 1
  assert.equal(view(t, T0 + s(351)).roundsCompleted, 1); // in round rest
});

test('Plan ohne Phasen wird abgelehnt', () => {
  assert.throws(() => createTimer(buildPlan({}, [])));
});
