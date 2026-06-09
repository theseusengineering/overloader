// Preact SetRow Mount - proof of concept
import { h, render } from 'https://unpkg.com/preact@10.15.1/dist/preact.module.js';
import { useState, useEffect, useRef } from 'https://unpkg.com/preact@10.15.1/hooks/dist/hooks.module.js';

function findSet(state, sessionExerciseId, setId) {
  const se = state.activeSession?.exercises.find(e => e.id === sessionExerciseId);
  if (!se) return null;
  return se.sets.find(s => s.id === setId) || null;
}

function SetRow({sessionExerciseId, setId}) {
  const [local, setLocal] = useState(() => {
    const s = findSet(window.OverLoaderAPI.getState(), sessionExerciseId, setId);
    return s ? {...s} : null;
  });
  const [revealed, setRevealed] = useState(false);
  const [dragOffset, setDragOffset] = useState(null);
  const railRef = useRef(null);
  const gestureRef = useRef({ pointerId: null, startX: 0, startY: 0, startOffset: 0, railWidth: 96, active: false });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    // Subscribe to simple polling for state changes (since app re-renders replace DOM)
    const id = setInterval(() => {
      const s = findSet(window.OverLoaderAPI.getState(), sessionExerciseId, setId);
      if (!s) return;
      // Update local if different
      setLocal((current) => (JSON.stringify(s) === JSON.stringify(current) ? current : {...s}));
    }, 300);
    return () => clearInterval(id);
  }, [sessionExerciseId, setId]);

  if (!local) return h('div', {class: 'set-row pset-missing'}, 'Missing');

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
      active: false
    };
    suppressClickRef.current = false;
  }

  function onPointerMove(e) {
    if (gestureRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - gestureRef.current.startX;
    const dy = e.clientY - gestureRef.current.startY;
    if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    gestureRef.current.active = true;
    suppressClickRef.current = true;
    e.preventDefault();
    const maxOffset = gestureRef.current.railWidth || 96;
    const offset = Math.min(0, Math.max(-maxOffset, gestureRef.current.startOffset + dx));
    setDragOffset(offset);
  }

  function finishGesture(e) {
    if (gestureRef.current.pointerId !== e.pointerId) return;
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
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function onClickCapture(e) {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onFieldChange(field, e) {
    const val = e.target.value;
    // Use existing runAction via handleInput by simulating updateSet via dataset
    // Simplest: directly update via OverLoaderAPI: mutate state then persist
    const state = window.OverLoaderAPI.getState();
    const se = state.activeSession.exercises.find(ex => ex.id === sessionExerciseId);
    if (!se) return;
    const set = se.sets.find(s => s.id === setId);
    if (!set) return;
    if (field === 'weight') set.weight = val === '' ? '' : Number(val);
    if (field === 'reps') set.reps = val === '' ? '' : Math.round(Number(val));
    if (field === 'rpe') set.rpe = val === '' ? '' : Number(val);
    if (field === 'rir') set.rir = val === '' ? '' : Number(val);
    window.OverLoaderAPI.persist().then(() => window.OverLoaderAPI.renderApp());
  }

  const railWidth = railRef.current?.offsetWidth || 96;
  const translateX = dragOffset != null ? dragOffset : (revealed ? -railWidth : 0);

  return (
    h('div', {
      class: 'set-row pset-row',
      style: { transform: `translateX(${translateX}px)` },
      onPointerDown,
      onPointerMove,
      onPointerUp: finishGesture,
      onPointerCancel: finishGesture,
      onClickCapture
    },
      h('div', {class: 'swipe-delete-rail', ref: railRef},
        h('button', {class: 'swipe-delete', onClick: onDelete}, 'Delete')
      ),
      h('div', {class: 'set-row-inner'},
        h('div', {class: 'set-badge'}, local.label || ''),
        h('button', {class: 'previous-cell'}, local.previousText || ''),
        h('label', {class: 'number-field weight-field'},
          h('input', {type: 'number', value: local.weight ?? '', onInput: (e) => onFieldChange('weight', e)})
        ),
        h('label', {class: 'number-field'},
          h('input', {type: 'number', value: local.reps ?? '', onInput: (e) => onFieldChange('reps', e)})
        ),
        h('label', {class: 'number-field compact'},
          h('input', {type: 'number', value: local.rpe ?? '', onInput: (e) => onFieldChange('rpe', e)})
        ),
        h('label', {class: 'number-field compact'},
          h('input', {type: 'number', value: local.rir ?? '', onInput: (e) => onFieldChange('rir', e)})
        ),
        h('button', {class: 'check-button ' + (local.completed ? 'is-complete' : ''), onClick: onToggleComplete, 'aria-label': 'Toggle complete'}, '✓')
      )
    )
  );
}

function mountAll() {
  document.querySelectorAll('.set-row-react').forEach((el) => {
    const sessionExerciseId = el.dataset.sessionExerciseId;
    const setId = el.dataset.setId;
    // avoid remounting
    if (el._mounted) return;
    render(h(SetRow, {sessionExerciseId, setId}), el);
    el._mounted = true;
  });
}

// Enable preact usage and trigger re-render
window.OVERLOADER_USE_PREACT_SETROW = true;
// Ensure OverLoaderAPI exists
window.OverLoaderAPI = window.OverLoaderAPI || {};
// Mount initially and on a small interval to catch re-renders from app
setTimeout(mountAll, 300);
const observer = new MutationObserver(mountAll);
observer.observe(document.body, { childList: true, subtree: true });

console.log('Preact set-row POC mounted');
