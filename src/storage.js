// FlightDeck — storage layer
// Manages rule persistence via chrome.storage.local with sync mirroring.

const STORAGE_KEY = "flightdeck";
const SYNC_KEY = "flightdeck_sync";
const HOST_HISTORY_KEY = "flightdeck_hosts";
const SCHEMA_VERSION = 2;

// Example rules shipped with the extension
function getDefaults() {
  return [
    {
      id: "example-debug",
      label: "🔍 Debug Mode (example.com)",
      enabled: false,
      hosts: ["example.com"],
      params: [{ key: "debug", value: "true" }],
      group: null
    },
    {
      id: "example-staging",
      label: "🟡 Staging Environment (example.com)",
      enabled: false,
      hosts: ["example.com"],
      params: [{ key: "env", value: "staging" }],
      group: "example-env"
    },
    {
      id: "example-production",
      label: "🟢 Production Environment (example.com)",
      enabled: false,
      hosts: ["example.com"],
      params: [{ key: "env", value: "production" }],
      group: "example-env"
    }
  ];
}

// Migrate v1 state (presets[] + customRules[]) to v2 (rules[])
function migrateV1(state) {
  const rules = [];
  if (Array.isArray(state.presets)) {
    for (const p of state.presets) {
      const rule = Object.assign({}, p);
      delete rule.builtin;
      rules.push(rule);
    }
  }
  if (Array.isArray(state.customRules)) {
    for (const c of state.customRules) {
      const rule = Object.assign({}, c);
      delete rule.builtin;
      rules.push(rule);
    }
  }
  return { rules, schemaVersion: SCHEMA_VERSION };
}

// Normalize raw state from storage into a valid v2 state
function normalizeState(raw) {
  if (!raw) {
    return { rules: getDefaults(), schemaVersion: SCHEMA_VERSION };
  }
  if (raw.schemaVersion === 1) {
    return migrateV1(raw);
  }
  if (raw.schemaVersion === SCHEMA_VERSION) {
    return raw;
  }
  // Unknown future version or corrupt — seed defaults
  return { rules: getDefaults(), schemaVersion: SCHEMA_VERSION };
}

// Load state from chrome.storage.local, seeding defaults on first run.
// If local is empty but sync has data, restore from sync (new device scenario).
async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY]: null }, (result) => {
      const raw = result[STORAGE_KEY];

      if (raw && raw.schemaVersion === SCHEMA_VERSION) {
        resolve(raw);
        return;
      }

      if (raw && raw.schemaVersion === 1) {
        const migrated = normalizeState(raw);
        saveState(migrated);
        resolve(migrated);
        return;
      }

      // No local state — try sync before falling back to defaults
      chrome.storage.sync.get({ [SYNC_KEY]: null }, (syncResult) => {
        const syncRaw = syncResult[SYNC_KEY];
        const state = normalizeState(syncRaw);
        saveState(state);
        resolve(state);
      });
    });
  });
}

// Save state to chrome.storage.local (primary) and mirror to chrome.storage.sync.
async function saveState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      // Best-effort sync mirror — silently catch quota errors
      try {
        chrome.storage.sync.set({ [SYNC_KEY]: state }, () => {
          if (chrome.runtime.lastError) {
            console.warn("FlightDeck: sync mirror failed:", chrome.runtime.lastError.message);
          }
        });
      } catch {
        // chrome.storage.sync may not be available in all contexts
      }
      resolve();
    });
  });
}

// Toggle a rule by ID.
// Enforces mutual-exclusion groups: enabling a rule with a group
// automatically disables all other rules in the same group.
async function toggleRule(id, enabled) {
  const state = await loadState();
  const target = state.rules.find((r) => r.id === id);
  if (!target) return state;

  target.enabled = enabled;

  // Enforce exclusion group
  if (enabled && target.group) {
    for (const rule of state.rules) {
      if (rule.id !== id && rule.group === target.group) {
        rule.enabled = false;
      }
    }
  }

  await saveState(state);
  return state;
}

// Add a rule. Returns the updated state.
async function addRule(rule) {
  const state = await loadState();
  state.rules.push({
    id: rule.id,
    label: rule.label,
    enabled: false,
    hosts: rule.hosts,
    params: rule.params,
    group: rule.group || null
  });
  await saveState(state);
  await addHostsToHistory(rule.hosts);
  return state;
}

// Update an existing rule by ID.
async function updateRule(id, updates) {
  const state = await loadState();
  const rule = state.rules.find((r) => r.id === id);
  if (!rule) return state;

  Object.assign(rule, updates);
  await saveState(state);

  if (updates.hosts) {
    await addHostsToHistory(updates.hosts);
  }

  return state;
}

// Delete a rule by ID. Any rule can be deleted.
async function deleteRule(id) {
  const state = await loadState();
  state.rules = state.rules.filter((r) => r.id !== id);
  await saveState(state);
  return state;
}

// Get all enabled rules
function getEnabledRules(state) {
  return state.rules.filter((r) => r.enabled);
}

// Restore missing default rules (does not overwrite modified defaults)
async function resetDefaults() {
  const state = await loadState();
  const existingIds = new Set(state.rules.map((r) => r.id));
  const defaults = getDefaults();

  for (const def of defaults) {
    if (!existingIds.has(def.id)) {
      state.rules.push(def);
    }
  }

  await saveState(state);
  return state;
}

// Check if a rule ID is one of the shipped defaults
function isDefaultId(id) {
  return getDefaults().some((d) => d.id === id);
}

// --- Host History for Autocomplete ---

async function getHostHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [HOST_HISTORY_KEY]: [] }, (result) => {
      resolve(result[HOST_HISTORY_KEY]);
    });
  });
}

async function addHostsToHistory(hosts) {
  const existing = await getHostHistory();
  const set = new Set(existing);
  for (const h of hosts) {
    set.add(h);
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [HOST_HISTORY_KEY]: [...set] }, resolve);
  });
}

async function rebuildHostHistory() {
  const state = await loadState();
  const allHosts = new Set();
  for (const rule of state.rules) {
    for (const h of rule.hosts) {
      allHosts.add(h);
    }
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [HOST_HISTORY_KEY]: [...allHosts] }, resolve);
  });
}

// Export for use by service worker and popup
if (typeof globalThis !== "undefined") {
  globalThis.FlightDeckStorage = {
    loadState,
    saveState,
    toggleRule,
    addRule,
    updateRule,
    deleteRule,
    getDefaults,
    getEnabledRules,
    resetDefaults,
    isDefaultId,
    getHostHistory,
    addHostsToHistory,
    rebuildHostHistory,
    normalizeState,
    SCHEMA_VERSION
  };
}
