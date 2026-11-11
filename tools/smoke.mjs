// Headless browser smoke test, Node built-ins only (no dependencies).
// Starts tools/serve.js, drives Chrome via the DevTools Protocol (Node 22 global fetch +
// WebSocket) at an iPhone-sized viewport, checks the main flows, and tears everything down.
//
// Usage:  node tools/smoke.mjs          (or: npm run smoke)
// Chrome: set CHROME=/path/to/chrome if it is not at the macOS default location.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeCircuit, buildBackup, parseBackup } from '../js/core/transfer.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVE_PORT = Number(process.env.PORT) || 8099;
const CDP_PORT = Number(process.env.CDP_PORT) || 9333;
const BASE = `http://localhost:${SERVE_PORT}/hiit-zirkel/`;

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const problems = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function waitFor(fn, { tries = 80, delay = 100 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e.message;
    }
    await sleep(delay);
  }
  throw new Error(`waitFor timed out (last: ${last})`);
}

if (!CHROME) {
  console.error('Chrome nicht gefunden. Setze CHROME=/pfad/zu/chrome und versuche es erneut.');
  process.exit(2);
}

const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.js')], {
  env: { ...process.env, PORT: String(SERVE_PORT) },
  stdio: 'ignore',
});
const udd = mkdtempSync(join(tmpdir(), 'zd-smoke-'));
let chrome;
let ws;

try {
  await waitFor(async () => (await fetch(BASE)).ok);

  // Static resource check: every module and the stylesheet must serve 200.
  const resources = ['', 'js/app.js', 'js/ui/home.js', 'js/ui/library.js', 'js/ui/editor.js', 'js/ui/history.js',
    'js/ui/settings.js', 'js/ui/tabbar.js', 'js/ui/dom.js', 'js/ui/run.js', 'js/ui/done.js', 'js/platform/update.js',
    'js/platform/theme.js', 'js/storage/db.js', 'js/core/circuit.js', 'js/core/library.js', 'js/core/plan.js',
    'css/tokens.css', 'css/base.css', 'css/app.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];
  let all200 = true;
  for (const r of resources) {
    const res = await fetch(BASE + r);
    if (res.status !== 200) { all200 = false; console.log('  ', res.status, BASE + r); }
  }
  check('Alle Ressourcen laden (200)', all200);

  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${udd}`, 'about:blank',
  ], { stdio: 'ignore' });

  const target = await waitFor(async () => {
    const res = await fetch(`http://localhost:${CDP_PORT}/json`);
    const list = await res.json();
    return list.find((t) => t.type === 'page');
  });

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      problems.push('exception: ' + (d.exception?.description || d.text));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      problems.push('log.error: ' + msg.params.entry.text + (msg.params.entry.url ? ' [' + msg.params.entry.url + ']' : ''));
    }
  };
  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitEval = (expr, opts) => waitFor(async () => evaluate(`(()=>{try{return !!(${expr});}catch(e){return false;}})()`), opts);
  const evalHandle = async (expression) => {
    const r = await send('Runtime.evaluate', { expression });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.objectId;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  // Reduced motion for the main flow: screens swap at once, so every selector below is
  // unambiguous. The sliding transition gets its own check further down.
  const setMotion = (reduce) =>
    send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
  await setMotion(true);

  await send('Page.navigate', { url: BASE });
  await waitEval(`document.querySelector('#app main')`);
  check('Startseite rendert', true);

  const goTab = async (tab, ready) => {
    await evaluate(`document.querySelector('#tabbar [data-nav="${tab}"]').click(); true`);
    await waitEval(ready);
  };
  const AMBIENT = `[data-segmented="soundMode"] [data-value="ambient"]`;

  // Tab bar: visible on the start screen, current tab marked
  const tabState = await evaluate(`({ hidden: document.getElementById('tabbar').hidden, current: document.querySelector('#tabbar [aria-current="page"]')?.dataset.nav })`);
  check('Tab-Leiste sichtbar, Tab "Zirkel" aktiv', tabState.hidden === false && tabState.current === 'home', JSON.stringify(tabState));

  // Settings persistence across reload
  await goTab('settings', `document.querySelector('${AMBIENT}')`);
  await evaluate(`document.querySelector('${AMBIENT}').click(); true`);
  await sleep(700);
  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  await goTab('settings', `document.querySelector('${AMBIENT}')`);
  const modePersisted = await evaluate(`document.querySelector('${AMBIENT}').getAttribute('aria-pressed')`);
  check('Einstellung bleibt nach Reload (Musik-Modus)', modePersisted === 'true', `aria-pressed=${modePersisted}`);

  // Appearance: default follows the device; forcing "Dunkel" applies at once and survives a reload
  const themeDefault = await evaluate(`({ attr: document.documentElement.dataset.theme ?? null, pressed: document.querySelector('[data-segmented="theme"] [aria-pressed="true"]').dataset.value })`);
  check('Darstellung: Standard ist Automatisch', themeDefault.attr === null && themeDefault.pressed === 'auto', JSON.stringify(themeDefault));
  await evaluate(`document.querySelector('[data-segmented="theme"] [data-value="dark"]').click(); true`);
  const themeNow = await evaluate(`({ attr: document.documentElement.dataset.theme, scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor })`);
  check('Darstellung: Dunkel wirkt sofort', themeNow.attr === 'dark' && themeNow.bg === 'rgb(0, 0, 0)', JSON.stringify(themeNow));
  await sleep(700);
  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  const themeAfter = await evaluate(`document.documentElement.dataset.theme`);
  check('Darstellung: Dunkel bleibt nach Reload', themeAfter === 'dark', `data-theme=${themeAfter}`);
  await goTab('settings', `document.querySelector('[data-segmented="theme"]')`);
  await evaluate(`document.querySelector('[data-segmented="theme"] [data-value="light"]').click(); true`);
  const lightBg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  check('Darstellung: Hell wirkt sofort', lightBg === 'rgb(242, 242, 247)', lightBg);
  await evaluate(`document.querySelector('[data-segmented="theme"] [data-value="auto"]').click(); true`);
  await sleep(500);

  // Design (look): applies at once, survives a reload before the first paint, effects only in a look
  await evaluate(`document.querySelector('[data-look="flammen"]').click(); true`);
  await evaluate(`document.fonts.ready.then(() => true)`);
  const lookNow = await evaluate(`({ attr: document.documentElement.dataset.look, pressed: document.querySelector('[data-look][aria-pressed="true"]').dataset.look,
    font: getComputedStyle(document.querySelector('.large-title h1')).fontFamily, bg: getComputedStyle(document.body).backgroundColor })`);
  check('Design: "Flammen" wirkt sofort (Farben, Titelschrift)',
    lookNow.attr === 'flammen' && lookNow.pressed === 'flammen' && lookNow.font.includes('Bangers') && lookNow.bg !== 'rgb(242, 242, 247)', JSON.stringify(lookNow));
  await evaluate(`(()=>{const t=document.querySelector('[data-toggle="animations"]'); t.checked=false; t.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
  await sleep(700);
  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  const lookAfter = await evaluate(`({ look: document.documentElement.dataset.look, anim: document.documentElement.dataset.anim, stored: localStorage.getItem('zd-look') })`);
  check('Design: bleibt nach Reload, "Bewegte Effekte aus" ebenso', lookAfter.look === 'flammen' && lookAfter.anim === 'off' && lookAfter.stored === 'flammen', JSON.stringify(lookAfter));
  await waitEval(`document.querySelector('.home-buddy')?.complete`);
  const buddy = await evaluate(`(() => { const b = document.querySelector('.home-buddy'); return { src: b.getAttribute('src'), w: b.naturalWidth, alt: b.alt }; })()`);
  check('Design: Figur auf der Startseite geladen (rein dekorativ, ohne Alt-Text)', buddy.src === 'img/characters/flammen-ready.svg' && buddy.w > 0 && buddy.alt === '', JSON.stringify(buddy));
  await evaluate(`document.querySelector('[data-card="start"][data-id="sample-quick"]').click(); true`);
  await waitEval(`document.querySelector('.run')`);
  const runBuddy = await evaluate(`(() => { const b = document.querySelector('.run-buddy'); return { hidden: b.hidden, src: b.getAttribute('src'), opacity: getComputedStyle(b).opacity }; })()`);
  check('Training im Design: Figur steht im Vorlauf dabei', !runBuddy.hidden && runBuddy.src === 'img/characters/flammen-ready.svg' && Number(runBuddy.opacity) > 0.9, JSON.stringify(runBuddy));
  await evaluate(`document.querySelector('[data-action="skip"]').click(); true`); // prep → work
  await sleep(500);
  const fx = await evaluate(`({ phase: document.querySelector('.run').dataset.phase, aura: getComputedStyle(document.querySelector('.ring-aura')).display,
    lines: getComputedStyle(document.querySelector('.run-fx')).display, linesOpacity: getComputedStyle(document.querySelector('.run-fx')).opacity,
    moving: getComputedStyle(document.querySelector('.aura-move')).animationName, cells: document.querySelectorAll('.run-time span').length,
    time: document.querySelector('.run-time').textContent })`);
  check('Training im Design: Aura und Linien sichtbar, stehen bei "Effekte aus" still, Restzeit lesbar',
    fx.phase === 'work' && fx.aura === 'block' && fx.lines === 'block' && Number(fx.linesOpacity) > 0.5 && fx.moving === 'none' && fx.cells >= 4 && /^\d+:\d\d$/.test(fx.time), JSON.stringify(fx));
  await evaluate(`document.querySelector('[data-action="abort"]').click(); true`);
  await waitEval(`document.querySelector('dialog.sheet[open]')`);
  await evaluate(`document.querySelector('dialog.sheet [data-sheet="ok"]').click(); true`);
  await waitEval(`document.querySelector('[data-action="home"]')`);
  await evaluate(`document.querySelector('[data-action="home"]').click(); true`);
  await waitEval(`document.querySelector('[data-nav="new"]')`);
  await goTab('settings', `document.querySelector('[data-look="standard"]')`);
  await evaluate(`document.querySelector('[data-look="standard"]').click(); true`);
  await evaluate(`(()=>{const t=document.querySelector('[data-toggle="animations"]'); t.checked=true; t.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
  const lookOff = await evaluate(`({ look: document.documentElement.dataset.look ?? null, anim: document.documentElement.dataset.anim ?? null, stored: localStorage.getItem('zd-look'), bg: getComputedStyle(document.body).backgroundColor })`);
  check('Design: zurück auf Standard entfernt das Design vollständig', lookOff.look === null && lookOff.anim === null && lookOff.stored === null, JSON.stringify(lookOff));
  await goTab('home', `document.querySelector('[data-nav="new"]')`);
  check('Standard-Design: keine Figur auf der Startseite', (await evaluate(`document.querySelector('.home-buddy')`)) === null);
  await goTab('settings', `document.querySelector('[data-look="standard"]')`);
  await sleep(700);

  // Personal media: own picture and own sound are stored on the device, survive a reload,
  // reach the training screen, and a too long sound is refused with a reason.
  // Files are made in the page (a canvas picture, a short WAV) and handed to the file inputs.
  const giveFile = (slot, makeBlob, name, type) => evaluate(`(async () => {
    const blob = await (${makeBlob})();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
    const input = document.querySelector('[data-media-input="${slot}"]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  const picture = `() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1200; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2400, 1200); g.fillStyle = '#08f'; g.fillRect(0, 0, 1200, 1200); return new Promise((r) => c.toBlob(r, 'image/png')); }`;
  const wav = (seconds) => `() => { const rate = 8000, n = Math.round(rate * ${seconds}); const b = new ArrayBuffer(44 + n * 2); const v = new DataView(b);
    const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 8000), true);
    return new Blob([b], { type: 'audio/wav' }); }`;
  const mediaState = (slot) => evaluate(`document.querySelector('[data-media="${slot}"] [data-el="state"]').textContent`);
  const mediaStatus = () => evaluate(`(() => { const s = document.querySelector('[data-el="media-status"]'); return s.hidden ? '' : s.textContent; })()`);

  await giveFile('background', picture, 'foto.png', 'image/png');
  await waitEval(`document.querySelector('[data-media="background"] [data-el="state"]').textContent.startsWith('Eigenes Bild')`);
  const thumb = await evaluate(`(() => { const t = document.querySelector('[data-media="background"] [data-el="thumb"]'); return { hidden: t.hidden, bg: t.style.backgroundImage.slice(0, 9), remove: !document.querySelector('[data-media-remove="background"]').hidden }; })()`);
  check('Persönlich: eigenes Bild gespeichert, Vorschau und "Entfernen" erscheinen', !thumb.hidden && thumb.bg === 'url("blob' && thumb.remove, `${await mediaState('background')} ${JSON.stringify(thumb)}`);

  await giveFile('sound-end', wav(0.4), 'fanfare.wav', 'audio/wav');
  await waitEval(`document.querySelector('[data-media="sound-end"] [data-el="state"]').textContent.includes('fanfare.wav')`);
  const soundState = await mediaState('sound-end');
  check('Persönlich: eigener Ton gespeichert, Länge angezeigt, "Anhören" erscheint',
    /fanfare\.wav, 0,4 s/.test(soundState) && (await evaluate(`!document.querySelector('[data-media-play="sound-end"]').hidden`)), soundState);
  await evaluate(`document.querySelector('[data-media-play="sound-end"]').click(); true`); // must not throw

  await giveFile('sound-roundDone', wav(9), 'lang.wav', 'audio/wav');
  await waitEval(`/höchstens 8 s/.test(document.querySelector('[data-el="media-status"]').textContent)`);
  check('Persönlich: zu langer Ton wird mit Begründung abgelehnt, nichts gespeichert',
    (await mediaState('sound-roundDone')) === 'Eingebauter Ton', await mediaStatus());

  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  await goTab('settings', `document.querySelector('[data-media="background"]')`);
  const afterReload = { bg: await mediaState('background'), end: await mediaState('sound-end'), round: await mediaState('sound-roundDone') };
  check('Persönlich: Bild und Ton bleiben nach Reload (IndexedDB)',
    afterReload.bg.startsWith('Eigenes Bild') && afterReload.end.includes('fanfare.wav') && afterReload.round === 'Eingebauter Ton', JSON.stringify(afterReload));
  const stored = await evaluate(`(async () => { const req = indexedDB.open('hiit-zirkel'); const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    const get = (k) => new Promise((res) => { const r = db.transaction('media').objectStore('media').get(k); r.onsuccess = () => res(r.result); });
    const bg = await get('background'); db.close();
    const img = await createImageBitmap(new Blob([bg.bytes], { type: bg.type }));
    return { type: bg.type, kb: Math.round(bg.bytes.byteLength / 1024), w: img.width, h: img.height }; })()`);
  check('Persönlich: Bild als JPEG auf höchstens 1600 px verkleinert', stored.type === 'image/jpeg' && stored.w === 1600 && stored.h === 800, JSON.stringify(stored));

  await goTab('home', `document.querySelector('[data-nav="new"]')`);
  await evaluate(`document.querySelector('[data-card="start"][data-id="sample-quick"]').click(); true`);
  await waitEval(`document.querySelector('.run')`);
  const photo = await evaluate(`(() => { const r = document.querySelector('.run'); const p = r.querySelector('.run-photo'); return { has: r.classList.contains('has-photo'), display: getComputedStyle(p).display,
    img: p.style.backgroundImage.slice(0, 9), cover: getComputedStyle(p, '::after').backgroundImage.includes('gradient') }; })()`);
  check('Training: eigenes Bild liegt hinter der Phasenfarbe (abgedunkelt)', photo.has && photo.display === 'block' && photo.img === 'url("blob' && photo.cover, JSON.stringify(photo));
  await evaluate(`document.querySelector('[data-action="abort"]').click(); true`);
  await waitEval(`document.querySelector('dialog.sheet[open]')`);
  await evaluate(`document.querySelector('dialog.sheet [data-sheet="ok"]').click(); true`);
  await waitEval(`document.querySelector('[data-action="home"]')`);
  await evaluate(`document.querySelector('[data-action="home"]').click(); true`);
  await waitEval(`document.querySelector('[data-nav="new"]')`);
  await sleep(400);

  await goTab('settings', `document.querySelector('[data-media-remove="background"]')`);
  await evaluate(`document.querySelector('[data-media-remove="background"]').click(); true`);
  await waitEval(`document.querySelector('dialog.sheet[open]')`);
  await evaluate(`document.querySelector('dialog.sheet [data-sheet="ok"]').click(); true`);
  await waitEval(`document.querySelector('[data-media="background"] [data-el="state"]').textContent === 'Kein Bild gewählt'`);
  check('Persönlich: Bild entfernen nach Rückfrage', (await evaluate(`document.querySelector('[data-media-remove="background"]').hidden`)) === true, await mediaStatus());
  await sleep(300);

  // Licences and sources: the notice for the body graphic is in the app, with the full text
  const lic = await evaluate(`document.querySelector('[data-el="licenses"]')?.textContent || ''`);
  await evaluate(`document.querySelector('[data-action="body-license"]').click(); true`);
  await waitEval(`document.querySelector('dialog.form-sheet[open] .license-text')`);
  const licText = await evaluate(`document.querySelector('dialog.form-sheet[open] .license-text').textContent`);
  check('Einstellungen: Lizenzen und Quellen mit MIT-Text der Körpergrafik',
    lic.includes('react-native-body-highlighter') && lic.includes('free-exercise-db') && lic.includes('Bangers') && licText.includes('MIT License') && licText.includes('ELABBASSI Hicham'));
  await evaluate(`document.querySelector('dialog.form-sheet[open] [data-action="close"]').click(); true`);
  await waitEval(`!document.querySelector('dialog.form-sheet')`);

  // Library opens
  await goTab('library', `document.querySelector('[data-screen="library"]')`);
  const count0 = await evaluate(`document.querySelector('[data-el="count"]').textContent`);
  check('Übungsliste öffnet mit Zählung', /^\d+ Übungen$/.test(count0), count0);

  // Diacritic-insensitive search
  await evaluate(`(()=>{const s=document.querySelector('.lib-search'); s.value='klimmzuge'; s.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await sleep(150);
  const filtered = await evaluate(`[...document.querySelectorAll('.ex-name')].map(h=>h.textContent)`);
  check('Suche ist umlaut-unempfindlich (klimmzuge → Klimmzüge)', filtered.some((t) => t.includes('Klimmzüge')), `${filtered.length} Treffer`);
  await evaluate(`(()=>{const s=document.querySelector('.lib-search'); s.value=''; s.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);

  // Body graphic: a built-in exercise opens a sheet, main muscle strong, secondary light, rest neutral
  await evaluate(`document.querySelector('[data-info="pushups"]').click(); true`);
  await waitEval(`document.querySelector('[data-el="dialog"]').open && document.querySelector('[data-el="dialog"] .body-fig')`);
  const sheet = await evaluate(`(()=>{
    const d=document.querySelector('[data-el="dialog"]');
    const fill=(l)=>{const p=d.querySelector('.bp[data-l="'+l+'"]'); return p ? getComputedStyle(p).fill : null;};
    return { sides: d.querySelectorAll('.body-side').length, main: fill(3), secondary: fill(1), rest: fill(0),
      text: d.querySelector('.form-body').textContent.replace(/\\s+/g,' '), label: d.querySelector('.body-fig').getAttribute('aria-label') };})()`);
  check('Muskelgrafik pro Übung: vorne und hinten, Haupt/Neben/Rest in drei Farben, Text dazu',
    sheet.sides === 2 && sheet.main && sheet.secondary && sheet.rest && new Set([sheet.main, sheet.secondary, sheet.rest]).size === 3
      && sheet.text.includes('Hauptmuskeln') && sheet.text.includes('Brust') && sheet.text.includes('Trizeps') && sheet.label.includes('Brust'),
    JSON.stringify({ sides: sheet.sides, main: sheet.main, secondary: sheet.secondary, rest: sheet.rest }));
  await evaluate(`document.querySelector('[data-el="dialog"] [data-action="cancel"]').click(); true`);
  await waitEval(`!document.querySelector('[data-el="dialog"]').open`);

  // Create a custom exercise (dialog-scoped fields)
  await evaluate(`document.querySelector('[data-action="add"]').click(); true`);
  await waitEval(`document.querySelector('[data-el="dialog"]').open`);
  await evaluate(`(()=>{
    const d=document.querySelector('[data-el="dialog"]');
    const n=d.querySelector('[data-field="name"]'); n.value='Smoke Test Übung'; n.dispatchEvent(new Event('input',{bubbles:true}));
    d.querySelector('[data-field="category"]').value='core';
    d.querySelector('[data-muscle="primary:abs"]').click();
    d.querySelector('[data-field="sides"]').checked=true;
    return true;})()`);
  const formFig = await evaluate(`(()=>{const d=document.querySelector('[data-el="dialog"]'); const before=d.querySelectorAll('.form-fig .bp[data-l="1"]').length;
    d.querySelector('[data-muscle="secondary:obliques"]').click();
    return { main: d.querySelectorAll('.form-fig .bp[data-l="3"]').length, before, after: d.querySelectorAll('.form-fig .bp[data-l="1"]').length };})()`);
  check('Formular: Figur folgt den gewählten Muskeln sofort', formFig.main === 1 && formFig.before === 0 && formFig.after === 1, JSON.stringify(formFig));
  await evaluate(`document.querySelector('[data-action="save"]').click(); true`);
  await waitEval(`!document.querySelector('[data-el="dialog"]').open && [...document.querySelectorAll('.ex-name')].some(h=>h.textContent.includes('Smoke Test Übung'))`);
  const rowText = await evaluate(`([...document.querySelectorAll('.ex-row')].find(r=>r.textContent.includes('Smoke Test Übung'))||{}).textContent || ''`);
  check('Eigene Übung angelegt (Eigen, L/R, Kategorie Rumpf, Muskel Bauch)',
    rowText.includes('Eigen') && rowText.includes('L/R') && rowText.includes('Rumpf') && rowText.includes('Bauch (gerade)'),
    rowText.replace(/\s+/g, ' ').trim());

  // No horizontal scrollbar
  const ov = await evaluate(`({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth})`);
  check('Keine horizontale Scrollleiste', ov.sw <= ov.cw, `scrollWidth ${ov.sw} ≤ clientWidth ${ov.cw}`);

  // Persists across reload (IndexedDB)
  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  await goTab('library', `document.querySelector('[data-screen="library"]')`);
  const persisted = await waitEval(`[...document.querySelectorAll('.ex-name')].some(h=>h.textContent.includes('Smoke Test Übung'))`).then(() => true).catch(() => false);
  check('Eigene Übung bleibt nach Reload (IndexedDB)', persisted);

  // Duplicate warning
  await evaluate(`document.querySelector('[data-action="add"]').click(); true`);
  await waitEval(`document.querySelector('[data-el="dialog"]').open`);
  await evaluate(`(()=>{const d=document.querySelector('[data-el="dialog"]'); const n=d.querySelector('[data-field="name"]'); n.value='liegestütze'; n.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await sleep(100);
  const dupShown = await evaluate(`!document.querySelector('[data-el="dup"]').hidden`);
  check('Dublettenwarnung bei vorhandenem Namen', dupShown);
  await evaluate(`document.querySelector('[data-action="cancel"]').click(); true`);

  // Delete
  await waitEval(`!document.querySelector('[data-el="dialog"]').open`);
  await evaluate(`[...document.querySelectorAll('[data-edit]')].find(b=>b.closest('.ex-row').textContent.includes('Smoke Test Übung')).click(); true`);
  await waitEval(`document.querySelector('[data-el="dialog"]').open`);
  await evaluate(`document.querySelector('[data-el="dialog"] [data-action="delete"]').click(); true`);
  await waitEval(`document.querySelector('dialog.sheet[open]')`);
  await evaluate(`document.querySelector('dialog.sheet [data-sheet="ok"]').click(); true`);
  const gone = await waitEval(`!document.querySelector('[data-el="dialog"]').open && ![...document.querySelectorAll('.ex-name')].some(h=>h.textContent.includes('Smoke Test Übung'))`).then(() => true).catch(() => false);
  check('Eigene Übung gelöscht', gone);

  // ---- circuit editor → start → history ----
  const setVal = (sel, value) =>
    evaluate(`(()=>{const el=document.querySelector('${sel}'); el.value=${JSON.stringify(String(value))}; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);

  // Back to home, open the editor for a new circuit
  await goTab('home', `document.querySelector('[data-nav="new"]')`);
  await evaluate(`document.querySelector('[data-nav="new"]').click(); true`);
  await waitEval(`document.querySelector('[data-el="name"]')`);
  check('Tab-Leiste im Editor verborgen', (await evaluate(`document.getElementById('tabbar').hidden`)) === true);
  await setVal('[data-el="name"]', 'Smoke Zirkel');
  for (const [k, v] of [['rounds', 1], ['workS', 2], ['restS', 0], ['roundRestS', 0], ['prepS', 0]]) await setVal(`[data-setting="${k}"]`, v);

  // Add two exercises via the picker
  await evaluate(`document.querySelector('[data-action="add"]').click(); true`);
  await waitEval(`document.querySelector('[data-pick]')`);
  await evaluate(`const bs=document.querySelectorAll('[data-pick]'); bs[0].click(); bs[1].click(); true`);
  await evaluate(`document.querySelector('[data-action="back"]').click(); true`); // "Fertig"
  await waitEval(`document.querySelectorAll('.edit-ex').length === 2`);
  const over = await evaluate(`(()=>{const m=document.querySelector('[data-el="muscles"]'); return { hidden: m.hidden, sides: m.querySelectorAll('.body-side').length,
    top: m.querySelectorAll('.bp[data-l="3"]').length, focus: m.querySelector('.muscle-top')?.textContent || '' };})()`);
  check('Editor: Muskel-Überblick des Zirkels mit Schwerpunkt', over.hidden === false && over.sides === 2 && over.top >= 1 && over.focus.length > 2, JSON.stringify(over));
  const dur0 = await evaluate(`document.querySelector('[data-el="duration"]').textContent`);
  check('Editor: zwei Übungen, Dauer 0:04 (1 Runde × 2×2 s)', dur0 === '0:04', dur0);

  // Per-exercise time: turn off "same length", give the first exercise 5 s
  await evaluate(`(()=>{const u=document.querySelector('[data-el="uniform"]'); u.checked=false; u.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
  await waitEval(`document.querySelector('[data-time="0"]')`);
  await setVal('[data-time="0"]', 5);
  const dur1 = await evaluate(`document.querySelector('[data-el="duration"]').textContent`);
  check('Editor: Pro-Übung-Zeit wirkt (5 s + 2 s = 0:07)', dur1 === '0:07', dur1);

  // Save as template → appears on home
  await evaluate(`document.querySelector('[data-action="save"]').click(); true`);
  await waitEval(`[...document.querySelectorAll('.circuit-head h3')].some(h=>h.textContent.includes('Smoke Zirkel'))`);
  check('Vorlage gespeichert und auf der Startseite', true);

  // Start the template, skip to the end
  await evaluate(`document.querySelector('[data-card="start"][data-kind="template"]').click(); true`);
  await waitEval(`document.querySelector('.run')`);
  await evaluate(`document.querySelector('[data-action="skip"]').click(); true`);
  await sleep(400); // two skips within 350 ms count as one accidental double tap
  await evaluate(`document.querySelector('[data-action="skip"]').click(); true`);
  await waitEval(`document.querySelector('.done')`);
  check('Zirkel gestartet und bis zum Ende durchgelaufen', true);

  // Back to overview, history now has an entry for this run
  await evaluate(`document.querySelector('[data-action="home"]').click(); true`);
  await waitEval(`document.querySelector('[data-nav="new"]')`);
  await goTab('history', `document.querySelector('[data-screen="history"]')`);
  const histHit = await evaluate(`[...document.querySelectorAll('.hist-name')].some(h=>h.textContent.includes('Smoke Zirkel'))`);
  check('Verlauf enthält den Lauf', histHit);

  // Persists across reload
  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  await goTab('history', `document.querySelector('[data-screen="history"]')`);
  const histPersist = await waitEval(`[...document.querySelectorAll('.hist-name')].some(h=>h.textContent.includes('Smoke Zirkel'))`).then(() => true).catch(() => false);
  check('Verlauf bleibt nach Reload (IndexedDB)', histPersist);

  // Edit the template, delete it → gone from home
  await goTab('home', `document.querySelector('[data-card="edit"][data-kind="template"]')`);
  await evaluate(`document.querySelector('[data-card="edit"][data-kind="template"]').click(); true`);
  await waitEval(`document.querySelector('[data-action="delete"]')`);
  await evaluate(`document.querySelector('[data-action="delete"]').click(); true`);
  await waitEval(`document.querySelector('dialog.sheet[open]')`);
  await evaluate(`document.querySelector('dialog.sheet [data-sheet="ok"]').click(); true`);
  const tmplGone = await waitEval(`document.querySelector('[data-nav="new"]') && ![...document.querySelectorAll('.circuit-head h3')].some(h=>h.textContent.includes('Smoke Zirkel'))`).then(() => true).catch(() => false);
  check('Vorlage gelöscht', tmplGone);

  // ---- screen transition with motion on: push leaves exactly one screen behind, pop too ----
  await setMotion(false);
  await evaluate(`document.querySelector('[data-nav="new"]').click(); true`);
  const during = await evaluate(`document.querySelectorAll('#app > .screen').length`);
  await sleep(800);
  const afterPush = await evaluate(`({ n: document.querySelectorAll('#app > .screen').length, editor: !!document.querySelector('[data-screen="editor"]'), focus: document.activeElement?.tagName })`);
  await evaluate(`document.querySelector('[data-screen="editor"] [data-action="back"]').click(); true`);
  await sleep(800);
  const afterPop = await evaluate(`({ n: document.querySelectorAll('#app > .screen').length, home: !!document.querySelector('[data-nav="new"]'), tabbar: !document.getElementById('tabbar').hidden })`);
  check('Bildschirmwechsel mit Animation: alter Bildschirm wird entfernt, Fokus auf Überschrift',
    during === 2 && afterPush.n === 1 && afterPush.editor && afterPush.focus === 'H1' && afterPop.n === 1 && afterPop.home && afterPop.tabbar,
    JSON.stringify({ during, afterPush, afterPop }));
  await setMotion(true);

  // ---- service worker / offline ----
  await send('Network.enable');
  const swActive = await waitEval(`navigator.serviceWorker && navigator.serviceWorker.controller !== null`, { tries: 150, delay: 100 }).then(() => true).catch(() => false);
  check('Service Worker aktiv und steuert die Seite', swActive);

  // Go offline and reload — the app must still render from the cache
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Page.reload');
  const offlineOk = await waitEval(`document.querySelector('#app main')`).then(() => true).catch(() => false);
  check('App rendert offline (Service-Worker-Cache)', offlineOk);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // Manifest advertises installable icons
  const icons = await evaluate(`(async () => { const m = await (await fetch('manifest.webmanifest')).json(); const out = [];
    for (const i of m.icons || []) { const r = await fetch(i.src); out.push({ src: i.src, purpose: i.purpose, ok: r.ok && Number(r.headers.get('content-length') || 1) > 0 }); }
    const fav = document.querySelector('link[rel="icon"][type="image/svg+xml"]'); const touch = document.querySelector('link[rel="apple-touch-icon"]');
    return { icons: out, fav: fav ? (await fetch(fav.href)).ok : false, touch: touch ? (await fetch(touch.href)).ok : false, name: m.name }; })()`);
  check('Manifest mit Icons (installierbar): alle Dateien da, eigenes maskable-Symbol, SVG-Favicon, Name Circle Champ',
    icons.icons.length >= 3 && icons.icons.every((i) => i.ok) && icons.icons.some((i) => i.purpose === 'maskable') && icons.fav && icons.touch && icons.name === 'Circle Champ',
    `${icons.icons.length} Icons`);

  // ---- share link / import / export ----

  // Receiving a shared circuit: encode one, load the app with #share=…, expect the editor to open
  // with it and the hash cleared. encodeCircuit is the very function the app uses, run here in node.
  const shared = {
    name: 'Geteilter Zirkel',
    exercises: [{ id: 'burpees', name: 'Burpees', sides: false }, { id: 'plank', name: 'Plank', sides: false }],
    settings: { rounds: 2, workS: 30, restS: 15, roundRestS: 0, prepS: 0, warmupS: 0, cooldownS: 0 },
  };
  // via about:blank so the share URL is a real document load (a bare hash change would not re-run boot())
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: `${BASE}#share=${encodeCircuit(shared)}` });
  await waitEval(`document.querySelector('[data-el="name"]')`);
  const sharedName = await evaluate(`document.querySelector('[data-el="name"]').value`);
  const sharedCount = await evaluate(`document.querySelectorAll('.edit-ex').length`);
  check('Teilen-Link empfangen → Editor mit Zirkel', sharedName === 'Geteilter Zirkel' && sharedCount === 2, `name="${sharedName}", ${sharedCount} Übungen`);
  check('Teilen-Hash nach Empfang geleert', (await evaluate(`location.hash`)) === '');
  await evaluate(`document.querySelector('[data-action="back"]').click(); true`); // back to home

  // Import a backup file via the hidden file input (DOM.setFileInputFiles with the element's objectId)
  const importPath = join(udd, 'import.json');
  writeFileSync(importPath, JSON.stringify(buildBackup({
    templates: [{
      id: 't-smoke-import', name: 'Import Zirkel',
      exercises: [{ id: 'squats', name: 'Kniebeugen', sides: false }],
      settings: { rounds: 1, workS: 20, restS: 0, roundRestS: 0, prepS: 0, warmupS: 0, cooldownS: 0 },
      createdAt: 1, updatedAt: 1, lastUsedAt: 9999999999999, sample: false,
    }],
  })));
  await waitEval(`document.querySelector('[data-nav="new"]')`);
  await goTab('settings', `document.querySelector('[data-el="import"]')`);
  await send('DOM.enable');
  const inputObjId = await evalHandle(`document.querySelector('[data-el="import"]')`);
  await send('DOM.setFileInputFiles', { objectId: inputObjId, files: [importPath] });
  await waitEval(`!document.querySelector('[data-el="status"]').hidden && document.querySelector('[data-el="status"]').textContent.includes('Importiert')`);
  const importStatus = await evaluate(`document.querySelector('[data-el="status"]').textContent`);
  check('Import per Datei meldet Erfolg', /Importiert/.test(importStatus), importStatus);
  await goTab('home', `document.querySelector('[data-nav="new"]')`);
  const importShown = await waitEval(`[...document.querySelectorAll('.circuit-head h3')].some(h=>h.textContent.includes('Import Zirkel'))`).then(() => true).catch(() => false);
  check('Importierter Zirkel auf der Startseite', importShown);

  // Export: let Chrome write the download to a temp dir, then validate the file with parseBackup
  const downloadDir = join(udd, 'downloads');
  mkdirSync(downloadDir, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await goTab('settings', `document.querySelector('[data-action="export"]')`);
  await evaluate(`document.querySelector('[data-action="export"]').click(); true`);
  let exportFile = null;
  for (let i = 0; i < 50 && !exportFile; i++) {
    const files = readdirSync(downloadDir).filter((f) => f.endsWith('.json'));
    if (files.length) exportFile = join(downloadDir, files[0]);
    else await sleep(100);
  }
  let exportOk = false;
  let exportDetail = 'keine Datei erzeugt';
  if (exportFile) {
    try {
      const parsed = parseBackup(readFileSync(exportFile, 'utf8'));
      // the imported template must be in the backup → round-trips through storage
      exportOk = parsed.templates.some((t) => t.id === 't-smoke-import');
      exportDetail = `${parsed.templates.length} Vorlagen, ${parsed.customExercises.length} eigene Übungen`;
    } catch (err) {
      exportDetail = err.message;
    }
  }
  check('Export enthält keine persönlichen Medien (eigener Ton ist noch gespeichert)', !!exportFile && !/fanfare|"media"|"bytes"/.test(readFileSync(exportFile, 'utf8')));
  check('Export erzeugt gültige Sicherungsdatei', exportOk, exportDetail);

  // Offline failures for cached assets would show here; only the browser's favicon is expected to 404.
  const appProblems = problems.filter((p) => !p.includes('/favicon.ico'));
  check('Keine App-Konsolenfehler / Exceptions', appProblems.length === 0, appProblems.join(' | ') || '(favicon.ico 404 ignoriert, browser-eigen)');
} finally {
  try { ws?.close(); } catch {}
  chrome?.kill('SIGKILL');
  server.kill('SIGKILL');
  try { rmSync(udd, { recursive: true, force: true }); } catch {}
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
process.exit(failed.length ? 1 : 0);
