# Contributing to FlightDeck

Thank you for your interest in contributing to FlightDeck! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Bugs

Before reporting a bug:

1. Check existing [issues](https://github.com/kafkade/flightdeck/issues) to avoid duplicates
2. Gather relevant information:
   - Browser and version (Edge, Chrome, etc.)
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior

Use the [bug report template](https://github.com/kafkade/flightdeck/issues/new?template=bug_report.yml) to create an issue.

### Suggesting Features

1. Check existing issues and discussions for similar suggestions
2. Open a [feature request](https://github.com/kafkade/flightdeck/issues/new?template=feature_request.yml) with:
   - Clear description of the feature
   - Use case and motivation
   - Proposed implementation (if you have ideas)

### Submitting Code

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run checks (`npm run lint && npm test`)
5. Test manually — load the extension, toggle presets, verify URL rewriting works
6. Commit with a descriptive message using conventional commits
7. Push to your fork
8. Open a Pull Request

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Chromium-based browser** (Edge or Chrome) for manual testing and E2E tests
- **Git**

### Building

```bash
git clone https://github.com/kafkade/flightdeck.git
cd flightdeck
npm install
```

Load the extension for development:

1. Open `edge://extensions` or `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `src/` directory
4. After making changes, click the **reload** button on the extension card

### Running Tests

```bash
npm test                            # Run all unit tests (Jest)
npx jest tests/unit/rules.test.js   # Run a single test file
npm run test:e2e                    # Playwright E2E smoke tests (headed browser required)
npm run lint                        # ESLint
npm run package                     # Build dist/flightdeck.zip
```

> **Note:** E2E tests require a headed Chromium instance (`headless: false`) because browser extensions cannot load in headless mode. They are not run in CI — run them locally before submitting changes to the popup or service worker.

## Coding Conventions

- **Vanilla JS** (ES2022) — no TypeScript, no framework, no build step
- Use `const` / `let`, never `var`
- Arrow functions for callbacks
- Keep functions small and testable
- Storage and rule-compilation code must have **zero DOM dependencies**
- Use `textContent` instead of `innerHTML` when rendering user-provided values (XSS prevention)
- Only comment code that needs clarification — don't over-comment
- 2-space indentation, LF line endings (see `.editorconfig`)
- ESLint enforces style — run `npm run lint` before committing

## Project Structure

| Directory | Purpose |
|---|---|
| `src/` | Extension source (loaded directly by the browser — no build step) |
| `src/background/` | Service worker — DNR rules, badge, keyboard shortcut |
| `src/popup/` | Popup UI — HTML, CSS, JS |
| `src/content/` | Content script — version overlay |
| `src/storage.js` | State persistence layer |
| `src/rules.js` | DNR rule compiler |
| `tests/unit/` | Jest unit tests |
| `tests/e2e/` | Playwright E2E smoke tests |
| `scripts/` | Dev tooling (packaging) |

## Making Changes

### Adding a New Preset

1. Add the preset object to `getDefaults()` in `src/storage.js`
2. Add the target domain to `host_permissions` in `src/manifest.json` (if new)
3. Write a unit test in `tests/unit/` covering the new preset
4. Bump the `schemaVersion` in `storage.js` if the schema shape changes

### Versioning

Keep versions aligned in both `package.json` and `src/manifest.json`. Bump both together.

## Pull Request Process

1. Push your branch and open a PR against `main`
2. Fill in the PR template
3. Run checks locally before requesting review:
   ```bash
   npm run lint && npm test
   ```
4. Request a review
5. Use **squash merge** with a conventional commit title:
   - `feat: add new preset for X`
   - `fix: prevent double-append on redirect`
   - `docs: update README with custom rules guide`
   - `test: add E2E test for mutual exclusion`

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `test:` — Adding or updating tests
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `chore:` — Build process, CI, dependencies

## License

By contributing to FlightDeck, you agree that your contributions will be licensed under the [MIT License](LICENSE).
