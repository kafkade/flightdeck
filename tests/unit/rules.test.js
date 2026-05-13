// Unit tests for FlightDeck rule compilation engine (rules.js) — schema v2

beforeEach(() => {
  jest.resetModules();
  delete globalThis.FlightDeckRules;
  require("../../src/rules.js");
});

function makeState(rules) {
  return { rules, schemaVersion: 2 };
}

function makeRule(overrides = {}) {
  return {
    id: "test-rule",
    label: "Test Rule",
    enabled: false,
    hosts: ["example.com"],
    params: [{ key: "debug", value: "true" }],
    group: null,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
test("compileRules returns empty array when no rules are enabled", () => {
  const state = makeState([makeRule({ enabled: false })]);
  const result = FlightDeckRules.compileRules(state);
  expect(result).toEqual([]);
});

test("compileRules returns empty array for empty rules", () => {
  const state = makeState([]);
  const result = FlightDeckRules.compileRules(state);
  expect(result).toEqual([]);
});

// ---------------------------------------------------------------------------
// Single rule → single DNR rule
// ---------------------------------------------------------------------------
test("single enabled rule produces one DNR rule", () => {
  const state = makeState([makeRule({ enabled: true })]);
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
// Multi-host rule → multiple DNR rules
// ---------------------------------------------------------------------------
test("multi-host rule produces one DNR rule per host", () => {
  const state = makeState([
    makeRule({
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
    makeRule({ id: "a", enabled: true, hosts: ["example.com"], params: [{ key: "debug", value: "true" }] }),
    makeRule({ id: "b", enabled: true, hosts: ["example.com"], params: [{ key: "env", value: "staging" }] })
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
    makeRule({ id: "a", enabled: true, hosts: ["example.com"] }),
    makeRule({ id: "b", enabled: false, hosts: ["example.com"] }),
    makeRule({ id: "c", enabled: true, hosts: ["api.example.com", "cdn.example.com"], params: [{ key: "env", value: "staging" }] })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(3);
});

// ---------------------------------------------------------------------------
// Special characters in params
// ---------------------------------------------------------------------------
test("params with special characters are preserved verbatim", () => {
  const state = makeState([
    makeRule({
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
    makeRule({
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
  const state = makeState([
    makeRule({ enabled: false }),
    makeRule({ id: "b", enabled: false }),
    makeRule({ id: "c", enabled: false })
  ]);
  expect(FlightDeckRules.compileRules(state)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Duplicate param key on same host → last value wins
// ---------------------------------------------------------------------------
test("duplicate param keys on same host are deduplicated (last wins)", () => {
  const state = makeState([
    makeRule({ id: "a", enabled: true, hosts: ["example.com"], params: [{ key: "env", value: "staging" }] }),
    makeRule({ id: "b", enabled: true, hosts: ["example.com"], params: [{ key: "env", value: "production" }] })
  ]);
  const rules = FlightDeckRules.compileRules(state);

  expect(rules).toHaveLength(1);
  expect(rules[0].action.redirect.transform.queryTransform.addOrReplaceParams).toEqual([
    { key: "env", value: "production" }
  ]);
});

// ---------------------------------------------------------------------------
// Handles missing rules array gracefully
// ---------------------------------------------------------------------------
test("compileRules handles state with no rules property", () => {
  const state = { schemaVersion: 2 };
  const rules = FlightDeckRules.compileRules(state);
  expect(rules).toEqual([]);
});
