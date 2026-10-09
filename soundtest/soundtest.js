// Feasibility test page: audio session types, <audio> element, speech, wake lock, clocks.
// Deliberately one plain file so it is easy to read; the real app gets a cleaner structure.

const $ = (id) => document.getElementById(id);

// ---------- small persistence helper (results survive app switches / page reloads) ----------
const MODE = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches
  ? 'Home-Bildschirm-App'
  : 'Browser-Tab';

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('soundtest:' + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('soundtest:' + key, JSON.stringify(value));
    } catch {
      /* private mode or storage blocked: page still works, just forgets */
    }
  },
};

// ---------- log ----------
const logLines = store.get('log', []);

function log(msg) {
  const time = new Date().toLocaleTimeString('de-DE');
  logLines.push(`${time} ${msg}`);
  if (logLines.length > 300) logLines.shift();
  store.set('log', logLines);
  renderLog();
}

function renderLog() {
  $('log').replaceChildren(
    ...logLines
      .slice()
      .reverse()
      .map((line) => Object.assign(document.createElement('li'), { textContent: line })),
  );
}

const fmtSec = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' s';
const fmtClock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- device info ----------
const ua = navigator.userAgent;
const osMatch = ua.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/);
const safariMatch = ua.match(/Version\/([\d.]+)/);
const hasSession = 'audioSession' in navigator;
const hasWakeLock = 'wakeLock' in navigator;
const hasSpeech = 'speechSynthesis' in window;

const deviceFacts = {
  Modus: MODE,
  'iOS laut Browser': osMatch ? osMatch.slice(1).filter(Boolean).join('.') : 'unbekannt',
  'Safari-Version': safariMatch ? safariMatch[1] : 'nicht angegeben',
  audioSession: hasSession ? 'vorhanden' : 'fehlt',
  'Wake Lock': hasWakeLock ? 'vorhanden' : 'fehlt',
  Sprachausgabe: hasSpeech ? 'vorhanden' : 'fehlt',
};
$('device').replaceChildren(
  ...Object.entries(deviceFacts).flatMap(([k, v]) => [
    Object.assign(document.createElement('dt'), { textContent: k }),
    Object.assign(document.createElement('dd'), { textContent: v }),
  ]),
);
$('mode-hint').textContent =
  MODE === 'Browser-Tab'
    ? 'Du bist im Safari-Tab. Für den Haupttest: Teilen → Zum Home-Bildschirm, dann über das neue Symbol öffnen.'
    : 'Du bist in der Home-Bildschirm-App. Das ist der wichtigere Modus.';
// iOS freezes the OS version in the user agent on newer versions, hence the note.
log(`Seite geladen (${MODE}). Hinweis: iOS-Version im Browser kann eingefroren sein, echte Version in den Notizen angeben.`);

// ---------- audio: session type + Web Audio + <audio> element ----------
const SESSION_TYPES = ['auto', 'playback', 'ambient', 'transient', 'transient-solo'];
let sessionType = store.get('sessionType', 'auto');
let ctx = null;
const beepEl = new Audio('beep.wav');
beepEl.preload = 'auto';

$('session-types').replaceChildren(
  ...SESSION_TYPES.map((t) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="radio" name="stype" value="${t}"><span>${t}</span>`;
    const input = label.querySelector('input');
    input.checked = t === sessionType;
    input.addEventListener('change', () => applySessionType(t));
    return label;
  }),
);

function applySessionType(type) {
  sessionType = type;
  store.set('sessionType', type);
  // Fresh start for every type so the new category really applies.
  stopLoop();
  beepEl.pause();
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
  }
  if (hasSession) {
    try {
      navigator.audioSession.type = type;
    } catch (e) {
      log('audioSession.type setzen fehlgeschlagen: ' + e.message);
    }
  }
  log('Audio-Modus: ' + type);
  renderAudioState();
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const own = ctx;
    own.onstatechange = () => {
      if (own === ctx) {
        log('AudioContext: ' + own.state);
        renderAudioState();
      }
    };
  }
  return ctx;
}

function beepWebAudio() {
  const c = getCtx();
  // resume() must be called synchronously inside the tap handler on iOS
  if (c.state !== 'running') c.resume().catch((e) => log('AudioContext.resume Fehler: ' + e.message));
  const t = c.currentTime + 0.03;
  const gain = c.createGain();
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.8, t + 0.008);
  gain.gain.setValueAtTime(0.8, t + 0.392);
  gain.gain.linearRampToValueAtTime(0, t + 0.4);
  // 880 Hz plus some 3rd harmonic, same recipe as beep.wav
  for (const [freq, level] of [[880, 0.8], [2640, 0.2]]) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.frequency.value = freq;
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(t);
    osc.stop(t + 0.42);
  }
}

function beepElement() {
  beepEl.currentTime = 0;
  beepEl.play().catch((e) => log('<audio>.play Fehler: ' + e.name + ' ' + e.message));
}

$('beep-webaudio').addEventListener('click', () => {
  beepWebAudio();
  log(`Piep Web Audio (${sessionType})`);
});
$('beep-element').addEventListener('click', () => {
  beepElement();
  log(`Piep <audio> (${sessionType})`);
});

// Continuous test: one beep every 5 s, used for the interruption test (Siri, call, app switch)
let loopTimer = null;
let loopCount = 0;

function loopBeep() {
  if ($('loop-source').value === 'element') beepElement();
  else beepWebAudio();
  loopCount++;
  $('loop-count').textContent = loopCount;
}

function stopLoop() {
  if (!loopTimer) return;
  clearInterval(loopTimer);
  loopTimer = null;
  $('loop-toggle').textContent = 'Dauertest starten (alle 5 s)';
  $('loop-toggle').classList.remove('on');
  log('Dauertest gestoppt');
}

$('loop-toggle').addEventListener('click', () => {
  if (loopTimer) return stopLoop();
  loopCount = 0;
  loopBeep(); // first beep inside the tap unlocks audio
  loopTimer = setInterval(loopBeep, 5000);
  $('loop-toggle').textContent = 'Dauertest stoppen';
  $('loop-toggle').classList.add('on');
  log(`Dauertest gestartet (${$('loop-source').value}, ${sessionType})`);
});

if (hasSession) {
  navigator.audioSession.addEventListener?.('statechange', () => {
    log('audioSession-Zustand: ' + navigator.audioSession.state);
    renderAudioState();
  });
}

function renderAudioState() {
  $('session-type').textContent = hasSession ? navigator.audioSession.type : 'nicht unterstützt';
  $('session-state').textContent = hasSession ? navigator.audioSession.state ?? '–' : '–';
  $('ctx-state').textContent = ctx ? ctx.state : 'noch nicht erstellt';
}
applySessionType(sessionType);

// ---------- speech ----------
let voices = [];

function loadVoices() {
  if (!hasSpeech) {
    $('voice-info').textContent = 'Sprachausgabe nicht verfügbar';
    return;
  }
  const all = speechSynthesis.getVoices();
  voices = all.filter((v) => v.lang && v.lang.toLowerCase().startsWith('de'));
  const saved = store.get('voiceURI', null);
  $('voice').replaceChildren(
    ...voices.map((v) => {
      const o = new Option(`${v.name} (${v.lang})${v.localService ? '' : ' online'}`, v.voiceURI);
      o.selected = v.voiceURI === saved;
      return o;
    }),
  );
  $('voice-info').textContent = `${voices.length} deutsche von ${all.length} Stimmen gefunden`;
}

if (hasSpeech) {
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  loadVoices();
  setTimeout(loadVoices, 500); // iOS sometimes fills the list late
}
$('voice').addEventListener('change', () => store.set('voiceURI', $('voice').value));

function say(text) {
  if (!hasSpeech) return log('Keine Sprachausgabe');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = voices.find((v) => v.voiceURI === $('voice').value);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = 'de-DE';
  }
  const t0 = performance.now();
  let tStart = null;
  u.onstart = () => (tStart = performance.now());
  u.onend = () => {
    const total = performance.now() - t0;
    const spoken = tStart ? performance.now() - tStart : total;
    const msg = `${text.length} Zeichen, ${Math.round(spoken)} ms gesprochen, ${Math.round(total)} ms ab Tippen`;
    $('speech-ms').textContent = msg;
    log('Ansage fertig: ' + msg);
  };
  u.onerror = (e) => log('Ansage Fehler: ' + e.error);
  speechSynthesis.speak(u);
  log(`Ansage gestartet (${voice ? voice.name : 'Standardstimme de-DE'}, Modus ${sessionType})`);
}

$('say-pause').addEventListener('click', () => say('Pause. Als Nächstes: Kniebeugen'));
$('say-round').addEventListener('click', () => say('Runde 1 geschafft, noch 2'));

// ---------- wake lock ----------
let wakeLock = null;
let wakeWanted = false;

async function requestWake() {
  if (!hasWakeLock) return log('Wake Lock nicht unterstützt');
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    log('Wake Lock aktiv');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      log('Wake Lock freigegeben');
      renderWake();
    });
  } catch (e) {
    log('Wake Lock Fehler: ' + e.name + ' ' + e.message);
  }
  renderWake();
}

function renderWake() {
  $('wake-state').textContent = wakeLock ? 'aktiv' : wakeWanted ? 'gewünscht, aber nicht aktiv' : 'aus';
  $('wake-toggle').textContent = wakeWanted ? 'Wake Lock freigeben' : 'Wake Lock anfordern';
  $('wake-toggle').classList.toggle('on', wakeWanted);
}

$('wake-toggle').addEventListener('click', () => {
  wakeWanted = !wakeWanted;
  if (wakeWanted) requestWake();
  else {
    wakeLock?.release();
    renderWake();
  }
});

// ---------- clocks + visibility ----------
let clockStart = null; // { date, perf }
let hiddenAt = null; // { date, perf }
let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;

$('clock-start').addEventListener('click', () => {
  clockStart = { date: Date.now(), perf: performance.now() };
  log('Uhren gestartet');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = { date: Date.now(), perf: performance.now() };
    visibleSince = null;
    log('Seite versteckt');
    return;
  }
  visibleSince = Date.now();
  if (hiddenAt) {
    const dDate = Date.now() - hiddenAt.date;
    const dPerf = performance.now() - hiddenAt.perf;
    log(`Zurück nach ${fmtSec(dDate)} (Date.now) / ${fmtSec(dPerf)} (performance.now)`);
    hiddenAt = null;
  } else {
    log('Seite sichtbar');
  }
  // Recovery strategy we want to use in the app: resume audio, re-request wake lock
  if (ctx && ctx.state !== 'running') {
    const before = ctx.state;
    ctx.resume().then(
      () => log(`AudioContext nach Rückkehr fortgesetzt (vorher ${before}, jetzt ${ctx?.state})`),
      (e) => log('AudioContext nach Rückkehr NICHT fortgesetzt: ' + e.message),
    );
  }
  if (wakeWanted && !wakeLock) requestWake();
  renderAudioState();
});

function tick() {
  if (clockStart) {
    const dDate = Date.now() - clockStart.date;
    const dPerf = performance.now() - clockStart.perf;
    $('clock-date').textContent = fmtSec(dDate);
    $('clock-perf').textContent = fmtSec(dPerf);
    $('clock-diff').textContent = fmtSec(dDate - dPerf);
  }
  $('visible-since').textContent = visibleSince ? fmtClock(Date.now() - visibleSince) : '–';
}
setInterval(tick, 250);

// ---------- results form ----------
const VARIANTS = [
  ['auto', 'Web Audio · auto'],
  ['playback', 'Web Audio · playback'],
  ['ambient', 'Web Audio · ambient'],
  ['transient', 'Web Audio · transient'],
  ['transient-solo', 'Web Audio · transient-solo'],
  ['element', '<audio>-Element'],
  ['speech', 'Sprachansage'],
];
const VARIANT_QUESTIONS = [
  // [key, label in form, options, short label in copied result]
  ['mute', 'Stummschalter an: hörbar?', ['–', 'ja', 'nein'], 'stumm hörbar'],
  ['spotify', 'Spotify läuft (Stummschalter aus):', ['–', 'läuft weiter', 'wird leiser', 'pausiert'], 'Spotify'],
  ['back', 'Falls pausiert: kommt Spotify von selbst zurück?', ['–', 'ja', 'nein'], 'Spotify zurück'],
];
const OTHER_QUESTIONS = [
  ['voiceok', 'Deutsche Stimme verständlich?', ['–', 'ja', 'nein', 'keine deutsche Stimme']],
  ['interrupt', 'Dauertest + Siri/Anruf: Piep danach?', ['–', 'kommt von selbst', 'erst nach Tippen', 'gar nicht']],
  ['airpods', 'AirPods: Verzögerung?', ['–', 'keine', 'leicht', 'störend']],
  ['wake', 'Wake Lock 20 min: Bildschirm', ['–', 'blieb an', 'ging aus']],
];

const results = store.get('results:' + MODE, {});

function selectField(key, label, options) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const sel = document.createElement('select');
  sel.append(...options.map((o) => new Option(o, o)));
  sel.value = results[key] ?? '–';
  sel.addEventListener('change', () => {
    results[key] = sel.value;
    store.set('results:' + MODE, results);
  });
  wrap.append(sel);
  return wrap;
}

$('results').replaceChildren(
  ...VARIANTS.map(([id, title]) => {
    const box = document.createElement('div');
    box.className = 'variant';
    box.append(Object.assign(document.createElement('h3'), { textContent: title }));
    for (const [q, label, opts] of VARIANT_QUESTIONS) box.append(selectField(`${id}.${q}`, label, opts));
    return box;
  }),
  Object.assign(document.createElement('div'), { className: 'variant' }),
);
const otherBox = $('results').lastElementChild;
otherBox.append(Object.assign(document.createElement('h3'), { textContent: 'Weitere Punkte' }));
for (const [q, label, opts] of OTHER_QUESTIONS) otherBox.append(selectField(q, label, opts));

$('notes').value = store.get('notes:' + MODE, '');
$('notes').addEventListener('input', () => store.set('notes:' + MODE, $('notes').value));

function resultText() {
  const lines = [
    'Ton-Test Ergebnis',
    `Datum: ${new Date().toLocaleString('de-DE')}`,
    `Modus: ${MODE}`,
    ...Object.entries(deviceFacts).filter(([k]) => k !== 'Modus').map(([k, v]) => `${k}: ${v}`),
    `Stimme: ${voices.find((v) => v.voiceURI === $('voice').value)?.name ?? 'keine'} (${$('voice-info').textContent})`,
    '',
  ];
  for (const [id, title] of VARIANTS) {
    const parts = VARIANT_QUESTIONS.map(([q, , , short]) => `${short} = ${results[`${id}.${q}`] ?? '–'}`);
    lines.push(`${title}: ${parts.join('; ')}`);
  }
  for (const [q, label] of OTHER_QUESTIONS) lines.push(`${label} ${results[q] ?? '–'}`);
  lines.push('', 'Notizen: ' + ($('notes').value || '–'), '', 'Protokoll (neueste zuerst):');
  lines.push(...logLines.slice(-60).reverse());
  lines.push('', 'User-Agent: ' + ua);
  return lines.join('\n');
}

$('copy').addEventListener('click', async () => {
  const text = resultText();
  try {
    await navigator.clipboard.writeText(text);
    $('copy-state').textContent = 'Kopiert. Jetzt in WhatsApp oder den Chat einfügen.';
    $('copy-fallback').hidden = true;
  } catch {
    $('copy-fallback').hidden = false;
    $('copy-fallback').value = text;
    $('copy-fallback').select();
    $('copy-state').textContent = 'Automatisch kopieren ging nicht. Text unten markieren und kopieren.';
  }
});

$('reset').addEventListener('click', () => {
  if (!confirm('Ergebnisse und Protokoll für diesen Modus wirklich löschen?')) return;
  for (const k of Object.keys(results)) delete results[k];
  store.set('results:' + MODE, results);
  store.set('notes:' + MODE, '');
  logLines.length = 0;
  store.set('log', logLines);
  location.reload();
});

renderLog();
renderWake();
tick();
