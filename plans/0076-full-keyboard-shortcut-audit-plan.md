# Plan 0076: Full Keyboard Shortcut Audit

## Outcome

- [ ] Build and run a repeatable, Playwright-led audit of every extension-owned keyboard behavior, with GPT-5.6 Luna Max personally overseeing execution and evidence review one batch at a time.
- [ ] Finish with trustworthy local artifacts that distinguish product defects from selector drift, missing coverage, account limitations, and environment failures, and give a future repair pass an exact reproduction path and likely owning code.
- [ ] Treat the audit as complete only when every discovered shortcut surface has an explicit result and all temporary browser, conversation, and extension-storage mutations have been recovered or clearly reported.

## Batch-count decision

- [ ] Use **5 Luna batches**. This is the default cross-cutting tier and fits the evidence: the work spans static inventory truth, Playwright orchestration and recovery, global shortcut execution, Chat/Work model-slot execution, manual/supervised residual proof, reporting, and documentation. It does not justify 6-10 batches because this work produces a defect backlog but does not implement the product repairs it discovers.

## Current state and evidence

- [ ] `extension/content.js` currently declares 51 keys in `shortcutDefaults`; `extension/shared/shortcut-action-metadata.js` has 51 matching action rows and 64 target descriptors.
- [ ] Current metadata classifies 42 actions as `scrape-targets`: 41 have executable activation probes and `shortcutKeyToggleChatWork` is `not-live-probed`. Nine legacy or retired rows are `not-applicable`.
- [ ] The static audit is not yet trustworthy after the runtime dispatcher refactor:
  - `tests/playwright/lib/shortcut-target-inventory.mjs` still parses computed entries shaped like `[shortcuts.someKey]:` through `SHORTCUT_HANDLER_KEY_PATTERN`.
  - `extension/content.js` now owns ordinary Alt actions in the named-property `altShortcutActions` registry near the `@note Alt shortcut action registry` marker.
  - The current parser therefore sees zero handlers and the current inventory produces 44 false `missing-runtime-handler` issues.
- [ ] The current inventory covers `shortcutDefaults` actions but not the two independent 15-slot model-picker profiles (`modelPickerKeyCodesLatest` and `modelPickerKeyCodesLegacy`) as first-class executable audit rows.
- [ ] Additional keyboard contracts exist outside the ordinary Alt registry and must stay explicit:
  - Ctrl/Command+Enter and Ctrl/Command+Backspace use `keyFunctionMappingCtrl` plus enable gates.
  - the configurable overlay opener has its own capture listener near `showShortcutOverlay`.
  - Primary-Control+Alt Previous/Next is a scroll-only response preview contract.
  - `pageUpDownTakeover` owns plain PageUp/PageDown behavior; `altPageUp` and `altPageDown` are retained legacy defaults, not active Alt handlers.
- [ ] The existing live workflow already provides the right base:
  - `tests/playwright/devscrape-wide.mjs` supports `validate-wide --probe-shortcuts` and targeted `probe-shortcuts --shortcut-action-id` runs.
  - `tests/playwright/lib/devscrape-wide-core.mjs` snapshots temporary shortcut assignments, runs state-specific probes, restores temporary keys, and writes `live-probes.json`, `check-report.json`, and `check-report.html` beside `run-manifest.json` and scrape dumps.
  - `tests/playwright/chatgpt-local-profile-test-setup.md` owns the authenticated standard-Chrome/CDP posture.
- [ ] Planning-time non-browser checks passed on 2026-09-08:
  - `npm run validate:keys`
  - `node tests/shortcut-target-live-selector-fixture.mjs`
  - `node --check tests/playwright/devscrape-wide.mjs`
  - `node --check tests/playwright/lib/devscrape-wide-core.mjs`
  - `node --check tests/playwright/lib/shortcut-target-inventory.mjs`

## Scope

- [ ] Inventory and account for all extension-owned keyboard surfaces, without hard-coding 51 as the permanent future count:
  - every action derived from current `shortcutDefaults`, `altShortcutActions`, explicit outside-registry handlers, settings schema, popup controls, and shortcut metadata;
  - every presented action at each sparse slot in both 15-slot Chat/Legacy and Work/Latest model-picker profiles, including conditionally present effort, model, configure, speed, reset, and Chat/Work toggle actions;
  - Alt and Control model-picker modifier modes;
  - control-gated Send and Stop;
  - ordinary Alt, Primary-Control+Alt response previews, overlay capture, PageUp/PageDown takeover, and modifier/IME pass-through behavior.
- [ ] Use Playwright for every action and guard that can be exercised deterministically and safely in the authenticated Windows Chrome profile.
- [ ] Give every remaining behavior a Luna-supervised proof, an explicit platform/account limitation, or a justified `not-applicable` result. No row may disappear because it is difficult to automate.
- [ ] Exercise blank default assignments by installing collision-free validation-only codes, then restore the original storage state.
- [ ] Exercise stateful or token-spending probes only through the disposable-conversation setup already authorized by `specs/0006-runtime-scrape-selector-validator-spec.md`; never mutate the fixed audit fixture conversation.
- [ ] Audit popup assignment/persistence, duplicate transfer, overlay visibility/labels, profile isolation, and runtime activation as one end-to-end contract.

## Non-goals

- [ ] Do not fix product shortcut handlers, selectors, or UX defects discovered by the audit. Record each confirmed defect as a discrete, execution-ready repair item for a later workstream.
- [ ] Do not audit unrelated native ChatGPT shortcuts, add Chrome permissions, add shipped popup controls, or put dev-audit files in a release zip.
- [ ] Do not broaden into macOS live execution. Record Command/Option behavior as platform-unverified unless a macOS runner is actually available; keep source-level modifier invariants in the matrix.
- [ ] Do not deploy, publish, restart, version-bump, or build a release archive. This plan owns dev-only validation code, local ignored evidence, and documentation truth.

## Intended design

- [ ] Extend the existing runtime validator rather than create a competing harness.
- [ ] Build one canonical audit-universe model whose row identity is stable:
  - global: `global:<actionId>`;
  - model slot: `model:<legacy|latest>:<slot>:<actionId-or-empty>`;
  - fixed/gated contract: `fixed:<contractId>`.
- [ ] Derive row membership from current sources of truth. Record observed counts in evidence, but make completeness guards compare sources so future shortcut additions fail closed without requiring count edits.
- [ ] Add a dedicated repo command, expected to be `npm run playwright:chatgpt:audit-shortcuts`, that composes preflight, strict extension capture, global probes, model/profile probes, recovery verification, report generation, and browser report opening.
- [ ] Preserve the current targeted failure loop: `probe-shortcuts --shortcut-action-id <actionId>` for global actions, with an equivalent profile/slot filter for model actions.
- [ ] Keep existing report files compatible and add a unified audit layer under the same timestamped `_temp-files/inspector-captures/<run>/` folder:
  - `shortcut-audit.json`: authoritative machine-readable universe, results, environment, classifications, and evidence paths;
  - `shortcut-audit.csv`: one flat row per audited behavior for sorting and handoff;
  - `shortcut-repair-backlog.md`: confirmed failures and coverage gaps ordered for repair;
  - `storage-recovery.json`: mutation ledger, compare-before-restore results, and final restoration proof;
  - `failures/`: failure-only screenshot plus bounded DOM/event evidence, named by stable row id;
  - existing `run-manifest.json`, `live-probes.json`, `check-report.json`, and `check-report.html` remain linked and interpretable.
- [ ] Extend the HTML Dashboard with full-audit coverage and repair-ready follow-up while preserving the detailed target tables and existing report history.

## Invariants and failure handling

- [ ] Snapshot every storage key the audit may mutate, including global shortcut keys, both model-picker arrays, model modifier radios, selected model profile, gated Ctrl shortcut settings, and any audit-toggled runtime setting.
- [ ] Restore with a mutation ledger and compare-before-restore semantics so the audit does not overwrite a concurrent user edit. A conflict is a blocking recovery result with the key and observed values recorded; it is never silently forced.
- [ ] Verify recovery by rereading storage and recording exact restored/removed/conflicted keys in `storage-recovery.json`. A missing recovery artifact or unresolved audit mutation makes the audit command fail.
- [ ] Keep the fixed conversation fixture read-only. New messages, Stop, Send Edit, codebox, and dictation setup use disposable blank conversations and restore the primary fixture before the run exits.
- [ ] Do not expose cookies, auth tokens, full storage dumps, or unrelated conversation content. Failure evidence should contain the smallest screenshot/DOM/event slice needed to reproduce the result and stay under ignored `_temp-files/`.
- [ ] Distinguish at least: `pass`, `product-fail`, `coverage-gap`, `environment-fail`, `account-unavailable`, `manual-pending`, `not-present`, and `not-applicable`.
- [ ] A skip, missing capability, failed setup, unverified manual row, or failed cleanup is not a pass.
- [ ] Require a targeted second reproduction before labeling a row `product-fail`. Preserve the first and confirmation evidence paths.
- [ ] For each row record action/profile/slot, actual stored and dispatched code, modifiers, preconditions, expected observation, actual observation, duration, status, reason, fixture/conversation class, owning symbols, and exact rerun command.
- [ ] Treat synthetic-key limitations honestly. Use the real content-script event path for positive automation; use explicit `KeyboardEvent` injection only for guard states Playwright cannot express, and label that proof method in the result.

## Risks and assumptions

- [ ] Assumption: Luna has access to the authenticated `CodexCleanProfile`, the unpacked extension can be loaded from `extension/`, and the fixed plus fallback fixtures remain accessible.
- [ ] Assumption: the existing spec-authorized disposable probes may spend a small number of ChatGPT requests for Send/Stop/Edit/codebox proof. If the account cannot do so, classify the rows; do not mutate the fixed fixture or claim success.
- [ ] ChatGPT DOM and account capabilities are volatile. Recheck current selectors and catalog capabilities at execution time and separate product failure from fixture/account drift.
- [ ] Model actions can change Chat/Work mode, model, effort, speed, or conversation state. Run them serially, assert the intended active profile before each action, and restore the starting state after each cohesive group.
- [ ] Profile storage is sync-backed. The compare-before-restore rule is required to avoid clobbering a concurrent popup edit or another tab's change.
- [ ] A headed CDP browser may require login or manual extension repair. This is an environment boundary, not permission to weaken strict capture or fabricate results.

## Acceptance matrix

| Requirement | Owning batch | Required proof |
| --- | --- | --- |
| Complete, drift-detecting universe for global, model-slot, fixed, gated, and retired keyboard contracts | Luna Batch 01 | Inventory fixture; source-to-row reconciliation; zero unclassified or false missing-handler rows |
| Playwright is used for every safely executable behavior and all residuals remain visible | Luna Batches 02-04 | Unified audit rows include proof method and coverage numerator/denominator; every safe row attempted |
| Browser/storage mutations are recoverable and concurrent edits are not overwritten | Luna Batches 02-05 | `storage-recovery.json`; post-run storage reread; primary fixture restored |
| All global shortcuts, blank defaults, modifier gates, response previews, overlay, and PageUp/PageDown contracts are exercised | Luna Batch 03 | Global result rows, negative-guard rows, failure evidence, and targeted reruns |
| Both Chat and Work sparse model profiles and both Alt/Control modes are exercised | Luna Batch 04 | Per-profile/per-slot/action rows with positive and wrong-profile/modifier proof |
| Popup assignment, duplicate transfer, overlay parity, and runtime use agree | Luna Batch 04 | End-to-end Playwright scenarios and restored settings evidence |
| Luna Max oversees and evaluates non-automatable or account-dependent behavior | Luna Batch 04 | Completed supervised checklist or explicit `manual-pending`/limitation rows with reasons |
| Findings are immediately actionable for later repairs | Luna Batch 05 | JSON, CSV, HTML, failure evidence, and prioritized Markdown backlog with owners/repro/retest |
| Final docs, regressions, artifact integrity, and no-deployment boundary are satisfied | Luna Batch 05 | Final command log, schema checks, report link checks, doc update, and no shipped/release changes |

## Luna Batch 01 — Establish a truthful exhaustive shortcut universe

- [x] **Status:** `[x]`
- [x] **Objective:** make static inventory authoritative before any browser result is trusted.
- [x] **Observable outcome:** a deterministic inventory run finds every current keyboard contract, recognizes the current `altShortcutActions` registry, includes both model profiles and special listeners, and reports no false handler gaps.
- [x] **Prerequisites:** read `AGENTS.md`, this plan, `PROJECT_SPEC.md`, `specs/0004-model-picker-and-shortcuts-spec.md`, and `specs/0006-runtime-scrape-selector-validator-spec.md` in that order.
- [x] **Inspect or change narrowly:**
  - `tests/playwright/lib/shortcut-target-inventory.mjs`: the computed/named registry patterns, `parseRuntimeHandlerActionIds`, keyboard-contract inventory, model-slot inventory, and `buildShortcutValidationInventory`.
  - `tests/playwright/lib/devscrape-wide-core.mjs`: pass source-derived options defaults and model-label helpers into the inventory used by the existing validator.
  - `extension/content.js`: `shortcutDefaults`, `keyFunctionMappingCtrl`, `altShortcutActions`, `handleAltShortcutEvent`, `handleCtrlShortcutEvent`, `runModelPickerDigitShortcut`, PageUp/PageDown takeover, and overlay `onKeyDown` (source-of-truth inspection; do not edit merely to simplify the audit).
  - `extension/options-storage.js`: both 15-slot profile defaults and keyboard gate defaults.
  - `extension/settings-schema.js`, `extension/popup.html`, and `extension/shared/model-picker-labels.js`: visibility, labels, sparse action slots, and profile action derivation.
  - `extension/shared/shortcut-action-metadata.js`: validate classifications; change only when current behavior proves metadata stale.
  - add or extend a small non-browser inventory fixture under `tests/`, preferably `tests/shortcut-audit-inventory-fixture.mjs`.
- [x] **Implementation:**
  - replace the stale computed-key-only parser with deterministic extraction for named keys in `altShortcutActions`, while keeping explicit classifications for Ctrl Send/Stop, the overlay listener, retired rows, and other outside-registry contracts;
  - reconcile defaults, runtime ownership, schema/popup visibility, and metadata without inferring targets from arbitrary handler bodies;
  - add model-profile rows for every slot `0..14` in both `legacy` and `latest`, preserving sparse catalog action slots and distinguishing empty, unavailable, and presented actions;
  - add explicit fixed/gated contract rows for modifier isolation, response preview, Ctrl Send/Stop, overlay capture, and PageUp/PageDown takeover;
  - fail closed on duplicates, orphan metadata, unknown targets/states/probe modes, missing ownership, missing profile slots, or unclassified keyboard listeners.
- [x] **Compatibility:** retain the 51 current global rows and existing metadata/report consumers without baking 51 into future completeness logic; preserve `requiresHandler: false` for deliberately external handlers.
- [x] **Tests and validation:**
  - `npm run validate:keys`
  - `node tests/shortcut-audit-inventory-fixture.mjs`
  - `node tests/shortcut-target-live-selector-fixture.mjs`
  - `node --check tests/playwright/lib/shortcut-target-inventory.mjs`
  - `npx biome check --stdin-file-path tests/playwright/lib/shortcut-target-inventory.mjs --diagnostic-level=error` (the repo Biome include does not include `.mjs`, so stdin mode performs the configured check explicitly)
  - `npx biome check --stdin-file-path tests/playwright/lib/devscrape-wide-core.mjs --diagnostic-level=error`
  - `npx biome check --stdin-file-path tests/shortcut-audit-inventory-fixture.mjs --diagnostic-level=error`
- [x] **Manual proof:** source spot-checks and the fixture cover an ordinary Alt action, Ctrl Send/Stop gates, the overlay opener, a retired action, both PageUp/PageDown gate/listener contracts, modifier isolation, response-preview routing, and sparse slots from each model profile.
- [x] **Acceptance:** parsed handler ownership is nonzero and source-accurate; the current 44 false missing-handler findings are gone; every discovered keyboard surface has one stable row and proof classification; zero inventory issues remain.
- [x] **Evidence — fill before marking `[x]`:**
  - Files changed: `tests/playwright/lib/shortcut-target-inventory.mjs`, `tests/playwright/lib/devscrape-wide-core.mjs`, and `tests/shortcut-audit-inventory-fixture.mjs`. No shipped extension files changed.
  - Commands and results: `npm run validate:keys` passed; `node tests/shortcut-audit-inventory-fixture.mjs` passed; `node tests/shortcut-target-live-selector-fixture.mjs` passed; Node syntax checks passed for the changed MJS files; three configured Biome stdin checks passed with `--diagnostic-level=error`; `git diff --check` and `npm run check:text` passed.
  - Inventory counts and representative rows: 51 runtime/default actions, 44 named handler actions, 64 target descriptors, 12 fixed/gated keyboard contracts, and 30 model-profile slot rows. Legacy has 15 slots (7 assigned, 7 presented, 7 unavailable, 1 empty); latest has 15 slots (11 assigned, 10 presented, 5 unavailable, 0 empty). The six listener rows include runtime dispatch, PageUp/PageDown takeover, model-picker dispatch/refresh, overlay dismissal, and overlay opener; the six source rows cover modifier isolation, response preview, Ctrl Send, Ctrl Stop, the PageUp/PageDown enable gate, and overlay Alt-only capture.
  - Proof scenarios: the fixture reconciles every handler-backed metadata action, every runtime action, all six listener contracts, all six source contracts, and exact `0..14` slot coverage for both profiles; it exits with `inventoryIssues: 0`.
  - Assumptions or limitations: this is source/schema inventory proof only; live browser behavior, account capability, storage recovery, and physical-key evidence are intentionally deferred to Batches 02-04.
  - Remaining risks: the named registry and fixed-contract source anchors are intentionally drift-sensitive; any future runtime refactor should update the inventory parser and fixture before live audit results are trusted.

## Luna Batch 02 — Add the deterministic Playwright audit and artifact pipeline

- [x] **Status:** `[x]`
- [x] **Objective:** turn the existing validator into one safe, repeatable full-audit command with unified evidence and recovery.
- [x] **Observable outcome:** an inventory-only dry run and synthetic fixtures produce the complete artifact schema, while the real command is ready to drive global and model probes without losing user settings.
- [x] **Prerequisites:** Luna Batch 01 is `[x]`; inventory has zero guard issues.
- [x] **Inspect or change narrowly:**
  - `tests/playwright/devscrape-wide.mjs`: CLI parsing, usage, validation composition, report opening, and exit behavior.
  - `tests/playwright/lib/devscrape-wide-core.mjs`: current storage mutation, probe orchestration, report assembly, and failure evidence.
  - `tests/playwright/lib/shortcut-target-inventory.mjs`: unified row inputs from Batch 01.
  - `tests/playwright/run-devscrape-validation.ps1`: only if the dedicated audit command should be exposed through the existing wrapper.
  - `package.json`: one authoritative audit script and no parallel ad hoc launcher.
  - `tests/playwright/lib/shortcut-audit-artifacts.mjs`: versioned report/status/CSV/Markdown/recovery helpers and bounded evidence writes.
  - focused fixtures under `tests/` for inventory, classification, CSV/Markdown escaping, recovery, exit policy, and report schema.
- [x] **Implementation:**
  - add a dedicated full-audit action and `npm run playwright:chatgpt:audit-shortcuts` script that composes strict extension reachability/capture, existing scrape validation, global probes, model probes, recovery, unified report generation, and HTML opening;
  - add an `--inventory-only` or equivalent non-browser mode for deterministic universe/report-schema validation;
  - implement a per-key mutation ledger with original presence/value, audit value, observed value before restore, compare-before-restore result, and final value;
  - centralize result statuses and exit policy: metadata drift, product failures, required-artifact failures, environment failures, `manual-pending`, or failed recovery must remain visible and fail the appropriate gate;
  - write the intended unified artifacts and failure-only evidence paths under the same timestamped ignored run folder;
  - add exact rerun commands for global action id and model profile/slot/action filters;
  - make artifact writes resilient: write a final manifest/recovery result even when probe execution fails, and keep partial evidence instead of replacing it.
- [x] **Compatibility:** preserve `validate-wide`, `check-wide`, `probe-shortcuts`, existing report history, and current JSON/HTML consumers; version new schemas instead of silently changing meaning.
- [x] **Tests and validation:**
  - `node tests/playwright/devscrape-wide.mjs --help`
  - `npm run playwright:chatgpt:audit-shortcuts -- --inventory-only`
  - `node tests/shortcut-audit-inventory-fixture.mjs`
  - `node tests/shortcut-audit-recovery-fixture.mjs`
  - `node tests/shortcut-audit-artifacts-fixture.mjs` (classification, exit policy, CSV/Markdown escaping, evidence, rerun commands)
  - `node tests/shortcut-target-live-selector-fixture.mjs`
  - `node --check` on every changed MJS entrypoint/module/fixture
  - `npx biome check --stdin-file-path ... --diagnostic-level=error` on every changed MJS file and `npx biome check package.json --diagnostic-level=error`
  - `npm run validate:keys`, `npm run check:text`, and `git diff --check`
  - `npm run playwright:chatgpt:check-scrape -- --no-open-report` (existing latest-run compatibility)
- [x] **Manual proof:** opened/queued the generated inventory-only HTML report and inspected its dashboard, audit artifact links, NOT RUN states, stable row ids, coverage counts, and recovery section. The report links to JSON, CSV, Markdown backlog, recovery JSON, and failure index; the synthetic artifact fixture also verifies CSV quoting/newlines, Markdown pipe escaping, evidence paths, and exact model rerun commands.
- [x] **Acceptance:** one repo-native command owns the full audit; dry-run JSON/CSV/HTML/Markdown/recovery/failure-index artifacts are mutually consistent; a forced CDP attach failure retained a complete fallback artifact set; the recovery fixture proves clean restoration and compare-before-restore conflict preservation without overwriting a concurrent edit.
- [x] **Evidence — fill before marking `[x]`:**
  - Files changed: `package.json`; `tests/playwright/devscrape-wide.mjs`; `tests/playwright/lib/devscrape-wide-core.mjs`; `tests/playwright/lib/shortcut-target-inventory.mjs`; new `tests/playwright/lib/shortcut-audit-artifacts.mjs`; and focused fixtures `tests/shortcut-audit-inventory-fixture.mjs`, `tests/shortcut-audit-recovery-fixture.mjs`, and `tests/shortcut-audit-artifacts-fixture.mjs`. No shipped `extension/` file, manifest permission, build include, version, release zip, or deployment file changed.
  - Commands and results: `node tests/shortcut-audit-inventory-fixture.mjs` reported 51 runtime actions, 44 named handlers, 64 target descriptors, 12 fixed contracts, 30 model rows, and 0 inventory issues; the selector fixture, recovery fixture, artifact/exit-policy fixture, syntax checks, configured Biome checks, `npm run validate:keys`, `npm run check:text`, and `git diff --check` passed. `node tests/playwright/devscrape-wide.mjs --help` exposes `audit-shortcuts`, phase/profile/slot/action filters, inventory-only, report-open controls, and no-auto-launch. `npm run playwright:chatgpt:audit-shortcuts -- --inventory-only` exited 0. Existing `npm run playwright:chatgpt:check-scrape -- --no-open-report` still selected the prior non-audit run and exited 0.
  - Artifact paths and schema versions: full dry run `C:\Users\bwhurd\Dropbox\CGCSP-Github\_temp-files\inspector-captures\2026-09-08_21-52-11_devscrapewide_c-69ea4723` contains `run-manifest.json` (v2), `live-probes.json` (v1, not-run), `shortcut-audit.json`/`.csv`/`shortcut-repair-backlog.md` (audit v1), `storage-recovery.json` (v1, not-run because no mutation occurred), `failures/index.json`, and `check-report.json`/`.html` (v4, inventory-only). JSON and CSV each contain 93 unique rows: 51 global, 12 fixed-contract, and 30 model-slot rows; 81 are `not-run` and 12 fixed/source rows are `pass`. Filtered dry runs also covered a global/fixed slice and `latest` model slot 14. A forced unreachable endpoint (`--no-auto-launch --cdp-endpoint http://127.0.0.1:65534`) exited 1 but retained fallback artifacts in `...\2026-09-08_21-54-10_devscrapewide_c-69ea4723` with 93 rows (81 `environment-fail`, 12 `pass`), check schema v4, and a visible setup follow-up.
  - Interruption/recovery proof scenarios: the artifact writer creates failure-only JSON under `failures/` and preserves partial manifests/reports on attach/probe failure. The pure recovery fixture verifies original presence/value, clean restoration, temporary-key removal, and conflict-preserved concurrent edits; the live browser recovery path is implemented but intentionally unexercised until Batches 03-04 have authenticated extension-backed probes.
  - Assumptions or limitations: this batch proves inventory, orchestration, artifact schemas, filtering, resilient writes, and non-destructive recovery logic only. It does not claim physical-key or account-dependent ChatGPT behavior; those live global/model and supervised checks are deferred to Batches 03-04. Inventory-only intentionally reports live rows as `not-run` and performs no storage mutation.
  - Remaining risks: live execution still depends on an authenticated `CodexCleanProfile`, reachable CDP endpoint, loaded unpacked extension, fixture readiness, and current account model catalog. A named-registry/source-anchor drift or a missing extension capture remains a fail-closed condition for the live batches; `check-scrape` deliberately ignores shortcut-audit-only folders when choosing its default latest legacy run.

## Luna Batch 03 — Execute and verify the global shortcut matrix

- [!] **Status:** `[!]`
- [~] **Objective:** run all global, fixed, and gated keyboard behaviors through the loaded extension and classify every result.
- [~] **Observable outcome:** every global/fixed row has a terminal evidence-backed status, every safe action was actually attempted, and any failure has one targeted confirmation run.
- [~] **Prerequisites:** Luna Batches 01-02 are `[x]`; the unpacked `extension/` build is loaded in `CodexCleanProfile`; authentication and a ready fixed/fallback fixture remain outstanding.
- [ ] **Inspect or change narrowly:** audit/test code and metadata only. Do not repair `extension/content.js` failures in this batch.
- [ ] **Execution:**
  - verify CDP reachability and loaded extension identity using `tests/playwright/chatgpt-local-profile-test-setup.md`; use the visible manual repair path if authentication or unpacked-extension setup is required;
  - run the full audit command in strict capture mode for the global phase, preserving the selected fixture in `run-manifest.json`;
  - run every safely executable global action, including blank-default actions through collision-free temporary assignments;
  - verify observable behavior, not only that a keydown listener fired: target clicks/focus/open state, viewport movement, clipboard output, DOM state, and expected no-op behavior;
  - exercise the existing disposable setups for Send, Stop, Send Edit, dictation, and codebox behavior without changing the fixed fixture;
  - test negative dispatch guards: ordinary Alt excludes Shift and the wrong control-like modifier, Primary-Control+Alt only previews Previous/Next, unmatched compound/AltGraph/IME-composition events pass through, Ctrl Send/Stop respect their enable gates, Backspace remains native when no Stop button exists, and disabled PageUp/PageDown takeover does not intercept;
  - verify the standalone overlay listener, PageUp/PageDown takeover, and intentional retired/inert actions are accurately classified and hidden where required;
  - for every initial failure, run the emitted targeted action command once after restoring its precondition; keep both evidence records.
- [ ] **Required commands:**
  - `npm run playwright:chatgpt:setup-cdp-profile` when no endpoint is reachable
  - `npm run playwright:chatgpt:audit-shortcuts -- --require-extension-capture --phase global`
  - `node tests/playwright/devscrape-wide.mjs --action probe-shortcuts --shortcut-action-id <actionId>` for each failed global action
  - `npm run playwright:chatgpt:check-scrape`
- [~] **Manual/live proof:** the retained environment-failure Dashboard, global audit JSON/CSV, and recovery report were inspected. No synthetic guard rows were promoted to live proof; no screenshots/DOM slices were created because fixture readiness failed before capture.
- [!] **Acceptance:** all 43 non-model global rows and 12 fixed-contract rows are represented in the retained audit artifact, but automation-safe live attempts, targeted retries, physical-key evidence, and fixture/storage recovery remain unproven until authentication and a ready fixture are available. This is an in-scope environment blocker after three consecutive goal turns: the required `CodexCleanProfile` remains logged out and both documented fixtures redirect to the login page.
- [~] **Evidence — fill before marking `[x]`:**
  - Files changed (audit harness/metadata only): no source files changed in Batch 03; only ignored run artifacts were created. The loaded extension is the existing unpacked `extension/` build; no product repair was attempted.
  - Commands and results: `npm run playwright:chatgpt:setup-cdp-profile` launched Chrome 152 with the documented `CodexCleanProfile`, CDP `http://127.0.0.1:9333`, and `--load-extension=...\extension`; direct `/json/version` reachability passed. The required `npm run playwright:chatgpt:audit-shortcuts -- --require-extension-capture --phase global` reached Chrome but timed out on both the primary and documented fallback fixture readiness checks and exited 1. On this continuation, a Playwright recheck of the persistent profile still showed `https://chatgpt.com/auth/login` with “Log in or sign up”; `verifyExtensionRuntimeReachable` continued to return the loaded extension identity. `npm run playwright:chatgpt:check-scrape` remained compatible and exited 0 on the prior non-audit run; a targeted check of the retained environment run also completed. Targeted per-action retries were not run because no global product-failure rows existed—the run failed before any live probe row was produced.
  - Run folder and artifact paths: retained global environment run `C:\Users\bwhurd\Dropbox\CGCSP-Github\_temp-files\inspector-captures\2026-09-08_21-57-07_devscrapewide_c-69ea4723` contains `run-manifest.json`, `live-probes.json`, `shortcut-audit.json`, `.csv`, `shortcut-repair-backlog.md`, `storage-recovery.json`, `failures/index.json`, and `check-report.json`/`.html`. Manifest mode is `environment-fail`; the check report records the same fixture boundary and no captured dumps.
  - Global totals by status and proof method: the audit report has 55 rows for this phase: 43 `global` rows classified `environment-fail` with `proofMethod: environment-failure`, and 12 `fixed-contract` rows classified `pass` with `proofMethod: source-inventory`; no model rows were included in the global phase, and no live probe rows were produced. The source inventory remains 51 actions, 64 targets, and zero inventory issues.
  - Confirmed failure/retry scenarios: there are no confirmed product failures or targeted repro records. The initial failure is an account/fixture environment boundary: Playwright navigated to `https://chatgpt.com/`, which displayed the logged-out “Log in to view this conversation” state (HTTP 200, zero conversation turns), then the runner timed out rather than weakening the fixture requirement.
  - Recovery result: `storage-recovery.json` is schema v1 with status `not-run`; the run failed before extension storage mutation or live probes. The Batch 02 recovery fixture already proves clean restore and conflict-preserved concurrent edits; live recovery cannot be claimed for this batch until probes execute.
  - Assumptions or limitations: the unpacked extension runtime itself is reachable (`verifyExtensionRuntimeReachable` returned extension id `dnnmjopemocomdffpcamjleolhjnocfm`), but the required authenticated ChatGPT fixture is not available in this profile. Environment-failure rows are intentionally not product defects and must be rerun after login/fixture readiness.
  - Remaining risks: no physical keyboard, DOM-observable, negative-guard, disposable Send/Stop/Edit/dictation/codebox, overlay, or PageUp/PageDown behavior has live evidence yet. Batch 03 cannot be marked `[x]` until the profile is authenticated, the fixture loads, strict extension capture succeeds, live rows are attempted, and any failures receive targeted confirmation. Further progress requires an external state change (successful login and fixture access).

## Luna Batch 04 — Audit Chat/Work model slots, popup parity, and supervised residuals

- [ ] **Status:** `[ ]`
- [ ] **Objective:** cover the profile-aware model shortcut system and close every row that cannot be proven by the global runner alone.
- [ ] **Observable outcome:** both 15-slot profiles, all currently presented sparse actions, both model modifier modes, popup/overlay assignment parity, and residual manual/account behaviors have explicit evidence.
- [ ] **Prerequisites:** Luna Batches 01-03 are `[x]`; global storage recovery passed; current Chat and Work catalogs can be refreshed or their capability limitation is recorded.
- [ ] **Inspect or change narrowly:**
  - `extension/content.js`: `MODEL_PICKER_CODES_BY_PROFILE`, `activateCurrentRuntimeModelPickerProfile`, `runModelPickerShortcutSlot`, and runtime profile detection (inspection only unless audit metadata needs correction).
  - `extension/shared/model-picker-labels.js`: grouped sparse actions, slots, and conditional capabilities.
  - `extension/popup.js`: profile selection, modifier selection, assignment, duplicate transfer, and profile-local persistence (inspection only).
  - the Playwright audit runner/helpers and report renderer from Batches 01-02.
- [ ] **Execution:**
  - refresh/capture the current Chat and Work catalogs through the documented extension workflow and record selector shape plus capabilities;
  - enumerate slots `0..14` for `legacy` and `latest`; mark empty or absent catalog positions explicitly instead of dropping them;
  - for every presented action, temporarily assign a collision-free code at its exact slot, activate the correct native Chat/Work profile, dispatch through the real keyboard path, and assert the semantic result (model, effort, speed, reset, configure option, or toggle) plus picker closure/composer focus;
  - run the active catalog once in Alt model mode and once in Control model mode; prove the wrong modifier does not dispatch and the same code in the inactive profile does not steal the action;
  - prove sparse slot identity and Chat/Work profile isolation rather than treating action count as a contiguous boundary;
  - exercise `shortcutKeyToggleChatWork`, currently `not-live-probed`, with Playwright if a deterministic blank/nonblank assertion is safe; otherwise complete a Luna-supervised headed proof and retain screenshot/state evidence;
  - use Playwright against the popup to change one global shortcut and one model slot, verify canonical `KeyboardEvent.code` persistence, deterministic duplicate transfer, profile-local isolation, overlay label/group/key parity, and runtime activation, then restore all settings;
  - review account-conditional model/effort/speed/reset rows and mark unavailable controls as `account-unavailable` or `not-present` with observed capability evidence, never `pass`;
  - complete any remaining Windows physical-browser or headed visual checks personally. Leave macOS-only and genuinely unavailable-account proof explicitly limited.
- [ ] **Required commands:**
  - `npm run playwright:chatgpt:audit-shortcuts -- --require-extension-capture --phase models`
  - the emitted targeted command for each failing `profile + slot + actionId` row
  - `npm run test:popup-visual`
  - `npm run validate:keys`
- [ ] **Manual/live proof:** Luna reviews both profile matrices, at least one passed action of every available action kind, every conditional capability classification, the popup/overlay screenshots, and the final storage recovery record.
- [ ] **Acceptance:** 30 profile-slot positions are accounted for; every currently presented action was attempted in both supported modifier modes or has a precise limitation; profile isolation and popup-to-runtime parity pass or become confirmed backlog items; no temporary assignment or mode remains.
- [ ] **Evidence — fill before marking `[x]`:**
  - Files changed (audit harness/metadata only):
  - Commands and results:
  - Run folder and artifact paths:
  - Chat/Work catalogs, slot counts, and capability summary:
  - Alt/Control and profile-isolation proof:
  - Popup/overlay parity proof:
  - Supervised/manual/account limitations:
  - Recovery result:
  - Remaining risks:

## Luna Batch 05 — Triage, publish actionable local artifacts, regress, and close

- [ ] **Status:** `[ ]`
- [ ] **Objective:** turn raw audit evidence into a stable repair handoff and prove the audit itself is complete and non-destructive.
- [ ] **Observable outcome:** the latest run folder contains consistent JSON/CSV/HTML/Markdown/recovery evidence, every non-pass is correctly classified, docs describe the reusable command, and the plan contains final evidence.
- [ ] **Prerequisites:** Luna Batches 01-04 are `[x]`; all targeted confirmation runs and recovery checks have finished.
- [ ] **Inspect or change narrowly:**
  - latest run artifacts created by this plan under `_temp-files/inspector-captures/`;
  - `specs/0004-model-picker-and-shortcuts-spec.md` for the complete inventory/proof contract;
  - `specs/0006-runtime-scrape-selector-validator-spec.md` for audit command, statuses, recovery, and artifact schema;
  - `tests/playwright/chatgpt-local-profile-test-setup.md` for reusable operator commands and environment boundaries;
  - plan evidence sections.
- [ ] **Triage:**
  - classify each non-pass as product handler/wiring defect, selector drift, unsafe/missing automation coverage, account capability, fixture/environment failure, platform limitation, or intentionally unavailable behavior;
  - require two consistent reproductions plus valid preconditions for `product-fail`;
  - order `shortcut-repair-backlog.md` by user impact: shipped/default or blocking behaviors first, optional blank-default behaviors next, audit coverage/tooling gaps separately;
  - give each backlog item stable row id, action/profile/slot, chord and modifiers, expected versus observed behavior, exact repro and retest commands, evidence paths, likely owning files/symbols, proposed repair boundary, compatibility risks, and acceptance proof;
  - include a clean “no confirmed product defects” section when appropriate instead of inventing work.
- [ ] **Artifact integrity:** verify JSON parses, CSV row identities match JSON, every HTML/Markdown evidence link resolves, status totals reconcile, failure evidence exists for confirmed failures, and recovery has no unresolved audit mutation.
- [ ] **Final validation:**
  - `npm run validate:keys`
  - `node tests/shortcut-audit-inventory-fixture.mjs`
  - `node tests/shortcut-target-live-selector-fixture.mjs`
  - run every new focused audit fixture
  - `node --check tests/playwright/devscrape-wide.mjs`
  - `node --check tests/playwright/lib/devscrape-wide-core.mjs`
  - `node --check tests/playwright/lib/shortcut-target-inventory.mjs`
  - `npx biome check` on all changed source/test/config files
  - `npm test`
  - `npm run playwright:chatgpt:audit-shortcuts -- --require-extension-capture`
  - `npm run playwright:chatgpt:check-scrape`
- [ ] **Documentation proof:** reread the edited spec/support sections and verify command names, artifact names, statuses, fixture rules, and no-deployment boundary match the code and final run.
- [ ] **Release/deployment gate:** no deployment is authorized or required. Confirm no shipped file, manifest permission, build include, version, or `dist/` artifact changed. If a production change became necessary, leave it in the repair backlog for a separately authorized plan.
- [ ] **Acceptance:** every audit row has a terminal status; every confirmed failure is actionable; no unexplained skip/manual-pending/recovery conflict remains; all final commands pass or an exact in-scope blocker is recorded; docs reflect current truth; all five batches contain evidence.
- [ ] **Evidence — fill before marking `[x]`:**
  - Files changed:
  - Commands and results:
  - Final run folder and artifact paths:
  - Final totals by status/proof/profile:
  - Confirmed defect backlog summary:
  - Artifact integrity checks:
  - Recovery and fixture restoration:
  - Documentation changes:
  - Limitations and remaining risks:

## Overall completion criteria

- [ ] Luna Batches 01-05 are all `[x]`; `[~]` or `[!]` means the audit is not complete.
- [ ] The source-derived audit universe has no missing, duplicate, orphaned, or unclassified keyboard contract.
- [ ] Every automation-safe row was exercised through Playwright, and every residual row has honest Luna-supervised evidence or a precise external limitation.
- [ ] Both Chat and Work profile slots and both Alt/Control model modes are accounted for.
- [ ] The final run's JSON, CSV, HTML, Markdown, failure evidence, and recovery files agree and are locally readable.
- [ ] All audit mutations are restored without overwriting concurrent user changes, and the fixed fixture remains unmodified.
- [ ] Confirmed shortcut defects are recorded for a later repair pass; none were silently fixed or dismissed during this audit.
- [ ] Required final regression and live-audit commands pass, or the plan remains incomplete with the exact blocker and retained partial evidence.
- [ ] No production deployment or release artifact was created.
