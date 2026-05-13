// FlightDeck — popup logic
// Renders all rules grouped by exclusion group, with toggle, edit, and delete.
// Includes rule CRUD with free-text host input and import strategy dialog.

const container = document.getElementById("rules-container");
const ruleForm = document.getElementById("rule-form");
const btnAdd = document.getElementById("btn-add-rule");
const btnCancel = document.getElementById("btn-cancel");
const formLabel = document.getElementById("form-label");
const formHosts = document.getElementById("form-hosts");
const formKey = document.getElementById("form-key");
const formValue = document.getElementById("form-value");
const formGroup = document.getElementById("form-group");
const formEditId = document.getElementById("form-edit-id");
const hostSuggestions = document.getElementById("host-suggestions");

// Group rules by exclusion group or "General" for ungrouped
function getGroupName(rule) {
  if (rule.group) {
    return rule.group.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "General";
}

function formatParams(rule) {
  return rule.hosts.join(", ") + " → " + rule.params.map((p) => p.key + "=" + p.value).join("&");
}

// Render all rules grouped by exclusion group
function render(state) {
  container.innerHTML = "";
  const rules = state.rules || [];

  if (rules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rules-empty";
    empty.textContent = "No rules configured. Click + Add to create one, or ↺ Defaults to restore examples.";
    container.appendChild(empty);
    return;
  }

  const groups = {};
  for (const rule of rules) {
    const group = getGroupName(rule);
    if (!groups[group]) groups[group] = [];
    groups[group].push(rule);
  }

  for (const [group, groupRules] of Object.entries(groups)) {
    const section = document.createElement("div");
    section.className = "group";

    const header = document.createElement("div");
    header.className = "group-header";
    header.textContent = group;
    section.appendChild(header);

    for (const rule of groupRules) {
      section.appendChild(createRuleElement(rule));
    }

    container.appendChild(section);
  }
}

function createRuleElement(rule) {
  const el = document.createElement("div");
  el.className = "rule" + (rule.enabled ? " rule--active" : "");
  el.dataset.id = rule.id;

  // Toggle
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = rule.enabled;
  checkbox.dataset.ruleId = rule.id;
  const slider = document.createElement("span");
  slider.className = "slider";
  toggleLabel.appendChild(checkbox);
  toggleLabel.appendChild(slider);

  // Info
  const info = document.createElement("div");
  info.className = "rule-info";

  const labelSpan = document.createElement("span");
  labelSpan.className = "rule-label";
  labelSpan.textContent = rule.label;

  if (rule.group) {
    const groupTag = document.createElement("span");
    groupTag.className = "rule-group";
    groupTag.textContent = " ⊘";
    groupTag.title = "Exclusive group: " + rule.group;
    labelSpan.appendChild(groupTag);
  }

  const detailSpan = document.createElement("span");
  detailSpan.className = "rule-detail";
  detailSpan.textContent = formatParams(rule);

  info.appendChild(labelSpan);
  info.appendChild(detailSpan);

  el.appendChild(toggleLabel);
  el.appendChild(info);

  // Action buttons — edit and delete on all rules
  const actions = document.createElement("div");
  actions.className = "rule-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn-icon";
  editBtn.textContent = "✏️";
  editBtn.title = "Edit rule";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditForm(rule);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-icon btn-icon--danger";
  deleteBtn.textContent = "🗑️";
  deleteBtn.title = "Delete rule";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("Delete rule \"" + rule.label + "\"?")) {
      chrome.runtime.sendMessage({ type: "delete-rule", id: rule.id }, () => loadAndRender());
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  el.appendChild(actions);

  checkbox.addEventListener("change", () => {
    chrome.runtime.sendMessage(
      { type: "toggle", id: rule.id, enabled: checkbox.checked },
      () => loadAndRender()
    );
  });

  return el;
}

// --- Host Autocomplete ---

function loadHostSuggestions() {
  chrome.runtime.sendMessage({ type: "get-host-history" }, (response) => {
    if (!response || !response.hosts) return;
    hostSuggestions.innerHTML = "";
    for (const host of response.hosts) {
      const option = document.createElement("option");
      option.value = host;
      hostSuggestions.appendChild(option);
    }
  });
}

function parseHosts(input) {
  return input
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
}

// --- Rule Form Logic ---

function resetForm() {
  ruleForm.reset();
  formEditId.value = "";
  ruleForm.hidden = true;
}

function openAddForm() {
  resetForm();
  loadHostSuggestions();
  ruleForm.hidden = false;
  formLabel.focus();
}

function openEditForm(rule) {
  resetForm();
  loadHostSuggestions();
  formEditId.value = rule.id;
  formLabel.value = rule.label;
  formHosts.value = rule.hosts.join(", ");
  formKey.value = rule.params[0]?.key || "";
  formValue.value = rule.params[0]?.value || "";
  formGroup.value = rule.group || "";

  ruleForm.hidden = false;
  formLabel.focus();
}

btnAdd.addEventListener("click", openAddForm);
btnCancel.addEventListener("click", resetForm);

ruleForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const label = formLabel.value.trim();
  const hosts = parseHosts(formHosts.value);
  const key = formKey.value.trim();
  const value = formValue.value.trim();
  const group = formGroup.value.trim() || null;
  const editId = formEditId.value;

  if (!label) { alert("Label is required."); return; }
  if (hosts.length === 0) { alert("Enter at least one host."); return; }
  if (!key) { alert("Parameter key is required."); return; }

  if (editId) {
    chrome.runtime.sendMessage({
      type: "update-rule",
      id: editId,
      updates: { label, hosts, params: [{ key, value }], group }
    }, (response) => {
      if (response && !response.ok) {
        alert("Error: " + response.error);
        return;
      }
      resetForm();
      loadAndRender();
    });
  } else {
    const id = crypto.randomUUID();
    chrome.runtime.sendMessage({
      type: "add-rule",
      rule: { id, label, hosts, params: [{ key, value }], group }
    }, (response) => {
      if (response && !response.ok) {
        alert("Error: " + response.error);
        return;
      }
      resetForm();
      loadAndRender();
    });
  }
});

function loadAndRender() {
  chrome.runtime.sendMessage({ type: "get-state" }, (state) => {
    if (state) render(state);
  });
}

// Initial render
loadAndRender();

// --- Build Info Overlay Toggle ---
const versionOverlayToggle = document.getElementById("version-overlay-toggle");

chrome.storage.local.get({ flightdeck_showVersion: false }, (result) => {
  versionOverlayToggle.checked = result.flightdeck_showVersion;
});

versionOverlayToggle.addEventListener("change", () => {
  chrome.storage.local.set({ flightdeck_showVersion: versionOverlayToggle.checked });
});

// Version footer
const versionEl = document.getElementById("version");
versionEl.textContent = "v" + chrome.runtime.getManifest().version;

// --- Import / Export ---

const btnExport = document.getElementById("btn-export");
const btnImport = document.getElementById("btn-import");
const importFile = document.getElementById("import-file");
const importDialog = document.getElementById("import-dialog");
const importFileInfo = document.getElementById("import-file-info");
const btnImportConfirm = document.getElementById("btn-import-confirm");
const btnImportCancel = document.getElementById("btn-import-cancel");

let pendingImportData = null;

btnExport.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "get-state" }, (state) => {
    if (!state) return;
    const exportData = {
      schemaVersion: 2,
      rules: state.rules,
      exportedAt: new Date().toISOString(),
      version: chrome.runtime.getManifest().version
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flightdeck-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  });
});

btnImport.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      alert("Invalid JSON file.");
      return;
    }

    pendingImportData = data;

    // Count rules in the file
    const ruleCount = Array.isArray(data.rules)
      ? data.rules.length
      : (Array.isArray(data.presets) ? data.presets.length : 0) +
        (Array.isArray(data.customRules) ? data.customRules.length : 0);

    importFileInfo.textContent = `${file.name} — ${ruleCount} rule(s)`;
    importDialog.hidden = false;
  };
  reader.readAsText(file);
  importFile.value = "";
});

btnImportConfirm.addEventListener("click", () => {
  if (!pendingImportData) return;

  const strategy = document.querySelector('input[name="import-strategy"]:checked').value;

  chrome.runtime.sendMessage(
    { type: "import-rules", data: pendingImportData, strategy },
    (response) => {
      if (!response || !response.ok) {
        alert("Import failed: " + (response?.error || "Unknown error"));
      } else {
        const s = response.summary;
        const parts = [];
        if (s.added > 0) parts.push(`${s.added} added`);
        if (s.updated > 0) parts.push(`${s.updated} updated`);
        if (s.skipped > 0) parts.push(`${s.skipped} skipped`);
        alert("Import complete: " + (parts.length > 0 ? parts.join(", ") : "no changes"));
      }
      pendingImportData = null;
      importDialog.hidden = true;
      loadAndRender();
    }
  );
});

btnImportCancel.addEventListener("click", () => {
  pendingImportData = null;
  importDialog.hidden = true;
});

// --- Restore Defaults ---

const btnRestore = document.getElementById("btn-restore");

btnRestore.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "reset-defaults" }, (response) => {
    if (response && response.ok) {
      loadAndRender();
    }
  });
});
