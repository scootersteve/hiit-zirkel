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
    'js/ui/run.js', 'js/ui/done.js', 'js/platform/update.js', 'js/storage/db.js', 'js/core/circuit.js',
    'js/core/library.js', 'js/core/plan.js', 'css/app.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'];
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

  await send('Page.navigate', { url: BASE });
  await waitEval(`document.querySelector('#app main')`);
  check('Startseite rendert', true);

  // Settings persistence across reload
  await evaluate(`document.querySelector('[data-mode="ambient"]').click(); true`);
  await sleep(700);
  await send('Page.reload');
  await waitEval(`document.querySelector('[data-mode="ambient"]')`);
  const modePersisted = await evaluate(`document.querySelector('[data-mode="ambient"]').getAttribute('aria-pressed')`);
  check('Einstellung bleibt nach Reload (Musik-Modus)', modePersisted === 'true', `aria-pressed=${modePersisted}`);

  // Library opens
  await evaluate(`document.querySelector('[data-nav="library"]').click(); true`);
  await waitEval(`document.querySelector('.lib-head')`);
  const count0 = await evaluate(`document.querySelector('[data-el="count"]').textContent`);
  check('Übungsliste öffnet mit Zählung', /\d+ von \d+ Übungen/.test(count0), count0);

  // Diacritic-insensitive search
  await evaluate(`(()=>{const s=document.querySelector('.lib-search'); s.value='klimmzuge'; s.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  await sleep(150);
  const filtered = await evaluate(`[...document.querySelectorAll('.ex-name')].map(h=>h.textContent)`);
  check('Suche ist umlaut-unempfindlich (klimmzuge → Klimmzüge)', filtered.some((t) => t.includes('Klimmzüge')), `${filtered.length} Treffer`);
  await evaluate(`(()=>{const s=document.querySelector('.lib-search'); s.value=''; s.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);

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
  await evaluate(`document.querySelector('[data-nav="library"]').click(); true`);
  await waitEval(`document.querySelector('.lib-head')`);
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
  await evaluate(`document.querySelector('[data-action="delete"]').click(); true`);
  await waitEval(`!document.querySelector('[data-el="del-confirm"]').hidden`);
  await evaluate(`document.querySelector('[data-action="delete-confirm"]').click(); true`);
  const gone = await waitEval(`!document.querySelector('[data-el="dialog"]').open && ![...document.querySelectorAll('.ex-name')].some(h=>h.textContent.includes('Smoke Test Übung'))`).then(() => true).catch(() => false);
  check('Eigene Übung gelöscht', gone);

  // ---- circuit editor → start → history ----
  const setVal = (sel, value) =>
    evaluate(`(()=>{const el=document.querySelector('${sel}'); el.value=${JSON.stringify(String(value))}; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);

  // Back to home, open the editor for a new circuit
  await evaluate(`document.querySelector('[data-action="back"]').click(); true`);
  await waitEval(`document.querySelector('[data-nav="new"]')`);
  await evaluate(`document.querySelector('[data-nav="new"]').click(); true`);
  await waitEval(`document.querySelector('[data-el="name"]')`);
  await setVal('[data-el="name"]', 'Smoke Zirkel');
  for (const [k, v] of [['rounds', 1], ['workS', 2], ['restS', 0], ['roundRestS', 0], ['prepS', 0]]) await setVal(`[data-setting="${k}"]`, v);

  // Add two exercises via the picker
  await evaluate(`document.querySelector('[data-action="add"]').click(); true`);
  await waitEval(`document.querySelector('[data-pick]')`);
  await evaluate(`const bs=document.querySelectorAll('[data-pick]'); bs[0].click(); bs[1].click(); true`);
  await evaluate(`document.querySelector('[data-action="back"]').click(); true`); // "Fertig"
  await waitEval(`document.querySelectorAll('.edit-ex').length === 2`);
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
  await evaluate(`document.querySelector('[data-action="skip"]').click(); true`);
  await waitEval(`document.querySelector('.done')`);
  check('Zirkel gestartet und bis zum Ende durchgelaufen', true);

  // Back to overview, history now has an entry for this run
  await evaluate(`document.querySelector('[data-action="home"]').click(); true`);
  await waitEval(`document.querySelector('[data-nav="history"]')`);
  await evaluate(`document.querySelector('[data-nav="history"]').click(); true`);
  await waitEval(`document.querySelector('.lib-head')`);
  const histHit = await evaluate(`[...document.querySelectorAll('.hist-main h3')].some(h=>h.textContent.includes('Smoke Zirkel'))`);
  check('Verlauf enthält den Lauf', histHit);

  // Persists across reload
  await send('Page.reload');
  await waitEval(`document.querySelector('#app main')`);
  await evaluate(`document.querySelector('[data-nav="history"]').click(); true`);
  await waitEval(`document.querySelector('.lib-head')`);
  const histPersist = await waitEval(`[...document.querySelectorAll('.hist-main h3')].some(h=>h.textContent.includes('Smoke Zirkel'))`).then(() => true).catch(() => false);
  check('Verlauf bleibt nach Reload (IndexedDB)', histPersist);

  // Edit the template, delete it → gone from home
  await evaluate(`document.querySelector('[data-action="back"]').click(); true`);
  await waitEval(`document.querySelector('[data-card="edit"][data-kind="template"]')`);
  await evaluate(`document.querySelector('[data-card="edit"][data-kind="template"]').click(); true`);
  await waitEval(`document.querySelector('[data-action="delete"]')`);
  await evaluate(`document.querySelector('[data-action="delete"]').click(); true`);
  await waitEval(`!document.querySelector('[data-el="del-confirm"]').hidden`);
  await evaluate(`document.querySelector('[data-action="delete-confirm"]').click(); true`);
  const tmplGone = await waitEval(`document.querySelector('[data-nav="new"]') && ![...document.querySelectorAll('.circuit-head h3')].some(h=>h.textContent.includes('Smoke Zirkel'))`).then(() => true).catch(() => false);
  check('Vorlage gelöscht', tmplGone);

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
  const iconCount = await evaluate(`fetch('manifest.webmanifest').then(r=>r.json()).then(m=>(m.icons||[]).length)`);
  check('Manifest mit Icons (installierbar)', iconCount >= 2, `${iconCount} Icons`);

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
  await waitEval(`document.querySelector('[data-nav="data"]')`);
  await evaluate(`document.querySelector('[data-nav="data"]').click(); true`);
  await waitEval(`document.querySelector('[data-el="import"]')`);
  await send('DOM.enable');
  const inputObjId = await evalHandle(`document.querySelector('[data-el="import"]')`);
  await send('DOM.setFileInputFiles', { objectId: inputObjId, files: [importPath] });
  await waitEval(`!document.querySelector('[data-el="status"]').hidden && document.querySelector('[data-el="status"]').textContent.includes('Importiert')`);
  const importStatus = await evaluate(`document.querySelector('[data-el="status"]').textContent`);
  check('Import per Datei meldet Erfolg', /Importiert/.test(importStatus), importStatus);
  await evaluate(`document.querySelector('[data-action="back"]').click(); true`);
  const importShown = await waitEval(`[...document.querySelectorAll('.circuit-head h3')].some(h=>h.textContent.includes('Import Zirkel'))`).then(() => true).catch(() => false);
  check('Importierter Zirkel auf der Startseite', importShown);

  // Export: let Chrome write the download to a temp dir, then validate the file with parseBackup
  const downloadDir = join(udd, 'downloads');
  mkdirSync(downloadDir, { recursive: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await evaluate(`document.querySelector('[data-nav="data"]').click(); true`);
  await waitEval(`document.querySelector('[data-action="export"]')`);
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
