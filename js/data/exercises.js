// Built-in exercise list (draft for review, not yet used by the app).
// Muscle names: see muscles.js. `ref` documents where the muscle assignment comes from:
//   ['<name in free-exercise-db>']          taken over (muscle names mapped to the graphic)
//   ['<name in free-exercise-db>', 'note']  taken over and adjusted, note says why
//   undefined                               own proposal, no match in free-exercise-db
// free-exercise-db: https://github.com/yuhonas/free-exercise-db (Unlicense / public domain)

export const CATEGORIES = Object.freeze({
  full: 'Ganzkörper',
  upper: 'Oberkörper',
  lower: 'Unterkörper',
  core: 'Rumpf',
  cardio: 'Cardio',
});

export const EQUIPMENT = Object.freeze({
  none: 'keine',
  kettlebell: 'Kettlebell',
  pullupBar: 'Klimmzugstange',
  dipStation: 'Dipstation',
  band: 'Band',
  box: 'Box',
});

const e = (id, name, category, equipment, primaryMuscles, secondaryMuscles, sides, ref) => ({
  id, name, category, equipment, primaryMuscles, secondaryMuscles, sides, ref,
});

export const EXERCISES = [
  // Ganzkörper
  e('burpees', 'Burpees', 'full', 'none', ['quadriceps', 'chest'], ['gluteal', 'triceps', 'deltoids', 'abs'], false),
  e('bear-crawl', 'Bärengang', 'full', 'none', ['deltoids', 'quadriceps'], ['abs', 'triceps', 'chest'], false),
  e('inchworm', 'Inchworm', 'full', 'none', ['deltoids', 'abs'], ['hamstring', 'chest', 'triceps'], false,
    ['Inchworm', 'Als Walk-out mit Stütz statt als Dehnung, deshalb Schultern und Bauch als Hauptmuskeln']),
  e('kb-swing', 'Kettlebell Swing', 'full', 'kettlebell', ['hamstring', 'gluteal'], ['lower-back', 'deltoids', 'calves'], false,
    ['One-Arm Kettlebell Swings', 'Beidhändige Variante; Gesäß als Hauptmuskel ergänzt (Hüftstreckung ist der Antrieb)']),
  e('kb-swing-single', 'Kettlebell Swing einarmig', 'full', 'kettlebell', ['hamstring', 'gluteal'], ['lower-back', 'deltoids', 'calves', 'obliques'], true,
    ['One-Arm Kettlebell Swings', 'Gesäß als Hauptmuskel ergänzt, seitlicher Bauch ergänzt (Gegenhalten der Rotation)']),
  e('kb-clean', 'Kettlebell Clean', 'full', 'kettlebell', ['hamstring'], ['gluteal', 'lower-back', 'deltoids', 'trapezius'], true,
    ['One-Arm Kettlebell Clean']),
  e('kb-snatch', 'Kettlebell Snatch', 'full', 'kettlebell', ['deltoids'], ['calves', 'gluteal', 'hamstring', 'lower-back', 'trapezius', 'triceps'], true,
    ['One-Arm Kettlebell Snatch']),
  e('kb-clean-press', 'Kettlebell Clean & Press', 'full', 'kettlebell', ['deltoids', 'gluteal'], ['hamstring', 'triceps', 'trapezius', 'lower-back'], true),
  e('kb-thruster', 'Kettlebell Thruster', 'full', 'kettlebell', ['deltoids', 'quadriceps'], ['gluteal', 'triceps'], false,
    ['Kettlebell Thruster', 'Oberschenkel vorne als Hauptmuskel ergänzt (tiefe Kniebeuge), Gesäß ergänzt']),
  e('turkish-get-up', 'Turkish Get-up', 'full', 'kettlebell', ['deltoids'], ['abs', 'calves', 'hamstring', 'quadriceps', 'triceps'], true,
    ['Kettlebell Turkish Get-Up (Squat style)']),

  // Oberkörper
  e('pushups', 'Liegestütze', 'upper', 'none', ['chest'], ['deltoids', 'triceps'], false, ['Pushups']),
  e('diamond-pushups', 'Diamond-Liegestütze', 'upper', 'none', ['triceps'], ['chest', 'deltoids'], false,
    ['Push-Ups - Close Triceps Position']),
  e('pike-pushups', 'Pike Push-ups', 'upper', 'none', ['deltoids'], ['triceps', 'chest'], false),
  e('handstand-pushups', 'Handstand-Liegestütze', 'upper', 'none', ['deltoids'], ['triceps'], false, ['Handstand Push-Ups']),
  e('archer-pushups', 'Archer Push-ups', 'upper', 'none', ['chest'], ['triceps', 'deltoids'], false),
  e('clap-pushups', 'Klatsch-Liegestütze', 'upper', 'none', ['chest'], ['triceps', 'deltoids'], false),
  e('pullups', 'Klimmzüge', 'upper', 'pullupBar', ['upper-back'], ['biceps'], false, ['Pullups']),
  e('chinups', 'Klimmzüge Untergriff', 'upper', 'pullupBar', ['upper-back'], ['biceps', 'forearm'], false, ['Chin-Up']),
  e('australian-pullups', 'Australian Pull-ups', 'upper', 'pullupBar', ['upper-back'], ['biceps', 'deltoids'], false,
    ['Inverted Row', 'Bizeps und Schultern als Nebenmuskeln ergänzt']),
  e('muscle-up', 'Muscle-up', 'upper', 'pullupBar', ['upper-back'], ['abs', 'biceps', 'forearm', 'deltoids', 'trapezius', 'triceps'], false,
    ['Muscle Up']),
  e('dips', 'Dips', 'upper', 'dipStation', ['triceps'], ['chest', 'deltoids'], false, ['Dips - Triceps Version']),
  e('bench-dips', 'Dips an der Box', 'upper', 'box', ['triceps'], ['chest', 'deltoids'], false, ['Bench Dips']),
  e('kb-press', 'Kettlebell Schulterdrücken', 'upper', 'kettlebell', ['deltoids'], ['triceps'], true,
    ['One-Arm Kettlebell Military Press To The Side']),
  e('kb-row', 'Kettlebell Rudern', 'upper', 'kettlebell', ['upper-back'], ['biceps'], true, ['One-Arm Kettlebell Row']),
  e('kb-floor-press', 'Kettlebell Floor Press', 'upper', 'kettlebell', ['chest'], ['triceps'], true, ['One-Arm Kettlebell Floor Press']),
  e('kb-halo', 'Kettlebell Halo', 'upper', 'kettlebell', ['deltoids'], ['trapezius', 'triceps', 'abs'], false),
  e('band-pull-apart', 'Band Pull-aparts', 'upper', 'band', ['deltoids'], ['upper-back', 'trapezius'], false, ['Band Pull Apart']),
  e('band-row', 'Rudern mit Band', 'upper', 'band', ['upper-back'], ['biceps', 'deltoids'], false),

  // Unterkörper
  e('squats', 'Kniebeugen', 'lower', 'none', ['quadriceps'], ['gluteal', 'hamstring'], false, ['Bodyweight Squat']),
  e('jump-squats', 'Sprungkniebeugen', 'lower', 'none', ['quadriceps'], ['calves', 'gluteal', 'hamstring'], false, ['Freehand Jump Squat']),
  e('lunges', 'Ausfallschritte', 'lower', 'none', ['quadriceps'], ['calves', 'gluteal', 'hamstring'], false, ['Bodyweight Walking Lunge']),
  e('jump-lunges', 'Sprung-Ausfallschritte', 'lower', 'none', ['quadriceps'], ['gluteal', 'hamstring', 'calves'], false),
  e('lateral-lunges', 'Seitliche Ausfallschritte', 'lower', 'none', ['adductors', 'quadriceps'], ['gluteal', 'hamstring'], false),
  e('cossack-squats', 'Kosakenkniebeugen', 'lower', 'none', ['adductors', 'quadriceps'], ['gluteal', 'hamstring'], false),
  e('bulgarian-split-squat', 'Bulgarian Split Squat', 'lower', 'box', ['quadriceps', 'gluteal'], ['hamstring', 'calves'], true,
    ['Split Squats', 'Oberschenkel vorne und Gesäß als Hauptmuskeln (Datenbank führt Oberschenkel hinten als Hauptmuskel)']),
  e('pistol-squat', 'Pistol Squat', 'lower', 'none', ['quadriceps'], ['calves', 'gluteal', 'hamstring'], true,
    ['Kettlebell Pistol Squat', 'Ohne Kettlebell, deshalb Schultern weggelassen']),
  e('wall-sit', 'Wall Sit', 'lower', 'none', ['quadriceps'], ['gluteal'], false),
  e('glute-bridge', 'Beckenheben', 'lower', 'none', ['gluteal'], ['hamstring'], false, ['Butt Lift (Bridge)']),
  e('single-leg-glute-bridge', 'Beckenheben einbeinig', 'lower', 'none', ['gluteal'], ['hamstring'], true, ['Single Leg Glute Bridge']),
  e('calf-raises', 'Wadenheben', 'lower', 'none', ['calves'], [], false, ['Standing Calf Raises']),
  e('step-ups', 'Step-ups', 'lower', 'box', ['quadriceps'], ['calves', 'gluteal', 'hamstring'], true, ['Dumbbell Step Ups']),
  e('box-jumps', 'Box Jumps', 'lower', 'box', ['quadriceps', 'gluteal'], ['hamstring', 'calves'], false,
    ['Box Jump (Multiple Response)', 'Oberschenkel vorne und Gesäß als Hauptmuskeln (Datenbank führt Oberschenkel hinten), Adduktoren weggelassen']),
  e('broad-jumps', 'Weitsprünge', 'lower', 'none', ['quadriceps'], ['calves', 'gluteal', 'hamstring'], false, ['Standing Long Jump']),
  e('goblet-squat', 'Goblet Squat', 'lower', 'kettlebell', ['quadriceps'], ['calves', 'gluteal', 'hamstring', 'deltoids'], false,
    ['Goblet Squat']),
  e('kb-deadlift', 'Kettlebell Kreuzheben', 'lower', 'kettlebell', ['gluteal', 'hamstring'], ['lower-back', 'forearm'], false),
  e('kb-single-leg-deadlift', 'Kettlebell Kreuzheben einbeinig', 'lower', 'kettlebell', ['hamstring'], ['gluteal', 'lower-back'], true,
    ['Kettlebell One-Legged Deadlift']),
  e('kb-sumo-squat', 'Sumo-Kniebeuge mit Kettlebell', 'lower', 'kettlebell', ['adductors', 'gluteal'], ['quadriceps', 'hamstring'], false),
  e('band-lateral-walk', 'Seitwärtsgehen mit Band', 'lower', 'band', ['gluteal'], [], true,
    ['Monster Walk']),

  // Rumpf
  e('plank', 'Plank', 'core', 'none', ['abs'], [], false, ['Plank']),
  e('side-plank', 'Seitstütz', 'core', 'none', ['obliques'], ['abs', 'deltoids'], true,
    ['Side Bridge', 'Seitlicher statt gerader Bauch (Datenbank unterscheidet nicht)']),
  e('plank-shoulder-taps', 'Plank mit Schultertippen', 'core', 'none', ['abs'], ['obliques', 'deltoids'], false),
  e('hollow-hold', 'Hollow Hold', 'core', 'none', ['abs'], ['obliques'], false),
  e('l-sit', 'L-Sit', 'core', 'dipStation', ['abs'], ['quadriceps', 'triceps'], false),
  e('hanging-knee-raises', 'Knieheben hängend', 'core', 'pullupBar', ['abs'], [], false),
  e('hanging-leg-raises', 'Beinheben hängend', 'core', 'pullupBar', ['abs'], [], false, ['Hanging Leg Raise']),
  e('toes-to-bar', 'Toes to Bar', 'core', 'pullupBar', ['abs'], ['upper-back', 'forearm'], false),
  e('crunches', 'Crunches', 'core', 'none', ['abs'], [], false, ['Crunches']),
  e('bicycle-crunches', 'Fahrrad-Crunches', 'core', 'none', ['abs', 'obliques'], [], false,
    ['Air Bike', 'Seitlicher Bauch ergänzt (Rotation)']),
  e('russian-twists', 'Russian Twists', 'core', 'none', ['obliques'], ['abs', 'lower-back'], false,
    ['Russian Twist', 'Seitlicher Bauch als Hauptmuskel (Datenbank unterscheidet nicht)']),
  e('v-ups', 'V-ups', 'core', 'none', ['abs'], ['quadriceps'], false),
  e('leg-raises', 'Beinheben liegend', 'core', 'none', ['abs'], [], false, ['Flat Bench Lying Leg Raise']),
  e('flutter-kicks', 'Flutter Kicks', 'core', 'none', ['abs'], ['quadriceps'], false),
  e('dead-bug', 'Dead Bug', 'core', 'none', ['abs'], [], false, ['Dead Bug']),
  e('superman', 'Superman', 'core', 'none', ['lower-back'], ['gluteal', 'hamstring'], false, ['Superman']),
  e('kb-windmill', 'Kettlebell Windmill', 'core', 'kettlebell', ['obliques'], ['abs', 'gluteal', 'hamstring', 'deltoids', 'triceps'], true,
    ['Kettlebell Windmill', 'Seitlicher statt gerader Bauch als Hauptmuskel']),

  // Cardio
  e('jumping-jacks', 'Hampelmann', 'cardio', 'none', ['calves', 'quadriceps'], ['gluteal', 'deltoids', 'adductors'], false),
  e('high-knees', 'High Knees', 'cardio', 'none', ['quadriceps'], ['calves', 'abs'], false),
  e('butt-kicks', 'Anfersen', 'cardio', 'none', ['hamstring'], ['calves', 'quadriceps'], false),
  e('mountain-climbers', 'Mountain Climbers', 'cardio', 'none', ['quadriceps'], ['chest', 'hamstring', 'deltoids', 'abs'], false,
    ['Mountain Climbers', 'Bauch als Nebenmuskel ergänzt (Stütz)']),
  e('skater-jumps', 'Skater Jumps', 'cardio', 'none', ['adductors'], ['gluteal', 'calves', 'hamstring', 'quadriceps'], false,
    ['Lateral Bound']),
  e('star-jumps', 'Strecksprünge', 'cardio', 'none', ['quadriceps'], ['calves', 'gluteal', 'hamstring', 'deltoids'], false, ['Star Jump']),
  e('tuck-jumps', 'Hocksprünge', 'cardio', 'none', ['quadriceps'], ['gluteal', 'calves', 'hamstring', 'abs'], false,
    ['Knee Tuck Jump', 'Oberschenkel vorne statt hinten als Hauptmuskel, Bauch ergänzt (Knie anziehen), Adduktoren weggelassen']),
  e('plank-jacks', 'Plank Jacks', 'cardio', 'none', ['abs'], ['deltoids', 'adductors', 'gluteal'], false),
  e('shadow-boxing', 'Schattenboxen', 'cardio', 'none', ['deltoids'], ['triceps', 'obliques', 'calves'], false),
  e('running-in-place', 'Sprint auf der Stelle', 'cardio', 'none', ['quadriceps', 'calves'], ['hamstring', 'gluteal'], false),
  e('side-shuffle', 'Side Shuffle', 'cardio', 'none', ['quadriceps', 'adductors'], ['gluteal', 'calves'], false),
];
