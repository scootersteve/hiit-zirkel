// App entry point: holds the settings and switches between the screens.
// Settings live in memory for now; saving them (IndexedDB) comes with the data step.

import { showHome } from './ui/home.js';
import { showRun } from './ui/run.js';
import { showDone } from './ui/done.js';

const settings = {
  soundMode: 'playback', // "Immer hörbar"; "ambient" = Musik-Modus
  volume: 0.8,
  voice: true,
  countdownBeeps: true,
  halfwayBeep: false,
};

const root = document.getElementById('app');

function home() {
  showHome(root, { settings, onStart: run });
}

// Called synchronously from the Start tap, so audio can be unlocked (iOS rule).
function run(circuit) {
  showRun(root, {
    circuit,
    settings,
    onEnd: (result) => showDone(root, { result, onRepeat: () => run(circuit), onHome: home }),
  });
}

home();
