// Takes screenshots of the screens in light and dark, iPhone-sized, into shots/ (not committed).
// For reviewing the design without a phone. The font is whatever this machine has (Segoe UI on
// Windows); on the iPhone the same CSS renders in San Francisco.
//
// Usage:  node tools/shots.mjs [width] [height]      (default 390 844)

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const WIDTH = Number(process.argv[2]) || 390;
const HEIGHT = Number(process.argv[3]) || 844;
const OUT = join(fileURLToPath(new URL('..', import.meta.url)), 'shots');
mkdirSync(OUT, { recursive: true });

const b = await launch({ servePort: 8094, cdpPort: 9338, width: WIDTH, height: HEIGHT });

async function shot(name, { full = false } = {}) {
  await sleep(450); // let transitions settle
  // full page: make the viewport as tall as the content, so fixed bars sit at the very bottom
  if (full) {
    const { cssContentSize: size } = await b.send('Page.getLayoutMetrics');
    await b.setViewport(WIDTH, Math.ceil(size.height));
    await sleep(150);
  }
  const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
  if (full) await b.setViewport(WIDTH, HEIGHT);
  const file = join(OUT, `${name}-${WIDTH}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(file);
}

const scheme = (value) =>
  b.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value }, { name: 'prefers-reduced-motion', value: 'reduce' }],
  });
const tap = (selector) => b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
const tab = async (name, ready) => {
  await tap(`#tabbar [data-nav="${name}"]`);
  await b.waitEval(ready);
};

try {
  for (const mode of ['light', 'dark']) {
    await scheme(mode);
    await b.goto();
    await shot(`home-leer-${mode}`);

    // one own circuit, so the screen shows both states
    await b.evaluate(`(async () => {
      const req = indexedDB.open('hiit-zirkel');
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const tx = db.transaction('templates', 'readwrite');
      tx.objectStore('templates').put({
        id: 't-shot', name: 'Montag Ganzkörper',
        exercises: ['Burpees', 'Klimmzüge', 'Kettlebell Swing', 'Liegestütze', 'Ausfallschritte'].map((name, i) => ({ id: 'x' + i, name, sides: false })),
        settings: { rounds: 4, workS: 45, restS: 15, roundRestS: 60, prepS: 10, warmupS: 0, cooldownS: 0 },
        createdAt: 1, updatedAt: 1, lastUsedAt: 2, sample: false,
      });
      await new Promise((res) => { tx.oncomplete = res; });
      db.close();
      return true;
    })()`);
    await b.goto();
    await shot(`home-${mode}`);
    await shot(`home-ganz-${mode}`, { full: true });

    await tab('settings', `document.querySelector('[data-segmented="theme"]')`);
    await shot(`einstellungen-${mode}`);
    await shot(`einstellungen-ganz-${mode}`, { full: true });

    await tab('library', `document.querySelector('[data-screen="library"]')`);
    await shot(`uebungen-${mode}`);
    await tab('history', `document.querySelector('[data-screen="history"]')`);
    await shot(`verlauf-${mode}`);

    await b.evaluate(`indexedDB.deleteDatabase('hiit-zirkel'); true`);
  }
  if (b.problems.length) console.log('Probleme:', b.problems);
} finally {
  await b.close();
}
