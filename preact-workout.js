import { h, render } from 'https://unpkg.com/preact@10.15.1/dist/preact.module.js';
import { useState, useEffect } from 'https://unpkg.com/preact@10.15.1/hooks/dist/hooks.module.js';
import { html, SetRow } from './preact-setrow.js';
import { getExercise, latestPerformance, templateSummary, formatSet } from './logic.js';
import { formatExerciseDisplayName } from './data.js';

// Simple wrapper for raw SVG icons from app.js
export function Icon({ name }) {
  return html`<span class="preact-icon-wrapper" dangerouslySetInnerHTML=${{ __html: window.OverLoaderAPI.icon(name) }}></span>`;
}

export function bestWorkingSet(entry, exercise) {
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

export function TemplateCard({ template, startOnly }) {
  const state = window.OverLoaderAPI.getState();
  const summary = templateSummary(state, template);
  return html`
    <article class="template-card">
      <div class="card-title-row">
        <div>
          <h2>${template.name}</h2>
          <span>${template.location} · ${template.exercises.length} exercises</span>
        </div>
        <button
          class="small-blue-button"
          data-action="start-template"
          data-template-id=${template.id}
          onClick=${() => window.OverLoaderAPI.runAction("start-template", { templateId: template.id })}
        >
          <${Icon} name="play" />
        </button>
      </div>
      <div class="template-summary">
        ${summary.slice(0, 6).map(line => html`<span key=${line}>${line}</span>`)}
      </div>
      ${startOnly ? null : html`
        <div class="card-actions">
          <button class="secondary-button" onClick=${() => window.OverLoaderAPI.runAction("edit-template", { templateId: template.id })}>Edit</button>
          <button class="secondary-button" onClick=${() => window.OverLoaderAPI.runAction("duplicate-template", { templateId: template.id })}>Duplicate</button>
        </div>
      `}
    </article>
  `;
}

function RecentHistory({ history }) {
  const state = window.OverLoaderAPI.getState();
  const recent = history
    .slice()
    .sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt))
    .slice(0, 6);

  return html`
    <section class="recent-panel">
      <div class="section-heading compact">
        <h1>Recent Exercise Logs</h1>
      </div>
      <div class="recent-list">
        ${recent.map((entry) => {
          const exercise = getExercise(state, entry.exerciseId);
          const displayName = exercise ? formatExerciseDisplayName(exercise) : "Unknown";
          // Use key to ensure stable rendering
          const key = entry.sessionId + entry.exerciseId + entry.performedAt;
          return html`
            <button key=${key} class="recent-item" onClick=${() => window.OverLoaderAPI.runAction("open-exercise-history", { exerciseId: entry.exerciseId })}>
              <strong>${displayName}</strong>
              <span>${entry.workoutName} · ${window.OverLoaderAPI.formatDate(entry.performedAt)}</span>
              <em>${bestWorkingSet(entry, exercise)}</em>
            </button>
          `;
        })}
      </div>
    </section>
  `;
}

function SessionReorder({ sessionReorder, activeSession }) {
  const state = window.OverLoaderAPI.getState();
  return html`
    <div class="session-reorder-list">
      ${activeSession.exercises.map((sessionExercise) => {
        const exercise = getExercise(state, sessionExercise.exerciseId);
        const displayName = exercise ? formatExerciseDisplayName(exercise) : "Unknown";
        const isDragging = sessionReorder?.sourceId === sessionExercise.id;
        return html`
          <div 
            key=${sessionExercise.id}
            class="session-reorder-row ${isDragging ? "is-dragging" : ""}" 
            data-session-reorder-id=${sessionExercise.id}
          >
            <span class="drag-handle"><${Icon} name="grip" /></span>
            <strong>${displayName}</strong>
          </div>
        `;
      })}
    </div>
  `;
}

function SessionExercise({ sessionExercise, expandedContexts, toggleContext }) {
  const exercise = getExercise(window.OverLoaderAPI.getState(), sessionExercise.exerciseId);
  const previous = latestPerformance(window.OverLoaderAPI.getState(), sessionExercise.exerciseId);
  
  const kgLabel = exercise?.loadMode === "assisted" ? "-kg" : "kg";
  const weightHeader = exercise?.loadMode === "bodyweight" ? "Load" : kgLabel;
  const reason = window.OverLoaderAPI.progressionContext(sessionExercise);
  const hasContext = Boolean(previous || reason);
  const contextExpanded = expandedContexts.has(sessionExercise.id);
  const displayName = exercise ? formatExerciseDisplayName(exercise) : "Unknown";
  const charCount = displayName.length;

  return html`
    <article class="session-exercise" data-session-exercise-id=${sessionExercise.id}>
      <div class="exercise-title-row">
        <button 
          class="exercise-title" 
          data-action="open-exercise-history"
          data-session-exercise-id=${sessionExercise.id}
          style=${{ '--char-count': charCount }} 
          onClick=${() => {
            if (window.OverLoaderAPI.isClickSuppressed()) return;
            window.OverLoaderAPI.runAction("open-exercise-history", { exerciseId: exercise.id, sessionExerciseId: sessionExercise.id });
          }}
        >
          ${displayName}
          ${exercise.needsReview ? html`<span class="review-pill">confirm</span>` : ""}
        </button>
        <div class="exercise-tools">
          <button class="mini-icon" data-action="open-exercise-menu" onClick=${() => {
            if (window.OverLoaderAPI.isClickSuppressed()) return;
            window.OverLoaderAPI.runAction("open-exercise-menu", { sessionExerciseId: sessionExercise.id });
          }} aria-label="Exercise menu">
            <${Icon} name="more" />
          </button>
        </div>
      </div>
      
      ${sessionExercise.note ? html`<div class="sticky-note">${sessionExercise.note}</div>` : ""}
      
      ${hasContext ? html`
        <button
          class="context-toggle"
          onClick=${() => toggleContext(sessionExercise.id)}
          aria-expanded=${contextExpanded ? "true" : "false"}
        >${contextExpanded ? "Hide" : "Show"} Load Reasoning and History</button>
        ${contextExpanded ? html`
          <div class="exercise-context-panel">
            ${previous ? html`<div class="previous-context">${previous.workoutName} · ${window.OverLoaderAPI.formatDate(previous.performedAt)}</div>` : ""}
            ${reason ? html`<div class="progression-context">${reason}</div>` : ""}
          </div>
        ` : ""}
      ` : ""}
      
      <div class="set-table">
        <div class="set-row table-head">
          <span>Set</span>
          <span>Previous</span>
          <span>${weightHeader}</span>
          <span>Reps</span>
          <span>RPE</span>
          <span>RIR</span>
          <span aria-label="Complete"><${Icon} name="check" /></span>
        </div>
        ${sessionExercise.sets.map((set) => html`
          <${SetRow} key=${set.id} sessionExerciseId=${sessionExercise.id} setId=${set.id} />
        `)}
      </div>
      
      <div class="set-actions">
        <button class="add-set" data-action="add-working-set" onClick=${() => window.OverLoaderAPI.runAction("add-working-set", { sessionExerciseId: sessionExercise.id })}>
          <${Icon} name="plus" /> Add Set
        </button>
        <button class="add-warmup" data-action="add-warmup-set" onClick=${() => window.OverLoaderAPI.runAction("add-warmup-set", { sessionExerciseId: sessionExercise.id })}>W</button>
      </div>
    </article>
  `;
}

export function ActiveSession({ state }) {
  const [expandedContexts, setExpandedContexts] = useState(new Set());

  if (!state.activeSession) return null;

  function toggleContext(id) {
    setExpandedContexts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return html`
    <div class="preact-workout-container">
      <div class="exercise-stack">
        ${state.activeSession.exercises.map(sessionExercise => html`
          <${SessionExercise} 
            key=${sessionExercise.id} 
            sessionExercise=${sessionExercise} 
            expandedContexts=${expandedContexts}
            toggleContext=${toggleContext}
          />
        `)}
      </div>
      <div class="session-actions">
        <button class="primary-wide" data-action="open-add-exercise" onClick=${() => window.OverLoaderAPI.runAction("open-add-exercise")}>
          <${Icon} name="plus" /> Add Exercises
        </button>
        <button class="danger-wide" data-action="cancel-workout" onClick=${() => window.OverLoaderAPI.runAction("cancel-workout")}>Cancel Workout</button>
      </div>
    </div>
  `;
}

export function WorkoutTab({ state, sessionReorder }) {
  if (!state.activeSession) {
    return html`
      <div class="start-panel">
        <div class="section-heading">
          <h1>Start Workout</h1>
          <button class="text-button" onClick=${() => window.OverLoaderAPI.runAction("open-new-template")}>Manage</button>
        </div>
        <div class="template-grid">
          ${state.templates.map((template) => html`<${TemplateCard} key=${template.id} template=${template} startOnly=${true} />`)}
        </div>
      </div>
      <${RecentHistory} history=${state.history} />
    `;
  }

  if (sessionReorder?.active) {
    return html`<${SessionReorder} sessionReorder=${sessionReorder} activeSession=${state.activeSession} />`;
  }

  return html`<${ActiveSession} state=${state} />`;
}

export function mountWorkout() {
  const root = document.getElementById('preact-workout-root');
  if (root) {
    const state = window.OverLoaderAPI.getState();
    const sessionReorder = window.OverLoaderAPI.getSessionReorder();
    render(html`<${WorkoutTab} state=${state} sessionReorder=${sessionReorder} />`, root);
  }
}

// Bind to window for vanilla JS interop
window.PreactWorkout = {
  render: mountWorkout
};

// Enable the feature flag
window.OVERLOADER_USE_PREACT_WORKOUT = true;
window.OverLoaderAPI.on?.('stateChange', mountWorkout);
mountWorkout();
