// Sample circuits shipped with the app. Exercises are stored as snapshots ({ id, name, sides }),
// like templates will be later.

const x = (id, name, sides = false) => ({ id, name, sides });

export const SAMPLE_CIRCUITS = [
  {
    id: 'sample-circuit',
    name: 'Beispiel-Zirkel',
    exercises: [
      x('burpees', 'Burpees'),
      x('squats', 'Kniebeugen'),
      x('pushups', 'Liegestütze'),
      x('mountain-climbers', 'Mountain Climbers'),
      x('lunges', 'Ausfallschritte'),
      x('plank', 'Plank'),
    ],
    // = acceptance test from the requirements: 20:10 min
    settings: { rounds: 3, workS: 40, restS: 20, roundRestS: 90, prepS: 10, warmupS: 0, cooldownS: 0 },
  },
  {
    id: 'sample-tabata',
    name: 'Klassisches Tabata',
    exercises: [x('burpees', 'Burpees')],
    // 20 s on, 10 s off, 8 rounds; with one exercise the 10 s break is the round rest
    settings: { rounds: 8, workS: 20, restS: 10, roundRestS: 10, prepS: 10, warmupS: 0, cooldownS: 0 },
  },
  {
    id: 'sample-quick',
    name: 'Schnelltest (alle Signale)',
    exercises: [x('jumping-jacks', 'Hampelmann'), x('side-plank', 'Seitstütz', true), x('squats', 'Kniebeugen')],
    // 10 s rest: just enough for "Pause. Als Nächstes: …" before the countdown
    settings: { rounds: 2, workS: 16, restS: 10, roundRestS: 12, prepS: 5, warmupS: 0, cooldownS: 0 },
  },
];
