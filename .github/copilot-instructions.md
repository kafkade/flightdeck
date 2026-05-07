# Copilot Instructions — FlightDeck

## What is FlightDeck

A Chromium browser extension (Manifest V3) that lets developers toggle query-string parameters on specific URL patterns using the `declarativeNetRequest` API. It also includes a content script that surfaces build/version info from HTML meta tags and comments.

## Commands

```bash
npm test                     # Unit tests (Jest)
npx jest tests/unit/rules.test.js   # Run a single unit test file
npm run test:e2e             # E2E tests (Playwright, launches headed Chromium with extension loaded)
npm run lint                 # ESLint across src/ and tests/
npm run package              # Zip src/ into dist/flightdeck.zip for distribution
npm run release:patch        # Prepare release commit/tag/changelog stamp (manual maintainer action)
```

E2E tests require a headed Chromium instance (`headless: false`) because browser extensions cannot load in headless mode. They run single-threaded (`workers: 1`).

## CI

- GitHub workflow: `.github/workflows/validate.yml`
- Required status check name: **Validate**
- CI runs lint + unit tests + packaging. E2E remains local-only.
- Release workflow: `.github/workflows/release.yml` (tag `v*` or manual dispatch)

## Architecture

```
src/
├── manifest.json            # MV3 manifest — permissions: declarativeNetRequest, storage
├── storage.js               # State persistence layer (chrome.storage.local + sync mirror)
├── rules.js                 # Rule compilation engine: state → DNR dynamic rules
├── background/
│   └── service-worker.js    # Message handler, DNR rule application, keyboard shortcut
├── popup/                   # Extension popup UI (vanilla HTML/CSS/JS)
└── content/
    └── version-overlay.js   # Content script — extracts build info from meta/comments
```

### Data flow

1. **Popup** sends messages (`toggle`, `add-rule`, `delete-rule`, etc.) to the **service worker** via `chrome.runtime.sendMessage`.
2. **Service worker** validates and persists state through `FlightDeckStorage`, then compiles enabled rules via `FlightDeckRules.compileRules()` and applies them with `chrome.declarativeNetRequest.updateDynamicRules()`.
3. Multiple rules targeting the **same host** are merged into a single DNR rule (DNR does not chain redirects). Duplicate param keys on the same host resolve last-writer-wins.
4. **Storage** writes to `chrome.storage.local` (primary) with best-effort mirroring to `chrome.storage.sync` for cross-device state. On first run, it tries restoring from sync before seeding defaults.

### Rule model

Each rule (preset or custom) has: `id`, `label`, `enabled`, `hosts[]`, `params[{key, value}]`, `group`, `builtin`. Rules sharing a non-null `group` are mutually exclusive — enabling one disables the others.

## Git Policy

AI assistants must **never** execute commands that modify git history or state. This includes `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git revert`, `git cherry-pick`, `git amend`, `git stash`, `git tag`, and any other write operation on the repository. Only read-only git commands (e.g., `git status`, `git log`, `git diff`) are permitted.

## Conventions

- **No build step** — `src/` is the extension directory loaded directly by Chromium. All source files are plain ES2022 JavaScript (CommonJS-style for Node tooling, script globals for browser).
- **Module sharing via `globalThis`** — `storage.js` and `rules.js` export their APIs onto `globalThis.FlightDeckStorage` and `globalThis.FlightDeckRules`. The service worker loads them with `importScripts()`. Unit tests load them via `require()`, which triggers the same `globalThis` assignment.
- **2-space indentation, LF line endings** (see `.editorconfig`).
- **`prefer-const` and `no-var`** are enforced by ESLint.
- **Unused function args** prefixed with `_` are allowed (`argsIgnorePattern: "^_"`).
- **Unit tests** mock `chrome.*` APIs on `global.chrome` and reset modules between tests with `jest.resetModules()` + `delete globalThis.FlightDeckRules/Storage`.
- **E2E tests** use a Playwright custom fixture that launches a persistent Chromium context with the extension loaded, extracting the extension ID from the service worker URL.
- **PR prep skill** lives at `.github/skills/pr-ready/SKILL.md` and should be used for changelog-aware PR descriptions.
