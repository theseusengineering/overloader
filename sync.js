const CONFIG_KEY = "overloader-sync-config";
const META_KEY = "overloader-sync-meta";

export function readCloudConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (!config?.url || !config?.anonKey || !config?.syncSecret) return null;
    return {
      url: normalizeSupabaseUrl(config.url),
      anonKey: String(config.anonKey).trim(),
      syncSecret: String(config.syncSecret).trim(),
      autoSync: Boolean(config.autoSync)
    };
  } catch {
    return null;
  }
}

export function saveCloudConfig(config) {
  const next = {
    url: normalizeSupabaseUrl(config.url),
    anonKey: String(config.anonKey || "").trim(),
    syncSecret: String(config.syncSecret || "").trim(),
    autoSync: Boolean(config.autoSync)
  };
  if (!next.url || !next.anonKey || !next.syncSecret) {
    throw new Error("Supabase URL, anon key, and sync secret are required.");
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function clearCloudConfig() {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(META_KEY);
}

export function readCloudMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}");
  } catch {
    return {};
  }
}

export function readCloudStatus() {
  const config = readCloudConfig();
  const meta = readCloudMeta();
  return {
    configured: Boolean(config),
    autoSync: Boolean(config?.autoSync),
    readyForAutoSync: Boolean(config?.autoSync && meta.lastSyncAt),
    lastSyncAt: meta.lastSyncAt ?? "",
    lastMode: meta.lastMode ?? "",
    lastStateUpdatedAt: meta.lastStateUpdatedAt ?? "",
    lastRemoteUpdatedAt: meta.lastRemoteUpdatedAt ?? "",
    lastError: meta.lastError ?? ""
  };
}

export async function syncCloudState(localState) {
  const remote = await fetchRemoteSnapshot();
  if (!remote) return pushCloudState(localState);

  const remoteState = remote.state;
  const remoteTime = stateTime(remoteState, remote.state_updated_at || remote.updated_at);
  const localTime = stateTime(localState);
  const meta = readCloudMeta();

  if (!meta.lastSyncAt || compareIso(remoteTime, localTime) > 0) {
    writeCloudMeta({
      lastSyncAt: new Date().toISOString(),
      lastMode: "pulled",
      lastStateUpdatedAt: localTime,
      lastRemoteUpdatedAt: remoteTime,
      lastError: ""
    });
    return { mode: "pulled", state: remoteState, remote };
  }

  if (compareIso(localTime, remoteTime) > 0) {
    return pushCloudState(localState);
  }

  writeCloudMeta({
    lastSyncAt: new Date().toISOString(),
    lastMode: "clean",
    lastStateUpdatedAt: localTime,
    lastRemoteUpdatedAt: remoteTime,
    lastError: ""
  });
  return { mode: "clean", remote };
}

export async function pullCloudState() {
  const remote = await fetchRemoteSnapshot();
  if (!remote) {
    writeCloudMeta({
      lastSyncAt: new Date().toISOString(),
      lastMode: "empty",
      lastError: ""
    });
    return { mode: "empty" };
  }
  writeCloudMeta({
    lastSyncAt: new Date().toISOString(),
    lastMode: "pulled",
    lastStateUpdatedAt: stateTime(remote.state),
    lastRemoteUpdatedAt: remote.state_updated_at || remote.updated_at || "",
    lastError: ""
  });
  return { mode: "pulled", state: remote.state, remote };
}

export async function pushCloudState(state) {
  const stateUpdatedAt = stateTime(state);
  const remote = await rpc("overloader_push", {
    p_sync_secret: requireCloudConfig().syncSecret,
    p_state: state,
    p_state_updated_at: stateUpdatedAt
  });
  writeCloudMeta({
    lastSyncAt: new Date().toISOString(),
    lastMode: "pushed",
    lastStateUpdatedAt: stateUpdatedAt,
    lastRemoteUpdatedAt: remote?.updated_at || remote?.state_updated_at || stateUpdatedAt,
    lastError: ""
  });
  return { mode: "pushed", remote };
}

async function fetchRemoteSnapshot() {
  const remote = await rpc("overloader_pull", {
    p_sync_secret: requireCloudConfig().syncSecret
  });
  return remote?.state ? remote : null;
}

async function rpc(functionName, body) {
  const config = requireCloudConfig();
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: apiHeaders(config),
    body: JSON.stringify(body)
  });
  return readResponse(response);
}

async function readResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (response.ok) return payload;
  const message = payload?.msg || payload?.message || payload?.error_description || payload?.hint || response.statusText;
  writeCloudMeta({ lastError: message });
  throw new Error(message);
}

function requireCloudConfig() {
  const config = readCloudConfig();
  if (!config) throw new Error("Save Supabase settings first.");
  return config;
}

function apiHeaders(config) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    "Content-Type": "application/json"
  };
}

function writeCloudMeta(update) {
  localStorage.setItem(META_KEY, JSON.stringify({
    ...readCloudMeta(),
    ...update
  }));
}

function normalizeSupabaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function stateTime(state, fallback = "") {
  return state?.updatedAt || fallback || new Date(0).toISOString();
}

function compareIso(a, b) {
  return new Date(a).getTime() - new Date(b).getTime();
}
