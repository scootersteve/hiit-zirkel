// Run screen: shows the timer state and turns cues into sounds and announcements.
// All timing logic lives in core/timer.js; this file only reads it and forwards taps.

import { buildPlan, plannedDurationS, PHASE } from '../core/plan.js';
import { createTimer, start, settle, view, msUntilNextChange, pause, resume, skip, back, addTime, abort, STATUS } from '../core/timer.js';
import { cuesBetween, canAnnounce, CUE } from '../core/cues.js';
import { phaseStartText, SIDE_SWITCH_TEXT, FINISHED_TEXT } from '../core/announcements.js';
import { PHASE_LABEL, displayPosition, exerciseLine } from '../core/display.js';
import { formatElapsed, formatRemaining } from '../core/format.js';
import * as audio from '../platform/audio.js';
import * as speech from '../platform/speech.js';
import * as wake from '../platform/wakelock.js';
import { setText, icon, mount, confirmSheet } from './dom.js';

const START_SIGNAL = {
  [PHASE.PREP]: null, // prep starts with the Start tap itself
  [PHASE.WARMUP]: 'restStart',
  [PHASE.WORK]: 'workStart',
  [PHASE.REST]: 'restStart',
  [PHASE.ROUND_REST]: 'roundRestStart',
  [PHASE.COOLDOWN]: 'restStart',
};

// The ring shows the progress of the current phase; pathLength="1" makes its dash values plain
// fractions (0 = empty, 1 = full).
const TEMPLATE = `
  <section class="run" data-phase="prep">
    <header class="run-top">
      <button class="run-abort" data-action="abort">Abbrechen</button>
      <div class="run-elapsed num" data-el="elapsed" aria-label="Verstrichene Zeit">0:00</div>
      <div class="run-pos num" data-el="pos"></div>
    </header>
    <div class="run-progress" aria-hidden="true"><div class="run-progress-bar" data-el="bar"></div></div>
    <div class="run-main">
      <div class="run-phase"><span data-el="phase"></span><span class="run-paused" data-el="paused" hidden>Pausiert</span></div>
      <div class="run-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle class="ring-track" cx="50" cy="50" r="45" pathLength="1"/>
          <circle class="ring-fill" cx="50" cy="50" r="45" pathLength="1" data-el="ring"/>
        </svg>
        <div class="run-time num" data-el="time" role="timer" aria-live="off"></div>
      </div>
      <div class="run-label" data-el="label"></div>
      <div class="run-exercise" data-el="exercise"></div>
      <div class="run-side" data-el="side" hidden></div>
    </div>
    <button class="run-audio-hint" data-action="audio" hidden>Ton unterbrochen. Hier tippen.</button>
    <nav class="run-controls">
      <button data-action="back" aria-label="Zurück">${icon('back')}</button>
      <button class="run-toggle" data-action="toggle"></button>
      <button data-action="skip" aria-label="Überspringen">${icon('skip')}</button>
      <button class="run-add" data-action="add" aria-label="10 Sekunden mehr">+10</button>
    </nav>
  </section>`;

export function showRun(root, { circuit, settings, onEnd }) {
  const plan = buildPlan(circuit.settings, circuit.exercises);

  // Still inside the Start tap: unlock sound and speech now (iOS autoplay rule).
  audio.setMode(settings.soundMode);
  audio.setVolume(settings.volume);
  audio.unlock();
  speech.unlock();
  wake.keepAwake();

  document.body.classList.add('running');
  const screen = mount(root, TEMPLATE, { nav: 'fade' }).querySelector('.run');
  const els = Object.fromEntries([...screen.querySelectorAll('[data-el]')].map((el) => [el.dataset.el, el]));
  const toggleButton = screen.querySelector('[data-action="toggle"]');
  const audioHint = screen.querySelector('[data-action="audio"]');

  let state = start(createTimer(plan), Date.now());
  let prev = view(state, Date.now());
  let timerId = 0;
  let ended = false;
  let lastToggleLabel = '';
  let lastTap = { action: '', at: 0 };
  let drawnPhase = -1;

  // ---------- sound ----------

  function announce(text, availableMs, delayMs) {
    if (settings.voice && canAnnounce(availableMs - delayMs, text)) {
      speech.speak(text, { delayMs, volume: settings.volume });
    }
  }

  function phaseStarted(v) {
    speech.cancel();
    const signal = START_SIGNAL[v.phase.type];
    const length = signal ? audio.play(signal) : 0;
    const text = phaseStartText(v.phase, v.rounds);
    if (text) announce(text, v.phaseRemainingMs, length);
  }

  function handleCue(cue, v) {
    switch (cue.type) {
      case CUE.PHASE_START:
        phaseStarted(v);
        break;
      case CUE.COUNTDOWN:
        speech.cancel(); // safety net: never talk over the countdown
        if (settings.countdownBeeps) audio.play('countdown');
        break;
      case CUE.HALFWAY:
        if (settings.halfwayBeep) audio.play('halfway');
        break;
      case CUE.SIDE_SWITCH:
        announce(SIDE_SWITCH_TEXT, v.phaseRemainingMs, audio.play('sideSwitch'));
        break;
      case CUE.FINISHED: {
        speech.cancel();
        const length = audio.play('finished');
        if (settings.voice) speech.speak(FINISHED_TEXT, { delayMs: length, volume: settings.volume });
        break;
      }
    }
  }

  // ---------- drawing ----------

  function draw(v) {
    const paused = v.status === STATUS.PAUSED;
    if (screen.dataset.phase !== v.phase.type) screen.dataset.phase = v.phase.type;
    screen.toggleAttribute('data-paused', paused);

    setText(els.elapsed, formatElapsed(v.activeMs));
    const pos = displayPosition(v.phase, state.plan);
    setText(els.pos, `Runde ${pos.round}/${pos.rounds} · Übung ${pos.number}/${pos.exerciseCount}`);

    setText(els.phase, PHASE_LABEL[v.phase.type]);
    els.paused.hidden = !paused;
    const time = formatRemaining(v.phaseRemainingMs);
    setText(els.time, time);
    els.time.toggleAttribute('data-long', time.length > 4);
    els.time.classList.toggle('final', !paused && v.status === STATUS.RUNNING && v.phaseRemainingMs <= 3000);

    const line = exerciseLine(v.phase, v.phaseElapsedMs);
    setText(els.label, line.label ? `${line.label}:` : '');
    setText(els.exercise, line.name);
    els.side.hidden = !line.sideLabel;
    if (line.sideLabel) setText(els.side, line.sideLabel);

    const toggleLabel = paused ? 'resume' : 'pause';
    if (toggleLabel !== lastToggleLabel) {
      toggleButton.innerHTML = icon(paused ? 'play' : 'pause');
      toggleButton.setAttribute('aria-label', paused ? 'Fortsetzen' : 'Pause');
      lastToggleLabel = toggleLabel;
    }
  }

  // The bar runs on the compositor: each tick it gets the position it should have reached by
  // the next tick and a linear transition of exactly that length. `jump` (tap, pause, return
  // from the background) puts it at the current position first, without animating.
  // The ring's stroke cannot be moved by the compositor; animated continuously it would cost a
  // style recalculation every frame. So it steps once per tick with a short ease, like the
  // second hand of a watch: smooth enough to read, about a fifth of the frames.
  function drawBar(v, waitMs, jump) {
    const bar = (ms) => `scaleX(${Math.min(1, v.totalMs ? ms / v.totalMs : 0).toFixed(5)})`;
    const ring = (ms) => (1 - Math.min(1, v.phaseDurationMs ? ms / v.phaseDurationMs : 0)).toFixed(4);
    const newPhase = v.phaseIndex !== drawnPhase;
    if (jump || newPhase) {
      els.bar.style.transition = 'none';
      els.bar.style.transform = bar(v.positionMs);
      void els.bar.getBoundingClientRect(); // commit the jump before the next transition starts
      drawnPhase = v.phaseIndex;
    }
    els.ring.style.transition = jump || newPhase ? 'none' : 'stroke-dashoffset 220ms var(--ease-out)';
    els.ring.style.strokeDashoffset = ring(v.phaseElapsedMs);
    if (waitMs > 0) {
      els.bar.style.transition = `transform ${waitMs}ms linear`;
      els.bar.style.transform = bar(v.positionMs + waitMs);
    }
  }

  // ---------- loop ----------
  // No per-frame redraw: between two changes nothing on screen differs except the bar, so the
  // loop sleeps until the next whole second (or halfway point) and wakes up exactly there.
  // Time still comes from timestamps only; a late wake-up shows the correct time, just later.

  function tick() {
    timerId = 0;
    const now = Date.now();
    state = settle(state, now);
    const v = view(state, now);
    const gap = v.now - prev.now;
    for (const cue of cuesBetween(prev, v)) handleCue(cue, v);
    prev = v;
    draw(v);
    if (v.status === STATUS.FINISHED) return finish();
    schedule(v, gap > 1500);
  }

  function schedule(v, jump = true) {
    clearTimeout(timerId);
    timerId = 0;
    if (ended) return;
    const running = v.status === STATUS.RUNNING && document.visibilityState === 'visible';
    const wait = running ? msUntilNextChange(v) : 0;
    drawBar(v, wait, jump);
    // +4 ms: a timer that fires a hair early would otherwise miss the boundary and spin.
    if (running) timerId = setTimeout(tick, wait + 4);
  }

  // ---------- controls ----------

  function act(fn) {
    const now = Date.now();
    const before = view(state, now);
    state = fn(state, now);
    const v = view(state, now);
    prev = v;
    draw(v);
    if (v.status === STATUS.FINISHED) {
      handleCue({ type: CUE.FINISHED }, v);
      return finish();
    }
    const restarted = v.phaseIndex !== before.phaseIndex || v.phaseElapsedMs < before.phaseElapsedMs;
    const resumedAtStart = fn === resume && v.phaseElapsedMs === 0;
    if (v.status === STATUS.RUNNING && (restarted || resumedAtStart)) phaseStarted(v);
    if (v.status === STATUS.PAUSED) speech.cancel();
    schedule(v);
  }

  // A second tap on the same control within 350 ms is treated as an accident (wet fingers):
  // it would pause and resume at once, or skip two phases. "+10 s" may be tapped repeatedly.
  const GUARDED = new Set(['toggle', 'back', 'skip', 'abort']);
  function isAccidentalRepeat(action) {
    const now = Date.now();
    const repeat = GUARDED.has(action) && lastTap.action === action && now - lastTap.at < 350;
    lastTap = { action, at: now };
    return repeat;
  }

  screen.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || ended || isAccidentalRepeat(action)) return;
    if (action === 'toggle') act(state.status === STATUS.PAUSED ? resume : pause);
    else if (action === 'back') act(back);
    else if (action === 'skip') act(skip);
    else if (action === 'add') act(addTime);
    else if (action === 'abort') askAbort();
    else if (action === 'audio') {
      audio.unlock();
      audioHint.hidden = true;
    }
  });

  // The training keeps running while the sheet is open; "Abbrechen" ends it where it is.
  let asking = false;
  async function askAbort() {
    if (asking) return;
    asking = true;
    const ok = await confirmSheet({
      title: 'Training abbrechen?',
      message: 'Es wird im Verlauf als abgebrochen gespeichert.',
      confirmLabel: 'Training abbrechen',
      cancelLabel: 'Weiter trainieren',
    });
    asking = false;
    if (!ok || ended) return;
    state = abort(state, Date.now());
    speech.cancel();
    finish();
  }

  // ---------- interruptions: app switch, call, Siri ----------

  async function onVisibility() {
    if (ended) return;
    if (document.visibilityState !== 'visible') return void clearTimeout(timerId); // no sounds from the background
    tick(); // the display jumps to the correct time immediately, missed cues are not replayed
    const ok = await audio.tryResume();
    if (!ended) audioHint.hidden = ok;
  }
  document.addEventListener('visibilitychange', onVisibility);
  const offAudioState = audio.onStateChange((s) => {
    if (ended) return;
    if (s === 'running') audioHint.hidden = true;
    else if (document.visibilityState === 'visible') audioHint.hidden = false;
  });

  // ---------- end ----------

  function finish() {
    if (ended) return;
    ended = true;
    clearTimeout(timerId);
    document.removeEventListener('visibilitychange', onVisibility);
    offAudioState();
    wake.allowSleep();
    document.body.classList.remove('running');
    const v = view(state, Date.now());
    onEnd({
      circuit,
      status: state.status, // finished | aborted
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      plannedMs: plannedDurationS(circuit.settings, circuit.exercises) * 1000,
      actualMs: state.activeMs,
      roundsCompleted: v.roundsCompleted,
      rounds: plan.rounds,
    });
  }

  // first phase: tone unless it is the prep countdown
  draw(prev);
  phaseStarted(prev);
  schedule(prev);
}

