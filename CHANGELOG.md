# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source documentation set (`README`, `CONTRIBUTING`, `PRIVACY`, `SECURITY`, publishing guides)
- GitHub issue templates, pull request template, and validation workflow
- Copilot skill and instruction coverage for PR preparation and repository conventions
- Release automation via `scripts/release.ps1` and `.github/workflows/release.yml` with GitHub release creation plus Chrome/Edge store publishing

## [1.0.0] - 2025-05-07

### Added

- Initial open-source release of FlightDeck
- Manifest V3 extension with preset and custom query-string rules
- Rule exclusion groups, import/export support, keyboard shortcut toggle, and badge indicator
- Build info overlay content script for page version metadata
- Unit tests (Jest) and E2E smoke tests (Playwright)
