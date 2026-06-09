import { h, render } from 'https://unpkg.com/preact@10.15.1/dist/preact.module.js';
import { useState, useEffect } from 'https://unpkg.com/preact@10.15.1/hooks/dist/hooks.module.js';
import { html } from './preact-setrow.js';
import { Icon, TemplateCard, bestWorkingSet } from './preact-workout.js';
import { formatExerciseDisplayName } from './data.js';
import { getExercise, latestPerformance } from './logic.js';

export function TemplatesTab({ state }) {
  return html`
    <div class="section-heading">
      <h1>Templates</h1>
      <button class="text-button" onClick=${() => window.OverLoaderAPI.runAction("open-new-template")}>New</button>
    </div>
    <div class="template-grid">
      ${state.templates.map(template => html`<${TemplateCard} key=${template.id} template=${template} startOnly=${false} />`)}
    </div>
  `;
}

export function ExercisesTab({ state }) {
  const filter = window.OverLoaderAPI.getExerciseFilter();
  const catFilter = window.OverLoaderAPI.getCategoryFilter();
  const categories = [...new Set(state.exercises.map(ex => ex.category))].sort();
  
  const visibleExercises = state.exercises
    .filter((exercise) => {
      const query = filter.trim().toLowerCase();
      const displayName = formatExerciseDisplayName(exercise).toLowerCase();
      const matchesQuery = !query
        || exercise.name.toLowerCase().includes(query)
        || displayName.includes(query)
        || exercise.category.toLowerCase().includes(query)
        || exercise.location.toLowerCase().includes(query)
        || exercise.equipment.toLowerCase().includes(query);
      const matchesCategory = !catFilter || exercise.category === catFilter;
      return matchesQuery && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return html`
    <div class="section-heading">
      <h1>Exercises</h1>
      <button class="text-button" onClick=${() => window.OverLoaderAPI.runAction("open-new-exercise")}>New</button>
    </div>
    <div class="filter-row">
      <input class="search-input" type="search" placeholder="Search" data-action="filter-exercises" value=${filter} />
      <select class="select-input" data-action="category-filter" value=${catFilter}>
        <option value="">Any Category</option>
        ${categories.map(category => html`<option key=${category} value=${category}>${category}</option>`)}
      </select>
    </div>
    <div class="exercise-list">
      ${visibleExercises.length > 0 
        ? visibleExercises.map(exercise => {
            const previous = latestPerformance(state, exercise.id);
            const best = previous ? bestWorkingSet(previous, exercise) : "No history";
            const displayName = formatExerciseDisplayName(exercise);
            return html`
              <button key=${exercise.id} class="exercise-list-item" onClick=${() => window.OverLoaderAPI.runAction("edit-exercise", { exerciseId: exercise.id })}>
                <span class="avatar">${displayName[0] ?? "?"}</span>
                <span class="exercise-list-main">
                  <strong>${displayName}</strong>
                  <em>${exercise.category} · ${exercise.location}</em>
                </span>
                <span class="exercise-list-side">${best}</span>
              </button>
            `;
          })
        : html`<p class="empty">No exercises match.</p>`
      }
    </div>
  `;
}

function historyWorkoutKey(entry) {
  return entry.sessionId || [
    entry.workoutName ?? "Workout",
    entry.performedAt ?? "",
    entry.location ?? ""
  ].join("|");
}

function workoutHistoryGroups(state) {
  const groups = new Map();
  for (const entry of state.history) {
    const key = historyWorkoutKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()]
    .map(([sessionId, entries]) => {
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
    })
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt));
}

export function HistoryTab({ state }) {
  const workouts = workoutHistoryGroups(state);
  return html`
    <div class="section-heading">
      <h1>History</h1>
    </div>
    <div class="workout-history-list">
      ${workouts.length > 0
        ? workouts.map(workout => html`
            <article key=${workout.sessionId} class="workout-history-card">
              <div class="workout-history-main">
                <h2>${workout.name}</h2>
                <span>${window.OverLoaderAPI.formatDateTime(workout.performedAt)} · ${workout.location}</span>
              </div>
              <div class="workout-history-metrics">
                <span><strong>${workout.exerciseCount}</strong> exercises</span>
                <span><strong>${workout.workingSetCount}</strong> working sets</span>
                <span><strong>${window.OverLoaderAPI.formatNumber(workout.totalVolume)}</strong> kg</span>
              </div>
              <div class="card-actions">
                <button class="secondary-button" onClick=${() => window.OverLoaderAPI.runAction("edit-workout-history", { sessionId: workout.sessionId })}>Edit</button>
                <button class="secondary-button danger-text" onClick=${() => window.OverLoaderAPI.runAction("delete-workout-history", { sessionId: workout.sessionId })}>Delete</button>
              </div>
            </article>
          `)
        : html`<p class="empty">No completed workouts yet.</p>`
      }
    </div>
  `;
}

function syncModeLabel(mode) {
  if (mode === "sync") return "Sync now";
  if (mode === "pull" || mode === "pulled") return "Pulled cloud to local";
  if (mode === "push" || mode === "pushed") return "Pushed local to cloud";
  if (mode === "clean") return "Already current";
  if (mode === "empty") return "No cloud data";
  if (mode === "auto") return "Auto push";
  return "none";
}

function cloudSyncActionLabel(mode) {
  if (mode === "pull") return "Pulling cloud data";
  if (mode === "push") return "Pushing local data";
  return "Syncing data";
}

function cloudSyncSummary(cloudStatus, cloudSyncMode) {
  if (cloudSyncMode) {
    return {
      pill: "Syncing",
      className: "working",
      detail: \`\${cloudSyncActionLabel(cloudSyncMode)} in progress\`,
      message: "Keep this tab open until the cloud operation finishes."
    };
  }
  if (!cloudStatus.configured) {
    return {
      pill: "Off",
      className: "off",
      detail: "Not configured",
      message: "Save Supabase settings to enable phone and laptop sync."
    };
  }
  if (cloudStatus.lastError) {
    return {
      pill: "Error",
      className: "error",
      detail: "Last cloud sync failed",
      message: "Open settings or run Sync now after fixing the error shown below."
    };
  }
  if (cloudStatus.autoSync && cloudStatus.readyForAutoSync) {
    return {
      pill: "Auto",
      className: "ok",
      detail: "Auto push active",
      message: "Local saves push to Supabase shortly after changes."
    };
  }
  if (cloudStatus.autoSync) {
    return {
      pill: "Auto",
      className: "warn",
      detail: "Auto push waiting",
      message: "Run Sync now once on this device to arm automatic pushes."
    };
  }
  return {
    pill: "Manual",
    className: cloudStatus.lastSyncAt ? "ok" : "warn",
    detail: cloudStatus.lastSyncAt ? "Manual sync ready" : "Manual sync not run",
    message: "Use Sync now after edits, or enable auto push in settings."
  };
}

export function DataTab({ state }) {
  const completedWorkouts = new Set(state.history.map((entry) => entry.sessionId)).size;
  const cloudStatus = window.OverLoaderAPI.getCloudStatus();
  const cloudSyncMode = window.OverLoaderAPI.getCloudSyncMode();
  const isDev = window.OverLoaderAPI.isLocalDevelopmentHost();
  const summary = cloudSyncSummary(cloudStatus, cloudSyncMode);

  return html`
    <div class="section-heading">
      <h1>Data</h1>
    </div>
    <div class="data-grid">
      <div class="stat-card"><strong>${state.history.length}</strong><span>exercise logs</span></div>
      <div class="stat-card"><strong>${completedWorkouts}</strong><span>sessions</span></div>
      <div class="stat-card"><strong>${state.templates.length}</strong><span>templates</span></div>
      <div class="stat-card"><strong>${state.exercises.length}</strong><span>exercises</span></div>
    </div>
    
    <section class="sync-card">
      <div class="sync-title-row">
        <div>
          <h2>Cloud Sync</h2>
          <span>${summary.detail}</span>
        </div>
        <span class=${"status-pill " + summary.className}>${summary.pill}</span>
      </div>
      <p class="sync-summary">${summary.message}</p>
      <div class="sync-meta">
        <span>Last sync <strong>${window.OverLoaderAPI.formatSyncDate(cloudStatus.lastSyncAt)}</strong></span>
        <span>Last action <strong>${syncModeLabel(cloudStatus.lastMode)}</strong></span>
        ${cloudStatus.lastStateUpdatedAt ? html`<span>Local saved <strong>${window.OverLoaderAPI.formatSyncDate(cloudStatus.lastStateUpdatedAt)}</strong></span>` : ""}
        ${cloudStatus.lastRemoteUpdatedAt ? html`<span>Cloud saved <strong>${window.OverLoaderAPI.formatSyncDate(cloudStatus.lastRemoteUpdatedAt)}</strong></span>` : ""}
        ${cloudStatus.lastError ? html`<span class="sync-error">Error <strong>${cloudStatus.lastError}</strong></span>` : ""}
      </div>
      <div class="sync-actions">
        <button class="secondary-button" onClick=${() => window.OverLoaderAPI.runAction("open-cloud-sync")}><${Icon} name="settings" /> Settings</button>
        <button class="secondary-button" disabled=${!cloudStatus.configured || !!cloudSyncMode} onClick=${() => window.OverLoaderAPI.runAction("cloud-pull")}><${Icon} name="download" /> Pull</button>
        <button class="secondary-button" disabled=${!cloudStatus.configured || !!cloudSyncMode} onClick=${() => window.OverLoaderAPI.runAction("cloud-push")}><${Icon} name="upload" /> Push</button>
      </div>
    </section>

    <div class="data-actions">
      <button class="primary-wide" onClick=${() => window.OverLoaderAPI.runAction("cloud-sync-now")}><${Icon} name="cloud" /> Sync now</button>
      <button class="primary-wide" onClick=${() => window.OverLoaderAPI.runAction("export-backup")}><${Icon} name="download" /> Export backup</button>
      ${isDev ? html`
        <button class="secondary-wide" onClick=${() => window.OverLoaderAPI.runAction("export-exercises")}><${Icon} name="download" /> Push exercises to repo JSON</button>
        <button class="secondary-wide" onClick=${() => window.OverLoaderAPI.runAction("export-templates")}><${Icon} name="download" /> Push templates to repo JSON</button>
      ` : ""}
      <label class="file-import">
        <${Icon} name="upload" /> Import backup
        <input type="file" accept="application/json,.json" data-action="import-backup" />
      </label>
      <button class="secondary-wide" onClick=${() => window.OverLoaderAPI.runAction("reset-seed")}>Reload seed data</button>
    </div>
  `;
}

export function AppViews({ state, currentView }) {
  if (currentView === "templates") return html`<${TemplatesTab} state=${state} />`;
  if (currentView === "exercises") return html`<${ExercisesTab} state=${state} />`;
  if (currentView === "history") return html`<${HistoryTab} state=${state} />`;
  if (currentView === "data") return html`<${DataTab} state=${state} />`;
  return null;
}

export function mountViews() {
  const root = document.getElementById('preact-views-root');
  if (root) {
    const state = window.OverLoaderAPI.getState();
    const currentView = window.OverLoaderAPI.getCurrentView();
    render(html`<${AppViews} state=${state} currentView=${currentView} />`, root);
  }
}

// Bind to window for vanilla JS interop
window.PreactViews = {
  render: mountViews
};

// Enable the feature flag
window.OVERLOADER_USE_PREACT_VIEWS = true;

window.OverLoaderAPI.on?.('stateChange', mountViews);
mountViews();
