// FlightDeck — storage layer
// Manages rule persistence via chrome.storage.local with sync mirroring.

const STORAGE_KEY = "flightdeck";
const SYNC_KEY = "flightdeck_sync";
const HOST_HISTORY_KEY = "flightdeck_hosts";
const SCHEMA_VERSION = 1;

// Example presets shipped with the extension (illustrative, not service-specific)
function getDefaults() {
  return [
    {
      id: "example-debug",
      label: "🔍 Debug Mode (example.com)",
      enabled: false,
      hosts: ["example.com"],
      params: [{ key: "debug", value: "true" }],
      group: null,
      builtin: true
    },
    {
      id: "example-staging",
      label: "🟡 Staging Environment (example.com)",
      enabled: false,
      hosts: ["example.com"],
      params: [{ key: "env", value: "staging" }],
      group: "example-env",
      builtin: true
    },
    {
      id: "example-production",
      label: "🟢 Production Environment (example.com)",
      enabled: false,
      hosts: ["example.com"],
      params: [{ key: "env", value: "production" }],
      group: "example-env",
      builtin: true
    }
  ];
}

// Load state from chrome.storage.local, seeding defaults on first run.
// If local is empty but sync has data, restore from sync (new device scenario).
async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY]: null }, (result) => {
      let state = result[STORAGE_KEY];

      if (!state || state.schemaVersion !== SCHEMA_VERSION) {
        // Try to restore from sync before falling back to defaults
        chrome.storage.sync.get({ [SYNC_KEY]: null }, (syncResult) => {
          const syncState = syncResult[SYNC_KEY];
          if (syncState && syncState.schemaVersion === SCHEMA_VERSION) {
            state = syncState;
          } else {
            state = {
              presets: getDefaults(),
              customRules: [],
              schemaVersion: SCHEMA_VERSION
            };
          }
          saveState(state);
          resolve(state);
        });
        return;
      }

      resolve(state);
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
            // Sync quota exceeded or sync disabled — not critical
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

// Toggle a preset or custom rule by ID.
// Enforces mutual-exclusion groups: enabling a rule with a group
// automatically disables all other rules in the same group.
async function toggleRule(id, enabled) {
  const state = await loadState();
  const allRules = [...state.presets, ...state.customRules];
  const target = allRules.find((r) => r.id === id);
  if (!target) return state;

  target.enabled = enabled;

  // Enforce exclusion group
  if (enabled && target.group) {
    for (const rule of allRules) {
      if (rule.id !== id && rule.group === target.group) {
        rule.enabled = false;
      }
    }
  }

  await saveState(state);
  return state;
}

// Add a custom rule. Returns the updated state.
async function addCustomRule(rule) {
  const state = await loadState();
  state.customRules.push({
    id: rule.id,
    label: rule.label,
    enabled: false,
    hosts: rule.hosts,
    params: rule.params,
    group: rule.group || null,
    builtin: false
  });
  await saveState(state);

  // Track hosts for autocomplete
  await addHostsToHistory(rule.hosts);

  return state;
}

// Update an existing custom rule by ID.
async function updateCustomRule(id, updates) {
  const state = await loadState();
  const rule = state.customRules.find((r) => r.id === id);
  if (!rule) return state;

  Object.assign(rule, updates);
  await saveState(state);

  // Track any new hosts
  if (updates.hosts) {
    await addHostsToHistory(updates.hosts);
  }

  return state;
}

// Delete a custom rule by ID. Built-in presets cannot be deleted.
async function deleteCustomRule(id) {
  const state = await loadState();
  state.customRules = state.customRules.filter((r) => r.id !== id);
  await saveState(state);
  return state;
}

// Get all enabled rules (presets + custom)
function getEnabledRules(state) {
  return [...state.presets, ...state.customRules].filter((r) => r.enabled);
}

// --- Host History for Autocomplete ---

// Get the list of previously used hosts
async function getHostHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [HOST_HISTORY_KEY]: [] }, (result) => {
      resolve(result[HOST_HISTORY_KEY]);
    });
  });
}

// Add hosts to the history (deduplicates)
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

// Collect all hosts currently used in presets and custom rules
async function rebuildHostHistory() {
  const state = await loadState();
  const allHosts = new Set();
  for (const rule of [...state.presets, ...state.customRules]) {
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
    addCustomRule,
    updateCustomRule,
    deleteCustomRule,
    getDefaults,
    getEnabledRules,
    getHostHistory,
    addHostsToHistory,
    rebuildHostHistory,
    SCHEMA_VERSION
  };
}
