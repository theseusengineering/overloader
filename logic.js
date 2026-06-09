import { formatExerciseDisplayName } from "./data.js";

export const WORKING_SET_TYPES = new Set(["working"]);
const STANDARD_LOAD_PROGRESS = 0.025;
const AGGRESSIVE_LOAD_PROGRESS = 0.05;
const DELOAD_PERCENT = 0.05;
const TARGET_RPE_TOLERANCE = 0.5;
const REP_PROGRESS_RPE_TOLERANCE = 0.75;
const HIGH_FATIGUE_RPE = 9.5;
const MID_EXERCISE_DELOAD_RPE = 9.5;
const BIG_EASY_RPE_GAP = -1;
const BIG_EASY_REP_BUFFER = 2;

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
  const workingPrescription = prescribeWorkingSets(exercise, last, working);

  for (let index = 0; index < warmups; index += 1) {
    const previous = previousWarmups[index] ?? previousWarmups.at(-1) ?? previousWorking[0] ?? null;
    rows.push(createSetRow(exercise, "warmup", index, previous, "W"));
  }

  for (let index = 0; index < working; index += 1) {
    const previous = previousWorking[index] ?? previousWorking.at(-1) ?? previousSets[index] ?? null;
    rows.push(createSetRow(exercise, "working", index, previous, String(index + 1), workingPrescription[index]));
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

export function createSetRow(exercise, type, index, previous, label = null, prescription = null) {
  const fallbackWeight = exercise.loadMode === "bodyweight" ? null : 0;
  const previousWeight = previous?.weight ?? fallbackWeight;
  const previousReps = previous?.reps ?? exercise.repMin;
  const prescribed = prescription ?? prescribeSet(exercise, previous, type);
  return {
    id: uid("session-set"),
    type,
    label: label ?? (type === "warmup" ? "W" : String(index + 1)),
    weight: prescribed.weight,
    reps: prescribed.reps,
    rpe: type === "working" ? exercise.targetRpe : null,
    rir: type === "working" ? rpeToRir(exercise.targetRpe) : null,
    plannedWeight: prescribed.weight,
    plannedReps: prescribed.reps,
    plannedRpe: type === "working" ? exercise.targetRpe : null,
    plannedRir: type === "working" ? rpeToRir(exercise.targetRpe) : null,
    plannedReason: prescribed.reason,
    plannedMode: prescribed.mode ?? "base",
    completed: false,
    previousWeight,
    previousReps,
    suggestionReason: prescribed.reason,
    suggestionMode: prescribed.mode ?? "base"
  };
}

export function prescribeSet(exercise, previous, type = "working") {
  if (exercise.loadMode === "bodyweight") {
    return {
      weight: null,
      reps: previous?.reps ?? exercise.repMin,
      reason: "Repeats the last bodyweight target unless RPE feedback says to change reps.",
      mode: "bodyweight"
    };
  }

  if (!previous) {
    return {
      weight: 0,
      reps: exercise.repMin,
      reason: "No previous data yet; start at the bottom of the rep range and adjust from RPE.",
      mode: "no-history"
    };
  }

  return {
    weight: roundToIncrement(previous.weight, exercise.increment, exercise.loadMode),
    reps: previous.reps,
    reason: type === "warmup"
      ? "Warmup copied from your last logged warmup."
      : "Holding the previous set target until the progression engine has enough feedback.",
    mode: type === "warmup" ? "warmup" : "hold"
  };
}

export function prescribeWorkingSets(exercise, previousPerformance, count = exercise.defaultWorkingSets ?? 3) {
  const previousWorking = workingSets(previousPerformance);
  if (!previousWorking.length) {
    return Array.from({ length: count }, () => ({
      weight: exercise.loadMode === "bodyweight" ? null : 0,
      reps: exercise.repMin,
      reason: "No previous working sets yet; start at the bottom of the rep range and adjust from RPE.",
      mode: "no-history"
    }));
  }

  const decision = nextSessionDecision(exercise, previousWorking);
  return Array.from({ length: count }, (_, index) => {
    const previous = previousWorking[index] ?? previousWorking.at(-1);
    return prescriptionFromDecision(exercise, previousWorking, previous, decision);
  });
}

export function recalculatePendingWorkingSets(state, sessionExerciseId) {
  const sessionExercise = state.activeSession?.exercises.find((entry) => entry.id === sessionExerciseId);
  if (!sessionExercise) return state;
  const exercise = getExercise(state, sessionExercise.exerciseId);
  if (!exercise) return state;

  const completedWorking = [];
  for (const set of sessionExercise.sets) {
    if (set.type !== "working") continue;
    if (set.completed) {
      completedWorking.push(set);
      continue;
    }
    if (set.touched) continue;
    if (!completedWorking.length) {
      resetSetToPlan(set);
      continue;
    }
    const target = prescribePendingSetAfterFeedback(exercise, set, completedWorking);
    if (!target) {
      resetSetToPlan(set);
      continue;
    }
    set.weight = target.weight;
    set.reps = target.reps;
    set.rpe = target.rpe;
    set.rir = target.rir;
    set.suggestionReason = target.reason;
    set.suggestionMode = target.mode;
    set.autoregulated = true;
  }
  return state;
}

function resetSetToPlan(set) {
  set.weight = set.plannedWeight ?? set.weight;
  set.reps = set.plannedReps ?? set.reps;
  set.rpe = set.plannedRpe ?? set.rpe;
  set.rir = set.plannedRir ?? set.rir;
  set.suggestionReason = set.plannedReason ?? set.suggestionReason;
  set.suggestionMode = set.plannedMode ?? set.suggestionMode;
  set.autoregulated = false;
}

function nextSessionDecision(exercise, previousWorking) {
  const summary = summarizeWorkingPerformance(exercise, previousWorking);
  if (summary.highFatigue && summary.missedReps) {
    return {
      type: "deload",
      percent: DELOAD_PERCENT,
      reason: `Deloading 5% because the last ${summary.setLabel} had high fatigue and missed the rep range.`,
      mode: "deload"
    };
  }
  if (summary.highFatigue) {
    return {
      type: "hold-exact",
      reason: `Holding exact work because RPE reached ${formatNumber(summary.maxRpe)}; adapt before adding load or reps.`,
      mode: "fatigue-hold"
    };
  }
  if (summary.underStimulated) {
    return {
      type: "load-progress",
      percent: AGGRESSIVE_LOAD_PROGRESS,
      reason: `Increasing 5% because average RPE was ${formatNumber(summary.avgRpe)}, below the target stress zone.`,
      mode: "aggressive-progress"
    };
  }
  if (summary.topOfRange && summary.rpeAllowsProgression) {
    return {
      type: "load-progress",
      percent: STANDARD_LOAD_PROGRESS,
      reason: `Increasing load because average reps reached ${formatNumber(summary.avgReps)} with recoverable RPE.`,
      mode: "load-progress"
    };
  }
  if (summary.maximalEffort) {
    return {
      type: "hold-exact",
      reason: `Holding because RPE averaged ${formatNumber(summary.avgRpe)}; more load would likely add fatigue before growth.`,
      mode: "effort-hold"
    };
  }
  return {
    type: "rep-progress",
    reason: "Keeping load and adding reps inside the rep range because RPE stayed recoverable.",
    mode: "rep-progress"
  };
}

function prescriptionFromDecision(exercise, previousWorking, previous, decision) {
  const anchor = firstLoad(previousWorking, exercise);
  if (decision.type === "deload") {
    return {
      weight: adjustedLoad(exercise, anchor, decision.percent, "deload"),
      reps: exercise.repMin,
      reason: decision.reason,
      mode: decision.mode
    };
  }
  if (decision.type === "load-progress") {
    return {
      weight: adjustedLoad(exercise, anchor, decision.percent, "progress"),
      reps: exercise.repMin,
      reason: decision.reason,
      mode: decision.mode
    };
  }
  if (decision.type === "rep-progress") {
    return {
      weight: previous?.weight ?? anchor,
      reps: Math.min(exercise.repMax, (Number(previous?.reps) || exercise.repMin) + 1),
      reason: decision.reason,
      mode: decision.mode
    };
  }
  return {
    weight: previous?.weight ?? anchor,
    reps: Number(previous?.reps) || exercise.repMin,
    reason: decision.reason,
    mode: decision.mode
  };
}

function prescribePendingSetAfterFeedback(exercise, pendingSet, completedWorking) {
  const last = completedWorking.at(-1);
  const rpe = actualRpe(last);
  if (rpe == null) return null;
  const targetRpe = Number(exercise.targetRpe) || 8;
  const targetRir = rpeToRir(targetRpe);
  const targetReps = clampInteger(Number(pendingSet.reps) || exercise.repMin, exercise.repMin, exercise.repMax);
  const actualReps = Number(last.reps) || 0;
  const missedTarget = actualReps < exercise.repMin;
  const rpeGap = rpe - targetRpe;
  const atRepFloorAndFailing = actualReps <= exercise.repMin && rpe >= MID_EXERCISE_DELOAD_RPE;
  const shouldReduceLoad = missedTarget || atRepFloorAndFailing;
  const clearlyTooEasy = rpeGap <= BIG_EASY_RPE_GAP && actualReps >= exercise.repMax + BIG_EASY_REP_BUFFER;
  const sameLoadTargetReps = estimateSameLoadTargetReps(last, targetRir);
  const adjustedReps = clampInteger(
    Math.min(targetReps, sameLoadTargetReps ?? targetReps),
    exercise.repMin,
    exercise.repMax
  );

  if (exercise.loadMode === "bodyweight") {
    const reps = bodyweightPendingReps(exercise, targetReps, adjustedReps, missedTarget);
    return {
      weight: null,
      reps,
      rpe: targetRpe,
      rir: targetRir,
      reason: pendingReason(exercise, pendingSet, last, targetRpe, missedTarget, false, reps, clearlyTooEasy),
      mode: reps < targetReps ? "intra-rep-drop" : clearlyTooEasy ? "intra-easy-hold" : "intra-hold"
    };
  }

  const adjusted = shouldReduceLoad
    ? adjustedLoad(exercise, last.weight, DELOAD_PERCENT, "deload")
    : roundToIncrement(last.weight, exercise.increment, exercise.loadMode);
  if (adjusted == null) return null;
  return {
    weight: adjusted,
    reps: shouldReduceLoad ? exercise.repMin : adjustedReps,
    rpe: targetRpe,
    rir: targetRir,
    reason: pendingReason(
      exercise,
      pendingSet,
      last,
      targetRpe,
      missedTarget || atRepFloorAndFailing,
      shouldReduceLoad,
      shouldReduceLoad ? exercise.repMin : adjustedReps,
      clearlyTooEasy
    ),
    mode: shouldReduceLoad ? "intra-load-drop" : adjustedReps < targetReps ? "intra-rep-drop" : clearlyTooEasy ? "intra-easy-hold" : "intra-hold"
  };
}

function summarizeWorkingPerformance(exercise, sets) {
  const valid = sets.filter((set) => Number(set.reps) > 0);
  const reps = valid.map((set) => Number(set.reps) || 0);
  const rpes = valid.map(actualRpe).filter((value) => value != null);
  const avgReps = average(reps) ?? 0;
  const avgRpe = average(rpes);
  const maxRpe = rpes.length ? Math.max(...rpes) : null;
  const targetRpe = Number(exercise.targetRpe) || 8;
  const missedReps = valid.some((set) => (Number(set.reps) || 0) < exercise.repMin);
  const minimumTopSets = Math.min(3, Math.max(1, Number(exercise.defaultWorkingSets) || 3));
  const topOfRange = valid.length >= minimumTopSets && valid.every((set) => (Number(set.reps) || 0) >= exercise.repMax);
  const rpeAllowsProgression = valid.every((set) => {
    const setRpe = actualRpe(set);
    return setRpe == null || setRpe <= targetRpe + TARGET_RPE_TOLERANCE;
  });
  const underStimulated = avgRpe != null && avgRpe <= targetRpe - 1 && avgReps >= exercise.repMax + 1;
  const highFatigue = maxRpe != null && (maxRpe >= HIGH_FATIGUE_RPE || (avgRpe ?? 0) >= targetRpe + 1.25);
  const maximalEffort = maxRpe != null && (maxRpe >= 9 || (avgRpe ?? 0) > targetRpe + REP_PROGRESS_RPE_TOLERANCE);

  return {
    avgReps,
    avgRpe,
    maxRpe,
    missedReps,
    topOfRange,
    rpeAllowsProgression,
    underStimulated,
    highFatigue,
    maximalEffort,
    setLabel: valid.length === 1 ? "set" : "sets"
  };
}

function adjustedLoad(exercise, weight, percent, direction) {
  if (exercise.loadMode === "bodyweight" || weight == null) return null;
  const increment = normalizedIncrement(exercise.increment);
  const currentAbs = Math.abs(Number(weight)) || 0;
  const isAssisted = exercise.loadMode === "assisted";
  const shouldIncreaseStimulus = direction === "progress";
  let targetAbs;

  if (isAssisted) {
    targetAbs = shouldIncreaseStimulus ? currentAbs * (1 - percent) : currentAbs * (1 + percent);
  } else {
    targetAbs = shouldIncreaseStimulus ? currentAbs * (1 + percent) : currentAbs * (1 - percent);
  }

  let roundedAbs = Math.round(targetAbs / increment) * increment;
  if (shouldIncreaseStimulus && !isAssisted && roundedAbs <= currentAbs) roundedAbs = currentAbs + increment;
  if (!shouldIncreaseStimulus && !isAssisted && roundedAbs >= currentAbs) roundedAbs = Math.max(0, currentAbs - increment);
  if (shouldIncreaseStimulus && isAssisted && roundedAbs >= currentAbs) roundedAbs = Math.max(0, currentAbs - increment);
  if (!shouldIncreaseStimulus && isAssisted && roundedAbs <= currentAbs) roundedAbs = currentAbs + increment;

  const sign = isAssisted ? -1 : 1;
  return Number((roundedAbs * sign).toFixed(2));
}

function estimateSameLoadTargetReps(set, targetRir) {
  const actualReps = Number(set?.reps) || 0;
  if (!actualReps) return null;
  const estimated = actualReps + actualRirFromSet(set) - targetRir;
  return Math.max(0, Math.floor(estimated));
}

function bodyweightPendingReps(exercise, targetReps, adjustedReps, missedTarget) {
  if (missedTarget) return Math.max(exercise.repMin, targetReps - 1);
  return Math.min(targetReps, adjustedReps);
}

function pendingReason(exercise, pendingSet, lastSet, targetRpe, missedTarget, shouldReduceLoad, reps, clearlyTooEasy) {
  if (missedTarget) {
    return `Reduced load because the last set fell below the rep floor. The engine only cuts load mid-exercise when you miss the range or hit the floor at near-failure.`;
  }
  if (shouldReduceLoad) {
    return `Reduced load because ${formatSetSummary(lastSet, exercise)} hit the rep floor at near-failure. Keeping the same load would likely push the next set below range.`;
  }
  if (clearlyTooEasy) {
    return `Holding load for the rest of the exercise. Large overshoots drive next-session progression, but the engine avoids mid-exercise load jumps for hypertrophy work.`;
  }
  if (reps < pendingSet.reps) {
    return `Holding load and trimming the next rep target because ${formatSetSummary(lastSet, exercise)} was harder than target RPE ${formatNumber(targetRpe)}. Set-to-set fatigue is expected, so the engine changes reps before load.`;
  }
  return `Holding the planned load. Progression is decided from the full exercise, not from a single set inside the workout.`;
}

function formatSetSummary(set, exercise) {
  const load = set.weight == null ? "BW" : `${formatWeight(set.weight, exercise)}`;
  return `${load} x ${Number(set.reps) || 0} @${formatNumber(actualRpe(set))}`;
}

function firstLoad(sets, exercise) {
  if (exercise.loadMode === "bodyweight") return null;
  const first = sets.find((set) => set.weight != null);
  return first?.weight ?? 0;
}

function actualRpe(set) {
  if (!set) return null;
  if (set.rpe !== "" && set.rpe != null) {
    const parsed = Number(set.rpe);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (set.rir !== "" && set.rir != null) {
    const parsed = rirToRpe(set.rir);
    return Number.isFinite(Number(parsed)) ? Number(parsed) : null;
  }
  return null;
}

function actualRirFromSet(set) {
  if (!set) return 2;
  if (set.rir !== "" && set.rir != null) {
    const parsed = Number(set.rir);
    return Number.isFinite(parsed) ? parsed : 2;
  }
  if (set.rpe !== "" && set.rpe != null) {
    const parsed = rpeToRir(set.rpe);
    return Number.isFinite(Number(parsed)) ? Number(parsed) : 2;
  }
  return 2;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + Number(value), 0) / valid.length;
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizedIncrement(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2.5;
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
