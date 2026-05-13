// FlightDeck — service worker
// Manages declarativeNetRequest dynamic rules for query-string injection.

importScripts("../storage.js", "../rules.js");

// Validate a rule object. Returns an error string or null if valid.
function validateRule(rule, existingIds = []) {
  if (!rule || typeof rule !== "object") return "Invalid rule object";
  if (!rule.label || typeof rule.label !== "string" || !rule.label.trim()) return "Label is required";
  if (!Array.isArray(rule.hosts) || rule.hosts.length === 0) return "At least one host is required";
  for (const host of rule.hosts) {
    if (typeof host !== "string" || !host.trim()) return "Each host must be a non-empty string";
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host.trim())) {
      return `Invalid hostname: "${host}"`;
    }
  }
  if (!Array.isArray(rule.params) || rule.params.length === 0) return "At least one parameter is required";
  for (const p of rule.params) {
    if (!p.key || typeof p.key !== "string" || !p.key.trim()) return "Parameter key is required";
    if (p.value === undefined || p.value === null) return "Parameter value is required";
  }
  if (rule.id && existingIds.includes(rule.id)) return `Duplicate rule ID: ${rule.id}`;
  return null;
}

// Normalize imported data (v1 or v2 format) into a rules array
function normalizeImport(data) {
  if (Array.isArray(data.rules)) {
    return data.rules;
  }
  // v1 format: presets[] + customRules[]
  const rules = [];
  if (Array.isArray(data.presets)) {
    for (const p of data.presets) {
      const rule = Object.assign({}, p);
      delete rule.builtin;
      rules.push(rule);
    }
  }
  if (Array.isArray(data.customRules)) {
    for (const c of data.customRules) {
      const rule = Object.assign({}, c);
      delete rule.builtin;
      rules.push(rule);
    }
  }
  return rules;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "toggle") {
    FlightDeckStorage.toggleRule(message.id, message.enabled).then((state) => {
      applyAllRules(state).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "get-state") {
    FlightDeckStorage.loadState().then((state) => sendResponse(state));
    return true;
  }

  if (message.type === "get-host-history") {
    FlightDeckStorage.getHostHistory().then((hosts) => sendResponse({ hosts }));
    return true;
  }

  if (message.type === "add-rule") {
    FlightDeckStorage.loadState().then((state) => {
      const existingIds = state.rules.map((r) => r.id);
      const error = validateRule(message.rule, existingIds);
      if (error) {
        sendResponse({ ok: false, error });
        return;
      }
      FlightDeckStorage.addRule(message.rule).then((updatedState) => {
        applyAllRules(updatedState).then(() => sendResponse({ ok: true, state: updatedState }));
      });
    });
    return true;
  }

  if (message.type === "update-rule") {
    FlightDeckStorage.loadState().then((state) => {
      const target = state.rules.find((r) => r.id === message.id);
      if (!target) {
        sendResponse({ ok: false, error: "Rule not found" });
        return;
      }
      const merged = { ...target, ...message.updates };
      const error = validateRule(merged);
      if (error) {
        sendResponse({ ok: false, error });
        return;
      }
      FlightDeckStorage.updateRule(message.id, message.updates).then((updatedState) => {
        applyAllRules(updatedState).then(() => sendResponse({ ok: true, state: updatedState }));
      });
    });
    return true;
  }

  if (message.type === "delete-rule") {
    FlightDeckStorage.loadState().then((state) => {
      const target = state.rules.find((r) => r.id === message.id);
      if (!target) {
        sendResponse({ ok: false, error: "Rule not found" });
        return;
      }
      FlightDeckStorage.deleteRule(message.id).then((updatedState) => {
        applyAllRules(updatedState).then(() => sendResponse({ ok: true, state: updatedState }));
      });
    });
    return true;
  }

  if (message.type === "reset-defaults") {
    FlightDeckStorage.resetDefaults().then((state) => {
      applyAllRules(state).then(() => sendResponse({ ok: true, state }));
    });
    return true;
  }

  if (message.type === "import-rules") {
    FlightDeckStorage.loadState().then(async (state) => {
      const imported = message.data;
      const strategy = message.strategy || "merge";

      if (!imported || typeof imported !== "object") {
        sendResponse({ ok: false, error: "Invalid JSON structure" });
        return;
      }

      const importedRules = normalizeImport(imported);

      // Validate all imported rules before mutating state
      const validRules = [];
      let skipped = 0;
      for (const rule of importedRules) {
        const error = validateRule(rule);
        if (error) {
          skipped++;
          continue;
        }
        validRules.push({
          id: rule.id,
          label: rule.label,
          enabled: typeof rule.enabled === "boolean" ? rule.enabled : false,
          hosts: rule.hosts,
          params: rule.params,
          group: rule.group || null
        });
      }

      let added = 0;
      let updated = 0;

      if (strategy === "replace") {
        // Replace all — wipe current rules, use imported
        state.rules = validRules;
        added = validRules.length;
      } else if (strategy === "overwrite") {
        // Merge with overwrite — update existing by ID, add new
        const existingMap = new Map(state.rules.map((r) => [r.id, r]));
        for (const rule of validRules) {
          if (existingMap.has(rule.id)) {
            Object.assign(existingMap.get(rule.id), rule);
            updated++;
          } else {
            state.rules.push(rule);
            added++;
          }
        }
      } else {
        // Merge — add new only, skip existing
        const existingIds = new Set(state.rules.map((r) => r.id));
        for (const rule of validRules) {
          if (existingIds.has(rule.id)) {
            skipped++;
            continue;
          }
          state.rules.push(rule);
          existingIds.add(rule.id);
          added++;
        }
      }

      await FlightDeckStorage.saveState(state);
      await FlightDeckStorage.rebuildHostHistory();
      await applyAllRules(state);
      sendResponse({
        ok: true,
        state,
        summary: { added, updated, skipped }
      });
    });
    return true;
  }

  return false;
});

// Apply all enabled rules as DNR dynamic rules and update badge
async function applyAllRules(state) {
  const dnrRules = FlightDeckRules.compileRules(state);

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map((r) => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: dnrRules
  });

  const enabledCount = FlightDeckStorage.getEnabledRules(state).length;
  chrome.action.setBadgeText({ text: enabledCount > 0 ? String(enabledCount) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#4A90D9" });
}

// On install or update, load state (triggers migration if needed) and apply
chrome.runtime.onInstalled.addListener(() => {
  FlightDeckStorage.loadState().then((state) => {
    FlightDeckStorage.rebuildHostHistory();
    applyAllRules(state);
  });
});

// Keyboard shortcut: toggle all rules on/off
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-all") {
    FlightDeckStorage.loadState().then(async (state) => {
      const enabledIds = state.rules.filter((r) => r.enabled).map((r) => r.id);

      if (enabledIds.length > 0) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ flightdeck_snapshot: enabledIds }, resolve);
        });
        for (const rule of state.rules) {
          if (rule.enabled) {
            state = await FlightDeckStorage.toggleRule(rule.id, false);
          }
        }
      } else {
        const snapshot = await new Promise((resolve) => {
          chrome.storage.local.get({ flightdeck_snapshot: [] }, (r) => resolve(r.flightdeck_snapshot));
        });
        for (const id of snapshot) {
          state = await FlightDeckStorage.toggleRule(id, true);
        }
        await new Promise((resolve) => {
          chrome.storage.local.remove("flightdeck_snapshot", resolve);
        });
      }
      await applyAllRules(state);
    });
  }
});

// On service worker startup, restore state
FlightDeckStorage.loadState().then(applyAllRules);
