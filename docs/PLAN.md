# Plan Zirkel Dojo (freigegeben 09.10.2026)

Anforderungen und Quellen liegen in der Projektnotiz im privaten Vault. Hier steht nur, was für den Code gilt.

## Architektur

Kein Framework, kein Build-Schritt. Drei Schichten:

| Schicht | Inhalt | Getestet |
|---|---|---|
| `js/core/` | Reine Logik ohne DOM: Ablaufplan, Timer, Signale, Übungssuche/Dubletten, Export/Import, Teilen-Link | `node --test` |
| `js/storage/`, `js/platform/` | IndexedDB, Web Audio, Sprachansage, Wake Lock | Browser + iPhone-Checkliste |
| `js/ui/` | Bildschirme als Funktionen, Hash-Router | Browser |

## Timer

Ablaufplan = flache Liste von Phasen, einmal aus den Einstellungen erzeugt. Phasen mit 0 s entstehen gar nicht.

```
[Vorlauf][Aufwärmen][Ü1][Pause][Ü2]…[Ü6][Rundenpause][Ü1]…[Ü6][Cool-down]
type = prep | warmup | work | rest | roundRest | cooldown
```

Dauer = Vorlauf + Aufwärmen + Runden × (Übungen × Belastung + (Übungen − 1) × Pause) + (Runden − 1) × Rundenpause + Cool-down

Zustandsautomat:

```
ready ──start──▶ running ──pause──▶ paused
                    ▲                  │
                    └──────resume──────┘
running ── Zeit über letzte Phase / Überspringen der letzten Phase ──▶ finished
running | paused ── Abbrechen (nach Rückfrage) ──▶ aborted
```

- Die Uhrzeit wird jeder Funktion übergeben (testbar mit künstlicher Uhr). Basis im Browser: `Date.now()`.
- Phasenwechsel entstehen nur durch Rechnen, nie durch Hochzählen.
- Überspringen, Zurück, +10 s gehen auch im pausierten Zustand, der Status bleibt.
- Verpasste Signale (Lücke > 1,5 s, z.B. nach App-Wechsel) werden nicht nachgeholt.
- Ansage nur, wenn die Phase lang genug für Ansage + 3 s Countdown + 1 s Puffer ist. Der erste Countdown-Ton bricht eine laufende Ansage ab.

## Begriffe für Verlauf und Anzeige

- **Tatsächliche Dauer** = gesamte Workout-Zeit vom Start bis zum Ende, inklusive Vorlauf, Belastungen, Pausen, Rundenpausen und Cool-down. Nicht enthalten ist nur die Zeit, in der die Pause-Taste gedrückt war (Anforderung: "Die Pausenzeit zählt nicht zur verstrichenen Trainingszeit").
- **Verstrichene Trainingszeit** (oben im Timer) = dieselbe Rechnung, live.
- **Absolvierte Runde** = ihre letzte Belastung ist zu Ende (durch Zeitablauf oder Überspringen).
- Der Hinweis "Neue Version verfügbar" erscheint nie während eines laufenden Trainings.

## Datenmodell (IndexedDB `hiit-zirkel`, Version 1)

```js
// customExercises (Startliste liegt als JS-Modul im Code)
{ id: "c-x7k2", name, category, equipment, primaryMuscles: ["chest"], secondaryMuscles: ["triceps"],
  sides: false, custom: true, createdAt, updatedAt }

// templates
{ id, name, exercises: [{ id, name }],
  settings: { rounds, workS, restS, roundRestS, prepS, warmupS, cooldownS },
  createdAt, updatedAt, lastUsedAt, sample: false }

// history (Kopie des Zirkels zum Trainingszeitpunkt)
{ id, startedAt, endedAt, templateId, circuit: { name, exercises: [{ id, name, sides }], settings },
  plannedS, actualS, roundsCompleted, status: "completed" | "aborted" }

// kv
settings:      { soundMode: "playback" | "ambient", volume: 0.8, voice: true, voiceURI: null,
                 countdownBeeps: true, halfwayBeep: false, theme: "dark", animations: true }
exerciseUsage: { "<exerciseId>": <timestamp> }

// media (nur auf dem Gerät, nicht im Export, nicht im Teilen-Link)
background, sound-roundDone, sound-end als Blob
```

- Muskelgruppen nutzen direkt die Namen der Grafik aus react-native-body-highlighter (MIT): `chest, abs, obliques, deltoids, biceps, triceps, forearm, trapezius, upper-back, lower-back, gluteal, quadriceps, hamstring, adductors, calves, tibialis, neck`.
- Export: `{ format: "hiit-zirkel-backup", version: 1, exportedAt, customExercises, exerciseUsage, templates, history, settings }`.
- Teilen-Link: Zirkel als base64url im Hash (`#share=…`), wird nie an den Server geschickt.

## Reihenfolge

0. Repo, GitHub Pages
1. Ton-Machbarkeitstest (`soundtest/`)
2. Timer-Logik + Tests
3. Startliste zur Prüfung
4. Timer-Anzeige mit Ton → Version auf Pages
5. Übungsliste, eigene Übungen, Auswahl
6. Zirkel-Editor, Vorlagen, Verlauf
7. Offline, Installation, Update-Hinweis → Version auf Pages
8. Export/Import, Teilen-Link
9. Muskelgrafik, Anime-Themes, Personalisierung, Feinschliff

## Getroffene Entscheidungen

- Repo-Name `hiit-zirkel` bleibt fest (steckt in der URL). Der App-Name steht im Manifest und ist änderbar.
- App-Name: Zirkel Dojo.
- Tests der Datenhaltung ohne Paket: Speicher-Schnittstelle mit IndexedDB- und In-Memory-Umsetzung.
- Ton-Test mit `auto`, `playback`, `ambient`, `transient`, `transient-solo`, `<audio>`-Element, Sprachansage, jeweils im Safari-Tab und als Home-Bildschirm-App.
- Lizenz eigener Code: MIT.
