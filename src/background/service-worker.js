// FlightDeck — service worker
// Manages declarativeNetRequest dynamic rules for query-string injection.

importScripts("../storage.js", "../rules.js");

// Validate a custom rule object. Returns an error string or null if valid.
function validateRule(rule, existingIds = []) {
  if (!rule || typeof rule !== "object") return "Invalid rule object";
  if (!rule.label || typeof rule.label !== "string" || !rule.label.trim()) return "Label is required";
  if (!Array.isArray(rule.hosts) || rule.hosts.length === 0) return "At least one host is required";
  for (const host of rule.hosts) {
    if (typeof host !== "string" || !host.trim()) return "Each host must be a non-empty string";
    // Basic hostname validation: must look like a domain
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
      const existingIds = [...state.presets, ...state.customRules].map((r) => r.id);
      const error = validateRule(message.rule, existingIds);
      if (error) {
        sendResponse({ ok: false, error });
        return;
      }
      FlightDeckStorage.addCustomRule(message.rule).then((updatedState) => {
        applyAllRules(updatedState).then(() => sendResponse({ ok: true, state: updatedState }));
      });
    });
    return true;
  }

  if (message.type === "update-rule") {
    FlightDeckStorage.loadState().then((state) => {
      const target = state.customRules.find((r) => r.id === message.id);
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
      FlightDeckStorage.updateCustomRule(message.id, message.updates).then((updatedState) => {
        applyAllRules(updatedState).then(() => sendResponse({ ok: true, state: updatedState }));
      });
    });
    return true;
  }

  if (message.type === "delete-rule") {
    FlightDeckStorage.loadState().then((state) => {
      const target = state.customRules.find((r) => r.id === message.id);
      if (!target) {
        sendResponse({ ok: false, error: "Rule not found" });
        return;
      }
      FlightDeckStorage.deleteCustomRule(message.id).then((updatedState) => {
        applyAllRules(updatedState).then(() => sendResponse({ ok: true, state: updatedState }));
      });
    });
    return true;
  }

  if (message.type === "import-rules") {
    FlightDeckStorage.loadState().then(async (state) => {
      const imported = message.data;
      if (!imported || typeof imported !== "object") {
        sendResponse({ ok: false, error: "Invalid JSON structure" });
        return;
      }

      let added = 0;
      let skipped = 0;
      let presetsSynced = 0;

      // Sync preset enabled states (only for matching IDs)
      if (Array.isArray(imported.presets)) {
        for (const ip of imported.presets) {
          const existing = state.presets.find((p) => p.id === ip.id);
          if (existing && typeof ip.enabled === "boolean") {
            existing.enabled = ip.enabled;
            presetsSynced++;
          }
        }
      }

      // Merge custom rules (skip duplicates by ID)
      if (Array.isArray(imported.customRules)) {
        const existingIds = new Set([
          ...state.presets.map((r) => r.id),
          ...state.customRules.map((r) => r.id)
        ]);
        for (const rule of imported.customRules) {
          if (existingIds.has(rule.id)) {
            skipped++;
            continue;
          }
          const error = validateRule(rule);
          if (error) {
            skipped++;
            continue;
          }
          state.customRules.push({
            id: rule.id,
            label: rule.label,
            enabled: typeof rule.enabled === "boolean" ? rule.enabled : false,
            hosts: rule.hosts,
            params: rule.params,
            group: rule.group || null,
            builtin: false
          });
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
        summary: { presetsSynced, added, skipped }
      });
    });
    return true;
  }

  return false;
});

// Apply all enabled rules as DNR dynamic rules and update badge
async function applyAllRules(state) {
  const dnrRules = FlightDeckRules.compileRules(state);

  // Get current dynamic rule IDs to remove them all, then add new ones
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map((r) => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: dnrRules
  });

  // Badge: show count of enabled rules
  const enabledCount = FlightDeckStorage.getEnabledRules(state).length;
  chrome.action.setBadgeText({ text: enabledCount > 0 ? String(enabledCount) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#4A90D9" });
}

// On install or update, seed defaults and apply
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
      const allRules = [...state.presets, ...state.customRules];
      const enabledIds = allRules.filter((r) => r.enabled).map((r) => r.id);

      if (enabledIds.length > 0) {
        // Save snapshot of currently enabled rules, then disable all
        await new Promise((resolve) => {
          chrome.storage.local.set({ flightdeck_snapshot: enabledIds }, resolve);
        });
        for (const rule of allRules) {
          if (rule.enabled) {
            state = await FlightDeckStorage.toggleRule(rule.id, false);
          }
        }
      } else {
        // Restore from snapshot
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
