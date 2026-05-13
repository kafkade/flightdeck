// Unit tests for FlightDeck storage layer (storage.js) — schema v2

let storageData = {};
let syncData = {};

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
test("loadState seeds default rules on first run", async () => {
  const state = await FlightDeckStorage.loadState();

  expect(state.schemaVersion).toBe(2);
  expect(state.rules).toHaveLength(3);
  expect(state.rules[0].id).toBe("example-debug");
  expect(state.rules[1].id).toBe("example-staging");
  expect(state.rules[2].id).toBe("example-production");
});

test("loadState returns stored v2 state if it exists", async () => {
  const existingState = {
    rules: [{ id: "test", enabled: true }],
    schemaVersion: 2
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
    rules: [{ id: "synced-rule", enabled: true }],
    schemaVersion: 2
  };
  syncData.flightdeck_sync = syncState;

  const state = await FlightDeckStorage.loadState();
  expect(state.rules[0].id).toBe("synced-rule");
});

// ---------------------------------------------------------------------------
// Migration — v1 to v2
// ---------------------------------------------------------------------------
test("loadState migrates v1 state to v2", async () => {
  storageData.flightdeck = {
    presets: [
      { id: "p1", label: "Preset", enabled: true, hosts: ["a.com"], params: [{ key: "k", value: "v" }], group: null, builtin: true }
    ],
    customRules: [
      { id: "c1", label: "Custom", enabled: false, hosts: ["b.com"], params: [{ key: "x", value: "1" }], group: "g1", builtin: false }
    ],
    schemaVersion: 1
  };

  const state = await FlightDeckStorage.loadState();
  expect(state.schemaVersion).toBe(2);
  expect(state.rules).toHaveLength(2);
  expect(state.rules[0].id).toBe("p1");
  expect(state.rules[1].id).toBe("c1");
  // builtin flag should be stripped
  expect(state.rules[0].builtin).toBeUndefined();
  expect(state.rules[1].builtin).toBeUndefined();
});

test("migration from v1 sync data works", async () => {
  syncData.flightdeck_sync = {
    presets: [{ id: "sp1", label: "Sync Preset", enabled: false, hosts: ["c.com"], params: [{ key: "a", value: "b" }], group: null, builtin: true }],
    customRules: [],
    schemaVersion: 1
  };

  const state = await FlightDeckStorage.loadState();
  expect(state.schemaVersion).toBe(2);
  expect(state.rules[0].id).toBe("sp1");
});

// ---------------------------------------------------------------------------
// normalizeState
// ---------------------------------------------------------------------------
test("normalizeState returns defaults for null", () => {
  const state = FlightDeckStorage.normalizeState(null);
  expect(state.schemaVersion).toBe(2);
  expect(state.rules).toHaveLength(3);
});

test("normalizeState migrates v1", () => {
  const state = FlightDeckStorage.normalizeState({
    presets: [{ id: "a", builtin: true }],
    customRules: [{ id: "b", builtin: false }],
    schemaVersion: 1
  });
  expect(state.schemaVersion).toBe(2);
  expect(state.rules).toHaveLength(2);
});

test("normalizeState passes through v2", () => {
  const v2 = { rules: [{ id: "x" }], schemaVersion: 2 };
  expect(FlightDeckStorage.normalizeState(v2)).toBe(v2);
});

// ---------------------------------------------------------------------------
// All defaults are disabled by default
// ---------------------------------------------------------------------------
test("all default rules start disabled", async () => {
  const state = await FlightDeckStorage.loadState();
  for (const rule of state.rules) {
    expect(rule.enabled).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// toggleRule
// ---------------------------------------------------------------------------
test("toggleRule enables a rule", async () => {
  const state = await FlightDeckStorage.toggleRule("example-debug", true);
  const rule = state.rules.find((r) => r.id === "example-debug");
  expect(rule.enabled).toBe(true);
});

test("toggleRule disables a rule", async () => {
  await FlightDeckStorage.toggleRule("example-debug", true);
  const state = await FlightDeckStorage.toggleRule("example-debug", false);
  const rule = state.rules.find((r) => r.id === "example-debug");
  expect(rule.enabled).toBe(false);
});

// ---------------------------------------------------------------------------
// toggleRule — exclusion group enforcement
// ---------------------------------------------------------------------------
test("enabling a rule in an exclusion group disables others in the same group", async () => {
  await FlightDeckStorage.toggleRule("example-staging", true);
  const state = await FlightDeckStorage.toggleRule("example-production", true);

  const staging = state.rules.find((r) => r.id === "example-staging");
  const production = state.rules.find((r) => r.id === "example-production");

  expect(staging.enabled).toBe(false);
  expect(production.enabled).toBe(true);
});

test("exclusion group does not affect rules with group: null", async () => {
  await FlightDeckStorage.toggleRule("example-debug", true);
  const state = await FlightDeckStorage.toggleRule("example-staging", true);

  const debug = state.rules.find((r) => r.id === "example-debug");
  const staging = state.rules.find((r) => r.id === "example-staging");

  expect(debug.enabled).toBe(true);
  expect(staging.enabled).toBe(true);
});

test("toggleRule returns state unchanged for nonexistent ID", async () => {
  const state = await FlightDeckStorage.toggleRule("nonexistent", true);
  expect(state.rules.every((r) => !r.enabled)).toBe(true);
});

// ---------------------------------------------------------------------------
// addRule
// ---------------------------------------------------------------------------
test("addRule adds a rule", async () => {
  const state = await FlightDeckStorage.addRule({
    id: "custom-1",
    label: "Test Custom",
    hosts: ["myapp.example.com"],
    params: [{ key: "debug", value: "1" }],
    group: null
  });

  expect(state.rules).toHaveLength(4); // 3 defaults + 1 new
  const added = state.rules.find((r) => r.id === "custom-1");
  expect(added.label).toBe("Test Custom");
  expect(added.enabled).toBe(false);
});

// ---------------------------------------------------------------------------
// updateRule
// ---------------------------------------------------------------------------
test("updateRule updates existing rule fields", async () => {
  await FlightDeckStorage.addRule({
    id: "custom-1",
    label: "Original",
    hosts: ["myapp.example.com"],
    params: [{ key: "a", value: "1" }]
  });

  const state = await FlightDeckStorage.updateRule("custom-1", {
    label: "Updated",
    params: [{ key: "b", value: "2" }]
  });

  const rule = state.rules.find((r) => r.id === "custom-1");
  expect(rule.label).toBe("Updated");
  expect(rule.params).toEqual([{ key: "b", value: "2" }]);
});

test("updateRule works on default rules too", async () => {
  const state = await FlightDeckStorage.updateRule("example-debug", {
    label: "Modified Debug"
  });

  const rule = state.rules.find((r) => r.id === "example-debug");
  expect(rule.label).toBe("Modified Debug");
});

test("updateRule returns state unchanged for nonexistent ID", async () => {
  const state = await FlightDeckStorage.updateRule("nonexistent", { label: "X" });
  expect(state.rules).toHaveLength(3);
});

// ---------------------------------------------------------------------------
// deleteRule — works on any rule
// ---------------------------------------------------------------------------
test("deleteRule removes a rule", async () => {
  await FlightDeckStorage.addRule({
    id: "custom-1",
    label: "Temp",
    hosts: ["myapp.example.com"],
    params: [{ key: "a", value: "1" }]
  });

  const state = await FlightDeckStorage.deleteRule("custom-1");
  expect(state.rules.find((r) => r.id === "custom-1")).toBeUndefined();
});

test("deleteRule can delete a default rule", async () => {
  const state = await FlightDeckStorage.deleteRule("example-debug");
  expect(state.rules.find((r) => r.id === "example-debug")).toBeUndefined();
  expect(state.rules).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// resetDefaults — restores missing defaults only
// ---------------------------------------------------------------------------
test("resetDefaults re-adds deleted default rules", async () => {
  await FlightDeckStorage.deleteRule("example-debug");
  await FlightDeckStorage.deleteRule("example-staging");
  const state = await FlightDeckStorage.resetDefaults();

  expect(state.rules.find((r) => r.id === "example-debug")).toBeDefined();
  expect(state.rules.find((r) => r.id === "example-staging")).toBeDefined();
});

test("resetDefaults does not overwrite modified defaults", async () => {
  await FlightDeckStorage.updateRule("example-debug", { label: "My Custom Label" });
  const state = await FlightDeckStorage.resetDefaults();

  const rule = state.rules.find((r) => r.id === "example-debug");
  expect(rule.label).toBe("My Custom Label");
});

test("resetDefaults does not duplicate existing defaults", async () => {
  const state = await FlightDeckStorage.resetDefaults();
  const debugRules = state.rules.filter((r) => r.id === "example-debug");
  expect(debugRules).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// isDefaultId
// ---------------------------------------------------------------------------
test("isDefaultId returns true for default IDs", () => {
  expect(FlightDeckStorage.isDefaultId("example-debug")).toBe(true);
  expect(FlightDeckStorage.isDefaultId("example-staging")).toBe(true);
});

test("isDefaultId returns false for non-default IDs", () => {
  expect(FlightDeckStorage.isDefaultId("custom-rule")).toBe(false);
});

// ---------------------------------------------------------------------------
// getEnabledRules
// ---------------------------------------------------------------------------
test("getEnabledRules returns only enabled rules", async () => {
  await FlightDeckStorage.toggleRule("example-debug", true);
  const state = await FlightDeckStorage.addRule({
    id: "custom-1",
    label: "Custom",
    hosts: ["myapp.example.com"],
    params: [{ key: "x", value: "1" }]
  });

  const enabled = FlightDeckStorage.getEnabledRules(state);
  expect(enabled).toHaveLength(1);
  expect(enabled[0].id).toBe("example-debug");
});

// ---------------------------------------------------------------------------
// getDefaults
// ---------------------------------------------------------------------------
test("getDefaults returns all 3 default rules", () => {
  const defaults = FlightDeckStorage.getDefaults();
  expect(defaults).toHaveLength(3);
  // No builtin flag in v2
  expect(defaults[0].builtin).toBeUndefined();
});

// ---------------------------------------------------------------------------
// saveState mirrors to sync
// ---------------------------------------------------------------------------
test("saveState writes to both local and sync", async () => {
  const state = {
    rules: [{ id: "test", enabled: true }],
    schemaVersion: 2
  };
  await FlightDeckStorage.saveState(state);

  expect(storageData.flightdeck).toEqual(state);
  expect(syncData.flightdeck_sync).toEqual(state);
});
