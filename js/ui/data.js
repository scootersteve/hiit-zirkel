// Backup screen: download everything as a JSON file, or read a backup back in (merge import).
// Media (background image, own sounds) is device-only and never part of a backup.

import { buildBackup, parseBackup } from '../core/transfer.js';

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const today = () => new Date().toISOString().slice(0, 10);

export function showData(root, { db, onBack }) {
  root.innerHTML = `
    <main class="page">
      <header class="lib-head">
        <button class="icon-btn" data-action="back" aria-label="Zurück">‹ Zurück</button>
        <h1>Daten</h1>
        <span></span>
      </header>

      <h2>Sicherung</h2>
      <section class="card">
        <p class="mode-hint">Alle eigenen Übungen, Zirkel, der Verlauf und die Einstellungen als Datei. Hintergrundbild und eigene Töne sind nicht enthalten (bleiben nur auf dem Gerät).</p>
        <button class="btn primary" data-action="export">Sicherung herunterladen</button>
      </section>

      <h2>Importieren</h2>
      <section class="card">
        <p class="mode-hint">Eine Sicherung einlesen. Vorhandenes bleibt erhalten, gleiche Einträge werden überschrieben.</p>
        <label class="btn" for="import-file">Datei auswählen</label>
        <input id="import-file" type="file" accept="application/json,.json" data-el="import" hidden>
        <p class="mode-hint" data-el="status" hidden></p>
      </section>
    </main>`;

  const status = root.querySelector('[data-el="status"]');
  const setStatus = (msg, ok = true) => {
    status.textContent = msg;
    status.hidden = false;
    status.classList.toggle('err', !ok);
  };

  root.querySelector('main').addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.action;
    if (action === 'back') onBack();
    else if (action === 'export') exportBackup();
  });

  async function exportBackup() {
    try {
      const backup = buildBackup(await db.collectData());
      download(`zirkel-dojo-${today()}.json`, JSON.stringify(backup, null, 2));
      setStatus('Sicherung heruntergeladen.');
    } catch (err) {
      setStatus('Export fehlgeschlagen: ' + err.message, false);
    }
  }

  root.querySelector('[data-el="import"]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const counts = await db.importData(parseBackup(await file.text()));
      setStatus(`Importiert: ${counts.customExercises} Übungen, ${counts.templates} Zirkel, ${counts.history} Verlaufseinträge.`);
    } catch (err) {
      setStatus('Import fehlgeschlagen: ' + err.message, false);
    } finally {
      event.target.value = ''; // lets the same file be chosen again
    }
  });
}
