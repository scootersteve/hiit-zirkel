// Run screen: shows the timer state and turns cues into sounds and announcements.
// All timing logic lives in core/timer.js; this file only reads it and forwards taps.

import { buildPlan, plannedDurationS, PHASE } from '../core/plan.js';
import { createTimer, start, settle, view, pause, resume, skip, back, addTime, abort, STATUS } from '../core/timer.js';
import { cuesBetween, canAnnounce, CUE } from '../core/cues.js';
import { phaseStartText, SIDE_SWITCH_TEXT, FINISHED_TEXT } from '../core/announcements.js';
import { PHASE_LABEL, displayPosition, exerciseLine } from '../core/display.js';
import { formatElapsed, formatRemaining } from '../core/format.js';
import * as audio from '../platform/audio.js';
import * as speech from '../platform/speech.js';
import * as wake from '../platform/wakelock.js';
import { setText, icon } from './dom.js';

const START_SIGNAL = {
  [PHASE.PREP]: null, // prep starts with the Start tap itself
  [PHASE.WARMUP]: 'restStart',
  [PHASE.WORK]: 'workStart',
  [PHASE.REST]: 'restStart',
  [PHASE.ROUND_REST]: 'roundRestStart',
  [PHASE.COOLDOWN]: 'restStart',
};

const TEMPLATE = `
  <section class="run" data-phase="prep">
    <header class="run-top">
      <button class="run-abort" data-action="abort">Abbrechen</button>
      <div class="run-elapsed" data-el="elapsed" aria-label="Verstrichene Zeit">0:00</div>
      <div class="run-pos" data-el="pos"></div>
    </header>
    <div class="run-progress"><div class="run-progress-bar" data-el="bar"></div></div>
    <div class="run-main">
      <div class="run-phase" data-el="phase"></div>
      <div class="run-paused" data-el="paused" hidden>Pausiert</div>
      <div class="run-time" data-el="time" role="timer" aria-live="off"></div>
      <div class="run-label" data-el="label"></div>
      <div class="run-exercise" data-el="exercise"></div>
      <div class="run-side" data-el="side" hidden></div>
    </div>
    <button class="run-audio-hint" data-action="audio" hidden>Ton unterbrochen. Hier tippen.</button>
    <nav class="run-controls">
      <button class="run-toggle" data-action="toggle"></button>
      <button data-action="back" aria-label="Zurück">${icon('back')}Zurück</button>
      <button data-action="skip" aria-label="Überspringen">${icon('skip')}Überspringen</button>
      <button data-action="add" aria-label="10 Sekunden mehr"><span class="run-add">+10</span>Sek.</button>
    </nav>
    <dialog class="confirm" data-el="dialog">
      <h2>Training abbrechen?</h2>
      <p>Danach siehst du, wie weit du gekommen bist.</p>
      <button class="btn danger" data-action="abort-confirm">Abbrechen</button>
      <button class="btn" data-action="abort-cancel">Weiter trainieren</button>
    </dialog>
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
  root.innerHTML = TEMPLATE;
  const screen = root.querySelector('.run');
  const els = Object.fromEntries([...screen.querySelectorAll('[data-el]')].map((el) => [el.dataset.el, el]));
  const toggleButton = screen.querySelector('[data-action="toggle"]');
  const audioHint = screen.querySelector('[data-action="audio"]');

  let state = start(createTimer(plan), Date.now());
  let prev = view(state, Date.now());
  let rafId = 0;
  let ended = false;
  let lastToggleLabel = '';

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
    els.bar.style.width = `${(v.progress * 100).toFixed(1)}%`;

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
      toggleButton.innerHTML = paused ? `${icon('play')}Fortsetzen` : `${icon('pause')}Pause`;
      lastToggleLabel = toggleLabel;
    }
  }

  // ---------- loop ----------

  function frame() {
    rafId = 0;
    const now = Date.now();
    state = settle(state, now);
    const v = view(state, now);
    for (const cue of cuesBetween(prev, v)) handleCue(cue, v);
    prev = v;
    draw(v);
    if (v.status === STATUS.FINISHED) return finish();
    if (v.status === STATUS.RUNNING) schedule();
  }

  function schedule() {
    if (!rafId && !ended) rafId = requestAnimationFrame(frame);
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
    schedule();
  }

  screen.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || ended) return;
    if (action === 'toggle') act(state.status === STATUS.PAUSED ? resume : pause);
    else if (action === 'back') act(back);
    else if (action === 'skip') act(skip);
    else if (action === 'add') act(addTime);
    else if (action === 'abort') els.dialog.showModal();
    else if (action === 'abort-cancel') els.dialog.close();
    else if (action === 'abort-confirm') {
      els.dialog.close();
      state = abort(state, Date.now());
      speech.cancel();
      finish();
    } else if (action === 'audio') {
      audio.unlock();
      audioHint.hidden = true;
    }
  });

  // ---------- interruptions: app switch, call, Siri ----------

  async function onVisibility() {
    if (document.visibilityState !== 'visible' || ended) return;
    schedule(); // the display jumps to the correct time immediately, missed cues are not replayed
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
    if (rafId) cancelAnimationFrame(rafId);
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
      plannedMs: plannedDurationS(circuit.settings, circuit.exercises.length) * 1000,
      actualMs: state.activeMs,
      roundsCompleted: v.roundsCompleted,
      rounds: plan.rounds,
    });
  }

  // first phase: tone unless it is the prep countdown
  draw(prev);
  phaseStarted(prev);
  schedule();
}

