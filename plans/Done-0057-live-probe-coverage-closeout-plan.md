# Live Probe Coverage Closeout Plan

Related specs: `specs/0004-model-picker-and-shortcuts-spec.md`, `specs/0006-runtime-scrape-selector-validator-spec.md`

## Goal

- [x] Convert as many remaining detailed-report skipped, not-live-probed, and partial shortcut rows as practical into targeted live probes without running another full scrape pass.
- [x] Treat a passing live activation probe as full shortcut validation for targets that only exist in disposable/setup states, so fully tested dictation, send, stop, edit, temporary-chat, and GPT-new-conversation shortcuts do not remain `partial` just because the fixed scrape fixture does not expose their setup-only target.

## Report Findings

- [x] Current report: `_temp-files/inspector-captures/2026-05-14_16-35-32_devscrapewide_c-69ea4723/check-report.json`.
- [x] Partial rows with passing live probes are report aggregation gaps: `shortcutKeyNewGptConversation`, `shortcutKeyClickSendButton`, `shortcutKeyClickStopButton`, `shortcutKeySendEdit`, `shortcutKeyTemporaryChat`, `shortcutKeyToggleDictate`, and `shortcutKeyCancelDictation`.
- [x] Not-live-probed rows that are likely testable one at a time: model thinking effort shortcuts, Pro effort shortcuts, Share, scroll top/bottom, Edit Message, Read Aloud, Branch In New Chat, and regenerate-menu actions.
- [x] Token-spend is not a blocker for targeted disposable-conversation probes; the fixed scrape fixture should still be restored after each probe.

## Scope

- [x] Touch only the runtime validator path unless a direct metadata dependency is found:
  - `extension/shared/shortcut-action-metadata.js`
  - `tests/playwright/lib/devscrape-wide-core.mjs`
  - `tests/playwright/devscrape-wide.mjs` only if the CLI/report bridge needs a small adapter
  - `specs/0006-runtime-scrape-selector-validator-spec.md` for durable probe policy updates
- [x] Do not run `validate-wide`, `scrape-wide`, or any full scrape pass in this workstream.
- [x] Validate each shortcut or small tightly coupled group with `--action probe-shortcuts --shortcut-action-id ...`.

## Execution Batches

- [x] Batch 1: Report aggregation cleanup.
  - Mark shortcut rows as fully checked when their live probe passes and every non-passing target is explicitly setup-only/no-scrape coverage for that shortcut.
  - Keep target rows honest as `no-scrape-coverage`; fix the shortcut status, not the target scrape audit.
  - Re-run `check-wide --folder 2026-05-14_16-35-32_devscrapewide_c-69ea4723` only if needed to validate report aggregation without a browser or new scrape.
- [x] Batch 2: Model and Pro effort live probes.
  - Add executable probes for `shortcutKeyThinkingStandard`, `shortcutKeyThinkingExtended`, `shortcutKeyThinkingLight`, `shortcutKeyThinkingHeavy`, `shortcutKeyProStandard`, and `shortcutKeyProExtended`.
  - Use the existing model-refresh/menu selectors; assert the intended option was activated through the real shortcut path.
  - Test each effort shortcut individually.
- [x] Batch 3: Viewport and focus behavior probes.
  - Add viewport assertions for `shortcutKeyScrollToTop` and `shortcutKeyClickNativeScrollToBottom`.
  - Add `shortcutKeyShare` as a click-target probe, using temporary key assignment if no active stored/default key exists.
  - Add `shortcutKeyEdit` using the existing disposable user-message setup, stopping before Send Edit unless explicitly chained.
- [x] Batch 4: Menu/action probes with side effects.
  - Add clipboard verification for `selectThenCopy` and `selectThenCopyAllMessages`.
  - Add `shortcutKeyMoreDotsReadAloud` with a muted/manual-safe click assertion.
  - Add `shortcutKeyMoreDotsBranchInNewChat` with a capture-phase navigation-prevented click assertion.
  - Add regenerate-menu probes one at a time with capture-phase prevention.
- [x] Batch 5: Code-block and internal-extension probes.
  - Add a codebox-conversation setup using `https://chatgpt.com/c/6a064cb5-9838-8333-8f8f-fe686158860e`.
  - Convert `shortcutKeyCopyAllCodeBlocks` to a clipboard probe against `pre code` content from that fixture.
  - Convert `shortcutKeyToggleCodeboxWrap` to a DOM-state probe that asserts `html.csp-codebox-wrap-enabled`.
  - Convert `shortcutKeyScrollUpOneMessage`, `shortcutKeyScrollDownOneMessage`, `shortcutKeyScrollUpTwoMessages`, and `shortcutKeyScrollDownTwoMessages` to scroll-delta DOM-state probes from a deterministic middle scroll position.
  - Convert `shortcutKeyShowOverlay` to an open-target probe for `#csp-shortcut-overlay`.
  - Keep removed or inert ChatGPT actions not applicable unless runtime code exposes a real handler target again.

## Validation

- [x] For every changed JS file, run `node --check <file>`.
- [x] For each converted shortcut, run only targeted `probe-shortcuts` commands with repeated `--shortcut-action-id`.
- [x] Use `check-wide --folder 2026-05-14_16-35-32_devscrapewide_c-69ea4723` for report-only aggregation checks if needed; do not collect new dumps.
- [x] Run `git diff --check` on edited files.
- [x] Run targeted `npx biome check` on edited files and leave pre-existing warnings alone unless the changed lines caused them.

## Done When

- [x] The existing report’s partial rows that already have passing live probes are no longer reported as incomplete at the shortcut level.
- [x] Each newly converted shortcut has a targeted passing probe or a concrete remaining blocker recorded in this plan.
- [x] No full scrape run was executed after this plan was created.
