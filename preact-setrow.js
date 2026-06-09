// Preact SetRow Mount - proof of concept
import { h, render } from 'https://unpkg.com/preact@10.15.1/dist/preact.module.js';
import { useState, useEffect, useRef } from 'https://unpkg.com/preact@10.15.1/hooks/dist/hooks.module.js';
import htm from 'https://unpkg.com/htm@3.1.1/dist/htm.module.js';

export const html = htm.bind(h);

function findSet(state, sessionExerciseId, setId) {
  const se = state.activeSession?.exercises.find(e => e.id === sessionExerciseId);
  if (!se) return null;
  return se.sets.find(s => s.id === setId) || null;
}

export function SetRow({sessionExerciseId, setId}) {
  const [local, setLocal] = useState(() => {
    const s = findSet(window.OverLoaderAPI.getState(), sessionExerciseId, setId);
    return s ? {...s} : null;
  });
  const [draftValues, setDraftValues] = useState({});
  const [revealed, setRevealed] = useState(false);
  const [dragOffset, setDragOffset] = useState(null);
  const railRef = useRef(null);
  const draftValuesRef = useRef({});
  const focusedFieldRef = useRef(null);
  const gestureRef = useRef({ pointerId: null, startX: 0, startY: 0, startOffset: 0, railWidth: 96, active: false, axis: null });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const syncFromState = () => {
      const s = findSet(window.OverLoaderAPI.getState(), sessionExerciseId, setId);
      if (!s) {
        setLocal(null);
        return;
      }
      if (focusedFieldRef.current) return;
      setLocal((current) => (JSON.stringify(s) === JSON.stringify(current) ? current : {...s}));
    };
    syncFromState();
    return window.OverLoaderAPI.on?.('stateChange', syncFromState);
  }, [sessionExerciseId, setId]);

  if (!local) return html`<div class="set-row pset-missing">Missing</div>`;

  function onToggleComplete() {
    window.OverLoaderAPI.runAction('toggle-set-complete', { sessionExerciseId, setId });
  }

  function onDelete() {
    setRevealed(false);
    setDragOffset(null);
    window.OverLoaderAPI.runAction('delete-set', { sessionExerciseId, setId });
  }

  function onPointerDown(e) {
    if (!e.isPrimary || e.button > 0 || e.target.closest('input, select, textarea')) return;
    if (window.OverLoaderAPI.closeAllRevealedRows) window.OverLoaderAPI.closeAllRevealedRows();
    const railWidth = railRef.current?.offsetWidth || 96;
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: revealed ? -railWidth : 0,
      railWidth,
      active: false,
      axis: null
    };
    suppressClickRef.current = false;
  }

  function onPointerMove(e) {
    if (gestureRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - gestureRef.current.startX;
    const dy = e.clientY - gestureRef.current.startY;
    if (!gestureRef.current.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.1) {
        cancelGesture(e);
        return;
      }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
      gestureRef.current.axis = 'horizontal';
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    gestureRef.current.active = true;
    suppressClickRef.current = true;
    e.preventDefault();
    const maxOffset = gestureRef.current.railWidth || 96;
    const offset = Math.min(0, Math.max(-maxOffset, gestureRef.current.startOffset + dx));
    setDragOffset(offset);
  }

  function finishGesture(e) {
    if (gestureRef.current.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const maxOffset = gestureRef.current.railWidth || 96;
    const finalOffset = dragOffset == null ? gestureRef.current.startOffset : dragOffset;
    const shouldReveal = gestureRef.current.active && finalOffset <= (-maxOffset * 0.35);
    if (shouldReveal) {
      setRevealed(true);
      setDragOffset(-maxOffset);
    } else {
      setRevealed(false);
      setDragOffset(null);
    }
    gestureRef.current.pointerId = null;
    gestureRef.current.active = false;
    gestureRef.current.axis = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function cancelGesture(e) {
    if (e?.currentTarget?.hasPointerCapture?.(gestureRef.current.pointerId)) {
      e.currentTarget.releasePointerCapture(gestureRef.current.pointerId);
    }
    gestureRef.current.pointerId = null;
    gestureRef.current.active = false;
    gestureRef.current.axis = null;
    setDragOffset(null);
  }

  function onClickCapture(e) {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onFieldInput(field, e) {
    const value = e.target.value;
    focusedFieldRef.current = field;
    draftValuesRef.current = { ...draftValuesRef.current, [field]: value };
    setDraftValues(draftValuesRef.current);
  }

  async function commitField(field) {
    if (!Object.prototype.hasOwnProperty.call(draftValuesRef.current, field)) {
      focusedFieldRef.current = null;
      return;
    }
    const value = draftValuesRef.current[field];
    focusedFieldRef.current = null;
    const nextDraftValues = { ...draftValuesRef.current };
    delete nextDraftValues[field];
    draftValuesRef.current = nextDraftValues;
    setDraftValues(nextDraftValues);
    await window.OverLoaderAPI.commitSetField(sessionExerciseId, setId, field, value);
  }

  function onFieldFocus(field, e) {
    focusedFieldRef.current = field;
    draftValuesRef.current = { ...draftValuesRef.current, [field]: e.target.value };
    setDraftValues(draftValuesRef.current);
  }

  function onFieldKeyDown(field, e) {
    if (e.key !== 'Enter') return;
    e.currentTarget.blur();
  }

  function fieldValue(field) {
    if (Object.prototype.hasOwnProperty.call(draftValues, field)) return draftValues[field];
    return local?.[field] ?? '';
  }

  const railWidth = railRef.current?.offsetWidth || 96;
  const translateX = dragOffset != null ? dragOffset : (revealed ? -railWidth : 0);

  return html`
    <div
      class="set-row pset-row"
      style=${{ transform: \`translateX(\${translateX}px)\` }}
      onPointerDown=${onPointerDown}
      onPointerMove=${onPointerMove}
      onPointerUp=${finishGesture}
      onPointerCancel=${finishGesture}
      onClickCapture=${onClickCapture}
    >
      <div class="swipe-delete-rail" ref=${railRef}>
        <button class="swipe-delete" onClick=${onDelete}>Delete</button>
      </div>
      <div class="set-row-inner">
        <div class="set-badge">\${local.label || ''}</div>
        <button class="previous-cell">\${local.previousText || ''}</button>
        <label class="number-field weight-field">
          <input data-field="weight" type="number" value=${fieldValue('weight')} onFocus=${(e) => onFieldFocus('weight', e)} onInput=${(e) => onFieldInput('weight', e)} onBlur=${() => commitField('weight')} onKeyDown=${(e) => onFieldKeyDown('weight', e)} />
        </label>
        <label class="number-field">
          <input data-field="reps" type="number" value=${fieldValue('reps')} onFocus=${(e) => onFieldFocus('reps', e)} onInput=${(e) => onFieldInput('reps', e)} onBlur=${() => commitField('reps')} onKeyDown=${(e) => onFieldKeyDown('reps', e)} />
        </label>
        <label class="number-field compact">
          <input data-field="rpe" type="number" value=${fieldValue('rpe')} onFocus=${(e) => onFieldFocus('rpe', e)} onInput=${(e) => onFieldInput('rpe', e)} onBlur=${() => commitField('rpe')} onKeyDown=${(e) => onFieldKeyDown('rpe', e)} />
        </label>
        <label class="number-field compact">
          <input data-field="rir" type="number" value=${fieldValue('rir')} onFocus=${(e) => onFieldFocus('rir', e)} onInput=${(e) => onFieldInput('rir', e)} onBlur=${() => commitField('rir')} onKeyDown=${(e) => onFieldKeyDown('rir', e)} />
        </label>
        <button data-action="toggle-set-complete" class="check-button \${local.completed ? 'is-complete' : ''}" onClick=${onToggleComplete} aria-label="Toggle complete">✓</button>
      </div>
    </div>
  `;
}

export function mountAll() {
  document.querySelectorAll('.set-row-react').forEach((el) => {
    const sessionExerciseId = el.dataset.sessionExerciseId;
    const setId = el.dataset.setId;
    // avoid remounting
    if (el._mounted) return;
    render(h(SetRow, {sessionExerciseId, setId}), el);
    el._mounted = true;
  });
}

window.PreactSetRow = { mountAll };

// Enable preact usage and trigger re-render
window.OVERLOADER_USE_PREACT_SETROW = true;
// Ensure OverLoaderAPI exists
window.OverLoaderAPI = window.OverLoaderAPI || {};
window.OverLoaderAPI.on?.('stateChange', mountAll);
mountAll();
const observer = new MutationObserver(mountAll);
observer.observe(document.body, { childList: true, subtree: true });

console.log('Preact set-row POC mounted');
