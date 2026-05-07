// Unit tests for FlightDeck rule compilation engine (rules.js)

beforeEach(() => {
  jest.resetModules();
  delete globalThis.FlightDeckRules;
  require("../../src/rules.js");
});

function makeState(presets, customRules = []) {
  return { presets, customRules, schemaVersion: 1 };
}

function makePreset(overrides = {}) {
  return {
    id: "test-preset",
    label: "Test Preset",
    enabled: false,
    hosts: ["example.com"],
    params: [{ key: "debug", value: "true" }],
    group: null,
    builtin: true,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
test("compileRules returns empty array when no rules are enabled", () => {
  const state = makeState([makePreset({ enabled: false })]);
  const result = FlightDeckRules.compileRules(state);
  expect(result).toEqual([]);
});

test("compileRules returns empty array for empty presets and customRules", () => {
  const state = makeState([], []);
  const result = FlightDeckRules.compileRules(state);
  expect(result).toEqual([]);
});

// ---------------------------------------------------------------------------
// Single preset → single DNR rule
// ---------------------------------------------------------------------------
test("single enabled preset produces one DNR rule", () => {
  const state = makeState([makePreset({ enabled: true })]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(1);
  expect(rules[0]).toMatchObject({
    id: 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: "debug", value: "true" }]
          }
        }
      }
    },
    condition: {
      urlFilter: "||example.com",
      resourceTypes: ["main_frame"]
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-host preset → multiple DNR rules
// ---------------------------------------------------------------------------
test("multi-host preset produces one DNR rule per host", () => {
  const state = makeState([
    makePreset({
      id: "multi-host",
      enabled: true,
      hosts: ["example.com", "api.example.com"],
      params: [{ key: "env", value: "staging" }]
    })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(2);
  expect(rules[0].condition.urlFilter).toBe("||example.com");
  expect(rules[1].condition.urlFilter).toBe("||api.example.com");
  expect(rules[0].id).toBe(1);
  expect(rules[1].id).toBe(2);
});

// ---------------------------------------------------------------------------
// Multiple enabled rules for same host → merged into one DNR rule
// ---------------------------------------------------------------------------
test("multiple rules for the same host are merged into one DNR rule", () => {
  const state = makeState([
    makePreset({ id: "a", enabled: true, hosts: ["example.com"], params: [{ key: "debug", value: "true" }] }),
    makePreset({ id: "b", enabled: true, hosts: ["example.com"], params: [{ key: "env", value: "staging" }] })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(1);
  expect(rules[0].condition.urlFilter).toBe("||example.com");
  expect(rules[0].action.redirect.transform.queryTransform.addOrReplaceParams).toEqual([
    { key: "debug", value: "true" },
    { key: "env", value: "staging" }
  ]);
});

// ---------------------------------------------------------------------------
// Multiple enabled rules for different hosts → separate DNR rules
// ---------------------------------------------------------------------------
test("rules for different hosts produce separate DNR rules", () => {
  const state = makeState([
    makePreset({ id: "a", enabled: true, hosts: ["example.com"] }),
    makePreset({ id: "b", enabled: false, hosts: ["example.com"] }),
    makePreset({ id: "c", enabled: true, hosts: ["api.example.com", "cdn.example.com"], params: [{ key: "env", value: "staging" }] })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  // example.com (1 rule) + api.example.com (1 rule) + cdn.example.com (1 rule) = 3
  expect(rules).toHaveLength(3);
});

// ---------------------------------------------------------------------------
// Custom rules compiled alongside presets
// ---------------------------------------------------------------------------
test("custom rules are compiled alongside presets", () => {
  const state = makeState(
    [makePreset({ enabled: true })],
    [makePreset({ id: "custom-1", enabled: true, hosts: ["api.example.com"], params: [{ key: "verbose", value: "1" }], builtin: false })]
  );
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(2);
  expect(rules[0].condition.urlFilter).toBe("||example.com");
  expect(rules[1].condition.urlFilter).toBe("||api.example.com");
});

// ---------------------------------------------------------------------------
// Special characters in params
// ---------------------------------------------------------------------------
test("params with special characters are preserved verbatim", () => {
  const state = makeState([
    makePreset({
      enabled: true,
      params: [{ key: "redirect_uri", value: "https://example.com/callback?foo=bar&baz=1" }]
    })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(1);
  expect(rules[0].action.redirect.transform.queryTransform.addOrReplaceParams).toEqual([
    { key: "redirect_uri", value: "https://example.com/callback?foo=bar&baz=1" }
  ]);
});

// ---------------------------------------------------------------------------
// Multiple params per rule
// ---------------------------------------------------------------------------
test("rule with multiple params includes all in addOrReplaceParams", () => {
  const state = makeState([
    makePreset({
      enabled: true,
      params: [
        { key: "debug", value: "true" },
        { key: "verbose", value: "1" }
      ]
    })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules[0].action.redirect.transform.queryTransform.addOrReplaceParams).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// All rules disabled → empty output
// ---------------------------------------------------------------------------
test("all rules disabled returns empty array", () => {
  const state = makeState(
    [makePreset({ enabled: false }), makePreset({ id: "b", enabled: false })],
    [makePreset({ id: "c", enabled: false, builtin: false })]
  );
  expect(FlightDeckRules.compileRules(state)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Duplicate param key on same host → last value wins
// ---------------------------------------------------------------------------
test("duplicate param keys on same host are deduplicated (last wins)", () => {
  const state = makeState([
    makePreset({ id: "a", enabled: true, hosts: ["example.com"], params: [{ key: "env", value: "staging" }] }),
    makePreset({ id: "b", enabled: true, hosts: ["example.com"], params: [{ key: "env", value: "production" }] })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(1);
  expect(rules[0].action.redirect.transform.queryTransform.addOrReplaceParams).toEqual([
    { key: "env", value: "production" }
  ]);
});
