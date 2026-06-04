import { createInitialState, DB_VERSION, LOCATION_OPTIONS, normalizeExerciseRecord, normalizeLocationName } from "./data.js";

const DB_NAME = "overloader";
const STORE_NAME = "state";
const STATE_KEY = "main";
const LOCAL_STORAGE_KEY = "overloader-state";

export async function loadState() {
  const localState = readLocalState();
  try {
    const state = await withTimeout(loadIndexedState(), 1200);
    if (state) {
      writeLocalState(state);
      return migrateState(state);
    }
    const initial = localState ? migrateState(localState) : createInitialState();
    saveState(initial);
    return initial;
  } catch (error) {
    console.warn("IndexedDB unavailable or slow, using localStorage fallback", error);
    if (localState) {
      const migrated = migrateState(localState);
      saveState(migrated);
      return migrated;
    }
    const initial = createInitialState();
    writeLocalState(initial);
    saveState(initial);
    return initial;
  }
}

export async function saveState(state) {
  const next = normalizeState({
    ...state,
    version: DB_VERSION,
    updatedAt: new Date().toISOString()
  });
  writeLocalState(next);
  try {
    const db = await openDb();
    await withTimeout(idbSet(db, STATE_KEY, next), 1200);
  } catch (error) {
    console.warn("IndexedDB save failed or was slow; localStorage mirror is current", error);
  }
  return next;
}

export async function replaceState(nextState) {
  const migrated = migrateState(nextState);
  return saveState(migrated);
}

function migrateState(state) {
  const initial = createInitialState();
  const previousVersion = Number(state.version ?? 0);
  const exercises = Array.isArray(state.exercises) ? state.exercises : [];
  const templates = Array.isArray(state.templates) ? state.templates : [];
  const history = Array.isArray(state.history) ? state.history : [];
  const needsSeedMerge = previousVersion < initial.version
    || exercises.length < initial.exercises.length
    || history.length < initial.history.length;
  const shouldRefreshTemplates = previousVersion < 5;

  return normalizeState({
    ...initial,
    ...state,
    settings: normalizeSettingsLocations(initial.settings, state.settings),
    exercises: needsSeedMerge ? mergeById(initial.exercises, exercises) : (exercises.length ? exercises : initial.exercises),
    templates: shouldRefreshTemplates ? initial.templates : (needsSeedMerge ? mergeById(initial.templates, templates) : (templates.length ? templates : initial.templates)),
    history: needsSeedMerge ? mergeHistory(initial.history, history) : (history.length ? history : initial.history),
    activeSession: state.activeSession ?? null,
    version: initial.version
  });
}

function normalizeSettingsLocations(initialSettings, storedSettings = {}) {
  const settings = {
    ...initialSettings,
    ...storedSettings
  };
  const configured = Array.isArray(settings.workoutLocations) ? settings.workoutLocations : [];
  const locations = [...LOCATION_OPTIONS, ...configured]
    .map(normalizeLocationName)
    .filter(Boolean);
  settings.workoutLocations = [...new Set(locations)];
  settings.homeLocation = normalizeLocationName(settings.homeLocation) || LOCATION_OPTIONS[0];
  settings.lastWorkoutLocation = normalizeLocationName(settings.lastWorkoutLocation) || settings.homeLocation;
  return settings;
}

function normalizeState(state) {
  return {
    ...state,
    settings: normalizeSettingsLocations(state.settings, state.settings),
    exercises: normalizeExerciseCollection(state.exercises),
    templates: normalizeLocationCollection(state.templates),
    history: normalizeLocationCollection(state.history),
    activeSession: normalizeSessionLocation(state.activeSession)
  };
}

function normalizeExerciseCollection(items) {
  return Array.isArray(items)
    ? items.map((item) => normalizeExerciseRecord(item))
    : [];
}

function normalizeLocationCollection(items) {
  return Array.isArray(items)
    ? items.map((item) => normalizeLocationObject(item))
    : [];
}

function normalizeLocationObject(item) {
  if (!item || typeof item !== "object" || !("location" in item)) return item;
  return {
    ...item,
    location: normalizeLocationName(item.location)
  };
}

function normalizeSessionLocation(session) {
  if (!session) return null;
  return {
    ...session,
    location: normalizeLocationName(session.location)
  };
}

function mergeById(seedItems, existingItems) {
  const byId = new Map();
  for (const item of seedItems) byId.set(item.id, item);
  for (const item of existingItems) byId.set(item.id, item);
  return [...byId.values()];
}

function mergeHistory(seedHistory, existingHistory) {
  const merged = [...seedHistory];
  const seen = new Set(seedHistory.map(historyKey));
  for (const entry of existingHistory) {
    const key = historyKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.sort((a, b) => new Date(a.performedAt) - new Date(b.performedAt));
}

function historyKey(entry) {
  const date = String(entry.performedAt ?? "").slice(0, 16);
  return [entry.exerciseId, entry.workoutName, date].join("|");
}

async function loadIndexedState() {
  const db = await openDb();
  return idbGet(db, STATE_KEY);
}

function readLocalState() {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn("localStorage read failed", error);
    return null;
  }
}

function writeLocalState(state) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("localStorage save failed", error);
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    })
  ]);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
