# Publishing FlightDeck (Chrome Web Store + Microsoft Edge Add-ons)

This guide covers the release flow for both stores.

## Prerequisites

1. Chrome Web Store developer account
2. Microsoft Edge Add-ons developer account
3. Public privacy policy URL:
   - `https://github.com/kafkade/flightdeck/blob/main/PRIVACY.md`
4. GitHub Actions secrets configured for store APIs (managed via `c:/kafkade/github-infra`):
   - Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`
   - Edge: `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`

## Release Preparation

1. Prepare release locally:

   ```bash
   npm run release:patch
   # or: npm run release:minor / npm run release:major
   ```

   The script:
   - bumps `package.json` + `src/manifest.json`
   - stamps `CHANGELOG.md` (`[Unreleased]` -> versioned section)
   - runs lint, tests, and packaging
   - creates release commit + git tag

2. Push the release tag:

   ```bash
   git push origin main --follow-tags
   ```

3. `release.yml` runs automatically and:
   - builds `dist/flightdeck.zip`
   - creates/updates GitHub Release
   - uploads/publishes to Chrome and Edge stores
4. Confirm store assets are updated under `store/`.

## GitHub Actions Release Workflow

- Workflow: `.github/workflows/release.yml`
- Triggers:
  - push tag `v*`
  - manual `workflow_dispatch`
- Defaults:
  - Auto-publish on tag
  - If store secrets are missing, store publish steps are skipped with warnings (release still completes)

## Chrome Web Store

1. Open Chrome Web Store Developer Dashboard.
2. Create a new item (or open existing FlightDeck listing).
3. Upload `dist/flightdeck.zip`.
4. Fill listing details:
   - Name, short description, full description
   - Category
   - Screenshots and promotional assets
5. Add privacy policy URL:
   - `https://github.com/kafkade/flightdeck/blob/main/PRIVACY.md`
6. Complete data disclosure:
   - No sale/sharing of data
   - No remote code
   - Data stored locally and optionally synced via browser sync
7. Submit for review.

## Microsoft Edge Add-ons

1. Open Partner Center > Edge Add-ons.
2. Create a new submission (or update existing listing).
3. Upload `dist/flightdeck.zip`.
4. Fill listing metadata (title, descriptions, screenshots, categories).
5. Set privacy policy URL:
   - `https://github.com/kafkade/flightdeck/blob/main/PRIVACY.md`
6. Confirm compliance declarations and submit for review.

## Post-Submission

1. Monitor review feedback in both portals.
2. Address any requested changes.
3. Publish once approved.
4. Tag release in GitHub and update `CHANGELOG.md`.

## Store Review Notes

- `host_permissions: <all_urls>` is a high-scrutiny permission; keep permission rationale clear in listings.
- Ensure all functionality is fully disclosed and consistent with `PRIVACY.md`.
