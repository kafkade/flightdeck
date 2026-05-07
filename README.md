# FlightDeck

A Chromium browser extension (Manifest V3) that lets developers toggle query-string parameters on specific URL patterns — a lightweight alternative to proxy tools for simple request-decoration workflows.

## Features

- **Preset toggles** — built-in example rules grouped by service in the popup
- **Mutual exclusion groups** — enabling a rule in a group auto-disables conflicting peers
- **Custom rules** — create, edit, and delete your own rules with any host + parameter combination
- **Import / Export** — share rule configurations with teammates as JSON files
- **Keyboard shortcut** — press `Ctrl+Shift+Q` (or `Cmd+Shift+Q` on Mac) to toggle all rules on/off
- **Badge indicator** — toolbar icon shows count of active rules
- **Build info overlay** — content script surfaces version metadata from HTML meta tags and comments
- **Cross-device sync** — settings mirror to `chrome.storage.sync` for multi-device use

## Installation

### From Source (Developer Mode)

1. Clone this repository:

   ```bash
   git clone https://github.com/kafkade/flightdeck.git
   cd flightdeck
   npm install
   ```

2. Open your browser's extension page:
   - **Edge**: `edge://extensions`
   - **Chrome**: `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `src/` directory
5. Pin the FlightDeck icon to your toolbar for easy access

> **Sharing with teammates:** Run `npm run package` to create `dist/flightdeck.zip`, then share the zip. Recipients extract it and load unpacked as above.

## Usage

### Toggling Presets

1. Click the FlightDeck toolbar icon to open the popup
2. Toggle any preset on/off — the parameter will be appended to matching URLs immediately
3. Presets in an exclusion group auto-disable conflicting peers when toggled on

### Creating Custom Rules

1. In the popup, scroll to the **Custom Rules** section
2. Click the **+** button
3. Fill in:
   - **Label** — a name for the rule
   - **Hosts** — comma-separated target hostnames (e.g., `example.com, api.example.com`)
   - **Param key / value** — the query parameter to append
   - **Exclusion group** _(optional)_ — group name for mutual exclusion
4. Click **Save**

Custom rules can be edited (✏️) or deleted (🗑️) from the popup.

### Importing & Exporting Rules

Use the **⬇ Export** and **⬆ Import** buttons in the popup footer to share configurations:

- **Export** downloads a `flightdeck-rules.json` file with all preset states and custom rules
- **Import** reads a JSON file and merges it into your current configuration:
  - Preset enabled/disabled states are synced for matching presets
  - New custom rules are added; duplicates (same ID) are skipped
  - Invalid rules are skipped with a summary of what was imported

### Keyboard Shortcut

Press `Ctrl+Shift+Q` (`Cmd+Shift+Q` on Mac) to:

- **Toggle all off** — if any rules are active, saves a snapshot and disables everything
- **Restore** — if no rules are active, restores the previously saved snapshot

Customize the shortcut at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

## Permissions

FlightDeck requests the following permissions:

| Permission | Why |
|---|---|
| `declarativeNetRequest` | Append query parameters to matching URL navigations via redirect rules |
| `storage` | Persist rule state locally and sync across devices |
| `host_permissions: <all_urls>` | Allow rules to target any hostname the user configures |
| Content script (`<all_urls>`) | Extract build/version metadata from page meta tags and HTML comments |

The extension does **not** collect, transmit, or share any data with external servers. See [PRIVACY.md](PRIVACY.md) for details.

## Development

```bash
npm install            # Install dev dependencies
npm test               # Run Jest unit tests
npm run lint           # Run ESLint
npm run test:e2e       # Run Playwright E2E tests (requires headed browser)
npm run package        # Build dist/flightdeck.zip for distribution
npm run release:patch  # Prepare patch release (bump version + changelog stamp + tag)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding conventions and PR guidelines.

### Release Automation

- Local release prep script: `scripts/release.ps1`
- CI release workflow: `.github/workflows/release.yml`
- Trigger: push a `v*` tag (or run workflow manually)
- CI behavior: validates, packages, creates/updates GitHub Release, and publishes to Chrome/Edge when store secrets are configured

## Project Docs

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [PRIVACY.md](PRIVACY.md)
- [PUBLISHING.md](PUBLISHING.md)
- [CHANGELOG.md](CHANGELOG.md)

## Architecture

```
src/
├── manifest.json            # MV3 manifest — permissions, commands, content scripts
├── storage.js               # State persistence (chrome.storage.local + sync mirror)
├── rules.js                 # Rule compilation engine: state → DNR dynamic rules
├── background/
│   └── service-worker.js    # Message handler, DNR application, keyboard shortcut
├── popup/                   # Extension popup UI (vanilla HTML/CSS/JS)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   └── version-overlay.js   # Content script — build info from meta/comments
└── icons/                   # Extension icons (16, 32, 48, 128 px)
tests/
├── unit/                    # Jest unit tests (rules, storage)
└── e2e/                     # Playwright E2E smoke tests
scripts/
└── package.js               # Zip builder for distribution
```

### How It Works

1. The **popup** reads state from `chrome.storage.local` and renders toggle switches grouped by service
2. Toggling a rule sends a message to the **service worker**, which updates storage and recompiles DNR rules
3. `chrome.declarativeNetRequest.updateDynamicRules()` registers redirect rules that append query parameters to matching URLs
4. The browser performs an internal redirect (307) — transparent to the user but visible in DevTools
5. Multiple rules targeting the **same host** are merged into a single DNR rule (DNR does not chain redirects)

### Key Concepts

- **Presets** — built-in rules shipped with the extension (`builtin: true`), cannot be deleted
- **Custom Rules** — user-created rules with the same shape, persisted in `customRules[]`
- **Exclusion Groups** — rules sharing a `group` string; enabling one auto-disables others in the group
- **Rule Compilation** — `compileRules()` merges all enabled rules per host into one DNR rule, last-writer-wins for duplicate param keys

## Troubleshooting

| Problem | Solution |
|---|---|
| Toggled a rule but the URL doesn't change | Check DevTools Network tab — the redirect is a 307 and may not update the address bar visually. Look for the appended param in the actual request URL. |
| Extension icon is greyed out | The extension may have errored. Go to `edge://extensions` or `chrome://extensions`, find FlightDeck, and click **Errors** or **Reload**. |
| Keyboard shortcut doesn't work | Another extension may have claimed the shortcut. Check `edge://extensions/shortcuts` and reassign. |
| Import says "0 added, N skipped" | The imported rules already exist (same IDs) or have invalid hosts/params. Export a fresh file and compare. |

## License

[MIT](LICENSE)
