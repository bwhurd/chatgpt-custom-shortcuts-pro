# Scrub duplicate shortcuts on popup open

## Goal and status

- [~] On each `popup.html` activation, repair conflicting shortcut assignments in `chrome.storage.sync` before publishing hydrated shortcut inputs, model chips, or editable controls. Batches 01–02 are implemented; import/restore boundaries, runtime propagation, and final docs/live checks remain.
- [ ] Keep one deterministic owner per modifier/code in each executable Chat or Work profile. Preserve legal reuse between profiles and between different modifiers.

## Investigation findings

- [x] `extension/shared/model-picker-labels.js:buildDefaultKeyCodesFromPresentationGroups` assigns sequential digits to Configure Models rows, but hardcodes Toggle Speed to `Digit6`. The shared Chat/Work setting separately defaults to `Digit5` in `options-storage.js` and `popup.js`. Advancing the sequential counter at the later shared-toggle row does not reserve its code from earlier model rows.
- [x] A read-only Node/VM probe using the current shared helper and a synthetic six-model Work catalog reproduced the report: fifth model GPT-6.1 Sol = `Digit5`, sixth model GPT-6 Astra = `Digit6`, Chat/Work = `Digit5`, Speed at slot 13 = `Digit6`. Synthetic dynamic slots 15/16 establish the mechanism; they are not verified live slot numbers.
- [x] `popup.js:initModelPickerCodesCache` pads/migrates arrays and filters unavailable catalog slots, but already-migrated arrays receive no duplicate scrub. `normalizeModelPickerCodes` copies values without checking conflicts. `refreshShortcutInputsFromStorage` independently paints scalar settings; neither path establishes one complete conflict-free snapshot.
- [x] `ModelLabels.normalizeProfileKeyCodes` ignores `shortcut-setting` actions and checks only one array. In the probe it retains the model's `Digit5` alongside the shared toggle, and clears Speed rather than the model's `Digit6` because models precede utilities in presentation order. Migration, file import, and Drive rehydration use this incomplete domain.
- [x] `ShortcutUtils.buildConflictsForCode` handles interactive edits with modifier/profile awareness, but reads popup DOM/cache state and is not a storage-wide activation validator. Model reset and default generation can also bypass that edit check.
- [x] Unavailable-slot filtering has runtime value: `content.js:isModelPickerAssignedShortcutEvent` checks every stored code in the active profile to suppress optional dynamic-effort handlers, even when the catalog has no action for that slot. A dead stored code can therefore block another shortcut while invoking no model action. Filtering the union of actions across the profile's catalogs clears that inert blocker while preserving supported dynamic slots and array positions.
- [x] Spec 0001 and spec 0004's model-data section require unavailable-slot cleanup on hydration. Spec 0004's duplicate-safeguard section conflicts by saying unsupported slot values must be preserved and popup open never repairs. Batch 05 must reconcile those statements, distinguishing catalog pruning from the new duplicate scrub.
- [x] On 2026-10-07, the browser inventory exposed three Chrome extension-connected profiles, none containing the supplied conversation URL or a custom CDP browser. The repo's candidate endpoints `127.0.0.1:9333`, `:9222`, and `:9223` were unavailable; Chrome command-line inspection found no running remote-debugging instance. No live storage was read or modified.
- [x] Chrome's [storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage) describes asynchronous reads/writes and `onChanged`; the [upstream concurrency discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU) identifies the absence of storage transactions. One batched patch is not a transaction across competing writers.

## Repair policy

- [ ] Use this proposed precedence for automatic repair: active scalar/global shortcuts first in stable schema/input order, then available model utilities in stable action order, then model/effort slots in ascending persisted slot order. Preserve existing Toggle Chat/Work and Toggle Speed assignments; clear the colliding GPT-6.1 Sol and GPT-6 Astra bindings in the reported example. Interactive confirmed edits still transfer ownership to the user's requested action.
- [ ] Compare canonical `KeyboardEvent.code`, including `DigitX`/`NumpadX` equivalence and legacy character normalization. Partition by the stored effective model modifier, not partially hydrated radios. A Control model binding may coexist with an Alt global binding.
- [ ] Deduplicate each profile independently, using global owners applicable to that profile plus every supported action across all its model configurations. Collapse repeated presentations of the same owner by storage key or profile/slot; never treat a model self-row and its Configure Models alias as two owners.
- [ ] Preserve nonconflicting bindings, dynamic slots beyond 15, array positions/length, other settings, and catalog/name snapshots. Clear model codes only when their slot is absent from every configuration in that profile, because the runtime still treats any stored code as an owner; do not prune according to only the selected configuration. Retired/inactive settings are not active owners.
- [ ] Persist cleared scalar shortcuts as NBSP (`\u00A0`) and cleared model-array entries as `''`, matching current writers. Never delete the key, truncate/reorder arrays, refill cleared bindings, or restart migration; removing a key can revive a default.

## Scope and non-goals

- [ ] Change shortcut assignment behavior only at popup hydration, default/reset generation, and the import/restore persistence boundaries needed to keep repaired values from returning.
- [ ] Do not renumber or auto-fill existing nonduplicate shortcuts; do not conflate Chat and Work profile arrays; do not alter shortcut dispatch/selectors, Chrome permissions, existing user files, or remote Drive state automatically.
- [ ] A popup-open repair must be idempotent and storage-local. It must not contact Drive or scrape ChatGPT.

## Acceptance matrix

| Requirement | Batch | Proof |
| --- | --- | --- |
| Canonical, deterministic conflict ownership while preserving distinct modifiers and Chat/Work reuse | 01 | Pure fixture asserts exact owners and survivors |
| Defaults and resets never assign a reserved key to a model row | 01 | Default-generation fixture and slot uniqueness check |
| Popup repairs persisted values before rendering/enabling controls; second open makes no write | 02 | Popup browser test inspects raw sync storage, UI, and write count |
| Import, restore, export, and reset cannot revive conflicting assignments | 03 | Local persistence-flow fixtures; no Drive call |
| Runtime consumers observe repaired values for either profile | 04 | Focused runtime/listener fixture and profile switch test |
| User-facing and data-flow contracts match the implementation | 05 | Owning specs reviewed; full focused regression and optional live CDP proof |

## Luna Batch 01 — Deterministic normalizer and defaults

- [x] **Objective and prerequisite:** Define the pure conflict policy and fix new/default assignments. No prerequisite beyond the investigation above.
- [x] **Likely files and symbols:** `extension/shared/model-picker-labels.js` (`normalizeProfileKeyCodes`, `buildDefaultKeyCodesFromPresentationGroups`, profile presentation groups); popup default construction in `extension/popup.js`; focused Node fixtures, including `tests/model-picker-slot-uniqueness.mjs`.
- [x] **Implementation:** Add a pure snapshot/profile normalizer that accepts scalar shortcut codes, modifier settings, both profile arrays, and catalog-backed owner groups. Use the documented precedence: active scalar shortcuts, model utilities in stable order, then model/effort slots by persisted slot. Deduplicate canonical codes within the same modifier/profile; collapse self-row aliases by true owner identity. Have the normalizer report a changed-key patch and cleared-owner summary while copying unrelated snapshot values untouched. Reserve applicable scalar and utility codes before generating default model digits; leave exhausted slots empty.
- [x] **Validation:** Add `tests/shortcut-duplicate-normalizer-fixture.mjs`; run `node tests/shortcut-duplicate-normalizer-fixture.mjs`, `node tests/model-picker-slot-uniqueness.mjs`, and `npx biome check extension/shared/model-picker-labels.js extension/popup.js tests/shortcut-duplicate-normalizer-fixture.mjs`.
- [x] **Acceptance and result:** All focused fixtures pass. They prove the reported Digit5/Digit6 conflicts, scalar conflicts, Digit/Numpad equivalence, blank/NBSP behavior, independent profiles/modifiers, hidden supported owners, aliases, long arrays, unrelated-value preservation, changed-key patching, idempotence, and unique generated defaults. Remaining risk: the original live profile remains unavailable through the discovered browser/CDP surfaces; popup persistence and runtime propagation are unverified and are addressed in later batches.

## Luna Batch 02 — Popup hydration and storage repair

- [x] **Objective and prerequisite:** Run the normalizer before popup shortcut/model state becomes visible or editable. Depends on Batch 01.
- [x] **Likely files and symbols:** `extension/popup.js` (`initModelPickerCodesCache`, `refreshShortcutInputsFromStorage`, startup default seeding, model render/hydration events); `extension/popup.html`, `extension/popup.css`; new `tests/playwright/popup-shortcut-duplicate-scrub.spec.mjs` plus the profile-selector regression.
- [x] **Implementation:** Order default seeding, one-time profile migration, filtering of slots absent from every configuration in each profile, complete storage read, duplicate patch, and final render behind one readiness boundary. The filter stays because runtime suppression checks every stored profile code, including unmapped slots; without it, a dead value can block another shortcut. Preserve supported dynamic slots and array positions. Persist changed duplicate owners as a single patch; after successful verification, hydrate both profile caches, scalar input datasets/values, modifier controls, and the model grid from the committed snapshot. Keep controls hidden until then. Re-read/recompute immediately before repair writes when relevant storage changes are observed. On read/write failure, keep shortcut controls hidden and show the existing error UX. Chrome sync writes remain non-transactional.
- [x] **Validation:** `npx playwright test tests/playwright/model-picker-profile-selector.spec.mjs tests/playwright/popup-shortcut-duplicate-scrub.spec.mjs --workers=1` passed all 6 tests. Coverage includes the reported scalar/model collisions, raw storage and rendered values, clean reopen with no repair write, seeding/migration order, duplicate ownership transfer, and failed storage writes. `npx biome check` on the seven changed popup/helper/spec/fixture files, all three focused Node fixtures, JavaScript syntax checks, and `git diff --check` passed.
- [x] **Acceptance and result:** Chat/Work and Speed keep their assignments; conflicting model shortcuts are cleared from sync storage and hidden until verified; unaffected supported assignments and separate profile reuse survive; reopen is write-free. A 500 ms delayed first read proves the pending UI stays hidden, while a forced sync-write failure leaves it hidden and reports an error. Six focused Playwright tests passed. The test write is one batched patch but Chrome sync provides no transaction; live target-profile/CDP proof remains for Batch 05.

## Luna Batch 03 — Import, restore, export, and reset boundaries

- [x] **Objective and prerequisite:** Prevent other popup persistence flows from writing or exporting a duplicate snapshot. Depends on Batch 01; preserve Batch 02's storage-ready contract.
- [x] **Likely files and symbols:** `extension/popup.js` (`importSettingsObj`, export builder, `rehydrateSettingsUI`, Clear/Reset actions); `extension/storage.js` only if its actual call path needs normalization; focused persistence fixtures.
- [x] **Implementation:** Apply the same pure normalizer to merged legacy/current file imports, Drive-restore data before local persistence, and shortcut/model reset defaults before UI publication. Ensure exports serialize sanitized authoritative profile arrays; keep `modelPickerKeyCodes` as the existing compatibility/migration field, not a third live registry. Retain existing import confirmations and interactive edit ownership transfer. Do not call Drive or upload a backup during popup activation.
- [x] **Validation:** Use local fixtures to prove imports with legacy/shared and profile arrays cannot resurrect duplicates, restore persists only sanitized local state, exported compatibility data cannot reintroduce losers, and resets stay unique. Run the focused fixtures and `npm run validate:keys`.
- [x] **Acceptance and result:** Batch 03 completed 2026-10-07. Legacy/shared and explicit-profile imports merge with current state, scrub before one allowlisted write, preserve the input object and unrelated local keys, and retain confirmation prompts. Export repairs committed storage first and writes canonical profile arrays plus the aligned legacy compatibility field. Cloud restore removes catalog/name scrape data, persists its normalized local settings patch before reflecting controls, and does not run on popup open. Clear-all, reset-all, and the model-profile reset path use the same normalized commit helper. Catalog-based unavailable-slot cleanup remains because runtime dispatch still treats stored codes for dynamic owners absent from the current catalog as active phantom assignments. Search-bar autofocus now waits for the shortcut container to become ready and stops on failed hydration, preserving the prior focused-popup state. Validation passed: `npx biome check extension/popup.js tests/playwright/popup-shortcut-duplicate-scrub.spec.mjs`; `node --check` on both changed JavaScript files; `npx playwright test tests/playwright/model-picker-profile-selector.spec.mjs tests/playwright/popup-shortcut-duplicate-scrub.spec.mjs --workers=1 --output test-results/popup-shortcut-duplicate-scrub-b03` (10/10); `node tests/shortcut-duplicate-normalizer-fixture.mjs`; `node tests/model-picker-slot-uniqueness.mjs`; `npm run validate:keys`; scoped `git diff --check`; and the coordinated visual-only expanded-popup check (1/1). The requested ChatGPT tab was found, but its debugger is unattached; live profile storage/runtime proof remains for Batch 05.

## Luna Batch 04 — Runtime propagation

- [ ] **Objective and prerequisite:** Verify live shortcut consumers follow committed scalar/profile storage after popup repair. Depends on Batch 02.
- [ ] **Likely files and symbols:** `extension/content.js` model-profile and scalar `chrome.storage.onChanged` handlers, runtime/hint caches, overlay hydration; the focused shortcut/profile fixtures under `tests/`.
- [ ] **Implementation:** Trace the actual repair patch through storage listeners for the selected and inactive profiles. Add only the missing invalidation/cache synchronization needed for runtime dispatch, overlay, or shortcut hints to observe cleared keys. Preserve current action routing and DOM selectors.
- [ ] **Validation:** Extend or add a focused fixture that applies the scrub patch, switches Chat/Work, and confirms cleared owners no longer dispatch or appear as assigned hints while preserved owners still do. Run the named focused fixture; do not pass the unsupported `model-picker` type to `test:shortcuts:fast` (the existing fast fixture accepts only registered case types and action ids).
- [ ] **Acceptance and result:** Popup, runtime action lookup, and overlay agree for both profiles after a storage change without reload-dependent stale assignments. Record exact fixture commands, outcomes, and any limitation.

## Luna Batch 05 — Integrated proof, documentation, and closure

- [ ] **Objective and prerequisite:** Close every acceptance row after Batches 01–04, update owning contracts, and perform available live proof.
- [ ] **Likely files:** `specs/0001-adding-new-settings-spec.md`, `specs/0003-cloud-sync-and-settings-data-flow-spec.md`, `specs/0004-model-picker-and-shortcuts-spec.md`, any focused test/spec files changed in prior batches, and this plan.
- [ ] **Implementation:** Replace spec 0004's “popup open ... never repair” statement with the narrow, verified startup-repair rule. Document precedence, storage clear values, readiness/failure behavior, import/restore/export handling, and retained profile invariants. Review all diff hunks for scope and update this batch with actual proof; do not mark a gate complete without evidence.
- [ ] **Validation:** Run the focused fixtures, `npm test`, `npx playwright test tests/playwright/model-picker-profile-selector.spec.mjs`, `npm run validate:keys`, `npm run check`, and `npm run check:text` as relevant to changed files. On an available user-supplied CDP profile, identify the tab by the exact conversation URL, inspect only the relevant shortcut/catalog/modifier state, reload the unpacked extension after code changes, and verify open/reopen storage plus UI and runtime propagation. The prior session did not expose this profile; report that gate as unavailable if still absent. No publish, deployment, zip build, or remote backup is in scope.
- [ ] **Acceptance and result:** Every acceptance-matrix row has proof; both toggles survive the reported scenario; second open causes no write; imports/resets cannot recreate the collision; relevant docs match the current code. Record skipped/unavailable proof and residual risk. Rename this file to `Done-0099-popup-shortcut-duplicate-scrub-plan.md` only when all required gates pass. If live CDP remains unavailable, keep the live-proof gate explicitly incomplete and do not call the plan complete.

## Rollback and overall completion

- [ ] Keep repairs minimal and limited to conflicting stored codes. The pure fixture can reproduce the old and new winner sets; if the live popup check fails, revert only the responsible code/test hunks, retain the findings, and leave this plan active for repair.
- [ ] The feature is complete only after all five Luna batches are `[x]`, the acceptance matrix is proven, owning specs are updated, and required browser/runtime gates pass. A written plan alone does not complete the feature.

## Related specs

- [ ] `specs/0001-adding-new-settings-spec.md`
- [ ] `specs/0003-cloud-sync-and-settings-data-flow-spec.md`
- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
