import { STRONG_EXERCISE_SEED, STRONG_HISTORY_SEED } from "./strong-history.js";

export const DB_VERSION = 5;
export const LOCATION_OPTIONS = ["Balmain Fitness", "SCOS"];
export const LEGACY_LOCATION_RENAMES = {
  "Other Gym": "SCOS"
};
const EQUIPMENT_NAME_LABELS = [
  "Smith Machine",
  "Plate Loaded",
  "Bodyweight",
  "Kettlebell",
  "Dumbbell",
  "Barbell",
  "Assisted",
  "Machine",
  "Cable",
  "Band"
];

export function normalizeLocationName(location) {
  const value = String(location ?? "").trim();
  return LEGACY_LOCATION_RENAMES[value] ?? value;
}

export function formatEquipmentLabel(equipment) {
  return String(equipment ?? "")
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatExerciseDisplayName(exercise) {
  if (!exercise) return "Unknown";
  const name = normalizeExerciseName(exercise.name, exercise.equipment);
  const equipment = formatEquipmentLabel(exercise.equipment);
  return equipment ? `${name} · ${equipment}` : name;
}

export function normalizeExerciseRecord(exercise) {
  if (!exercise || typeof exercise !== "object") return exercise;
  const equipment = String(exercise.equipment ?? "").trim();
  return {
    ...exercise,
    name: normalizeExerciseName(exercise.name, equipment),
    equipment,
    location: normalizeLocationName(exercise.location)
  };
}

export function normalizeExerciseName(name, equipment = "") {
  let value = String(name ?? "").trim();
  if (!value) return "";
  const labels = equipmentNameLabels(equipment);

  value = value.replace(/\s*\(([^)]*)\)/g, (_match, content) => {
    const parts = String(content)
      .split(/\s*-\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !isExerciseMetadataLabel(part, labels));
    return parts.length ? ` (${parts.join(" - ")})` : "";
  });

  for (const label of labels) {
    const pattern = new RegExp(`(^|\\s+)${escapeRegExp(label)}(?=\\s+|$|\\s*\\()`, "gi");
    value = value.replace(pattern, " ");
  }

  return value.replace(/\s{2,}/g, " ").trim();
}

function equipmentNameLabels(equipment) {
  const labels = new Set(EQUIPMENT_NAME_LABELS);
  const current = formatEquipmentLabel(equipment);
  if (current) labels.add(current);
  return [...labels].sort((a, b) => b.length - a.length);
}

function isExerciseMetadataLabel(value, labels) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (LOCATION_OPTIONS.some((location) => location.toLowerCase() === normalized)) return true;
  return labels.some((label) => label.toLowerCase() === normalized);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const DEFAULT_SETTINGS = {
  unit: "kg",
  defaultRepMin: 8,
  defaultRepMax: 12,
  defaultTargetRpe: 8,
  safetyMode: "conservative",
  homeLocation: LOCATION_OPTIONS[0],
  lastWorkoutLocation: LOCATION_OPTIONS[0],
  workoutLocations: [...LOCATION_OPTIONS]
};

const BASE_EXERCISE_SEED = [
  exercise("chest-press-plate-loaded", "Chest Press Plate Loaded", "Chest", "plate-loaded", "SCOS", 2.5, 1, 4),
  exercise("iso-lateral-row-machine", "Iso-Lateral Row (Machine)", "Back", "machine", "Balmain Fitness", 2.5, 1, 3),
  exercise("lat-pulldown-plate-loaded", "Lat Pulldown (Plate Loaded)", "Back", "plate-loaded", "SCOS", 2.5, 1, 3),
  exercise("lateral-raise-cable", "Lateral Raise (Cable)", "Shoulders", "cable", "Balmain Fitness", 1.25, 1, 4),
  exercise("exercise-f7a9c5c5-740f-4184-b59a-8419073a38ec", "Lateral Raise", "Shoulders", "cable", "SCOS", 1.25, 1, 4),
  exercise("shoulder-press-plate-loaded", "Shoulder Press (Plate Loaded)", "Shoulders", "plate-loaded", "Balmain Fitness", 2.5, 1, 3),
  exercise("triceps-pushdown-cable-straight-bar", "Triceps Pushdown (Cable - Straight Bar)", "Arms", "cable", "Balmain Fitness", 2.5, 1, 3),
  exercise("exercise-eb39ef7c-0b34-4ac5-9563-a916d7e846c0", "Triceps Pushdown", "Arms", "cable", "SCOS", 2.5, 1, 3),
  exercise("bicep-curl-cable", "Bicep Curl (Cable)", "Arms", "cable", "Balmain Fitness", 2.5, 1, 4),
  exercise("exercise-09c574ef-d834-42ae-b88e-2c3780324daa", "Bicep Curl", "Arms", "cable", "SCOS", 2.5, 1, 4),
  exercise("jpg-kneeled-lat-pulldown-single-arm", "JPG Kneeled Lat Pulldown Single Arm", "Back", "cable", "Balmain Fitness", 1.25, 1, 4, { repMin: 20, repMax: 28 }),
  exercise("exercise-1015a3a3-3c64-4f06-b7f3-c924cdec1115", "JPG Kneeled Lat Pulldown Single Arm", "Back", "cable", "SCOS", 1.25, 1, 4, { repMin: 20, repMax: 28 }),
  exercise("pull-up-assisted", "Pull Up (Assisted)", "Back", "assisted", "Balmain Fitness", 1, 1, 3, { loadMode: "assisted" }),
  exercise("exercise-4a3c6744-330c-4542-af4f-71dba7a15d4e", "Pull Up", "Back", "assisted", "SCOS", 1, 1, 3, { loadMode: "assisted" }),
  exercise("rear-deltoid-fly", "Rear Deltoid Fly", "Back", "machine", "Balmain Fitness", 1, 1, 4),
  exercise("seated-row-plate-loaded-balmain", "Seated Row Plate Loaded (Balmain Fitness)", "Back", "plate-loaded", "Balmain Fitness", 2.5, 1, 3),
  exercise("chest-press-machine-balmain", "Chest Press Machine (Balmain Fitness)", "Chest", "machine", "Balmain Fitness", 2.5, 1, 5),
  exercise("exercise-12709b75-3c13-4900-bb56-749876dad9d9", "Chest Press", "Chest", "machine", "SCOS", 2.5, 1, 5),
  exercise("knee-raise-captains-chair", "Knee Raise (Captain's Chair)", "Core", "bodyweight", "Balmain Fitness", 1, 0, 4, { loadMode: "bodyweight" }),
  exercise("seated-row-plate-loaded", "Seated Row Plate Loaded", "Back", "plate-loaded", "SCOS", 2.5, 1, 3),
  exercise("shoulder-press-machine", "Shoulder Press (Machine)", "Shoulders", "machine", "SCOS", 2.5, 1, 3),
  exercise("lat-pulldown-cable-split-handles", "Lat Pulldown (Cable) (Split Hand Grips)", "Back", "cable", "SCOS", 2.5, 1, 3),
  exercise("iso-lateral-chest-press-machine", "Iso-Lateral Chest Press (Machine)", "Chest", "machine", "SCOS", 2.5, 1, 4),
  exercise("lat-pulldown-cable", "Lat Pulldown (Cable)", "Back", "cable", "Balmain Fitness", 1.25, 1, 4),
  exercise("exercise-a59c0b14-4314-43ae-8cf2-73709d076157", "Lat Pulldown", "Back", "cable", "SCOS", 1.25, 1, 4),
  exercise("incline-bench-press-dumbbell", "Incline Bench Press (Dumbbell)", "Chest", "dumbbell", "SCOS", 2, 2, 3),
  exercise("exercise-c334aa8a-e12b-4568-a84b-cb292afa3abd", "Leg Extension", "Legs", "machine", "Balmain Fitness", 2.5, 1, 3),
  exercise("leg-extension-machine", "Leg Extension (Machine)", "Legs", "machine", "SCOS", 2.5, 1, 3),
  exercise("seated-calf-raise-plate-loaded", "Seated Calf Raise (Plate Loaded)", "Legs", "plate-loaded", "Balmain Fitness", 2.5, 0, 3),
  exercise("exercise-0962feec-ce41-4ebd-ab1d-f37dbbb234d5", "Seated Leg Curl", "Legs", "machine", "Balmain Fitness", 2.5, 1, 2),
  exercise("seated-leg-curl-machine", "Seated Leg Curl (Machine)", "Legs", "machine", "SCOS", 2.5, 1, 2),
  exercise("exercise-d6829ae9-edfa-408b-a929-737dc9a0a236", "Seated Leg Press", "Legs", "machine", "Balmain Fitness", 2.5, 2, 2),
  exercise("seated-leg-press-machine", "Seated Leg Press (Machine)", "Legs", "machine", "SCOS", 2.5, 2, 2),
  exercise("exercise-4c61fe47-6aa8-4545-8545-609b95b4ac3d", "Leg Press", "Legs", "plate-loaded", "Balmain Fitness", 5, 3, 3),
  exercise("forearm-curl-side-body", "Forearm Curl Side Body", "Arms", "dumbbell", "SCOS", 2, 0, 4),
  exercise("lateral-raise-dumbbell", "Lateral Raise (Dumbbell)", "Shoulders", "dumbbell", "Balmain Fitness", 2, 0, 3),
  exercise("seated-overhead-press-dumbbell", "Seated Overhead Press (Dumbbell)", "Shoulders", "dumbbell", "SCOS", 2, 0, 3),
  exercise("seated-lateral-raise", "Seated Lateral Raise", "Shoulders", "dumbbell", "Balmain Fitness", 2, 0, 4),
  exercise("leg-press", "Leg Press", "Legs", "plate-loaded", "SCOS", 5, 3, 3),
  exercise("incline-bench-press-barbell", "Incline Bench Press (Barbell)", "Chest", "barbell", "SCOS", 2.5, 3, 3),
  exercise("pec-deck-machine", "Pec Deck (Machine)", "Chest", "machine", "SCOS", 2.5, 1, 3),
  exercise("chin-up", "Chin Up", "Back", "bodyweight", "SCOS", 1, 0, 2, { loadMode: "bodyweight" }),
  exercise("diverging-row", "Diverging Row", "Back", "machine", "SCOS", 2.5, 2, 4),
  exercise("exercise-dbaa3593-0a24-4e47-8354-86696244d1f0", "Shoulder Press", "Shoulders", "machine", "Balmain Fitness", 2.5, 1, 3),
  exercise("exercise-60aa89f0-153a-4e22-899f-936705c2b176", "Shoulder Press", "Shoulders", "plate-loaded", "SCOS", 2.5, 1, 3),
  exercise("pull-up", "Pull Up", "Back", "bodyweight", "SCOS", 1, 0, 3, { loadMode: "bodyweight" }),
  exercise("bicep-curl-dumbbell", "Bicep Curl (Dumbbell)", "Arms", "dumbbell", "Home", 2, 0, 3)
];

export const EXERCISE_SEED = mergeExerciseSeeds(BASE_EXERCISE_SEED, STRONG_EXERCISE_SEED);

export const TEMPLATE_SEED = [
  template("legs-balmain", "Legs - Balmain Fitness", "Balmain Fitness", [
    ["exercise-d6829ae9-edfa-408b-a929-737dc9a0a236", 2, 2],
    ["exercise-4c61fe47-6aa8-4545-8545-609b95b4ac3d", 3, 3],
    ["exercise-c334aa8a-e12b-4568-a84b-cb292afa3abd", 1, 3],
    ["exercise-0962feec-ce41-4ebd-ab1d-f37dbbb234d5", 1, 2],
    ["seated-calf-raise-plate-loaded", 0, 3]
  ]),
  template("pull-balmain", "Pull - Balmain Fitness", "Balmain Fitness", [
    ["pull-up-assisted", 1, 3],
    ["rear-deltoid-fly", 1, 4],
    ["seated-row-plate-loaded-balmain", 1, 3],
    ["jpg-kneeled-lat-pulldown-single-arm", 1, 4],
    ["bicep-curl-cable", 1, 4]
  ]),
  template("push-balmain", "Push - Balmain Fitness", "Balmain Fitness", [
    ["chest-press-machine-balmain", 3, 3],
    ["shoulder-press-plate-loaded", 1, 3],
    ["knee-raise-captains-chair", 0, 4],
    ["triceps-pushdown-cable-straight-bar", 2, 3],
    ["lateral-raise-cable", 1, 4]
  ]),
  template("legs-scos", "Legs - SCOS", "SCOS", [
    ["seated-leg-press-machine", 2, 2],
    ["leg-press", 3, 3],
    ["leg-extension-machine", 1, 3],
    ["seated-leg-curl-machine", 1, 2]
  ]),
  template("pull-scos", "Pull - SCOS", "SCOS", [
    ["exercise-4a3c6744-330c-4542-af4f-71dba7a15d4e", 1, 3],
    ["diverging-row", 2, 4],
    ["seated-row-plate-loaded", 1, 3],
    ["exercise-1015a3a3-3c64-4f06-b7f3-c924cdec1115", 1, 4],
    ["exercise-09c574ef-d834-42ae-b88e-2c3780324daa", 1, 4]
  ]),
  template("push-scos", "Push - SCOS", "SCOS", [
    ["chest-press-plate-loaded", 2, 3],
    ["exercise-60aa89f0-153a-4e22-899f-936705c2b176", 1, 3],
    ["knee-raise-captains-chair", 0, 4],
    ["exercise-eb39ef7c-0b34-4ac5-9563-a916d7e846c0", 2, 3],
    ["exercise-f7a9c5c5-740f-4184-b59a-8419073a38ec", 1, 4]
  ]),
  template("upper-scos", "Upper - SCOS", "SCOS", [
    ["chest-press-plate-loaded", 1, 4],
    ["lat-pulldown-plate-loaded", 1, 3],
    ["exercise-60aa89f0-153a-4e22-899f-936705c2b176", 1, 3],
    ["seated-row-plate-loaded", 1, 3],
    ["exercise-eb39ef7c-0b34-4ac5-9563-a916d7e846c0", 2, 3],
    ["exercise-09c574ef-d834-42ae-b88e-2c3780324daa", 1, 3]
  ])
];

const SCREENSHOT_HISTORY_SEED = [
  performance("chest-press-plate-loaded", "Back Bis", "Balmain Fitness", "2026-06-01T11:17:00+10:00", [
    warmup(40, 12), working(60, 12), working(80, 8), working(70, 10), working(70, 10)
  ]),
  performance("iso-lateral-row-machine", "Back Bis", "Balmain Fitness", "2026-06-01T11:17:00+10:00", [
    warmup(40, 12), working(80, 8), working(80, 10), working(80, 10)
  ]),
  performance("lat-pulldown-plate-loaded", "Back Bis", "Balmain Fitness", "2026-06-01T11:17:00+10:00", [
    warmup(60, 12), working(80, 12), working(80, 10), working(80, 10)
  ]),
  performance("lateral-raise-cable", "Back Bis", "Balmain Fitness", "2026-06-01T11:17:00+10:00", [
    working(5, 20), working(5, 24), working(5, 24), working(5, 24)
  ]),
  performance("shoulder-press-plate-loaded", "Back Bis", "Balmain Fitness", "2026-06-01T11:17:00+10:00", [
    warmup(20, 14), working(40, 12), working(50, 8), working(40, 12)
  ]),
  performance("triceps-pushdown-cable-straight-bar", "Back Bis", "Balmain Fitness", "2026-06-01T11:17:00+10:00", [
    warmup(30, 14), warmup(40, 12), working(60, 12), working(60, 12), working(60, 12)
  ]),
  performance("bicep-curl-cable", "Pull - Balmain Fitness", "Balmain Fitness", "2026-05-31T14:44:00+10:00", [
    warmup(20, 12), working(35, 12), working(35, 12), working(35, 12), working(35, 12)
  ]),
  performance("jpg-kneeled-lat-pulldown-single-arm", "Pull - Balmain Fitness", "Balmain Fitness", "2026-05-31T14:44:00+10:00", [
    warmup(11.25, 24), working(16.25, 24), working(18.75, 20), working(18.75, 24), working(18.75, 28)
  ]),
  performance("pull-up-assisted", "Pull - Balmain Fitness", "Balmain Fitness", "2026-05-31T14:44:00+10:00", [
    warmup(-47, 12), working(-40, 12), working(-40, 8), working(-47, 10)
  ]),
  performance("rear-deltoid-fly", "Pull - Balmain Fitness", "Balmain Fitness", "2026-05-31T14:44:00+10:00", [
    warmup(19, 12), working(33, 12), working(33, 12), working(33, 12), working(33, 12)
  ]),
  performance("seated-row-plate-loaded-balmain", "Pull - Balmain Fitness", "Balmain Fitness", "2026-05-31T14:44:00+10:00", [
    warmup(40, 12), working(60, 12), working(60, 12), working(60, 14)
  ]),
  performance("chest-press-machine-balmain", "Chest Tris", "Balmain Fitness", "2026-05-30T14:38:00+10:00", [
    warmup(30, 12), warmup(50, 12), warmup(70, 12), working(80, 12), working(90, 10), working(90, 10), failure(90, 10), dropset(80, 2)
  ]),
  performance("knee-raise-captains-chair", "Chest Tris", "Balmain Fitness", "2026-05-30T14:38:00+10:00", [
    working(null, 12), working(null, 12), working(null, 12), working(null, 12)
  ]),
  performance("seated-row-plate-loaded", "Chest Tris", "SCOS", "2026-05-28T19:58:00+10:00", [
    warmup(40, 12), working(80, 10), working(80, 10), working(60, 12)
  ]),
  performance("shoulder-press-machine", "Chest Tris", "SCOS", "2026-05-28T19:58:00+10:00", [
    warmup(20, 12), working(40, 12), working(40, 12), working(40, 12)
  ]),
  performance("lat-pulldown-cable-split-handles", "Back Bis", "SCOS", "2026-05-26T20:57:00+10:00", [
    warmup(30, 12), working(40, 12), working(40, 12), working(40, 12)
  ]),
  performance("iso-lateral-chest-press-machine", "Back Bis", "SCOS", "2026-05-21T18:05:00+10:00", [
    warmup(40, 12), working(60, 10), working(80, 8), working(70, 10), working(60, 12)
  ]),
  performance("lat-pulldown-cable", "Back Bis", "SCOS", "2026-05-15T18:05:00+10:00", [
    warmup(22.5, 12), working(45, 12), working(60, 10), working(56.25, 12), working(56.25, 12)
  ]),
  performance("incline-bench-press-dumbbell", "Chest Tris", "SCOS", "2026-04-19T15:09:00+10:00", [
    warmup(12, 12), warmup(20, 12), working(28, 8), working(28, 8), working(20, 8)
  ]),
  performance("leg-extension-machine", "Evening Workout", "Balmain Fitness", "2026-04-15T19:21:00+10:00", [
    warmup(30, 12), working(40, 12), working(40, 12), working(40, 14)
  ]),
  performance("seated-calf-raise-plate-loaded", "Evening Workout", "Balmain Fitness", "2026-04-15T19:21:00+10:00", [
    working(20, 12), working(20, 14), working(20, 14)
  ]),
  performance("seated-leg-curl-machine", "Evening Workout", "Balmain Fitness", "2026-04-15T19:21:00+10:00", [
    warmup(25, 12), working(30, 12), working(35, 12)
  ]),
  performance("seated-leg-press-machine", "Evening Workout", "Balmain Fitness", "2026-04-15T19:21:00+10:00", [
    warmup(60, 14), warmup(80, 12), working(80, 12), working(80, 14)
  ]),
  performance("forearm-curl-side-body", "Chest Tris", "SCOS", "2026-04-07T10:25:00+10:00", [
    working(14, 16), working(14, 16), working(14, 16), working(14, 16)
  ]),
  performance("lateral-raise-dumbbell", "Chest Tris", "SCOS", "2026-03-31T21:24:00+11:00", [
    working(6, 12), working(8, 12), working(6, 12)
  ]),
  performance("seated-overhead-press-dumbbell", "Chest Tris", "SCOS", "2026-03-09T20:34:00+11:00", [
    working(16, 10), working(16, 10), working(16, 10)
  ]),
  performance("unknown-leg-exercise-confirm", "Leg day 1.0", "SCOS", "2026-02-25T15:12:00+11:00", [
    warmup(20, 12), working(35, 12), working(40, 11), working(35, 12), working(35, 12)
  ]),
  performance("seated-lateral-raise", "Midday Workout", "SCOS", "2026-02-06T12:39:00+11:00", [
    working(6, 12), working(6, 16), dropset(4, 10), working(8, 14), dropset(8, 14), dropset(6, 14), working(8, 8), dropset(6, 8), dropset(4, 12)
  ]),
  performance("leg-press", "Leg day 1.0", "SCOS", "2026-02-04T12:45:00+11:00", [
    warmup(40, 12), warmup(80, 10), warmup(100, 10), working(120, 10), working(120, 12), working(120, 12)
  ]),
  performance("incline-bench-press-barbell", "Midday Workout", "SCOS", "2026-02-02T13:32:00+11:00", [
    warmup(20, 12), warmup(40, 10), warmup(50, 10), working(60, 8), working(60, 8), working(60, 8)
  ]),
  performance("pec-deck-machine", "Midday Workout", "SCOS", "2026-02-02T13:32:00+11:00", [
    warmup(15, 12), working(30, 12), working(30, 12), working(25, 14)
  ]),
  performance("chin-up", "Back Bis", "SCOS", "2026-01-27T16:32:00+11:00", [
    working(null, 2), working(null, 2)
  ]),
  performance("diverging-row", "Back Bis", "SCOS", "2026-01-27T16:32:00+11:00", [
    warmup(20, 14), warmup(40, 12), working(60, 12), working(80, 8), working(80, 8), working(80, 8)
  ]),
  performance("pull-up", "Back Bis", "SCOS", "2026-01-27T16:32:00+11:00", [
    working(null, 6), working(null, 6), working(null, 6)
  ]),
  performance("bicep-curl-dumbbell", "Home quick", "Home", "2024-10-23T14:00:00+11:00", [
    working(8, 12), working(8, 16), working(8, 20)
  ])
];

export const HISTORY_SEED = STRONG_HISTORY_SEED.length ? STRONG_HISTORY_SEED : SCREENSHOT_HISTORY_SEED;

export function createInitialState() {
  return {
    version: DB_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      ...DEFAULT_SETTINGS,
      workoutLocations: [...DEFAULT_SETTINGS.workoutLocations]
    },
    exercises: cloneSeed(EXERCISE_SEED),
    templates: cloneSeed(TEMPLATE_SEED),
    history: cloneSeed(HISTORY_SEED),
    activeSession: null
  };
}

function cloneSeed(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeExerciseSeeds(baseExercises, importedExercises) {
  const byId = new Map();
  for (const exercise of importedExercises) {
    byId.set(exercise.id, exercise);
  }
  for (const exercise of baseExercises) {
    byId.set(exercise.id, {
      ...(byId.get(exercise.id) ?? {}),
      ...exercise
    });
  }
  return [...byId.values()]
    .map(normalizeExerciseRecord)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function exercise(id, name, category, equipment, location, increment, defaultWarmupSets, defaultWorkingSets, overrides = {}) {
  return normalizeExerciseRecord({
    id,
    name,
    category,
    equipment,
    location,
    increment,
    repMin: overrides.repMin ?? DEFAULT_SETTINGS.defaultRepMin,
    repMax: overrides.repMax ?? DEFAULT_SETTINGS.defaultRepMax,
    targetRpe: overrides.targetRpe ?? DEFAULT_SETTINGS.defaultTargetRpe,
    defaultWarmupSets,
    defaultWorkingSets,
    loadMode: overrides.loadMode ?? "external",
    needsReview: overrides.needsReview ?? false,
    notes: overrides.notes ?? ""
  });
}

function template(id, name, location, exerciseRows) {
  return {
    id,
    name,
    location,
    updatedAt: new Date().toISOString(),
    exercises: exerciseRows.map(([exerciseId, warmupSets, workingSets]) => ({
      id: makeId("tpl-row"),
      exerciseId,
      warmupSets,
      workingSets
    }))
  };
}

function performance(exerciseId, workoutName, location, performedAt, sets) {
  return {
    id: makeId("perf"),
    sessionId: makeId("session"),
    exerciseId,
    workoutName,
    location,
    performedAt,
    note: "",
    sets: sets.map((set, index) => ({
      id: makeId("set"),
      order: index,
      completed: true,
      rpe: null,
      rir: null,
      ...set
    }))
  };
}

function warmup(weight, reps) {
  return { type: "warmup", weight, reps };
}

function working(weight, reps) {
  return { type: "working", weight, reps };
}

function failure(weight, reps) {
  return { type: "failure", weight, reps };
}

function dropset(weight, reps) {
  return { type: "dropset", weight, reps };
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
