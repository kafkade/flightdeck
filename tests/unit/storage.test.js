// Unit tests for FlightDeck storage layer (storage.js)

let storageData = {};
let syncData = {};

// Mock chrome.storage.local and chrome.storage.sync before loading the module
beforeEach(() => {
  jest.resetModules();
  storageData = {};
  syncData = {};
  delete globalThis.FlightDeckStorage;

  global.chrome = {
    storage: {
      local: {
        get: jest.fn((query, cb) => {
          const key = Object.keys(query)[0];
          cb({ [key]: storageData[key] !== undefined ? storageData[key] : query[key] });
        }),
        set: jest.fn((data, cb) => {
          Object.assign(storageData, data);
          if (cb) cb();
        }),
        remove: jest.fn((key, cb) => {
          delete storageData[key];
          if (cb) cb();
        })
      },
      sync: {
        get: jest.fn((query, cb) => {
          const key = Object.keys(query)[0];
          cb({ [key]: syncData[key] !== undefined ? syncData[key] : query[key] });
        }),
        set: jest.fn((data, cb) => {
          Object.assign(syncData, data);
          if (cb) cb();
        })
      }
    },
    runtime: {
      lastError: null
    }
  };

  require("../../src/storage.js");
});

// ---------------------------------------------------------------------------
// loadState — seeds defaults on first run
// ---------------------------------------------------------------------------
test("loadState seeds default presets on first run", async () => {
  const state = await FlightDeckStorage.loadState();

  expect(state.schemaVersion).toBe(1);
  expect(state.presets).toHaveLength(3);
  expect(state.customRules).toEqual([]);
  expect(state.presets[0].id).toBe("example-debug");
  expect(state.presets[1].id).toBe("example-staging");
  expect(state.presets[2].id).toBe("example-production");
});

test("loadState returns stored state if it exists", async () => {
  const existingState = {
    presets: [{ id: "test", enabled: true }],
    customRules: [],
    schemaVersion: 1
  };
  storageData.flightdeck = existingState;

  const state = await FlightDeckStorage.loadState();
  expect(state).toEqual(existingState);
});

// ---------------------------------------------------------------------------
// loadState — restores from sync when local is empty
// ---------------------------------------------------------------------------
test("loadState restores from sync when local is empty", async () => {
  const syncState = {
    presets: [{ id: "synced-rule", enabled: true }],
    customRules: [{ id: "synced-custom", label: "From Sync" }],
    schemaVersion: 1
  };
  syncData.flightdeck_sync = syncState;

  const state = await FlightDeckStorage.loadState();
  expect(state.presets[0].id).toBe("synced-rule");
  expect(state.customRules[0].id).toBe("synced-custom");
});

// ---------------------------------------------------------------------------
// All defaults are disabled by default
// ---------------------------------------------------------------------------
test("all default presets start disabled", async () => {
  const state = await FlightDeckStorage.loadState();
  for (const preset of state.presets) {
    expect(preset.enabled).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// toggleRule — enables a rule
// ---------------------------------------------------------------------------
test("toggleRule enables a preset", async () => {
  const state = await FlightDeckStorage.toggleRule("example-debug", true);
  const preset = state.presets.find((p) => p.id === "example-debug");
  expect(preset.enabled).toBe(true);
});

test("toggleRule disables a preset", async () => {
  await FlightDeckStorage.toggleRule("example-debug", true);
  const state = await FlightDeckStorage.toggleRule("example-debug", false);
  const preset = state.presets.find((p) => p.id === "example-debug");
  expect(preset.enabled).toBe(false);
});

// ---------------------------------------------------------------------------
// toggleRule — exclusion group enforcement
// ---------------------------------------------------------------------------
test("enabling a rule in an exclusion group disables others in the same group", async () => {
  await FlightDeckStorage.toggleRule("example-staging", true);
  const state = await FlightDeckStorage.toggleRule("example-production", true);

  const staging = state.presets.find((p) => p.id === "example-staging");
  const production = state.presets.find((p) => p.id === "example-production");

  expect(staging.enabled).toBe(false);
  expect(production.enabled).toBe(true);
});

test("exclusion group does not affect rules with group: null", async () => {
  await FlightDeckStorage.toggleRule("example-debug", true);
  const state = await FlightDeckStorage.toggleRule("example-staging", true);

  const debug = state.presets.find((p) => p.id === "example-debug");
  const staging = state.presets.find((p) => p.id === "example-staging");

  expect(debug.enabled).toBe(true);
  expect(staging.enabled).toBe(true);
});

// ---------------------------------------------------------------------------
// toggleRule — nonexistent rule
// ---------------------------------------------------------------------------
test("toggleRule returns state unchanged for nonexistent ID", async () => {
  const state = await FlightDeckStorage.toggleRule("nonexistent", true);
  expect(state.presets.every((p) => !p.enabled)).toBe(true);
});

// ---------------------------------------------------------------------------
// addCustomRule
// ---------------------------------------------------------------------------
test("addCustomRule adds a rule to customRules", async () => {
  const state = await FlightDeckStorage.addCustomRule({
    id: "custom-1",
    label: "Test Custom",
    hosts: ["myapp.example.com"],
    params: [{ key: "debug", value: "1" }],
    group: null
  });

  expect(state.customRules).toHaveLength(1);
  expect(state.customRules[0].id).toBe("custom-1");
  expect(state.customRules[0].enabled).toBe(false);
  expect(state.customRules[0].builtin).toBe(false);
});

// ---------------------------------------------------------------------------
// updateCustomRule
// ---------------------------------------------------------------------------
test("updateCustomRule updates existing rule fields", async () => {
  await FlightDeckStorage.addCustomRule({
    id: "custom-1",
    label: "Original",
    hosts: ["myapp.example.com"],
    params: [{ key: "a", value: "1" }]
  });

  const state = await FlightDeckStorage.updateCustomRule("custom-1", {
    label: "Updated",
    params: [{ key: "b", value: "2" }]
  });

  const rule = state.customRules.find((r) => r.id === "custom-1");
  expect(rule.label).toBe("Updated");
  expect(rule.params).toEqual([{ key: "b", value: "2" }]);
});

test("updateCustomRule returns state unchanged for nonexistent ID", async () => {
  const state = await FlightDeckStorage.updateCustomRule("nonexistent", { label: "X" });
  expect(state.customRules).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// deleteCustomRule
// ---------------------------------------------------------------------------
test("deleteCustomRule removes a custom rule", async () => {
  await FlightDeckStorage.addCustomRule({
    id: "custom-1",
    label: "Temp",
    hosts: ["myapp.example.com"],
    params: [{ key: "a", value: "1" }]
  });

  const state = await FlightDeckStorage.deleteCustomRule("custom-1");
  expect(state.customRules).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// getEnabledRules
// ---------------------------------------------------------------------------
test("getEnabledRules returns only enabled rules from presets and custom", async () => {
  await FlightDeckStorage.toggleRule("example-debug", true);
  const state = await FlightDeckStorage.addCustomRule({
    id: "custom-1",
    label: "Custom",
    hosts: ["myapp.example.com"],
    params: [{ key: "x", value: "1" }]
  });

  // Custom rule starts disabled
  const enabled = FlightDeckStorage.getEnabledRules(state);
  expect(enabled).toHaveLength(1);
  expect(enabled[0].id).toBe("example-debug");
});

// ---------------------------------------------------------------------------
// getDefaults
// ---------------------------------------------------------------------------
test("getDefaults returns all 3 built-in presets", () => {
  const defaults = FlightDeckStorage.getDefaults();
  expect(defaults).toHaveLength(3);
  expect(defaults.every((p) => p.builtin === true)).toBe(true);
});

// ---------------------------------------------------------------------------
// saveState mirrors to sync
// ---------------------------------------------------------------------------
test("saveState writes to both local and sync", async () => {
  const state = {
    presets: [{ id: "test", enabled: true }],
    customRules: [],
    schemaVersion: 1
  };
  await FlightDeckStorage.saveState(state);

  expect(storageData.flightdeck).toEqual(state);
  expect(syncData.flightdeck_sync).toEqual(state);
});
