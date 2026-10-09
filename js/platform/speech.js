// German voice announcements via the Web Speech API. Without a German voice: no announcements.

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice = null;
let pendingTimer = null;

function pickVoice() {
  if (!synth) return;
  const german = synth.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith('de'));
  voice =
    german.find((v) => v.lang === 'de-DE' && v.localService) ||
    german.find((v) => v.localService) || // local voices also work offline
    german[0] ||
    null;
}

if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice); // iOS fills the voice list late
}

export function germanVoiceName() {
  if (!voice) pickVoice();
  return voice ? voice.name : null;
}

/** Call inside a tap handler, like audio.unlock(). */
export function unlock() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}

/** Speaks after `delayMs` (so it does not talk over a tone). Replaces anything pending. */
export function speak(text, { delayMs = 0, volume = 1 } = {}) {
  cancel();
  if (!synth) return;
  if (!voice) pickVoice();
  if (!voice) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.volume = volume;
    synth.speak(u);
  }, delayMs);
}

/** Stops pending and running announcements, e.g. when the countdown starts. */
export function cancel() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
}
