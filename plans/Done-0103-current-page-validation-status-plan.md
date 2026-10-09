# Current-page validation and three-phase shortcut-check workflow — complete

## Goal

Use the authenticated ChatGPT page to check required shortcut targets, distinguish live evidence from prepared-page regressions, and automate the user's three-phase workflow through publication and GitHub CI.

## User workflow

The installed run-checks-for-chatgpt-custom-shortcuts-pro skill uses these exact phases:

1. Collect evidence for automated check
2. Confirm evidence has no errors
3. Push and Check with Github

The agent runs and validates each step, advances automatically when its gate passes, monitors the published revision, then reports live target results, unverified scope, and the GitHub run. The flow uses no tray action.

## Batch 01 — Fresh evidence and shared target replay

Reused the existing attach-only Playwright collector, target inventory, and target matcher. A capture is bound to its invocation, current source fingerprint, timestamps, and required-state coverage. The exporter publishes only bounded code-owned tokens from registered captures; raw DOM, receipts, account or conversation data, and detailed reports stay local.

Snapshot replay uses the same AND-within/OR-between target matching and expected-file rules as the live checker. The schema caps evidence at 64 states and 256 KiB. The local evidence gate is 24 hours; historical GitHub replay marks evidence older than seven days unverified.

## Batch 02 — Skill phases and fast gates

The skill reuses the existing collector and automates evidence confirmation, repair of observed failures, focused fixture updates, affected-only reruns, safe publication, and exact-revision monitoring. Passing checks are reused when their inputs are unchanged. Full controlled regressions run in GitHub. Optional activation remains opt-in.

The user-authorized GPT-6.1-Sol extra-high thread edited the installed skill directly. Independent review and the skill validator passed. CONTRIBUTING.md was shortened to the required code and documentation check commands.

## Batch 03 — Publication and acceptance

A successful CodexCleanProfile capture completed at 2026-10-09T09:18:57.325Z. Its required target summary was 39/39 passed, 0 failed or partial, with 8 rows out of scope. Activation was not requested. The exact-receipt exporter accepted the complete evidence and the snapshot replay reported VERIFIED. The captured evidence was reused without recapturing.

The first GitHub run found only a Biome formatting issue in tests/playwright/live-snapshot/latest.json. Formatting changed token-array whitespace only. Parsed JSON equality confirmed all capture values and ordering remained unchanged. The targeted Biome check and snapshot replay passed.

Source revision bf67a102e0a97b3935f647ca890e887010571270 passed Fast validation run 37916688288:
https://github.com/bwhurd/chatgpt-custom-shortcuts-pro/actions/runs/37916688288

The workflow ran npm run checks -- --ci. Its shortcut-check-summary artifact contains checks.md and live-snapshot.md only. No raw capture, receipt, local profile data, or detailed report was uploaded. Fixture review found no unused assets to remove.

## Validation record

- Fresh target evidence: 39 in-scope targets passed; 0 failed or partial; 8 out of scope; activation unrequested.
- Snapshot: captured-token JSON replay VERIFIED with the original timestamp, fingerprint, state IDs, statuses, and tokens.
- Regression suite: npm run test:validators passed 235 tests, 229 passed, 0 failed, and 6 Windows symlink-only skips.
- Settings: npm run validate:keys passed with 65 popup-backed controls, 8 supplemental keys, and prototype checks.
- PowerShell: Test-PowerShellFast passed for scripts/check-live-chrome-profile.ps1 with analysis enabled.
- Formatting and text: changed-file Biome checks and npm run check:text passed.
- GitHub: exact source SHA and Fast validation run above passed. Raw evidence was excluded from the uploaded summary.
- Cleanup: no unused fixture assets were found; completed plans use Done- filenames.

## Acceptance and limits

The three exact skill phases, authenticated target collection, current-source evidence export, privacy-safe snapshot replay, failure repair and focused fixture refresh, GitHub publication, exact-revision CI, documentation, and clean local synchronization are complete.

Captured-token presence follows the existing matcher. It does not prove live activation, native browser effects, or account-level behavior. Those effects remain unverified unless an activation probe is requested. No extension-store release or ZIP build is part of this plan.

## Related documentation

See AGENTS.md, PROJECT_SPEC.md, and specs/0006-runtime-scrape-selector-validator-spec.md for routing and validation ownership. The completed execution handoff is plans/Done-luna-three-phase-skill-validation-thread-prompt.md.
