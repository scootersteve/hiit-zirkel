// Generates our own short WAV tones (16-bit mono PCM). No third-party sounds.
// Usage: node tools/make-sounds.js

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RATE = 44100;

// segments: [{ freq, ms }] where freq 0 = silence
function tone(segments, volume = 0.8) {
  const samples = [];
  for (const { freq, ms } of segments) {
    const n = Math.round((RATE * ms) / 1000);
    const fade = Math.min(Math.round(RATE * 0.008), n / 2); // 8 ms fade in/out, avoids clicks
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / fade, (n - 1 - i) / fade);
      const t = i / RATE;
      // sine plus a bit of 3rd harmonic: cuts through music better than a pure sine
      const s = freq ? Math.sin(2 * Math.PI * freq * t) * 0.8 + Math.sin(2 * Math.PI * freq * 3 * t) * 0.2 : 0;
      samples.push(s * env * volume);
    }
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const out = (name) => fileURLToPath(new URL('../soundtest/' + name, import.meta.url));

// Same pattern as the Web Audio test beep, so both variants sound alike.
writeFileSync(out('beep.wav'), wav(tone([{ freq: 880, ms: 400 }])));
console.log('soundtest/beep.wav written');
