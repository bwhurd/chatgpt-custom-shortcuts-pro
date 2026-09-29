# Plan 0082: Repair model refresh from the live catalog

## Goal and approval gate

- [x] Inspect Chat first, then Work, including every explicit model's available effort range; record structural targets and native order in [the live catalog](../specs/model-picker-live-catalog-2026-09-25.md).
- [x] Implementation approved. User authorized growing slot arrays and retiring historical refresh formats; keep shortcut dispatch and the separate full audit in `0076-full-keyboard-shortcut-audit-plan.md` out of scope unless a shared target change is required.
- [x] Replace popup refresh with one current-picker scan. Live acceptance remains a separate closeout gate.

## Evidence and owning files

- [x] Confirm removed pill/view/slider markers and the switch from header radios to blank-composer `aria-pressed` buttons. The catalog records both live attributes and conflicting source predicates.
- [x] Observe Chat: two explicit models, each Instant/Medium/High. Observe Work: seven explicit models in native order plus separate Default; five efforts except GPT-5.5's four. Default's five positions select recommended model/effort pairs.
- [x] Implement in `extension/shared/model-picker-selectors.js`, `extension/content.js`, `extension/popup.js`, `extension/shared/model-picker-labels.js`, and `extension/options-storage.js`. Preserve existing assignment slots; grow arrays rather than cap the inventory. Fifteen remains default compatibility padding, not a catalog/key-array ceiling.

## Implementation handoff — live behavior not yet verified

- [x] Add current pill and pressed-button mode targets, current view-toggle detection, and explicit `surfaceMode` catalog identity so Chat is not inferred as Work from a shared menu shape.
- [x] Implement one `scrapeCurrentModelPickerCatalogOnce` path: active Advanced inventory in DOM order, primary titles, sequential per-model slider scan, separate recommendation pairs, observed utilities, initial selection restoration, and storage acknowledgment before a successful response.
- [x] Remove `scrapePillModelCatalogOnce`, `scrapeIntegratedModelCatalogOnce`, and Configure-dialog refresh fallback from `scrapeModelCatalogOnce`. Historical shape notes remain in spec 0004; shortcut-only legacy handlers are outside this refresh pass.
- [x] Allow fresh dynamic model slots beyond historical defaults; preserve full key/name arrays through bootstrap, hydration, popup save and overlay copies. Preserve matched slots when catalog ids transition from an old positional alias to explicit dynamic identity.
- [x] Show surface/stage failure codes for refresh errors; reserve the open-tab message for `NO_CHATGPT_TAB`.
- [x] Review the focused change surface and retire only unreferenced legacy refresh helpers; retain shortcut-only legacy handlers.
- [x] Run the three focused fixtures, `node --check` on changed JavaScript/tests, and Biome on changed source/tests: all pass.

## One-pass repair

- [x] Add the observed structural targets to the shared selector helpers and current scanner. Refresh supports the current shell only; unsupported shapes fail explicitly rather than running historical cascades.
- [x] Make the existing coordinator scan Chat then Work with one small surface-scanner routine (implementation complete; live validation pending):
  1. Select mode and verify reciprocal `aria-pressed` state and ready pill.
  2. Open pill; expose Advanced once only if Simple is active.
  3. Read all primary model titles in DOM order, including off-viewport rows; keep Default as recommendation metadata, not an explicit model slot. Strip secondary descriptions/hints structurally.
  4. For each explicit model, reopen Advanced as needed, select its captured row, verify checked identity and Simple state, then walk the finite slider range once. Read effort label/token and index after each confirmed movement; do not scrape combined model/effort text or inactive panels.
  5. Record Default's recommended pairs separately and record only actually rendered utility capabilities. Use bounded state-based waits inside this requested operation, no permanent observer/poll loop or stacked synthetic activation sequences.
- [x] Build one in-memory complete result per surface with ordered models, per-model effort availability/index mapping, recommendation metadata and capabilities. Adapt that result to the existing catalog contract once; preserve matched slots and assigned keys. Do not use the currently selected model as an inventory fallback or merge stale cached models into a fresh successful scan.
- [x] Add complete-scan guards and await persistence before returning a surface result. Retain failed-surface snapshots and still attempt the other surface; cleanup restores initial mode and refocuses composer. Failure-injection and live proof remain pending.
- [x] Distinguish missing tab from picker/scan failures with surface/stage codes in the existing toast UI.

## Validation and closeout

- [x] Add and run focused coverage for active Advanced rows, primary-title extraction, current Chat/Work structural targets, and catalog/key/name hydration beyond 15 slots. Keep broader failure/persistence and runtime assignment checks in the live closeout below.
- [x] Update the current-picker spec without rewriting historical compatibility notes; verify changed files with focused fixtures, syntax checks and Biome.
- [ ] Confirm the installed unpacked extension points at this checkout, then manually reload it. The computer-use boundary blocks `chrome://extensions`; do not use an indirect click route or guess another install path.
- [ ] Run the real popup refresh. Prove the immediate Chat and Work views match the live catalog's model order and effort availability, then close/reopen the popup and prove the same snapshots. Repeat starting in the other mode and from an already-open Advanced menu; verify unchanged shortcut assignments and useful failure behavior. Record response/storage/UI evidence before claiming success.
- [ ] Add one concise changelog bullet after live behavior is verified; update the catalog only for new observations, and rename this plan `Done-0082-model-refresh-live-catalog-repair-plan.md` only after live acceptance passes.

## Related specs

- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`: catalog/profile/assignment contracts and cleanup.
- [ ] `specs/0001-adding-new-settings-spec.md`: existing popup/shared-label ownership; no new setting or manifest permission is planned.
