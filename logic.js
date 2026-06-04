import { formatExerciseDisplayName } from "./data.js";

export const WORKING_SET_TYPES = new Set(["working"]);

export function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getExercise(state, exerciseId) {
  return state.exercises.find((exercise) => exercise.id === exerciseId);
}

export function getTemplate(state, templateId) {
  return state.templates.find((template) => template.id === templateId);
}

export function latestPerformance(state, exerciseId) {
  return state.history
    .filter((entry) => entry.exerciseId === exerciseId)
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))[0] ?? null;
}

export function visiblePreviousSets(performance) {
  if (!performance) return [];
  return performance.sets.filter((set) => set.type !== "dropset" && set.type !== "failure");
}

export function workingSets(performance) {
  if (!performance) return [];
  return performance.sets.filter((set) => WORKING_SET_TYPES.has(set.type));
}

export function createSessionFromTemplate(state, templateId, locationOverride = null) {
  const template = getTemplate(state, templateId);
  if (!template) throw new Error("Template not found");

  return {
    id: uid("session"),
    templateId: template.id,
    templateName: template.name,
    location: locationOverride || template.location,
    startedAt: new Date().toISOString(),
    templateDirty: false,
    exercises: template.exercises.map((row) => createSessionExercise(state, row.exerciseId, {
      warmupSets: row.warmupSets,
      workingSets: row.workingSets
    }))
  };
}

export function createSessionExercise(state, exerciseId, counts = {}) {
  const exercise = getExercise(state, exerciseId);
  if (!exercise) throw new Error("Exercise not found");
  const last = latestPerformance(state, exerciseId);
  const previousSets = visiblePreviousSets(last);
  const warmups = counts.warmupSets ?? exercise.defaultWarmupSets ?? 1;
  const working = counts.workingSets ?? exercise.defaultWorkingSets ?? 3;
  const rows = [];
  const previousWarmups = previousSets.filter((set) => set.type === "warmup");
  const previousWorking = previousSets.filter((set) => set.type === "working");

  for (let index = 0; index < warmups; index += 1) {
    const previous = previousWarmups[index] ?? previousWarmups.at(-1) ?? previousWorking[0] ?? null;
    rows.push(createSetRow(exercise, "warmup", index, previous, "W"));
  }

  for (let index = 0; index < working; index += 1) {
    const previous = previousWorking[index] ?? previousWorking.at(-1) ?? previousSets[index] ?? null;
    rows.push(createSetRow(exercise, "working", index, previous, String(index + 1)));
  }

  return {
    id: uid("session-exercise"),
    exerciseId,
    exerciseName: formatExerciseDisplayName(exercise),
    category: exercise.category,
    note: "",
    previousPerformanceId: last?.id ?? null,
    previousPerformedAt: last?.performedAt ?? null,
    previousWorkoutName: last?.workoutName ?? null,
    sets: rows
  };
}

export function createSetRow(exercise, type, index, previous, label = null) {
  const fallbackWeight = exercise.loadMode === "bodyweight" ? null : 0;
  const previousWeight = previous?.weight ?? fallbackWeight;
  const previousReps = previous?.reps ?? exercise.repMin;
  const prescribed = prescribeSet(exercise, previous, type);
  return {
    id: uid("session-set"),
    type,
    label: label ?? (type === "warmup" ? "W" : String(index + 1)),
    weight: prescribed.weight,
    reps: prescribed.reps,
    rpe: type === "working" ? exercise.targetRpe : null,
    rir: type === "working" ? rpeToRir(exercise.targetRpe) : null,
    completed: false,
    previousWeight,
    previousReps,
    suggestionReason: prescribed.reason
  };
}

export function prescribeSet(exercise, previous, type = "working") {
  if (exercise.loadMode === "bodyweight") {
    return {
      weight: null,
      reps: previous?.reps ?? exercise.repMin,
      reason: "Repeats the last bodyweight rep target until the progression engine is enabled."
    };
  }

  if (!previous) {
    return {
      weight: 0,
      reps: exercise.repMin,
      reason: "No previous data yet; starting at the bottom of the rep range."
    };
  }

  return {
    weight: roundToIncrement(previous.weight, exercise.increment, exercise.loadMode),
    reps: previous.reps,
    reason: type === "warmup"
      ? "Warmup copied from your last logged warmup."
      : "V1 holds the last working-set target; RPE progression lands in the next increment."
  };
}

export function addSetToSessionExercise(state, sessionExerciseId, type = "working") {
  const session = state.activeSession;
  const sessionExercise = session?.exercises.find((entry) => entry.id === sessionExerciseId);
  if (!sessionExercise) return state;
  const exercise = getExercise(state, sessionExercise.exerciseId);
  const sameType = sessionExercise.sets.filter((set) => set.type === type);
  const previous = sameType.at(-1) ?? sessionExercise.sets.at(-1) ?? null;
  const label = type === "warmup" ? "W" : String(sameType.length + 1);
  const nextSet = createSetRow(exercise, type, sameType.length, previous, label);
  if (type === "warmup") {
    const firstWorkingIndex = sessionExercise.sets.findIndex((set) => set.type !== "warmup");
    if (firstWorkingIndex >= 0) {
      sessionExercise.sets.splice(firstWorkingIndex, 0, nextSet);
    } else {
      sessionExercise.sets.push(nextSet);
    }
  } else {
    sessionExercise.sets.push(nextSet);
  }
  normalizeSetLabels(sessionExercise);
  session.templateDirty = true;
  return state;
}

export function removeSetFromSessionExercise(state, sessionExerciseId, setId) {
  const sessionExercise = state.activeSession?.exercises.find((entry) => entry.id === sessionExerciseId);
  if (!sessionExercise) return state;
  sessionExercise.sets = sessionExercise.sets.filter((set) => set.id !== setId);
  normalizeSetLabels(sessionExercise);
  state.activeSession.templateDirty = true;
  return state;
}

export function replaceSessionExercise(state, sessionExerciseId, replacementExerciseId) {
  const session = state.activeSession;
  if (!session) return state;
  const index = session.exercises.findIndex((entry) => entry.id === sessionExerciseId);
  if (index < 0) return state;
  const current = session.exercises[index];
  session.exercises[index] = {
    ...createSessionExercise(state, replacementExerciseId),
    note: current.note
  };
  session.templateDirty = true;
  return state;
}

export function addExerciseToSession(state, exerciseId) {
  const session = state.activeSession;
  if (!session) return state;
  session.exercises.push(createSessionExercise(state, exerciseId));
  session.templateDirty = true;
  return state;
}

export function normalizeSetLabels(sessionExercise) {
  let workingIndex = 1;
  sessionExercise.sets.forEach((set) => {
    if (set.type === "warmup") {
      set.label = "W";
      return;
    }
    if (set.type === "dropset") {
      set.label = "D";
      return;
    }
    if (set.type === "failure") {
      set.label = "F";
      return;
    }
    set.label = String(workingIndex);
    workingIndex += 1;
  });
}

export function finishActiveSession(state) {
  const session = state.activeSession;
  if (!session) return { state, savedCount: 0 };
  const performedAt = new Date().toISOString();
  const saved = [];

  for (const sessionExercise of session.exercises) {
    const completedSets = sessionExercise.sets
      .filter((set) => set.completed)
      .map((set, order) => ({
        id: uid("set"),
        order,
        type: set.type,
        weight: set.weight,
        reps: Number(set.reps) || 0,
        rpe: set.rpe === "" || set.rpe == null ? null : Number(set.rpe),
        rir: set.rir === "" || set.rir == null ? null : Number(set.rir),
        completed: true
      }));

    if (!completedSets.length) continue;

    saved.push({
      id: uid("perf"),
      sessionId: session.id,
      exerciseId: sessionExercise.exerciseId,
      workoutName: session.templateName,
      location: session.location,
      performedAt,
      note: sessionExercise.note,
      sets: completedSets
    });
  }

  state.history.push(...saved);
  state.activeSession = null;
  state.updatedAt = new Date().toISOString();
  return { state, savedCount: saved.length, session, saved };
}

export function saveActiveAsNewTemplate(state, name) {
  const session = state.activeSession;
  if (!session) return state;
  state.templates.push(templateFromSession(state, session, uid("template"), name));
  session.templateDirty = false;
  return state;
}

export function overwriteTemplateFromActive(state) {
  const session = state.activeSession;
  if (!session?.templateId) return state;
  const index = state.templates.findIndex((template) => template.id === session.templateId);
  if (index < 0) return state;
  state.templates[index] = templateFromSession(state, session, session.templateId, session.templateName);
  session.templateDirty = false;
  return state;
}

export function templateFromSession(state, session, id, name) {
  return {
    id,
    name,
    location: session.location,
    updatedAt: new Date().toISOString(),
    exercises: session.exercises.map((entry) => ({
      id: uid("tpl-row"),
      exerciseId: entry.exerciseId,
      warmupSets: entry.sets.filter((set) => set.type === "warmup").length,
      workingSets: entry.sets.filter((set) => set.type === "working").length
    }))
  };
}

export function formatSet(set, exercise) {
  const weight = formatWeight(set.weight, exercise);
  return set.weight == null ? `${set.reps} reps` : `${weight} x ${set.reps}`;
}

export function formatWeight(weight, exercise) {
  if (weight == null || exercise?.loadMode === "bodyweight") return "BW";
  const value = exercise?.loadMode === "assisted" ? -Math.abs(Number(weight)) : Number(weight);
  return `${formatNumber(value)} kg`;
}

export function inputWeightValue(weight, exercise) {
  if (weight == null || exercise?.loadMode === "bodyweight") return "";
  return exercise?.loadMode === "assisted" ? Math.abs(Number(weight)) : Number(weight);
}

export function normalizeInputWeight(value, exercise) {
  if (exercise?.loadMode === "bodyweight") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return exercise?.loadMode === "assisted" ? -Math.abs(parsed) : parsed;
}

export function percentageDelta(current, previous) {
  if (current == null || previous == null || Number(previous) === 0) return null;
  const currentAbs = Math.abs(Number(current));
  const previousAbs = Math.abs(Number(previous));
  if (!previousAbs) return null;
  return ((currentAbs - previousAbs) / previousAbs) * 100;
}

export function roundToIncrement(value, increment = 2.5, loadMode = "external") {
  if (value == null) return null;
  const sign = loadMode === "assisted" ? -1 : Math.sign(Number(value)) || 1;
  const rounded = Math.round(Math.abs(Number(value)) / increment) * increment;
  return Number((rounded * sign).toFixed(2));
}

export function rpeToRir(rpe) {
  if (rpe === "" || rpe == null) return "";
  return clampNumber(10 - Number(rpe), 0, 10);
}

export function rirToRpe(rir) {
  if (rir === "" || rir == null) return "";
  return clampNumber(10 - Number(rir), 0, 10);
}

export function formatNumber(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function templateSummary(state, template) {
  return template.exercises.map((row) => {
    const exercise = getExercise(state, row.exerciseId);
    return `${row.workingSets} x ${exercise ? formatExerciseDisplayName(exercise) : "Unknown"}`;
  });
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return "";
  return Math.min(max, Math.max(min, Number(value.toFixed(1))));
}
