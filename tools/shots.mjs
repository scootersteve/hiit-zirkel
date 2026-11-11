// Takes screenshots of the screens in light and dark, iPhone-sized, into shots/ (not committed).
// For reviewing the design without a phone. The font is whatever this machine has (Segoe UI on
// Windows); on the iPhone the same CSS renders in San Francisco.
//
// Usage:  node tools/shots.mjs [width] [height] [look]      (default 390 844, standard design;
//         look = a name from js/data/looks.js, the files then carry it in their name)

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const WIDTH = Number(process.argv[2]) || 390;
const HEIGHT = Number(process.argv[3]) || 844;
const LOOK = process.argv[4] || '';
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
  const file = join(OUT, `${name}${LOOK ? `-${LOOK}` : ''}-${WIDTH}.png`);
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
    // choose the look the way a user does, so it is stored and survives the reloads below
    if (LOOK) {
      await tab('settings', `document.querySelector('[data-look]')`);
      await tap(`[data-look="${LOOK}"]`);
      await sleep(800);
      await b.goto();
      await b.evaluate(`document.fonts.ready.then(() => true)`);
    }
    await shot(`home-leer-${mode}`);

    // one own circuit, so the screen shows both states
    await b.evaluate(`(async () => {
      const req = indexedDB.open('hiit-zirkel');
      const db = await new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const tx = db.transaction('templates', 'readwrite');
      tx.objectStore('templates').put({
        id: 't-shot', name: 'Montag Ganzkörper',
        exercises: [['burpees', 'Burpees'], ['pullups', 'Klimmzüge'], ['kb-swing', 'Kettlebell Swing'], ['pushups', 'Liegestütze'], ['lunges', 'Ausfallschritte']].map(([id, name]) => ({ id, name, sides: false })),
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

    // editor, picker, own-exercise form, delete sheet
    await tap('[data-card="edit"][data-kind="template"]');
    await b.waitEval(`document.querySelector('[data-screen="editor"]')`);
    await shot(`editor-${mode}`);
    await shot(`editor-ganz-${mode}`, { full: true });
    await tap('[data-screen="editor"] [data-action="delete"]');
    await b.waitEval(`document.querySelector('dialog.sheet[open]')`);
    await shot(`sheet-${mode}`);
    await tap('dialog.sheet [data-sheet="cancel"]');
    await sleep(400);
    await tap('[data-screen="editor"] [data-action="add"]');
    await b.waitEval(`document.querySelector('[data-screen="picker"]')`);
    await shot(`auswahl-${mode}`);
    await tap('[data-screen="picker"] [data-action="add"]');
    await b.waitEval(`document.querySelector('dialog.form-sheet[open]')`);
    await tap('[data-muscle="primary:gluteal"]');
    await tap('[data-muscle="secondary:hamstring"]');
    await shot(`eigene-uebung-${mode}`);
    await tap('dialog.form-sheet [data-action="cancel"]');
    await sleep(400);
    await tap('[data-screen="picker"] [data-action="back"]');
    await b.waitEval(`document.querySelector('[data-screen="editor"]')`);
    await tap('[data-screen="editor"] [data-action="back"]');
    await b.waitEval(`document.querySelector('[data-nav="new"]')`);

    // training: one shot per phase, then the end screen
    await tap('[data-card="start"][data-id="sample-quick"]');
    await b.waitEval(`document.querySelector('.run')`);
    await shot(`lauf-vorlauf-${mode}`);
    const skipTo = async (phase) => {
      for (let i = 0; i < 12; i++) {
        if (await b.evaluate(`document.querySelector('.run')?.dataset.phase === ${JSON.stringify(phase)}`)) return;
        await tap('[data-action="skip"]');
        await sleep(420);
      }
    };
    await skipTo('work');
    await sleep(2500); // let the ring and bar move a little
    await shot(`lauf-belastung-${mode}`);
    await skipTo('rest');
    await shot(`lauf-pause-${mode}`);
    await skipTo('roundRest');
    await shot(`lauf-rundenpause-${mode}`);
    await tap('[data-action="toggle"]');
    await sleep(300);
    await shot(`lauf-pausiert-${mode}`);
    for (let i = 0; i < 12 && (await b.evaluate(`!!document.querySelector('.run')`)); i++) {
      await tap('[data-action="skip"]');
      await sleep(420);
    }
    await b.waitEval(`document.querySelector('[data-screen="done"]')`);
    await shot(`abschluss-${mode}`);
    await tap('[data-action="home"]');
    await b.waitEval(`document.querySelector('[data-nav="new"]')`);

    await tab('settings', `document.querySelector('[data-segmented="theme"]')`);
    await shot(`einstellungen-${mode}`);
    await shot(`einstellungen-ganz-${mode}`, { full: true });

    await tab('library', `document.querySelector('[data-screen="library"]')`);
    await shot(`uebungen-${mode}`);
    await tap('[data-info="burpees"]');
    await b.waitEval(`document.querySelector('dialog.form-sheet[open] .body-fig')`);
    await shot(`uebung-muskeln-${mode}`);
    await tap('dialog.form-sheet [data-action="cancel"]');
    await sleep(400);
    await tab('history', `document.querySelector('[data-screen="history"]')`);
    await shot(`verlauf-${mode}`);

    await b.evaluate(`indexedDB.deleteDatabase('hiit-zirkel'); true`);
  }
  if (b.problems.length) console.log('Probleme:', b.problems);
} finally {
  await b.close();
}
