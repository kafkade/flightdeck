# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Unified data model: `presets[]` and `customRules[]` merged into a single `rules[]` array (schema v2)
- All rules can now be edited and deleted (including shipped defaults)
- Import supports three strategies: Add new only, Update matching + add new, Replace all rules
- Import dialog shows file info and strategy selection before applying
- Export uses v2 format (`{ schemaVersion: 2, rules: [...] }`); import accepts both v1 and v2

### Added

- Restore defaults button in popup footer (re-adds missing shipped rules without overwriting modifications)
- Import strategy dialog with radio button selection
- Schema migration: v1 → v2 runs automatically on extension update
- Empty state message when all rules are deleted

### Removed

- `builtin` flag from the rule model (default-ness is derived from `getDefaults()` IDs)
- Separate "Presets" and "Custom Rules" sections in the popup — all rules are shown in one unified list grouped by exclusion group

## [1.0.0] - 2025-05-07

### Added

- Initial open-source release of FlightDeck
- Manifest V3 extension with preset and custom query-string rules
- Rule exclusion groups, import/export support, keyboard shortcut toggle, and badge indicator
- Build info overlay content script for page version metadata
- Unit tests (Jest) and E2E smoke tests (Playwright)
