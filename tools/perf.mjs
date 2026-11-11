// Measures what a running training costs: main-thread time and callbacks per minute.
// Starts the sample circuit, lets it run for a window, and reads Chrome's own counters.
//
// Usage:  node tools/perf.mjs [seconds] [look]   (default 30 s, with 4x CPU throttling ≈ slower phone;
//         look = a name from css/looks.css, to measure its effects against the standard design)
// Numbers are from desktop Chrome, not from an iPhone: use them to compare before/after,
// not as absolute battery figures.

import { launch, sleep } from './cdp.mjs';

const SECONDS = Number(process.argv[2]) || 30;
const LOOK = process.argv[3] || '';
const ANIM_OFF = process.argv[4] === 'off'; // look with the "animations" setting switched off
const b = await launch({ servePort: 8096, cdpPort: 9336 });

try {
  await b.send('Performance.enable');
  await b.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await b.goto();
  // PERF_CSS: extra CSS for an experiment, e.g. to switch one effect off and see what it costs
  if (process.env.PERF_CSS) await b.evaluate(`document.head.insertAdjacentHTML('beforeend', '<style>' + ${JSON.stringify(process.env.PERF_CSS)} + '</style>'); true`);
  if (LOOK) await b.evaluate(`document.documentElement.dataset.look = ${JSON.stringify(LOOK)}; ${ANIM_OFF ? "document.documentElement.dataset.anim = 'off';" : ''} document.fonts.ready.then(() => true)`);

  // Count how often the page asks for a frame or a timer while the training runs.
  await b.evaluate(`(() => {
    window.__perf = { raf: 0, timeout: 0 };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => { window.__perf.raf++; return raf(fn); };
    const st = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => { window.__perf.timeout++; return st(fn, ms, ...rest); };
    return true;
  })()`);

  await b.evaluate(`document.querySelector('[data-card="start"][data-id="sample-circuit"]').click(); true`);
  await b.waitEval(`document.querySelector('.run')`);
  await sleep(1500); // let the start settle

  const metrics = async () => Object.fromEntries((await b.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const before = await metrics();
  const countBefore = await b.evaluate('({ ...window.__perf })');
  await sleep(SECONDS * 1000);
  const after = await metrics();
  const countAfter = await b.evaluate('({ ...window.__perf })');

  const perMin = (v) => (v * 60) / SECONDS;
  const ms = (name) => perMin((after[name] - before[name]) * 1000);
  const row = (label, value, unit) => console.log(`${label.padEnd(34)} ${value.toFixed(1).padStart(9)} ${unit}`);

  console.log(`Fenster: ${SECONDS} s laufendes Training, CPU 4x gedrosselt, Werte pro Minute, Look: ${LOOK || 'Standard'}${ANIM_OFF ? ', Animationen aus' : ''}`);
  row('Haupt-Thread gesamt (TaskDuration)', ms('TaskDuration'), 'ms/min');
  row('  davon JavaScript', ms('ScriptDuration'), 'ms/min');
  row('  davon Stil-Neuberechnung', ms('RecalcStyleDuration'), 'ms/min');
  row('  davon Layout', ms('LayoutDuration'), 'ms/min');
  row('Stil-Neuberechnungen', perMin(after.RecalcStyleCount - before.RecalcStyleCount), '/min');
  row('Layouts', perMin(after.LayoutCount - before.LayoutCount), '/min');
  row('requestAnimationFrame-Aufrufe', perMin(countAfter.raf - countBefore.raf), '/min');
  row('setTimeout-Aufrufe', perMin(countAfter.timeout - countBefore.timeout), '/min');
  if (b.problems.length) console.log('Probleme:', b.problems);
} finally {
  await b.close();
}
