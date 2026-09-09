/goal Complete the entire five-batch keyboard-shortcut audit defined in `plans/0076-full-keyboard-shortcut-audit-plan.md`. Build and run the audit, validate every extension-owned keyboard behavior, produce the required actionable artifacts, and keep this goal active until all five batches and the final acceptance gate pass.

You are GPT-5.6 Luna Max executing a repository-grounded audit in:

`C:\Users\bwhurd\Dropbox\CGCSP-Github`

Own the execution and browser evidence review personally. Playwright should exercise every behavior that can be tested safely and deterministically; you must inspect the resulting reports and failure evidence yourself. Do not treat a generated report, a unit test, a listener firing, or a delegated conclusion as proof without checking the expected observable behavior.

## Read order and scope

At the start of the first execution turn, read in this exact order:

1. `AGENTS.md`
2. `plans/0076-full-keyboard-shortcut-audit-plan.md`
3. `PROJECT_SPEC.md`
4. `specs/0004-model-picker-and-shortcuts-spec.md`
5. `specs/0006-runtime-scrape-selector-validator-spec.md`
6. `tests/playwright/chatgpt-local-profile-test-setup.md`

Then inspect only the files and symbols named by the current batch. Do not read completed plans or `_temp-files/` history by default. You may read the specific run folder created or selected by this audit when a batch requires its evidence.

Use the plan as execution truth, but verify its planning-time observations against current code before editing. Important current observations that may have changed:

- `extension/content.js` had 51 `shortcutDefaults` rows.
- `extension/shared/shortcut-action-metadata.js` had 51 action definitions and 64 targets.
- 42 actions were `scrape-targets`; 41 had executable probes, `shortcutKeyToggleChatWork` was `not-live-probed`, and nine rows were `not-applicable`.
- `tests/playwright/lib/shortcut-target-inventory.mjs` parsed zero current handlers because it still expected `[shortcuts.someKey]:`, while runtime now uses named keys in `altShortcutActions`. This produced 44 false `missing-runtime-handler` issues and must be resolved before live results are trusted.
- The existing audit did not represent the two 15-slot Chat/Legacy and Work/Latest model profiles as first-class executable rows.

Do not hard-code these counts as timeless truth. Reconcile the live sources and record current counts in evidence.

## Execution cadence

- Find the earliest `Luna Batch` whose status is not `[x]`.
- Work on exactly that one batch in the current execution turn.
- Never start a later batch in the same execution turn, even if the current batch finishes early.
- At the end of the turn, update that batch's status and every evidence field in the plan, report the observable outcome, and yield.
- Keep the overall `/goal` active across automatic continuations. Do not ask the user to type “continue.” On the next continuation, select the next earliest incomplete batch.
- Use `[ ]` for not started, `[~]` for incomplete or unvalidated, `[x]` only after every batch acceptance criterion passes, and `[!]` only for a concrete in-scope blocker.
- A failed or skipped required validation, missing live proof, missing artifact, unresolved recovery conflict, unexplained audit row, or stale documentation prevents `[x]`.

## Guardrails

- Preserve unrelated work. Check `git status --short` before edits and again before closing each batch. Do not reset, overwrite, or clean user changes.
- Follow the repo's context budget: discover with `rg`, read focused symbols/ranges, and stop searching when the batch has enough evidence.
- Use `apply_patch` for edits. Do not edit shipped runtime code merely to make the audit easier.
- The audit may repair or extend its dev-only harness, metadata, tests, package command, and owning docs. It must not repair product shortcut behavior discovered during the run; put confirmed product defects into the repair backlog for a later authorized workstream.
- Do not add manifest permissions, shipped popup controls, release-zip entries, versions, or `dist/` artifacts.
- Before running any materially edited PowerShell script, run `C:\Users\bwhurd\tools\scripts\Test-PowerShellSyntax.ps1 -Path <script.ps1>` and treat parser/analyzer errors as blocking.
- Run focused validation in every batch and the full relevant regression/live gate in Batch 05.
- Use standard Chrome attached over CDP through `CodexCleanProfile`; do not substitute Chrome for Testing for the authenticated profile.
- Reload the unpacked extension from `extension/` before trusting live results after any shipped-file change. Shipped changes are not expected under this plan.
- If login, extension setup, account capability, or fixture access is unavailable, record the exact environment boundary and retained evidence. Do not weaken strict capture, fabricate success, or mark affected rows passed.

## Audit truth and coverage

The complete universe must be derived from current source and include:

- global configurable actions from defaults, runtime ownership, metadata, schema, and popup surfaces;
- Ctrl/Command Send and Stop gates;
- the standalone overlay key listener;
- ordinary Alt and Primary-Control+Alt response-preview behavior;
- PageUp/PageDown takeover and its enable gate;
- retired or unavailable keys that must remain inert/hidden;
- every slot `0..14` in both `modelPickerKeyCodesLegacy` and `modelPickerKeyCodesLatest`;
- every currently presented sparse model, effort, configure, speed, reset, and Chat/Work action;
- Alt and Control model-picker modes, wrong-modifier rejection, and inactive-profile isolation;
- popup assignment/persistence, canonical codes, duplicate transfer, and overlay/runtime parity.

Every row needs a stable identity, proof method, expected and observed behavior, status, reason, evidence path, and rerun command. No behavior may vanish because it is unsafe or difficult. Use an explicit supervised, unavailable, not-present, or not-applicable classification.

Use Playwright for every safe, deterministic path. For states Playwright cannot express directly, an injected `KeyboardEvent` may prove a guard only when the result says `event-injection`; it is not physical-key proof. Record macOS Command/Option execution as platform-unverified unless a real macOS runner exists.

## Safety and recovery

- Keep the primary fixture read-only.
- Use only the disposable-conversation setups authorized by `specs/0006-runtime-scrape-selector-validator-spec.md` for Send, Stop, Edit, dictation, codebox, or any prompt-spending behavior.
- Snapshot every storage key the audit may mutate. Use a per-key mutation ledger and compare-before-restore so a concurrent user edit is never silently overwritten.
- Always attempt cleanup in `finally` paths, restore the primary fixture, reread storage, and write `storage-recovery.json`, including on partial failure.
- A recovery conflict, missing recovery artifact, or leftover audit mutation blocks completion.
- Keep evidence under ignored `_temp-files/inspector-captures/<run>/`. Never write cookies, auth tokens, full unrelated storage, or unnecessary conversation content.
- Require a targeted second reproduction with valid preconditions before labeling a row `product-fail`.

## Required artifacts

Keep the current run manifest, dumps, `live-probes.json`, `check-report.json`, and `check-report.html`. Add and reconcile:

- `shortcut-audit.json`
- `shortcut-audit.csv`
- `shortcut-repair-backlog.md`
- `storage-recovery.json`
- bounded failure-only evidence under `failures/`

The Markdown backlog must make every confirmed failure directly repairable: stable id, action/profile/slot, chord/modifiers, expected versus observed, two reproduction records, exact repro and retest commands, evidence paths, likely owning files/symbols, suggested repair boundary, compatibility risks, and acceptance proof. Keep environment/account/tooling gaps separate from product defects.

## Batch and final validation

Run the exact commands named by the current batch. Use repo-native scripts where they exist. The intended final live command is `npm run playwright:chatgpt:audit-shortcuts -- --require-extension-capture`; verify the implemented CLI rather than inventing a different manual sequence.

In Batch 05, perform all of these unless the current repo legitimately supersedes one and you document why:

- `npm run validate:keys`
- `node tests/shortcut-audit-inventory-fixture.mjs`
- `node tests/shortcut-target-live-selector-fixture.mjs`
- every new focused audit fixture
- Node syntax checks for every changed MJS/JS entrypoint
- `npx biome check` on all changed source/test/config files
- `npm test`
- `npm run playwright:chatgpt:audit-shortcuts -- --require-extension-capture`
- `npm run playwright:chatgpt:check-scrape`

Validate that JSON parses, CSV and JSON row identities/totals agree, local HTML/Markdown links resolve, confirmed failures have evidence, and storage recovery is clean.

There is no production deployment for this work. The final release/deployment gate is proof that no shipped extension file, manifest permission, build include, version, release zip, or deployed system changed. If a production repair is needed, keep it in `shortcut-repair-backlog.md` for a separate plan.

Update the owning specs and the local profile setup doc only after code and final run behavior are known. Mark the overall goal complete only when all five plan batches are `[x]`, all completion criteria pass, required live/browser proof is present, all mutations are recovered, actionable artifacts are internally consistent, and the plan contains final evidence. Creating the harness or producing a partial report is not completion.
