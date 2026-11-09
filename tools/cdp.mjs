// Shared helper for the measuring and screenshot tools: starts tools/serve.js and a headless
// Chrome, and talks to it over the DevTools Protocol. Node built-ins only (Node 22: global
// fetch + WebSocket). tools/smoke.mjs keeps its own copy of this on purpose (it predates this
// file and is the release gate).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const CHROME = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find((p) => existsSync(p));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { tries = 100, delay = 100 } = {}) {
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

export async function launch({ servePort = 8097, cdpPort = 9335, width = 390, height = 844, scale = 2 } = {}) {
  if (!CHROME) throw new Error('Chrome nicht gefunden. Setze CHROME=/pfad/zu/chrome.');
  const base = `http://localhost:${servePort}/hiit-zirkel/`;
  const server = spawn(process.execPath, [join(ROOT, 'tools', 'serve.js')], {
    env: { ...process.env, PORT: String(servePort) },
    stdio: 'ignore',
  });
  const udd = mkdtempSync(join(tmpdir(), 'zd-cdp-'));
  await waitFor(async () => (await fetch(base)).ok);

  const chrome = spawn(CHROME, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${udd}`, 'about:blank',
  ], { stdio: 'ignore' });

  const target = await waitFor(async () => {
    const list = await (await fetch(`http://localhost:${cdpPort}/json`)).json();
    return list.find((t) => t.type === 'page');
  });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let nextId = 1;
  const pending = new Map();
  const problems = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      problems.push('exception: ' + (d.exception?.description || d.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
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
  const waitEval = (expr, opts) =>
    waitFor(async () => evaluate(`(()=>{try{return !!(${expr});}catch(e){return false;}})()`), opts);
  const setViewport = (w, h, s = scale) =>
    send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: s, mobile: true });
  const goto = async (path = '') => {
    await send('Page.navigate', { url: base + path });
    await waitEval(`document.querySelector('#app main, #app section')`);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await setViewport(width, height);

  const close = async () => {
    try { ws.close(); } catch { /* already closed */ }
    chrome.kill();
    server.kill();
    await sleep(300);
    try { rmSync(udd, { recursive: true, force: true }); } catch { /* Windows may still hold a lock */ }
  };

  return { base, send, evaluate, waitEval, setViewport, goto, problems, close };
}
