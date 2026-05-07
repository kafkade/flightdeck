---
name: pr-ready
description: >
  Prepare a pull request description and update CHANGELOG.md — but never
  create the PR itself. Uses the repository PR template, summarizes user-facing
  changes, updates the Unreleased section, and copies the PR description to
  the clipboard.
---

# PR Ready — Description + Changelog

Prepare a branch for pull request: generate a PR description from the diff and
update the changelog. Do not create the PR.

## Steps

### 1. Gather context

1. Detect base branch (`main`/`master`) and current branch.
2. Collect commit list and diff stats:
   - `git log <base>..<current> --oneline`
   - `git diff <base>..<current> --stat`
3. Read `.github/pull_request_template.md`.
4. Read `CHANGELOG.md` and inspect `## [Unreleased]`.

### 2. Run checks

Run:

- `npm run lint`
- `npm test`
- `npm run package`

Record which checks pass/fail to fill checklist accurately.

### 3. Generate PR description

Use the exact PR template structure:

- Write a concise summary with user-facing changes.
- Set change type checkboxes based on the diff.
- Fill validation checkboxes based on actual results.
- Keep description concrete and avoid internal planning references.

### 4. Update changelog

1. Identify user-facing changes only.
2. Add entries under `## [Unreleased]` categories (`Added`, `Changed`, `Fixed`, `Security`, etc.).
3. Append without deleting existing unreleased entries.
4. Skip internal-only changes (CI, refactors without behavior changes, test-only updates).

### 5. Output

1. Copy PR description to clipboard (`Set-Clipboard`/`pbcopy`/`xclip`).
2. Suggest a conventional-commit PR title.
3. Summarize changelog additions.

## Guardrails

This skill MUST NOT:

- Create pull requests (`gh pr create` or any API equivalent)
- Run `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git revert`,
  `git cherry-pick`, `git tag`, or any git write operation
- Rewrite git history

All git write operations are manual maintainer actions.
