// Sound output: our own tones, generated with Web Audio. No sound files, no third-party sounds
// in the app itself; the user may put own sounds on two signals (kept on the device only).
// Sound mode = audioSession type (settings.soundMode):
//   "playback" ("Immer hörbar"): audible despite the mute switch, pauses other music.
//   "ambient"  ("Musik-Modus"):  mixes with Spotify, silent when the mute switch is on.

// Each signal is a list of segments; freq 0 = silence. Distinguishable without looking:
// pitch, length and number of tones differ.
const SIGNALS = {
  workStart: [{ freq: 1046.5, ms: 650 }], // long, high
  restStart: [{ freq: 523.25, ms: 170 }, { freq: 0, ms: 90 }, { freq: 523.25, ms: 170 }], // lower double tone
  roundRestStart: [
    { freq: 784, ms: 150 }, { freq: 0, ms: 40 }, { freq: 659.25, ms: 150 }, { freq: 0, ms: 40 }, { freq: 523.25, ms: 320 },
  ], // falling three-tone sequence
  countdown: [{ freq: 880, ms: 110 }], // short
  halfway: [{ freq: 1318.5, ms: 70 }, { freq: 0, ms: 60 }, { freq: 1318.5, ms: 70 }], // two quick high blips
  sideSwitch: [{ freq: 659.25, ms: 120 }, { freq: 0, ms: 40 }, { freq: 987.75, ms: 240 }], // rising two-tone
  finished: [
    { freq: 523.25, ms: 140 }, { freq: 0, ms: 30 }, { freq: 659.25, ms: 140 }, { freq: 0, ms: 30 },
    { freq: 784, ms: 140 }, { freq: 0, ms: 30 }, { freq: 1046.5, ms: 550 },
  ], // rising fanfare
};

export const SIGNAL_NAMES = Object.keys(SIGNALS);

// Own sounds (personalisation): signal name → bytes of the audio file the user chose. They are
// decoded for the current context; a new context (after a mode change) decodes them again.
const customBytes = new Map();
const customBuffers = new Map();

let ctx = null;
let master = null;
let mode = 'playback';
let volume = 0.8;
const stateListeners = new Set();

function applySessionType() {
  if (!('audioSession' in navigator)) return; // only Safari 16.4+
  try {
    navigator.audioSession.type = mode;
  } catch {
    /* unsupported value: keep browser default */
  }
}

export function setMode(newMode) {
  if (newMode === mode) return;
  mode = newMode;
  // Rebuild the context so the new session type really applies to the next sound.
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
    master = null;
    customBuffers.clear();
  }
  applySessionType();
}

// decodeAudioData empties the buffer it is given, so it always gets a copy. Callback form:
// older Safari versions have no promise form.
const decode = (context, bytes) => new Promise((resolve, reject) => context.decodeAudioData(bytes.slice(0), resolve, reject));

function decodeCustom(name, bytes) {
  if (!ctx) return Promise.resolve(null);
  const own = ctx;
  return decode(own, bytes).then((buffer) => {
    if (own === ctx && customBytes.get(name) === bytes) customBuffers.set(name, buffer); // still current?
    return buffer;
  });
}

/** Replaces a built-in signal by an own sound (bytes of an audio file); null restores the tone. */
export function setCustomSound(name, bytes) {
  customBuffers.delete(name);
  if (!bytes) {
    customBytes.delete(name);
    return Promise.resolve(null);
  }
  customBytes.set(name, bytes);
  return decodeCustom(name, bytes).catch(() => null);
}

/** Length in seconds of an audio file, to check it before it is stored. Rejects if undecodable. */
export async function probe(bytes) {
  unlock();
  if (!ctx) throw new Error('Kein Ton in diesem Browser');
  return (await decode(ctx, bytes)).duration;
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

/** Must run inside a tap handler: iOS only allows sound after a user gesture. */
export function unlock() {
  applySessionType();
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    const own = ctx;
    own.onstatechange = () => own === ctx && stateListeners.forEach((fn) => fn(own.state));
    for (const [name, bytes] of customBytes) decodeCustom(name, bytes).catch(() => {});
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // One silent sample fully wakes up the audio output on iOS.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

export const isRunning = () => !!ctx && ctx.state === 'running';

/** After an interruption (call, Siri, app switch). Resolves to true if sound works again. */
export async function tryResume() {
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* needs a tap, reported via the return value */
    }
  }
  return ctx.state === 'running';
}

export function onStateChange(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/** Plays a signal right now. Returns its length in ms (0 if nothing was played). */
export function play(name) {
  const segments = SIGNALS[name];
  if (!segments || !ctx) return 0;
  // Tones scheduled on a stopped context would come out late, at the wrong moment: skip instead.
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    return 0;
  }
  const custom = customBuffers.get(name);
  if (custom) {
    const src = ctx.createBufferSource();
    src.buffer = custom;
    src.connect(master);
    src.start(ctx.currentTime + 0.02);
    return Math.round(custom.duration * 1000);
  }
  let t = ctx.currentTime + 0.02;
  for (const { freq, ms } of segments) {
    if (freq) tone(freq, t, ms / 1000);
    t += ms / 1000;
  }
  return segments.reduce((sum, s) => sum + s.ms, 0);
}

function tone(freq, t, dur) {
  const env = ctx.createGain();
  env.connect(master);
  const fade = Math.min(0.01, dur / 4); // short fades avoid clicks
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + fade);
  env.gain.setValueAtTime(1, t + dur - fade);
  env.gain.linearRampToValueAtTime(0, t + dur);
  // Sine plus some 3rd harmonic: cuts through music better than a pure sine.
  for (const [multiple, level] of [[1, 0.8], [3, 0.2]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq * multiple;
    gain.gain.value = level;
    osc.connect(gain).connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}
