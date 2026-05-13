// FlightDeck — rule compilation engine
// Converts the unified rule model into declarativeNetRequest dynamic rules.

// Compile enabled rules into DNR dynamic rule objects.
// All params targeting the same host are merged into a single DNR rule,
// because DNR does not chain multiple redirect rules for the same URL.
// Rule IDs are assigned sequentially starting at 1.
function compileRules(state) {
  const rules = state.rules || [];
  const enabled = rules.filter((r) => r.enabled);

  // Group all params by host
  const hostParams = {};
  for (const rule of enabled) {
    for (const host of rule.hosts) {
      if (!hostParams[host]) hostParams[host] = [];
      for (const p of rule.params) {
        // Later params with the same key overwrite earlier ones
        const existing = hostParams[host].findIndex((e) => e.key === p.key);
        if (existing >= 0) {
          hostParams[host][existing] = { key: p.key, value: p.value };
        } else {
          hostParams[host].push({ key: p.key, value: p.value });
        }
      }
    }
  }

  // One DNR rule per host
  const dnrRules = [];
  let ruleId = 1;
  for (const [host, params] of Object.entries(hostParams)) {
    dnrRules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          transform: {
            queryTransform: {
              addOrReplaceParams: params
            }
          }
        }
      },
      condition: {
        urlFilter: "||" + host,
        resourceTypes: ["main_frame"]
      }
    });
  }

  return dnrRules;
}

if (typeof globalThis !== "undefined") {
  globalThis.FlightDeckRules = {
    compileRules
  };
}
