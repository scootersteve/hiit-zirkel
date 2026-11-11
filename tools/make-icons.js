// Renders the app icon PNGs from the SVG sources (icons/icon.svg, icons/icon-maskable.svg).
// No packages: starts a headless Google Chrome through tools/cdp.mjs, shows each SVG in a page of
// the exact pixel size (deviceScaleFactor 1) and saves the screenshot as PNG. Needs Google Chrome
// (or set CHROME=/path/to/chrome). favicon.svg is used by the browser as is and needs no PNG.
//
// Usage:  npm run icons     (or: node tools/make-icons.js)
// Writes: apple-touch-icon.png (180), icon-192.png, icon-512.png, icon-maskable-512.png

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TARGETS = [
  { file: 'apple-touch-icon.png', size: 180, source: 'icons/icon.svg' },
  { file: 'icon-192.png', size: 192, source: 'icons/icon.svg' },
  { file: 'icon-512.png', size: 512, source: 'icons/icon.svg' },
  { file: 'icon-maskable-512.png', size: 512, source: 'icons/icon-maskable.svg' },
];

const b = await launch({ servePort: 8122, cdpPort: 9362 });

try {
  for (const { file, size, source } of TARGETS) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await b.send('Page.navigate', { url: `${b.base}${source}` });
    await b.waitEval(`document.readyState === 'complete' && document.documentElement.localName === 'svg'`);
    await sleep(150);
    const { data } = await b.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
    });
    writeFileSync(join(ROOT, file), Buffer.from(data, 'base64'));
    console.log(`${file}  ${size}x${size}  from ${source}`);
  }
} finally {
  await b.close();
}
