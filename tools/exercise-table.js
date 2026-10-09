// Generates docs/uebungsliste.md (review table) from js/data/exercises.js.
// Usage: node tools/exercise-table.js

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXERCISES, CATEGORIES, EQUIPMENT } from '../js/data/exercises.js';
import { MUSCLES } from '../js/data/muscles.js';

const muscles = (list) => (list.length ? list.map((m) => MUSCLES[m]).join(', ') : '–');
const notes = [];
const source = (ref) => {
  if (!ref) return 'eigener Vorschlag';
  if (ref.length === 1) return `DB: ${ref[0]}`;
  notes.push(ref[1]);
  return `DB: ${ref[0]}, angepasst (${notes.length})`;
};

const lines = [
  '# Übungsliste (Entwurf zur Prüfung)',
  '',
  `${EXERCISES.length} Übungen. Erzeugt aus \`js/data/exercises.js\` mit \`node tools/exercise-table.js\`. Änderungen bitte in der JS-Datei, nicht hier.`,
  '',
  '**Spalte Quelle:**',
  '- `DB: <Name>`: Muskeln aus [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (gemeinfrei) übernommen, Eintrag mit diesem Namen. Muskelnamen auf die Gruppen der Grafik übertragen (z.B. Latissimus und mittlerer Rücken → Oberer Rücken, Abduktoren → Gesäß).',
  '- `angepasst (n)`: übernommen und bewusst geändert, Grund in den Anmerkungen unten.',
  '- `eigener Vorschlag`: Übung fehlt in der Datenbank, Zuordnung ist ein Vorschlag ohne externe Quelle. Hier lohnt das Prüfen am meisten.',
  '',
  '**Seitenwechsel = ja:** Die App sagt zur Halbzeit der Belastung "Seite wechseln". Übungen, die man im Wechsel macht (z.B. Ausfallschritte), stehen auf nein.',
  '',
  'Hüftbeuger und Abduktoren gibt es in der Grafik nicht, sie fehlen deshalb in der Liste.',
  '',
];

for (const [key, label] of Object.entries(CATEGORIES)) {
  const rows = EXERCISES.filter((e) => e.category === key);
  lines.push(`## ${label} (${rows.length})`, '');
  lines.push('| Name | Ausrüstung | Hauptmuskeln | Nebenmuskeln | Seitenwechsel | Quelle |');
  lines.push('|---|---|---|---|---|---|');
  for (const e of rows) {
    lines.push(
      `| ${e.name} | ${EQUIPMENT[e.equipment]} | ${muscles(e.primaryMuscles)} | ${muscles(e.secondaryMuscles)} | ${e.sides ? 'ja' : 'nein'} | ${source(e.ref)} |`,
    );
  }
  lines.push('');
}

lines.push('## Anmerkungen zu den Anpassungen', '');
notes.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
lines.push('');

const out = fileURLToPath(new URL('../docs/uebungsliste.md', import.meta.url));
writeFileSync(out, lines.join('\n'));
console.log(`docs/uebungsliste.md written (${EXERCISES.length} exercises)`);
