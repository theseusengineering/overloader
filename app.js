import {
  LOCATION_OPTIONS,
  formatExerciseDisplayName,
  normalizeExerciseName,
  normalizeExerciseRecord,
  normalizeLocationName
} from "./data.js";
import { loadState, replaceState, saveState } from "./storage.js";
import {
  addExerciseToSession,
  addSetToSessionExercise,
  clone,
  createSessionFromTemplate,
  finishActiveSession,
  formatNumber,
  formatSet,
  formatWeight,
  getExercise,
  inputWeightValue,
  latestPerformance,
  normalizeInputWeight,
  overwriteTemplateFromActive,
  percentageDelta,
  rirToRpe,
  replaceSessionExercise,
  rpeToRir,
  saveActiveAsNewTemplate,
  templateSummary,
  uid
} from "./logic.js";

const app = document.querySelector("#app");

let state = null;
let currentView = "workout";
let modal = null;
let renderedModalScrollKey = "";
let exerciseFilter = "";
let categoryFilter = "";
let toast = "";
let toastTimer = null;
let workoutClockTimer = null;
const OTHER_LOCATION_VALUE = "__other__";
const CUSTOM_TAG_VALUE = "__custom_tag__";
const DEFAULT_CATEGORY_TAGS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Other"];
const DEFAULT_EQUIPMENT_TAGS = ["machine", "plate-loaded", "cable", "dumbbell", "barbell", "bodyweight", "assisted"];

renderBoot("Loading OverLoader");
init().catch((error) => {
  console.error("OverLoader failed to start", error);
  renderBoot("OverLoader failed to start", error?.message ?? String(error));
});

async function init() {
  state = await loadState();
  bindGlobalEvents();
  render();
  startWorkoutClockTicker();
  registerServiceWorker();
}

function renderBoot(title, detail = "") {
  app.innerHTML = `
    <main class="boot-screen">
      <img src="icon.svg" alt="" width="72" height="72">
      <h1>${escapeHtml(title)}</h1>
      ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
    </main>
  `;
}

function bindGlobalEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("drop", handleDrop);
  document.addEventListener("dragend", handleDragEnd);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal) {
      closeModal();
    }
  });
}

async function persist() {
  state = await saveState(state);
}

function render() {
  const previousModalScrollKey = renderedModalScrollKey;
  const previousModalScrollTop = document.querySelector(".modal-body")?.scrollTop ?? 0;
  const previousPageScrollTop = window.scrollY;
  app.innerHTML = `
    <main class="phone-frame">
      ${renderTopBar()}
      <section class="view-shell">
        ${renderView()}
      </section>
      ${renderBottomNav()}
    </main>
    ${modal ? renderModal() : ""}
    ${toast ? `<div class="toast">${escapeHtml(toast)}</div>` : ""}
  `;
  renderedModalScrollKey = modalScrollKey(modal);
  restoreScrollPosition(previousModalScrollKey, previousModalScrollTop, previousPageScrollTop);
}

function modalScrollKey(activeModal) {
  if (!activeModal) return "";
  const parts = [activeModal.type];
  if (activeModal.templateId) parts.push(activeModal.templateId);
  if (activeModal.exerciseId) parts.push(activeModal.exerciseId);
  if (activeModal.sessionExerciseId) parts.push(activeModal.sessionExerciseId);
  if (activeModal.mode) parts.push(activeModal.mode);
  if (activeModal.reorderMode) parts.push("reorder");
  return parts.join(":");
}

function currentModalScrollTop() {
  return document.querySelector(".modal-body")?.scrollTop ?? 0;
}

function restoreScrollPosition(previousModalScrollKey, previousModalScrollTop, previousPageScrollTop) {
  if (renderedModalScrollKey && renderedModalScrollKey === previousModalScrollKey) {
    requestAnimationFrame(() => {
      const body = document.querySelector(".modal-body");
      if (body) body.scrollTop = previousModalScrollTop;
    });
  } else if (!renderedModalScrollKey) {
    requestAnimationFrame(() => window.scrollTo(0, previousPageScrollTop));
  } else if (modal?.restoreScrollTop != null) {
    const restoreScrollTop = modal.restoreScrollTop;
    delete modal.restoreScrollTop;
    requestAnimationFrame(() => {
      const body = document.querySelector(".modal-body");
      if (body) body.scrollTop = restoreScrollTop;
    });
  }
}

function renderTopBar() {
  const active = state.activeSession;
  const title = active ? active.templateName : "OverLoader";
  const subtitle = active ? formatElapsed(active.startedAt) : `${state.exercises.length} exercises`;
  return `
    <header class="top-bar">
      <button class="icon-button" data-action="go-home" aria-label="Workout home">${icon("rotate")}</button>
      <div class="top-title">
        <div class="grabber"></div>
        <strong>${escapeHtml(title)}</strong>
        <span ${active ? "data-role=\"workout-clock\"" : ""}>${escapeHtml(subtitle)}</span>
      </div>
      ${active
        ? `<button class="finish-button" data-action="finish-workout">Finish</button>`
        : `<button class="icon-button blue" data-action="open-data-menu" aria-label="Data">${icon("database")}</button>`}
    </header>
  `;
}

function startWorkoutClockTicker() {
  clearInterval(workoutClockTimer);
  workoutClockTimer = setInterval(() => {
    const clock = document.querySelector("[data-role='workout-clock']");
    if (!clock || !state?.activeSession) return;
    clock.textContent = formatElapsed(state.activeSession.startedAt);
  }, 1000);
}

function renderView() {
  if (currentView === "templates") return renderTemplatesView();
  if (currentView === "exercises") return renderExercisesView();
  if (currentView === "history") return renderHistoryView();
  if (currentView === "data") return renderDataView();
  return renderWorkoutView();
}

function renderWorkoutView() {
  if (!state.activeSession) {
    return `
      <div class="start-panel">
        <div class="section-heading">
          <h1>Start Workout</h1>
          <button class="text-button" data-view="templates">Manage</button>
        </div>
        <div class="template-grid">
          ${state.templates.map((template) => renderTemplateCard(template, true)).join("")}
        </div>
      </div>
      ${renderRecentHistory()}
    `;
  }

  return `
    <div class="session-meta">
      <div>
        <h1>${escapeHtml(state.activeSession.templateName)}</h1>
        <span>${formatDate(state.activeSession.startedAt)}</span>
      </div>
      <button class="small-blue-button" data-action="open-template-session-actions">${icon("more")}</button>
    </div>
    <div class="exercise-stack">
      ${state.activeSession.exercises.map(renderSessionExercise).join("")}
    </div>
    <div class="session-actions">
      <button class="primary-wide" data-action="open-add-exercise">${icon("plus")} Add Exercises</button>
      <button class="danger-wide" data-action="cancel-workout">Cancel Workout</button>
    </div>
  `;
}

function renderSessionExercise(sessionExercise) {
  const exercise = getExercise(state, sessionExercise.exerciseId);
  const previous = latestPerformance(state, sessionExercise.exerciseId);
  const kgLabel = exercise?.loadMode === "assisted" ? "-kg" : "kg";
  const weightHeader = exercise?.loadMode === "bodyweight" ? "Load" : kgLabel;
  return `
    <article class="session-exercise" data-session-exercise-id="${sessionExercise.id}">
      <div class="exercise-title-row">
        <button class="exercise-title" data-action="open-exercise-history" data-exercise-id="${exercise.id}">
          ${escapeHtml(formatExerciseDisplayName(exercise))}
          ${exercise.needsReview ? `<span class="review-pill">confirm</span>` : ""}
        </button>
        <div class="exercise-tools">
          <button class="mini-icon" data-action="open-focus" data-session-exercise-id="${sessionExercise.id}" aria-label="Focus metric">${icon("chart")}</button>
          <button class="mini-icon" data-action="open-exercise-menu" data-session-exercise-id="${sessionExercise.id}" aria-label="Exercise menu">${icon("more")}</button>
        </div>
      </div>
      ${sessionExercise.note ? `<div class="sticky-note">${escapeHtml(sessionExercise.note)}</div>` : ""}
      ${previous ? `<div class="previous-context">${escapeHtml(previous.workoutName)} · ${formatDate(previous.performedAt)}</div>` : ""}
      <div class="set-table">
        <div class="set-row table-head">
          <span>Set</span>
          <span>Previous</span>
          <span>${escapeHtml(weightHeader)}</span>
          <span>Reps</span>
          <span>RPE</span>
          <span>RIR</span>
          <span aria-label="Complete">${icon("check")}</span>
        </div>
        ${sessionExercise.sets.map((set) => renderSetRow(sessionExercise, exercise, set)).join("")}
      </div>
      <div class="set-actions">
        <button class="add-set" data-action="add-working-set" data-session-exercise-id="${sessionExercise.id}">${icon("plus")} Add Set</button>
        <button class="add-warmup" data-action="add-warmup-set" data-session-exercise-id="${sessionExercise.id}">W</button>
      </div>
    </article>
  `;
}

function renderSetRow(sessionExercise, exercise, set) {
  const disabledWeight = exercise.loadMode === "bodyweight" ? "disabled" : "";
  const delta = percentageDelta(set.weight, set.previousWeight);
  const deltaText = delta == null ? "" : `${delta >= 0 ? "+" : ""}${formatNumber(delta)}%`;
  const completedClass = set.completed ? "completed" : "pending";
  return `
    <div class="set-row ${completedClass}" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}">
      <button class="set-badge ${set.type}" data-action="cycle-set-type" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}">${escapeHtml(set.label)}</button>
      <button class="previous-cell" data-action="open-exercise-history" data-exercise-id="${exercise.id}">
        ${formatPrevious(set, exercise)}
      </button>
      <label class="number-field weight-field">
        <input ${disabledWeight} type="number" inputmode="decimal" min="0" step="${exercise.increment}" data-field="weight" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}" value="${inputWeightValue(set.weight, exercise)}">
        ${deltaText ? `<sup>${escapeHtml(deltaText)}</sup>` : ""}
      </label>
      <label class="number-field">
        <input type="number" inputmode="numeric" min="0" step="1" data-field="reps" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}" value="${set.reps ?? ""}">
      </label>
      <label class="number-field compact">
        <input type="number" inputmode="decimal" min="0" max="10" step="0.5" placeholder="RPE" data-field="rpe" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}" value="${set.rpe ?? ""}">
      </label>
      <label class="number-field compact">
        <input type="number" inputmode="decimal" min="0" max="10" step="0.5" placeholder="RIR" data-field="rir" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}" value="${set.rir ?? ""}">
      </label>
      <button class="check-button ${set.completed ? "is-complete" : ""}" data-action="toggle-set-complete" data-session-exercise-id="${sessionExercise.id}" data-set-id="${set.id}" aria-label="Toggle complete">${icon("check")}</button>
    </div>
  `;
}

function renderTemplatesView() {
  return `
    <div class="section-heading">
      <h1>Templates</h1>
      <button class="text-button" data-action="open-new-template">New</button>
    </div>
    <div class="template-grid">
      ${state.templates.map((template) => renderTemplateCard(template, false)).join("")}
    </div>
  `;
}

function renderTemplateCard(template, startOnly) {
  const summary = templateSummary(state, template);
  return `
    <article class="template-card">
      <div class="card-title-row">
        <div>
          <h2>${escapeHtml(template.name)}</h2>
          <span>${escapeHtml(template.location)} · ${template.exercises.length} exercises</span>
        </div>
        <button class="small-blue-button" data-action="start-template" data-template-id="${template.id}">${icon("play")}</button>
      </div>
      <div class="template-summary">
        ${summary.slice(0, 6).map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
      </div>
      ${startOnly ? "" : `
        <div class="card-actions">
          <button class="secondary-button" data-action="edit-template" data-template-id="${template.id}">Edit</button>
          <button class="secondary-button" data-action="duplicate-template" data-template-id="${template.id}">Duplicate</button>
        </div>
      `}
    </article>
  `;
}

function renderExercisesView() {
  const categories = [...new Set(state.exercises.map((exercise) => exercise.category))].sort();
  const visibleExercises = state.exercises
    .filter((exercise) => {
      const query = exerciseFilter.trim().toLowerCase();
      const displayName = formatExerciseDisplayName(exercise).toLowerCase();
      const matchesQuery = !query
        || exercise.name.toLowerCase().includes(query)
        || displayName.includes(query)
        || exercise.category.toLowerCase().includes(query)
        || exercise.location.toLowerCase().includes(query)
        || exercise.equipment.toLowerCase().includes(query);
      const matchesCategory = !categoryFilter || exercise.category === categoryFilter;
      return matchesQuery && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return `
    <div class="section-heading">
      <h1>Exercises</h1>
      <button class="text-button" data-action="open-new-exercise">New</button>
    </div>
    <div class="filter-row">
      <input class="search-input" type="search" placeholder="Search" data-action="filter-exercises" value="${escapeHtml(exerciseFilter)}">
      <select class="select-input" data-action="category-filter">
        <option value="">Any Category</option>
        ${categories.map((category) => `<option value="${escapeHtml(category)}" ${categoryFilter === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
      </select>
    </div>
    <div class="exercise-list">
      ${visibleExercises.map((exercise) => renderExerciseListItem(exercise)).join("") || `<p class="empty">No exercises match.</p>`}
    </div>
  `;
}

function renderExerciseListItem(exercise, mode = "settings") {
  const previous = latestPerformance(state, exercise.id);
  const best = previous ? bestWorkingSet(previous, exercise) : "No history";
  const displayName = formatExerciseDisplayName(exercise);
  return `
    <button class="exercise-list-item" data-action="${mode === "select" ? "select-exercise" : "edit-exercise"}" data-exercise-id="${exercise.id}">
      <span class="avatar">${escapeHtml(displayName[0] ?? "?")}</span>
      <span class="exercise-list-main">
        <strong>${escapeHtml(displayName)}</strong>
        <em>${escapeHtml(exercise.category)} · ${escapeHtml(exercise.location)}</em>
      </span>
      <span class="exercise-list-side">${escapeHtml(best)}</span>
    </button>
  `;
}

function renderDataView() {
  const completedWorkouts = new Set(state.history.map((entry) => entry.sessionId)).size;
  return `
    <div class="section-heading">
      <h1>Data</h1>
    </div>
    <div class="data-grid">
      <div class="stat-card"><strong>${state.history.length}</strong><span>exercise logs</span></div>
      <div class="stat-card"><strong>${completedWorkouts}</strong><span>sessions</span></div>
      <div class="stat-card"><strong>${state.templates.length}</strong><span>templates</span></div>
      <div class="stat-card"><strong>${state.exercises.length}</strong><span>exercises</span></div>
    </div>
    <div class="data-actions">
      <button class="primary-wide" data-action="export-backup">${icon("download")} Export backup</button>
      <button class="secondary-wide" data-action="export-exercises">${icon("download")} Push exercises to repo JSON</button>
      <button class="secondary-wide" data-action="export-templates">${icon("download")} Push templates to repo JSON</button>
      <label class="file-import">
        ${icon("upload")} Import backup
        <input type="file" accept="application/json,.json" data-action="import-backup">
      </label>
      <button class="secondary-wide" data-action="reset-seed">Reload seed data</button>
    </div>
  `;
}

function renderHistoryView() {
  const workouts = workoutHistoryGroups();
  return `
    <div class="section-heading">
      <h1>History</h1>
    </div>
    <div class="workout-history-list">
      ${workouts.map((workout) => renderWorkoutHistoryCard(workout)).join("") || `<p class="empty">No completed workouts yet.</p>`}
    </div>
  `;
}

function renderWorkoutHistoryCard(workout) {
  return `
    <article class="workout-history-card">
      <div class="workout-history-main">
        <h2>${escapeHtml(workout.name)}</h2>
        <span>${formatDateTime(workout.performedAt)} · ${escapeHtml(workout.location)}</span>
      </div>
      <div class="workout-history-metrics">
        <span><strong>${workout.exerciseCount}</strong> exercises</span>
        <span><strong>${workout.workingSetCount}</strong> working sets</span>
        <span><strong>${formatNumber(workout.totalVolume)}</strong> kg</span>
      </div>
      <div class="card-actions">
        <button class="secondary-button" data-action="edit-workout-history" data-session-id="${escapeAttr(workout.sessionId)}">Edit</button>
        <button class="secondary-button danger-text" data-action="delete-workout-history" data-session-id="${escapeAttr(workout.sessionId)}">Delete</button>
      </div>
    </article>
  `;
}

function workoutHistoryGroups() {
  const groups = new Map();
  for (const entry of state.history) {
    const key = historyWorkoutKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()]
    .map(([sessionId, entries]) => workoutHistorySummary(sessionId, entries))
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
}

function workoutHistorySummary(sessionId, entries) {
  const sortedEntries = entries.slice().sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
  const first = sortedEntries[0] ?? {};
  const workingSets = sortedEntries.flatMap((entry) => entry.sets.filter((set) => set.type === "working"));
  const totalVolume = workingSets.reduce((total, set) => {
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if (!Number.isFinite(weight) || !Number.isFinite(reps)) return total;
    return total + Math.abs(weight) * reps;
  }, 0);
  return {
    sessionId,
    name: first.workoutName ?? "Workout",
    location: first.location ?? "",
    performedAt: first.performedAt ?? new Date().toISOString(),
    exerciseCount: sortedEntries.length,
    workingSetCount: workingSets.length,
    totalVolume
  };
}

function historyWorkoutKey(entry) {
  return entry.sessionId || [
    entry.workoutName ?? "Workout",
    entry.performedAt ?? "",
    entry.location ?? ""
  ].join("|");
}

function workoutHistoryEntries(sessionId) {
  return state.history
    .filter((entry) => historyWorkoutKey(entry) === sessionId)
    .sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
}

function renderRecentHistory() {
  const recent = state.history
    .slice()
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))
    .slice(0, 6);

  return `
    <section class="recent-panel">
      <div class="section-heading compact">
        <h1>Recent Exercise Logs</h1>
      </div>
      <div class="recent-list">
        ${recent.map((entry) => {
          const exercise = getExercise(state, entry.exerciseId);
          return `
            <button class="recent-item" data-action="open-exercise-history" data-exercise-id="${entry.exerciseId}">
              <strong>${escapeHtml(exercise ? formatExerciseDisplayName(exercise) : "Unknown")}</strong>
              <span>${escapeHtml(entry.workoutName)} · ${formatDate(entry.performedAt)}</span>
              <em>${escapeHtml(bestWorkingSet(entry, exercise))}</em>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderBottomNav() {
  const items = [
    ["workout", "Workout", "dumbbell"],
    ["templates", "Templates", "list"],
    ["exercises", "Exercises", "database"],
    ["history", "History", "history"],
    ["data", "Data", "download"]
  ];
  return `
    <nav class="bottom-nav">
      ${items.map(([view, label, iconName]) => `
        <button class="${currentView === view ? "active" : ""}" data-view="${view}">
          ${icon(iconName)}
          <span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderModal() {
  if (modal.type === "exercise-menu") return renderExerciseMenu();
  if (modal.type === "exercise-picker") return renderExercisePicker();
  if (modal.type === "exercise-settings") return renderExerciseSettings();
  if (modal.type === "exercise-history") return renderExerciseHistory();
  if (modal.type === "workout-history-editor") return renderWorkoutHistoryEditor();
  if (modal.type === "template-editor") return renderTemplateEditor();
  if (modal.type === "finish-template-choice") return renderFinishTemplateChoice();
  if (modal.type === "start-location") return renderStartLocationModal();
  if (modal.type === "focus") return renderFocusModal();
  if (modal.type === "data-menu") return renderDataMenu();
  if (modal.type === "session-actions") return renderSessionActions();
  return "";
}

function renderModalFrame(title, body, footer = "") {
  return `
    <div class="modal-backdrop">
      <section class="modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-modal-sheet>
        <header class="modal-header">
          <button class="icon-button" data-action="close-modal" aria-label="Close">${icon("x")}</button>
          <h2>${escapeHtml(title)}</h2>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-footer">${footer}</footer>` : ""}
      </section>
    </div>
  `;
}

function renderExerciseMenu() {
  const sessionExercise = state.activeSession?.exercises.find((entry) => entry.id === modal.sessionExerciseId);
  const exercise = getExercise(state, sessionExercise?.exerciseId);
  return renderModalFrame(exercise ? formatExerciseDisplayName(exercise) : sessionExercise?.exerciseName ?? "Exercise", `
    <div class="menu-list">
      <button data-action="add-note" data-session-exercise-id="${modal.sessionExerciseId}">${icon("note")} Add Note</button>
      <button data-action="replace-exercise" data-session-exercise-id="${modal.sessionExerciseId}">${icon("swap")} Replace Exercise</button>
      <button data-action="add-warmup-set" data-session-exercise-id="${modal.sessionExerciseId}">${icon("plus")} Add Warmup</button>
      <button data-action="remove-session-exercise" data-session-exercise-id="${modal.sessionExerciseId}" class="danger-text">${icon("x")} Remove Exercise</button>
    </div>
  `);
}

function renderExercisePicker() {
  const filter = modal.filter ?? "";
  const filtered = state.exercises
    .filter((exercise) => {
      const query = filter.toLowerCase();
      return exercise.name.toLowerCase().includes(query)
        || formatExerciseDisplayName(exercise).toLowerCase().includes(query)
        || exercise.category.toLowerCase().includes(query)
        || exercise.equipment.toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const title = modal.mode === "replace" ? "Replace Exercise" : "Add Exercises";
  return renderModalFrame(title, `
    <input class="search-input full" type="search" placeholder="Search" data-action="picker-filter" value="${escapeHtml(filter)}">
    <div class="exercise-list picker">
      ${filtered.map((exercise) => renderExerciseListItem(exercise, "select")).join("")}
    </div>
  `);
}

function renderExerciseSettings() {
  const exercise = modal.draft ?? getExercise(state, modal.exerciseId);
  if (!exercise) return "";
  const location = normalizeLocationName(exercise.location);
  const locationChoice = modal.locationChoice ?? (LOCATION_OPTIONS.includes(location) ? location : OTHER_LOCATION_VALUE);
  const customLocation = modal.customLocation ?? (locationChoice === OTHER_LOCATION_VALUE ? location : "");
  return renderModalFrame("Exercise Settings", `
    <form class="settings-form" data-form="exercise-settings" data-exercise-id="${exercise.id}">
      <label>Name<input name="name" value="${escapeAttr(normalizeExerciseName(exercise.name, exercise.equipment))}"></label>
      ${renderExerciseTagField("Category", "category", exercise.category)}
      <label>Location
        <select name="locationChoice" data-field="exercise-location-choice">
          ${LOCATION_OPTIONS.map((option) => `<option value="${escapeAttr(option)}" ${locationChoice === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          <option value="${OTHER_LOCATION_VALUE}" ${locationChoice === OTHER_LOCATION_VALUE ? "selected" : ""}>Other</option>
        </select>
      </label>
      ${locationChoice === OTHER_LOCATION_VALUE ? `
        <label>Custom location<input name="customLocation" data-field="custom-exercise-location" value="${escapeAttr(customLocation)}" placeholder="Gym name"></label>
      ` : ""}
      ${renderExerciseTagField("Equipment", "equipment", exercise.equipment)}
      <label>Warmups<input type="number" min="0" step="1" name="defaultWarmupSets" value="${exercise.defaultWarmupSets}"></label>
      <label>Working sets<input type="number" min="1" step="1" name="defaultWorkingSets" value="${exercise.defaultWorkingSets}"></label>
      <label>Rep min<input type="number" min="1" step="1" name="repMin" value="${exercise.repMin}"></label>
      <label>Rep max<input type="number" min="1" step="1" name="repMax" value="${exercise.repMax}"></label>
      <label>Target RPE<input type="number" min="1" max="10" step="0.5" name="targetRpe" value="${exercise.targetRpe}"></label>
      <label>Increment kg<input type="number" min="0.25" step="0.25" name="increment" value="${exercise.increment}"></label>
      <label>Load type
        <select name="loadMode">
          ${["external", "assisted", "bodyweight"].map((mode) => `<option value="${mode}" ${exercise.loadMode === mode ? "selected" : ""}>${mode}</option>`).join("")}
        </select>
      </label>
      <label>Notes<textarea name="notes">${escapeHtml(exercise.notes ?? "")}</textarea></label>
    </form>
  `, `
    ${modal.isNew ? "" : `<button class="secondary-wide" data-action="duplicate-exercise" data-exercise-id="${exercise.id}">Duplicate Exercise</button>`}
    <button class="primary-wide" data-action="save-exercise-settings" data-exercise-id="${exercise.id}">Save</button>
  `);
}

function renderExerciseTagField(label, field, value) {
  const current = String(value ?? "").trim();
  const options = exerciseTagOptions(field);
  const choice = modal.tagChoices?.[field] ?? (options.includes(current) ? current : CUSTOM_TAG_VALUE);
  const customValue = modal.customTags?.[field] ?? (choice === CUSTOM_TAG_VALUE ? current : "");
  return `
    <label>${escapeHtml(label)}
      <select name="${escapeAttr(`${field}Choice`)}" data-field="exercise-tag-choice" data-tag-field="${escapeAttr(field)}">
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${choice === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        <option value="${CUSTOM_TAG_VALUE}" ${choice === CUSTOM_TAG_VALUE ? "selected" : ""}>Add new tag</option>
      </select>
    </label>
    ${choice === CUSTOM_TAG_VALUE ? `
      <label>New ${escapeHtml(label.toLowerCase())}<input name="${escapeAttr(`${field}Custom`)}" data-field="custom-exercise-tag" data-tag-field="${escapeAttr(field)}" value="${escapeAttr(customValue)}" placeholder="${escapeAttr(label)}"></label>
    ` : ""}
  `;
}

function exerciseTagOptions(field) {
  const defaults = field === "category" ? DEFAULT_CATEGORY_TAGS : DEFAULT_EQUIPMENT_TAGS;
  const seen = new Set();
  const ordered = [];
  for (const tag of defaults) addTagOption(tag, seen, ordered);
  const values = state.exercises.map((exercise) => exercise?.[field]);
  if (modal?.type === "exercise-settings" && modal.draft?.[field]) values.push(modal.draft[field]);
  for (const tag of values.sort((a, b) => String(a).localeCompare(String(b)))) {
    addTagOption(tag, seen, ordered);
  }
  return ordered;
}

function addTagOption(tag, seen, ordered) {
  const value = String(tag ?? "").trim();
  if (!value || seen.has(value)) return;
  seen.add(value);
  ordered.push(value);
}

function renderExerciseHistory() {
  const exercise = getExercise(state, modal.exerciseId);
  const history = state.history
    .filter((entry) => entry.exerciseId === modal.exerciseId)
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
  return renderModalFrame(exercise ? formatExerciseDisplayName(exercise) : "History", `
    <div class="history-list">
      ${history.map((entry) => `
        <article class="history-card">
          <h3>${escapeHtml(entry.workoutName)}</h3>
          <span>${formatDateTime(entry.performedAt)} · ${escapeHtml(entry.location)}</span>
          <div class="history-sets">
            ${entry.sets.map((set) => `<span class="${set.type}">${setLabel(set)} ${escapeHtml(formatSet(set, exercise))}${set.rpe ? ` @${set.rpe}` : ""}</span>`).join("")}
          </div>
        </article>
      `).join("") || `<p class="empty">No history yet.</p>`}
    </div>
  `);
}

function renderWorkoutHistoryEditor() {
  const entries = modal.draft ?? workoutHistoryEntries(modal.sessionId);
  const first = entries[0];
  if (!first) return "";
  return renderModalFrame("Edit Workout", `
    <form class="settings-form" data-form="workout-history-editor" data-session-id="${escapeAttr(modal.sessionId)}">
      <label>Name<input name="workoutName" value="${escapeAttr(first.workoutName)}"></label>
      <label>Location<input name="location" value="${escapeAttr(first.location)}"></label>
      <label>Date<input name="performedAt" type="datetime-local" value="${escapeAttr(formatDateTimeInput(first.performedAt))}"></label>
    </form>
    <div class="history-editor-list">
      ${entries.map((entry) => renderHistoryEditorExercise(entry)).join("")}
    </div>
  `, `
    <button class="danger-wide" data-action="delete-workout-history-from-editor" data-session-id="${escapeAttr(modal.sessionId)}">Delete Workout</button>
    <button class="primary-wide" data-action="save-workout-history" data-session-id="${escapeAttr(modal.sessionId)}">Save Workout</button>
  `);
}

function renderHistoryEditorExercise(entry) {
  const exercise = getExercise(state, entry.exerciseId);
  return `
    <article class="history-editor-exercise" data-history-entry-id="${entry.id}">
      <h3>${escapeHtml(exercise ? formatExerciseDisplayName(exercise) : "Unknown")}</h3>
      <div class="history-editor-table">
        <div class="history-editor-row history-editor-head">
          <span>Set</span>
          <span>Type</span>
          <span>kg</span>
          <span>Reps</span>
          <span>RPE</span>
        </div>
        ${entry.sets.map((set, index) => `
          <div class="history-editor-row" data-history-set-id="${set.id}">
            <span class="set-badge ${escapeAttr(set.type)}">${escapeHtml(setLabel(set))}</span>
            <select data-field="history-set-type">
              ${["warmup", "working", "failure", "dropset"].map((type) => `<option value="${type}" ${set.type === type ? "selected" : ""}>${typeLabel(type)}</option>`).join("")}
            </select>
            <input type="number" inputmode="decimal" step="${exercise?.increment ?? 0.5}" data-field="history-weight" value="${set.weight ?? ""}">
            <input type="number" inputmode="numeric" min="0" step="1" data-field="history-reps" value="${set.reps ?? ""}">
            <input type="number" inputmode="decimal" min="0" max="10" step="0.5" data-field="history-rpe" value="${set.rpe ?? ""}">
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderTemplateEditor() {
  const template = modal.draft ?? state.templates.find((entry) => entry.id === modal.templateId);
  if (!template) return "";
  if (modal.reorderMode) return renderTemplateReorderEditor(template);
  return renderModalFrame("Edit Template", `
    <form class="settings-form" data-form="template-editor" data-template-id="${template.id}">
      <label>Name<input name="name" value="${escapeAttr(template.name)}"></label>
      <label>Location<input name="location" value="${escapeAttr(template.location)}"></label>
    </form>
    <div class="template-editor-list">
      ${template.exercises.map((row) => renderTemplateEditorExercise(template, row)).join("")}
    </div>
    <button class="secondary-wide" data-action="template-add-exercise" data-template-id="${template.id}">${icon("plus")} Add Exercise</button>
  `, `
    <button class="primary-wide" data-action="save-template-editor" data-template-id="${template.id}">Save Template</button>
  `);
}

function renderTemplateEditorExercise(template, row) {
  const exercise = getExercise(state, row.exerciseId);
  const isMenuOpen = modal.menuRowId === row.id;
  return `
    <article class="template-editor-exercise" data-template-row-id="${row.id}">
      <div class="template-exercise-title-row">
        <strong>${escapeHtml(exercise ? formatExerciseDisplayName(exercise) : "Unknown")}</strong>
        <div class="exercise-tools">
          <button class="mini-icon" data-action="open-template-row-menu" data-template-id="${template.id}" data-row-id="${row.id}" aria-label="Template exercise menu">${icon("more")}</button>
          <button class="mini-icon danger" data-action="remove-template-row" data-template-id="${template.id}" data-row-id="${row.id}" aria-label="Remove exercise">${icon("x")}</button>
        </div>
      </div>
      ${isMenuOpen ? `
        <div class="template-row-menu">
          <button data-action="replace-template-row" data-template-id="${template.id}" data-row-id="${row.id}">${icon("swap")} Replace Exercise</button>
          <button data-action="open-template-reorder" data-template-id="${template.id}">${icon("list")} Rearrange Exercises</button>
        </div>
      ` : ""}
      <div class="template-set-table">
        <div class="template-set-row template-table-head">
          <span>Set</span>
          <span>Type</span>
          <span aria-hidden="true"></span>
        </div>
        ${renderTemplateSetRows(template, row)}
      </div>
      <div class="template-set-actions">
        <button data-action="template-add-warmup" data-template-id="${template.id}" data-row-id="${row.id}">${icon("plus")} W</button>
        <button data-action="template-remove-warmup" data-template-id="${template.id}" data-row-id="${row.id}">${icon("minus")} W</button>
        <button data-action="template-add-working" data-template-id="${template.id}" data-row-id="${row.id}">${icon("plus")} Set</button>
        <button data-action="template-remove-working" data-template-id="${template.id}" data-row-id="${row.id}">${icon("minus")} Set</button>
      </div>
    </article>
  `;
}

function renderTemplateReorderEditor(template) {
  const rowsById = new Map(template.exercises.map((row) => [row.id, row]));
  const orderedIds = normalizedTemplateReorderIds(template);
  return renderModalFrame("Rearrange Exercises", `
    <div class="template-reorder-list" data-template-id="${template.id}">
      ${orderedIds.map((rowId, index) => {
        const row = rowsById.get(rowId);
        const exercise = getExercise(state, row?.exerciseId);
        return `
          <div class="template-reorder-row" draggable="true" data-reorder-row-id="${rowId}">
            <span class="drag-handle">${icon("grip")}</span>
            <strong>${escapeHtml(exercise ? formatExerciseDisplayName(exercise) : "Unknown")}</strong>
            <div class="reorder-controls">
              <button class="mini-icon" data-action="move-template-reorder" data-row-id="${rowId}" data-direction="up" ${index === 0 ? "disabled" : ""} aria-label="Move up">${icon("up")}</button>
              <button class="mini-icon" data-action="move-template-reorder" data-row-id="${rowId}" data-direction="down" ${index === orderedIds.length - 1 ? "disabled" : ""} aria-label="Move down">${icon("down")}</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `, `
    <button class="secondary-wide" data-action="cancel-template-reorder" data-template-id="${template.id}">Cancel</button>
    <button class="primary-wide" data-action="confirm-template-reorder" data-template-id="${template.id}">Confirm Order</button>
  `);
}

function renderTemplateSetRows(template, row) {
  const rows = [];
  const warmupSets = normalizeSetCount(row.warmupSets);
  const workingSets = Math.max(1, normalizeSetCount(row.workingSets));
  for (let index = 0; index < warmupSets; index += 1) {
    rows.push({ label: "W", type: "warmup", name: "Warmup" });
  }
  for (let index = 1; index <= workingSets; index += 1) {
    rows.push({ label: String(index), type: "working", name: "Working" });
  }
  return rows.map((set) => `
    <div class="template-set-row">
      <span class="set-badge ${set.type}">${escapeHtml(set.label)}</span>
      <span>${escapeHtml(set.name)}</span>
      <button class="mini-icon danger" data-action="${set.type === "warmup" ? "template-remove-warmup" : "template-remove-working"}" data-template-id="${template.id}" data-row-id="${row.id}" aria-label="Remove ${escapeHtml(set.name)} set">${icon("x")}</button>
    </div>
  `).join("");
}

function renderFinishTemplateChoice() {
  const session = state.activeSession;
  const hasTemplateChanges = Boolean(session?.templateDirty);
  return renderModalFrame(hasTemplateChanges ? "Save Template Changes" : "Finish Workout", `
    <p class="modal-copy">${hasTemplateChanges
      ? "This workout no longer matches its template. Save those layout changes?"
      : "Finish this workout, or keep this exact layout as a new template."}</p>
    <label class="single-field">New template name<input data-field="new-template-name" value="${escapeAttr(`${session?.templateName ?? "Workout"} Copy`)}"></label>
  `, `
    <button class="primary-wide" data-action="finish-save-new-template">Save New Template</button>
    ${hasTemplateChanges ? `<button class="secondary-wide" data-action="finish-overwrite-template">Overwrite Template</button>` : ""}
    <button class="secondary-wide" data-action="finish-only">Finish Only</button>
  `);
}

function renderStartLocationModal() {
  const template = state.templates.find((entry) => entry.id === modal.templateId);
  const choice = modal.locationChoice ?? LOCATION_OPTIONS[0];
  const customValue = modal.customLocation ?? "";
  return renderModalFrame("Workout Location", `
    <form class="settings-form" data-form="start-location">
      <label>Template<input disabled value="${escapeAttr(template?.name ?? "Workout")}"></label>
      <label>Location
        <select name="locationChoice" data-field="workout-location-choice">
          ${LOCATION_OPTIONS.map((location) => `<option value="${escapeAttr(location)}" ${choice === location ? "selected" : ""}>${escapeHtml(location)}</option>`).join("")}
          <option value="${OTHER_LOCATION_VALUE}" ${choice === OTHER_LOCATION_VALUE ? "selected" : ""}>Other</option>
        </select>
      </label>
      ${choice === OTHER_LOCATION_VALUE ? `
        <label>Custom location<input name="customLocation" data-field="custom-workout-location" value="${escapeAttr(customValue)}" placeholder="Gym name"></label>
      ` : ""}
    </form>
  `, `
    <button class="primary-wide" data-action="start-template-confirm">Start Workout</button>
  `);
}

function renderFocusModal() {
  const sessionExercise = state.activeSession?.exercises.find((entry) => entry.id === modal.sessionExerciseId);
  const exercise = getExercise(state, sessionExercise?.exerciseId);
  const working = sessionExercise?.sets.filter((set) => set.type === "working") ?? [];
  const totalVolume = working.reduce((sum, set) => sum + (Math.abs(Number(set.weight)) || 0) * (Number(set.reps) || 0), 0);
  const totalReps = working.reduce((sum, set) => sum + (Number(set.reps) || 0), 0);
  const avgWeight = working.length ? working.reduce((sum, set) => sum + (Math.abs(Number(set.weight)) || 0), 0) / working.length : 0;
  return renderModalFrame("Focus Metric", `
    <div class="metric-list">
      <div><strong>Total Volume</strong><span>${formatNumber(totalVolume)} kg</span></div>
      <div><strong>Total Reps</strong><span>${formatNumber(totalReps)} reps</span></div>
      <div><strong>Weight/Set</strong><span>${exercise?.loadMode === "bodyweight" ? "BW" : `${formatNumber(avgWeight)} kg`}</span></div>
      <div><strong>Working Sets</strong><span>${working.length}</span></div>
    </div>
  `);
}

function renderDataMenu() {
  return renderModalFrame("Data", `
    <div class="menu-list">
      <button data-action="export-backup">${icon("download")} Export backup</button>
      <button data-action="export-exercises">${icon("download")} Push exercises to repo JSON</button>
      <button data-action="export-templates">${icon("download")} Push templates to repo JSON</button>
      <button data-view="data">${icon("database")} Open data screen</button>
    </div>
  `);
}

function renderSessionActions() {
  const session = state.activeSession;
  return renderModalFrame("Workout Options", `
    <div class="menu-list">
      <button data-action="save-session-template-copy">${icon("plus")} Save as New Template</button>
      <button data-action="overwrite-session-template-now">${icon("download")} Overwrite Current Template</button>
      <button data-action="open-add-exercise">${icon("plus")} Add Exercises</button>
    </div>
  `, session?.templateDirty ? `<p class="modal-copy">Template changes are pending for this workout.</p>` : "");
}

async function handleClick(event) {
  const actionTarget = event.target.closest("[data-action], [data-view]");
  const backdrop = event.target.closest(".modal-backdrop");
  if (backdrop && !event.target.closest(".modal-sheet")) {
    closeModal();
    return;
  }

  if (!actionTarget) return;

  if (actionTarget.dataset.modalSheet != null) return;

  const view = actionTarget.dataset.view;
  if (view) {
    if (!confirmDiscardModalChanges()) return;
    currentView = view;
    modal = null;
    render();
    return;
  }

  const action = actionTarget.dataset.action;
  await runAction(action, actionTarget);
}

function handleDragStart(event) {
  const row = event.target.closest("[data-reorder-row-id]");
  if (!row || modal?.type !== "template-editor" || !modal.reorderMode) return;
  modal.dragRowId = row.dataset.reorderRowId;
  row.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", modal.dragRowId);
}

function handleDragOver(event) {
  const row = event.target.closest("[data-reorder-row-id]");
  if (!row || modal?.type !== "template-editor" || !modal.reorderMode) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  row.classList.toggle("drop-after", event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2);
}

function handleDrop(event) {
  const row = event.target.closest("[data-reorder-row-id]");
  if (!row || modal?.type !== "template-editor" || !modal.reorderMode) return;
  event.preventDefault();
  const sourceRowId = event.dataTransfer.getData("text/plain") || modal.dragRowId;
  const targetRowId = row.dataset.reorderRowId;
  const placeAfter = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
  dropTemplateReorderRow(sourceRowId, targetRowId, placeAfter);
  modal.dragRowId = null;
  render();
}

function handleDragEnd() {
  document.querySelectorAll(".template-reorder-row.is-dragging, .template-reorder-row.drop-after").forEach((row) => {
    row.classList.remove("is-dragging", "drop-after");
  });
  if (modal?.dragRowId) modal.dragRowId = null;
}

async function runAction(action, target) {
  switch (action) {
    case "go-home":
      if (!confirmDiscardModalChanges()) return;
      currentView = "workout";
      modal = null;
      render();
      break;
    case "start-template":
      if (state.activeSession && !confirm("Replace the active workout?")) return;
      openStartLocationModal(target.dataset.templateId);
      render();
      break;
    case "start-template-confirm": {
      const location = selectedWorkoutLocation();
      if (!location) {
        alert("Choose a workout location first.");
        return;
      }
      state.activeSession = createSessionFromTemplate(state, modal.templateId, location);
      state.settings.lastWorkoutLocation = location;
      currentView = "workout";
      modal = null;
      await persist();
      render();
      break;
    }
    case "finish-workout":
      if (!state.activeSession) return;
      modal = { type: "finish-template-choice" };
      render();
      break;
    case "finish-save-new-template": {
      const input = document.querySelector("[data-field='new-template-name']");
      saveActiveAsNewTemplate(state, input?.value?.trim() || `${state.activeSession.templateName} Copy`);
      await finishWorkout();
      break;
    }
    case "finish-overwrite-template":
      overwriteTemplateFromActive(state);
      await finishWorkout();
      break;
    case "finish-only":
      await finishWorkout();
      break;
    case "cancel-workout":
      if (!confirm("Cancel this workout? Unsaved set rows will be lost.")) return;
      state.activeSession = null;
      await persist();
      render();
      break;
    case "toggle-set-complete":
      updateSet(target, (set) => {
        set.completed = !set.completed;
      });
      await persist();
      render();
      break;
    case "cycle-set-type":
      updateSet(target, (set) => {
        set.type = nextSetType(set.type);
      });
      normalizeActiveExercise(target.dataset.sessionExerciseId);
      state.activeSession.templateDirty = true;
      await persist();
      render();
      break;
    case "add-working-set":
      addSetToSessionExercise(state, target.dataset.sessionExerciseId, "working");
      await persist();
      render();
      break;
    case "add-warmup-set":
      addSetToSessionExercise(state, target.dataset.sessionExerciseId, "warmup");
      modal = modal?.type === "exercise-menu" ? null : modal;
      await persist();
      render();
      break;
    case "open-exercise-menu":
      modal = { type: "exercise-menu", sessionExerciseId: target.dataset.sessionExerciseId };
      render();
      break;
    case "open-focus":
      modal = { type: "focus", sessionExerciseId: target.dataset.sessionExerciseId };
      render();
      break;
    case "replace-exercise":
      modal = { type: "exercise-picker", mode: "replace", sessionExerciseId: target.dataset.sessionExerciseId, filter: "" };
      render();
      break;
    case "open-add-exercise":
      modal = { type: "exercise-picker", mode: "add", filter: "" };
      render();
      break;
    case "select-exercise":
      if (modal?.mode === "replace") {
        const current = state.activeSession?.exercises.find((entry) => entry.id === modal.sessionExerciseId);
        if (sessionExerciseHasEnteredWork(current) && !confirm("Replace this exercise? Completed or edited rows on it will be discarded.")) return;
        replaceSessionExercise(state, modal.sessionExerciseId, target.dataset.exerciseId);
      } else if (modal?.mode === "template-add") {
        addExerciseToTemplateDraft(modal, target.dataset.exerciseId);
        modal = {
          type: "template-editor",
          templateId: modal.templateId,
          draft: modal.draft,
          dirty: true,
          isNew: modal.isNew,
          restoreScrollTop: modal.returnScrollTop
        };
        await persist();
        render();
        break;
      } else if (modal?.mode === "template-replace") {
        replaceExerciseInTemplateDraft(modal, modal.rowId, target.dataset.exerciseId);
        modal = {
          type: "template-editor",
          templateId: modal.templateId,
          draft: modal.draft,
          dirty: true,
          isNew: modal.isNew,
          menuRowId: null,
          restoreScrollTop: modal.returnScrollTop
        };
        await persist();
        render();
        break;
      } else {
        addExerciseToSession(state, target.dataset.exerciseId);
      }
      modal = null;
      await persist();
      render();
      break;
    case "remove-session-exercise":
      if (!confirm("Remove this exercise from the current workout?")) return;
      state.activeSession.exercises = state.activeSession.exercises.filter((entry) => entry.id !== target.dataset.sessionExerciseId);
      state.activeSession.templateDirty = true;
      modal = null;
      await persist();
      render();
      break;
    case "add-note": {
      const note = prompt("Exercise note");
      if (note != null) {
        const entry = state.activeSession.exercises.find((item) => item.id === target.dataset.sessionExerciseId);
        if (entry) entry.note = note.trim();
      }
      modal = null;
      await persist();
      render();
      break;
    }
    case "open-exercise-history":
      modal = { type: "exercise-history", exerciseId: target.dataset.exerciseId };
      render();
      break;
    case "edit-workout-history":
      openWorkoutHistoryEditor(target.dataset.sessionId);
      render();
      break;
    case "save-workout-history":
      if (saveWorkoutHistoryEditor(target.dataset.sessionId)) {
        modal = null;
        await persist();
        renderToast("Workout updated");
        render();
      }
      break;
    case "delete-workout-history":
      if (!confirm("Delete this workout from history? This removes every exercise log in it.")) return;
      deleteWorkoutHistory(target.dataset.sessionId);
      await persist();
      renderToast("Workout deleted");
      render();
      break;
    case "delete-workout-history-from-editor":
      if (!confirm("Delete this workout from history? This removes every exercise log in it.")) return;
      deleteWorkoutHistory(target.dataset.sessionId);
      modal = null;
      await persist();
      renderToast("Workout deleted");
      render();
      break;
    case "edit-exercise":
      openExerciseSettings(target.dataset.exerciseId);
      render();
      break;
    case "save-exercise-settings":
      if (saveExerciseSettings(target.dataset.exerciseId)) {
        modal = null;
        await persist();
        renderToast("Exercise saved");
        render();
      }
      break;
    case "duplicate-exercise":
      if (duplicateExerciseSettingsDraft(target.dataset.exerciseId)) {
        renderToast("Duplicate draft created");
        render();
      }
      break;
    case "open-new-exercise":
      createNewExercise();
      render();
      break;
    case "edit-template":
      openTemplateEditor(target.dataset.templateId);
      render();
      break;
    case "duplicate-template":
      duplicateTemplate(target.dataset.templateId);
      await persist();
      renderToast("Template duplicated");
      render();
      break;
    case "open-new-template":
      createNewTemplate();
      render();
      break;
    case "template-add-exercise":
      syncTemplateDraftFromForm();
      const addTemplateScrollTop = currentModalScrollTop();
      modal = {
        type: "exercise-picker",
        mode: "template-add",
        templateId: target.dataset.templateId,
        draft: modal?.draft,
        dirty: modal?.dirty ?? false,
        isNew: modal?.isNew ?? false,
        returnScrollTop: addTemplateScrollTop,
        filter: ""
      };
      render();
      break;
    case "open-template-row-menu":
      syncTemplateDraftFromForm();
      modal.menuRowId = modal.menuRowId === target.dataset.rowId ? null : target.dataset.rowId;
      render();
      break;
    case "open-template-reorder":
      syncTemplateDraftFromForm();
      modal.reorderMode = true;
      modal.reorderIds = normalizedTemplateReorderIds(modal.draft);
      modal.editorScrollTop = currentModalScrollTop();
      modal.restoreScrollTop = 0;
      modal.menuRowId = null;
      render();
      break;
    case "cancel-template-reorder":
      modal.reorderMode = false;
      modal.reorderIds = null;
      modal.restoreScrollTop = modal.editorScrollTop ?? 0;
      render();
      break;
    case "confirm-template-reorder":
      applyTemplateReorder();
      modal.reorderMode = false;
      modal.reorderIds = null;
      modal.restoreScrollTop = modal.editorScrollTop ?? 0;
      modal.dirty = true;
      render();
      break;
    case "move-template-reorder":
      moveTemplateReorderRow(target.dataset.rowId, target.dataset.direction);
      render();
      break;
    case "replace-template-row":
      syncTemplateDraftFromForm();
      const replaceTemplateScrollTop = currentModalScrollTop();
      modal = {
        type: "exercise-picker",
        mode: "template-replace",
        templateId: target.dataset.templateId,
        rowId: target.dataset.rowId,
        draft: modal?.draft,
        dirty: modal?.dirty ?? false,
        isNew: modal?.isNew ?? false,
        returnScrollTop: replaceTemplateScrollTop,
        filter: ""
      };
      render();
      break;
    case "template-add-warmup":
      changeTemplateSetCount(target.dataset.templateId, target.dataset.rowId, "warmupSets", 1);
      render();
      break;
    case "template-remove-warmup":
      changeTemplateSetCount(target.dataset.templateId, target.dataset.rowId, "warmupSets", -1);
      render();
      break;
    case "template-add-working":
      changeTemplateSetCount(target.dataset.templateId, target.dataset.rowId, "workingSets", 1);
      render();
      break;
    case "template-remove-working":
      changeTemplateSetCount(target.dataset.templateId, target.dataset.rowId, "workingSets", -1);
      render();
      break;
    case "remove-template-row":
      if (!confirm("Remove this exercise from the template?")) return;
      removeTemplateRow(target.dataset.templateId, target.dataset.rowId);
      render();
      break;
    case "save-template-editor":
      saveTemplateEditor(target.dataset.templateId);
      modal = null;
      await persist();
      renderToast("Template saved");
      render();
      break;
    case "export-backup":
      exportBackup();
      modal = null;
      render();
      break;
    case "export-exercises":
      await exportExercisesBackup();
      modal = null;
      render();
      break;
    case "export-templates":
      await exportTemplatesBackup();
      modal = null;
      render();
      break;
    case "open-data-menu":
      modal = { type: "data-menu" };
      render();
      break;
    case "open-template-session-actions":
      modal = { type: "session-actions" };
      render();
      break;
    case "save-session-template-copy": {
      const name = prompt("New template name", `${state.activeSession?.templateName ?? "Workout"} Copy`);
      if (name?.trim()) {
        saveActiveAsNewTemplate(state, name.trim());
        modal = null;
        await persist();
        renderToast("Template saved");
        render();
      }
      break;
    }
    case "overwrite-session-template-now":
      if (!confirm("Overwrite the current template with this workout layout?")) return;
      overwriteTemplateFromActive(state);
      modal = null;
      await persist();
      renderToast("Template overwritten");
      render();
      break;
    case "reset-seed":
      if (!confirm("Reload seed data and clear local edits/history?")) return;
      localStorage.removeItem("overloader-state");
      state = await replaceState((await import("./data.js")).createInitialState());
      renderToast("Seed data reloaded");
      render();
      break;
    case "close-modal":
      closeModal();
      break;
    default:
      break;
  }
}

async function finishWorkout() {
  if (!state.activeSession) return;
  const completedSets = state.activeSession.exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.completed).length,
    0
  );
  if (!completedSets && !confirm("No sets are checked complete, so no exercise history will be saved. Finish and discard this workout?")) return;
  const result = finishActiveSession(state);
  state = result.state;
  modal = null;
  await persist();
  renderToast(`${result.savedCount} exercise logs saved`);
  render();
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.field === "custom-workout-location" && modal?.type === "start-location") {
    modal.customLocation = target.value;
    return;
  }

  if (target.dataset.field === "custom-exercise-location" && modal?.type === "exercise-settings") {
    modal.customLocation = target.value;
    modal.dirty = true;
    return;
  }

  if (target.dataset.field === "custom-exercise-tag" && modal?.type === "exercise-settings") {
    const field = target.dataset.tagField;
    if (!field) return;
    modal.customTags = {
      ...(modal.customTags ?? {}),
      [field]: target.value
    };
    if (modal.draft) modal.draft[field] = target.value;
    modal.dirty = true;
    return;
  }

  if (target.dataset.action === "picker-filter") {
    modal.filter = target.value;
    render();
    restoreInputFocus("[data-action='picker-filter']", target.value.length);
    return;
  }

  if (target.dataset.action === "filter-exercises") {
    exerciseFilter = target.value;
    render();
    restoreInputFocus("[data-action='filter-exercises']", target.value.length);
    return;
  }

  if (markModalFormDirty(target)) return;

  if (target.dataset.field && target.dataset.setId) {
    updateSet(target, (set, exercise) => {
      const field = target.dataset.field;
      set.touched = true;
      if (field === "weight") set.weight = normalizeInputWeight(clampInputValue(target.value, 0), exercise);
      if (field === "reps") set.reps = target.value === "" ? "" : Math.round(clampInputValue(target.value, 0));
      if (field === "rpe") {
        set.rpe = target.value === "" ? "" : clampInputValue(target.value, 0, 10);
        set.rir = rpeToRir(set.rpe);
      }
      if (field === "rir") {
        set.rir = target.value === "" ? "" : clampInputValue(target.value, 0, 10);
        set.rpe = rirToRpe(set.rir);
      }
    });
    saveState(state);
  }

  if (target.dataset.field === "template-warmups" || target.dataset.field === "template-working") {
    const template = modal?.type === "template-editor" ? modal.draft : state.templates.find((entry) => entry.id === target.dataset.templateId);
    const row = template?.exercises.find((entry) => entry.id === target.dataset.rowId);
    if (!row) return;
    if (target.dataset.field === "template-warmups") row.warmupSets = Math.round(clampInputValue(target.value, 0));
    if (target.dataset.field === "template-working") row.workingSets = Math.max(1, Math.round(clampInputValue(target.value, 1)));
    if (modal?.type === "template-editor") {
      modal.dirty = true;
    } else {
      saveState(state);
    }
  }
}

async function handleChange(event) {
  const target = event.target;
  if (target.dataset.field === "workout-location-choice" && modal?.type === "start-location") {
    modal.locationChoice = target.value;
    render();
    return;
  }

  if (target.dataset.field === "exercise-location-choice" && modal?.type === "exercise-settings") {
    syncExerciseSettingsDraftFromForm();
    modal.locationChoice = target.value;
    modal.dirty = true;
    render();
    return;
  }

  if (target.dataset.field === "exercise-tag-choice" && modal?.type === "exercise-settings") {
    const field = target.dataset.tagField;
    if (!field) return;
    syncExerciseSettingsDraftFromForm();
    modal.tagChoices = {
      ...(modal.tagChoices ?? {}),
      [field]: target.value
    };
    if (target.value !== CUSTOM_TAG_VALUE && modal.draft) modal.draft[field] = target.value;
    modal.dirty = true;
    render();
    return;
  }

  if (markModalFormDirty(target)) return;

  if (target.dataset.action === "category-filter") {
    categoryFilter = target.value;
    render();
    return;
  }

  if (target.dataset.action === "import-backup") {
    const file = target.files?.[0];
    if (!file) return;
    if (!confirm("Import this backup and replace local OverLoader data?")) {
      target.value = "";
      return;
    }
    const text = await file.text();
    try {
      state = await replaceState(JSON.parse(text));
      renderToast("Backup imported");
      render();
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  }
}

function updateSet(target, updater) {
  const sessionExercise = state.activeSession?.exercises.find((entry) => entry.id === target.dataset.sessionExerciseId);
  const set = sessionExercise?.sets.find((entry) => entry.id === target.dataset.setId);
  const exercise = getExercise(state, sessionExercise?.exerciseId);
  if (set && exercise) updater(set, exercise, sessionExercise);
}

function restoreInputFocus(selector, cursorPosition = null) {
  const input = document.querySelector(selector);
  if (!input) return;
  input.focus();
  if (typeof input.setSelectionRange === "function") {
    const position = cursorPosition ?? input.value.length;
    input.setSelectionRange(position, position);
  }
}

function clampInputValue(value, min, max = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function openStartLocationModal(templateId) {
  const location = defaultWorkoutLocation(templateId);
  const isStandard = LOCATION_OPTIONS.includes(location);
  modal = {
    type: "start-location",
    templateId,
    locationChoice: isStandard ? location : OTHER_LOCATION_VALUE,
    customLocation: isStandard ? "" : location
  };
}

function defaultWorkoutLocation(templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);
  const templateLocation = normalizeLocationName(template?.location);
  if (templateLocation && templateLocation !== "Mixed") return templateLocation;
  return defaultNewLocation();
}

function defaultNewLocation() {
  return normalizeLocationName(state.activeSession?.location)
    || normalizeLocationName(state.settings.lastWorkoutLocation)
    || normalizeLocationName(state.settings.homeLocation)
    || LOCATION_OPTIONS[0];
}

function selectedWorkoutLocation() {
  if (modal?.type !== "start-location") return "";
  if (modal.locationChoice === OTHER_LOCATION_VALUE) {
    return normalizeLocationName(modal.customLocation);
  }
  return normalizeLocationName(modal.locationChoice);
}

function selectedExerciseSettingsLocation(data, fallbackLocation) {
  const locationChoice = String(data.get("locationChoice") || "").trim();
  if (locationChoice === OTHER_LOCATION_VALUE) {
    return normalizeLocationName(data.get("customLocation") || fallbackLocation);
  }
  return normalizeLocationName(locationChoice || fallbackLocation);
}

function selectedExerciseTag(data, field, fallbackValue) {
  const choice = String(data.get(`${field}Choice`) || "").trim();
  const rawValue = choice === CUSTOM_TAG_VALUE
    ? data.get(`${field}Custom`)
    : choice;
  return String(rawValue || fallbackValue || "").trim();
}

function markModalFormDirty(target) {
  if (modal?.type === "template-editor" && target.closest("[data-form='template-editor']")) {
    syncTemplateDraftFromForm();
    modal.dirty = true;
    return true;
  }

  if (modal?.type === "exercise-settings" && target.closest("[data-form='exercise-settings']")) {
    syncExerciseSettingsDraftFromForm();
    modal.dirty = true;
    return true;
  }

  if (modal?.type === "workout-history-editor" && target.closest("[data-form='workout-history-editor'], .history-editor-list")) {
    modal.dirty = true;
    return true;
  }

  return false;
}

function sessionExerciseHasEnteredWork(sessionExercise) {
  if (!sessionExercise) return false;
  return Boolean(sessionExercise.note?.trim()) || sessionExercise.sets.some((set) => set.completed || set.touched);
}

function normalizeActiveExercise(sessionExerciseId) {
  const sessionExercise = state.activeSession?.exercises.find((entry) => entry.id === sessionExerciseId);
  if (!sessionExercise) return;
  let workingIndex = 1;
  for (const set of sessionExercise.sets) {
    if (set.type === "warmup") set.label = "W";
    else if (set.type === "failure") set.label = "F";
    else if (set.type === "dropset") set.label = "D";
    else {
      set.label = String(workingIndex);
      workingIndex += 1;
    }
  }
}

function openExerciseSettings(exerciseId) {
  const exercise = getExercise(state, exerciseId);
  if (!exercise) return;
  modal = {
    type: "exercise-settings",
    exerciseId,
    draft: clone(exercise),
    dirty: false,
    isNew: false
  };
}

function saveExerciseSettings(exerciseId) {
  const source = modal?.draft ?? getExercise(state, exerciseId);
  const next = readExerciseSettingsForm(exerciseId, source);
  if (!next) return false;
  const index = state.exercises.findIndex((exercise) => exercise.id === exerciseId);
  if (index >= 0) {
    state.exercises[index] = next;
  } else {
    state.exercises.push(next);
  }
  return true;
}

function duplicateExerciseSettingsDraft(exerciseId) {
  const source = modal?.draft ?? getExercise(state, exerciseId);
  const current = readExerciseSettingsForm(exerciseId, source);
  if (!current) return false;
  const id = uid("exercise");
  const location = alternateStandardLocation(current.location);
  modal = {
    type: "exercise-settings",
    exerciseId: id,
    draft: {
      ...current,
      id,
      location
    },
    dirty: true,
    isNew: true,
    locationChoice: LOCATION_OPTIONS.includes(location) ? location : OTHER_LOCATION_VALUE,
    customLocation: LOCATION_OPTIONS.includes(location) ? "" : location
  };
  return true;
}

function readExerciseSettingsForm(exerciseId, source) {
  const form = document.querySelector(`[data-form='exercise-settings'][data-exercise-id='${cssEscape(exerciseId)}']`);
  if (!form || !source) return null;
  const data = new FormData(form);
  const equipment = selectedExerciseTag(data, "equipment", source.equipment);
  const next = {
    ...source,
    name: normalizeExerciseName(data.get("name") || source.name, equipment),
    category: selectedExerciseTag(data, "category", source.category),
    location: selectedExerciseSettingsLocation(data, source.location),
    equipment,
    defaultWarmupSets: Math.round(clampInputValue(data.get("defaultWarmupSets"), 0)),
    defaultWorkingSets: Math.max(1, Math.round(clampInputValue(data.get("defaultWorkingSets"), 1))),
    repMin: Math.max(1, Math.round(clampInputValue(data.get("repMin"), 1))),
    targetRpe: clampInputValue(data.get("targetRpe"), 1, 10),
    increment: clampInputValue(data.get("increment"), 0.25),
    loadMode: String(data.get("loadMode") || "external"),
    notes: String(data.get("notes") || ""),
    needsReview: false
  };
  next.repMax = Math.max(next.repMin, Math.round(clampInputValue(data.get("repMax"), next.repMin)));
  return next;
}

function syncExerciseSettingsDraftFromForm() {
  if (modal?.type !== "exercise-settings" || !modal.draft) return;
  const current = readExerciseSettingsForm(modal.exerciseId, modal.draft);
  if (current) modal.draft = current;
}

function alternateStandardLocation(location) {
  const normalized = normalizeLocationName(location);
  if (normalized === LOCATION_OPTIONS[0]) return LOCATION_OPTIONS[1] ?? LOCATION_OPTIONS[0];
  if (normalized === LOCATION_OPTIONS[1]) return LOCATION_OPTIONS[0];
  return LOCATION_OPTIONS[0];
}

function createNewExercise() {
  const id = uid("exercise");
  modal = {
    type: "exercise-settings",
    exerciseId: id,
    isNew: true,
    dirty: true,
    draft: {
      id,
      name: "New Exercise",
      category: "Other",
      equipment: "machine",
      location: defaultNewLocation(),
      increment: 2.5,
      repMin: 8,
      repMax: 12,
      targetRpe: 8,
      defaultWarmupSets: 1,
      defaultWorkingSets: 3,
      loadMode: "external",
      needsReview: false,
      notes: ""
    }
  };
}

function openWorkoutHistoryEditor(sessionId) {
  const entries = workoutHistoryEntries(sessionId);
  if (!entries.length) return;
  modal = {
    type: "workout-history-editor",
    sessionId,
    draft: clone(entries),
    dirty: false
  };
}

function saveWorkoutHistoryEditor(sessionId) {
  const draft = modal?.draft;
  const form = document.querySelector(`[data-form='workout-history-editor'][data-session-id='${cssEscape(sessionId)}']`);
  if (!draft?.length || !form) return false;
  const data = new FormData(form);
  const workoutName = String(data.get("workoutName") || draft[0].workoutName || "Workout").trim();
  const location = normalizeLocationName(data.get("location") || draft[0].location || "");
  const performedAt = parseDateTimeInput(data.get("performedAt"), draft[0].performedAt);

  for (const entry of draft) {
    entry.workoutName = workoutName;
    entry.location = location;
    entry.performedAt = performedAt;
    const entryElement = document.querySelector(`[data-history-entry-id='${cssEscape(entry.id)}']`);
    for (const set of entry.sets) {
      const setElement = entryElement?.querySelector(`[data-history-set-id='${cssEscape(set.id)}']`);
      if (!setElement) continue;
      const type = setElement.querySelector("[data-field='history-set-type']")?.value ?? set.type;
      const weightValue = setElement.querySelector("[data-field='history-weight']")?.value ?? "";
      const repsValue = setElement.querySelector("[data-field='history-reps']")?.value ?? "";
      const rpeValue = setElement.querySelector("[data-field='history-rpe']")?.value ?? "";
      set.type = type;
      set.weight = weightValue === "" ? null : Number(weightValue);
      set.reps = repsValue === "" ? 0 : Math.round(clampInputValue(repsValue, 0));
      set.rpe = rpeValue === "" ? null : clampInputValue(rpeValue, 0, 10);
      set.rir = set.rpe == null ? null : rpeToRir(set.rpe);
      set.completed = true;
    }
  }

  const byId = new Map(draft.map((entry) => [entry.id, entry]));
  state.history = state.history.map((entry) => byId.has(entry.id) ? clone(byId.get(entry.id)) : entry);
  state.updatedAt = new Date().toISOString();
  return true;
}

function deleteWorkoutHistory(sessionId) {
  const before = state.history.length;
  state.history = state.history.filter((entry) => historyWorkoutKey(entry) !== sessionId);
  state.updatedAt = new Date().toISOString();
  return before - state.history.length;
}

function duplicateTemplate(templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template) return;
  state.templates.push({
    ...clone(template),
    id: uid("template"),
    name: `${template.name} Copy`,
    updatedAt: new Date().toISOString(),
    exercises: template.exercises.map((row) => ({ ...row, id: uid("tpl-row") }))
  });
}

function openTemplateEditor(templateId) {
  const template = state.templates.find((entry) => entry.id === templateId);
  if (!template) return;
  modal = {
    type: "template-editor",
    templateId,
    draft: clone(template),
    dirty: false,
    isNew: false
  };
}

function createNewTemplate() {
  const id = uid("template");
  modal = {
    type: "template-editor",
    templateId: id,
    isNew: true,
    dirty: true,
    draft: {
      id,
      name: "New Template",
      location: defaultNewLocation(),
      updatedAt: new Date().toISOString(),
      exercises: []
    }
  };
}

function addExerciseToTemplateDraft(templateModal, exerciseId) {
  const template = templateModal.draft;
  const exercise = getExercise(state, exerciseId);
  if (!template || !exercise) return;
  template.exercises.push({
    id: uid("tpl-row"),
    exerciseId,
    warmupSets: exercise.defaultWarmupSets,
    workingSets: exercise.defaultWorkingSets
  });
  template.updatedAt = new Date().toISOString();
  templateModal.dirty = true;
}

function normalizedTemplateReorderIds(template) {
  if (!template?.exercises) return [];
  const currentIds = template.exercises.map((row) => row.id);
  const currentIdSet = new Set(currentIds);
  const ordered = (modal?.reorderIds ?? [])
    .filter((rowId) => currentIdSet.has(rowId));
  for (const rowId of currentIds) {
    if (!ordered.includes(rowId)) ordered.push(rowId);
  }
  if (modal?.type === "template-editor" && modal.reorderMode) modal.reorderIds = ordered;
  return ordered;
}

function applyTemplateReorder() {
  if (modal?.type !== "template-editor" || !modal.draft) return;
  const rowsById = new Map(modal.draft.exercises.map((row) => [row.id, row]));
  const orderedRows = normalizedTemplateReorderIds(modal.draft)
    .map((rowId) => rowsById.get(rowId))
    .filter(Boolean);
  modal.draft.exercises = orderedRows;
  modal.draft.updatedAt = new Date().toISOString();
}

function moveTemplateReorderRow(rowId, direction) {
  if (modal?.type !== "template-editor" || !modal.reorderMode) return;
  const ordered = normalizedTemplateReorderIds(modal.draft);
  const index = ordered.indexOf(rowId);
  if (index < 0) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= ordered.length) return;
  [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
  modal.reorderIds = ordered;
}

function dropTemplateReorderRow(sourceRowId, targetRowId, placeAfter) {
  if (modal?.type !== "template-editor" || !modal.reorderMode || sourceRowId === targetRowId) return;
  const ordered = normalizedTemplateReorderIds(modal.draft);
  const sourceIndex = ordered.indexOf(sourceRowId);
  const targetIndex = ordered.indexOf(targetRowId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  ordered.splice(sourceIndex, 1);
  const adjustedTargetIndex = ordered.indexOf(targetRowId);
  ordered.splice(adjustedTargetIndex + (placeAfter ? 1 : 0), 0, sourceRowId);
  modal.reorderIds = ordered;
}

function replaceExerciseInTemplateDraft(templateModal, rowId, exerciseId) {
  const template = templateModal.draft;
  const exercise = getExercise(state, exerciseId);
  const row = template?.exercises.find((entry) => entry.id === rowId);
  if (!template || !exercise || !row) return false;
  row.exerciseId = exerciseId;
  row.warmupSets = normalizeSetCount(row.warmupSets ?? exercise.defaultWarmupSets);
  row.workingSets = Math.max(1, normalizeSetCount(row.workingSets ?? exercise.defaultWorkingSets));
  template.updatedAt = new Date().toISOString();
  templateModal.dirty = true;
  return true;
}

function changeTemplateSetCount(templateId, rowId, field, delta) {
  syncTemplateDraftFromForm();
  const template = modal?.type === "template-editor" ? modal.draft : state.templates.find((entry) => entry.id === templateId);
  const row = template?.exercises.find((entry) => entry.id === rowId);
  if (!row) return;
  const minimum = field === "workingSets" ? 1 : 0;
  row[field] = Math.max(minimum, normalizeSetCount(row[field]) + delta);
  template.updatedAt = new Date().toISOString();
  if (modal?.type === "template-editor") {
    modal.dirty = true;
  } else {
    saveState(state);
  }
}

function removeTemplateRow(templateId, rowId) {
  syncTemplateDraftFromForm();
  const template = modal?.type === "template-editor" ? modal.draft : state.templates.find((entry) => entry.id === templateId);
  if (!template) return;
  template.exercises = template.exercises.filter((row) => row.id !== rowId);
  template.updatedAt = new Date().toISOString();
  if (modal?.type === "template-editor") modal.dirty = true;
}

function saveTemplateEditor(templateId) {
  const draft = modal?.draft ?? state.templates.find((entry) => entry.id === templateId);
  const form = document.querySelector(`[data-form='template-editor'][data-template-id='${cssEscape(templateId)}']`);
  if (!draft || !form) return;
  const data = new FormData(form);
  draft.name = String(data.get("name") || draft.name).trim();
  draft.location = normalizeLocationName(data.get("location") || draft.location);
  draft.exercises = draft.exercises.map((row) => ({
    ...row,
    warmupSets: normalizeSetCount(row.warmupSets),
    workingSets: Math.max(1, normalizeSetCount(row.workingSets))
  }));
  draft.updatedAt = new Date().toISOString();
  const index = state.templates.findIndex((entry) => entry.id === templateId);
  if (index >= 0) {
    state.templates[index] = clone(draft);
  } else {
    state.templates.push(clone(draft));
  }
}

function syncTemplateDraftFromForm() {
  if (modal?.type !== "template-editor" || !modal.draft) return;
  const form = document.querySelector(`[data-form='template-editor'][data-template-id='${cssEscape(modal.templateId)}']`);
  if (!form) return;
  const data = new FormData(form);
  modal.draft.name = String(data.get("name") || modal.draft.name).trim();
  modal.draft.location = normalizeLocationName(data.get("location") || modal.draft.location);
}

function confirmDiscardModalChanges() {
  if (!modal?.dirty) return true;
  if (modal.type === "template-editor") return confirm("Discard unsaved template changes?");
  if (modal.type === "exercise-picker" && (modal.mode === "template-add" || modal.mode === "template-replace")) return confirm("Discard unsaved template changes?");
  if (modal.type === "exercise-settings") return confirm("Discard unsaved exercise changes?");
  if (modal.type === "workout-history-editor") return confirm("Discard unsaved workout changes?");
  return true;
}

function closeModal() {
  if (modal?.type === "exercise-picker" && (modal.mode === "template-add" || modal.mode === "template-replace") && modal.draft) {
    modal = {
      type: "template-editor",
      templateId: modal.templateId,
      draft: modal.draft,
      dirty: modal.dirty ?? false,
      isNew: modal.isNew ?? false,
      menuRowId: null,
      restoreScrollTop: modal.returnScrollTop
    };
    render();
    return;
  }

  if (!confirmDiscardModalChanges()) return;
  modal = null;
  render();
}

function exportBackup() {
  downloadJson(state, `overloader-backup-${dateStamp()}.json`);
  renderToast("Backup exported");
}

async function exportExercisesBackup() {
  const payload = {
    schema: "overloader-exercises",
    version: 1,
    exportedAt: new Date().toISOString(),
    count: state.exercises.length,
    exercises: state.exercises
      .slice()
      .map(normalizeExerciseRecord)
      .sort((a, b) => {
        const locationCompare = String(a.location).localeCompare(String(b.location));
        return locationCompare || String(a.name).localeCompare(String(b.name));
      })
  };
  if (await pushExercisesToRepo(payload)) {
    renderToast(`${state.exercises.length} exercises pushed to repo JSON`);
    return;
  }
  downloadJson(payload, `overloader-exercises-${dateStamp()}.json`);
  renderToast(`${state.exercises.length} exercises exported`);
}

async function exportTemplatesBackup() {
  const templates = state.templates
    .slice()
    .map(normalizeTemplateRecord)
    .sort((a, b) => {
      const locationCompare = String(a.location).localeCompare(String(b.location));
      return locationCompare || String(a.name).localeCompare(String(b.name));
    });
  const payload = {
    schema: "overloader-templates",
    version: 1,
    exportedAt: new Date().toISOString(),
    count: templates.length,
    templates
  };
  if (await pushTemplatesToRepo(payload)) {
    renderToast(`${templates.length} templates pushed to repo JSON`);
    return;
  }
  downloadJson(payload, `overloader-templates-${dateStamp()}.json`);
  renderToast(`${templates.length} templates exported`);
}

function normalizeTemplateRecord(template) {
  return {
    ...template,
    name: String(template.name ?? "").trim(),
    location: normalizeLocationName(template.location),
    exercises: Array.isArray(template.exercises)
      ? template.exercises.map((row) => ({
          ...row,
          warmupSets: normalizeSetCount(row.warmupSets),
          workingSets: normalizeSetCount(row.workingSets)
        }))
      : []
  };
}

function normalizeSetCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

async function pushExercisesToRepo(payload) {
  return pushPayloadToRepo("./api/exercises-repo", payload);
}

async function pushTemplatesToRepo(payload) {
  return pushPayloadToRepo("./api/templates-repo", payload);
}

async function pushPayloadToRepo(endpoint, payload) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function bestWorkingSet(entry, exercise) {
  const sets = entry.sets.filter((set) => set.type === "working");
  const best = sets
    .slice()
    .sort((a, b) => {
      const aVol = (Math.abs(Number(a.weight)) || 0) * (Number(a.reps) || 0);
      const bVol = (Math.abs(Number(b.weight)) || 0) * (Number(b.reps) || 0);
      return bVol - aVol;
    })[0] ?? entry.sets[0];
  return best ? formatSet(best, exercise) : "No sets";
}

function formatPrevious(set, exercise) {
  if (set.previousWeight == null && exercise.loadMode !== "bodyweight") return "None";
  return set.previousWeight == null
    ? `${set.previousReps ?? 0} reps`
    : `${formatWeight(set.previousWeight, exercise)} x ${set.previousReps ?? 0}`;
}

function setLabel(set) {
  if (set.type === "warmup") return "W";
  if (set.type === "failure") return "F";
  if (set.type === "dropset") return "D";
  return `${set.order + 1}`;
}

function nextSetType(type) {
  if (type === "warmup") return "working";
  if (type === "working") return "failure";
  if (type === "failure") return "dropset";
  return "warmup";
}

function typeLabel(type) {
  if (type === "warmup") return "Warmup";
  if (type === "failure") return "Failure";
  if (type === "dropset") return "Dropset";
  return "Working";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTimeInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseDateTimeInput(value, fallback) {
  const parsed = new Date(value || fallback);
  if (Number.isNaN(parsed.getTime())) return fallback || new Date().toISOString();
  return parsed.toISOString();
}

function formatElapsed(startedAt) {
  const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const totalSeconds = Math.floor(diff / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderToast(message) {
  toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = "";
    render();
  }, 2600);
}

function icon(name) {
  const paths = {
    rotate: `<path d="M20 11a8 8 0 1 1-2.34-5.66"/><path d="M20 4v7h-7"/>`,
    database: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>`,
    check: `<path d="m5 12 4 4L19 6"/>`,
    chart: `<path d="M4 19V5"/><path d="M4 19h16"/><circle cx="8" cy="15" r="2"/><circle cx="13" cy="11" r="2"/><circle cx="18" cy="7" r="2"/><path d="m9.5 13.5 2-1.5M14.5 9.5l2-1.5"/>`,
    down: `<path d="m6 9 6 6 6-6"/>`,
    grip: `<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>`,
    history: `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/><path d="M12 7v5l3 2"/>`,
    more: `<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>`,
    minus: `<path d="M5 12h14"/>`,
    plus: `<path d="M12 5v14M5 12h14"/>`,
    play: `<path d="m8 5 11 7-11 7z"/>`,
    list: `<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>`,
    dumbbell: `<path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/>`,
    download: `<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>`,
    upload: `<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>`,
    up: `<path d="m18 15-6-6-6 6"/>`,
    x: `<path d="M18 6 6 18M6 6l12 12"/>`,
    note: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>`,
    swap: `<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>`
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.more}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/'/g, "\\'");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    const registration = await navigator.serviceWorker.register("./sw.js?v=1.2.8");
    await registration.update();
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}
