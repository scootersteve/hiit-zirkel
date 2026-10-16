// Headless browser smoke test, Node built-ins only (no dependencies).
// Starts tools/serve.js, drives Chrome via the DevTools Protocol (Node 22 global fetch +
// WebSocket) at an iPhone-sized viewport, checks the main flows, and tears everything down.
//
// Usage:  node tools/smoke.mjs          (or: npm run smoke)
// Chrome: set CHROME=/path/to/chrome if it is not at the macOS default location.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const resources = ['', 'js/app.js', 'js/ui/home.js', 'js/ui/library.js', 'js/ui/run.js', 'js/ui/done.js',
    'js/storage/db.js', 'js/storage/store.js', 'js/storage/memory.js', 'js/storage/indexeddb.js', 'js/storage/schema.js',
    'js/core/library.js', 'js/core/plan.js', 'js/core/timer.js', 'css/app.css'];
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

  // The browser auto-requests /favicon.ico; a 404 there is not an app error.
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
