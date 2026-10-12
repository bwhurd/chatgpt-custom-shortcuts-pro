# Work composer tool toggles

## Outcome and evidence

- [~] Make repeated tool shortcuts remove their selected tool in both Chat and Work, preserving draft text and unrelated selections. Batch 01's runtime and controlled fixture work is complete; authenticated proof and owning docs remain in Batch 02.
- CDP reproduction on 2026-10-11, standard `CodexCleanProfile`, port 9333, extension 4.8.0.3: trusted Alt+Q in Chat adds one Create Image inline pill; second press removes it. Alt+W switches to Work; first Alt+Q adds one footer button; second press leaves it selected. Clicking the native button removes it. No messages were submitted; the owned tab was left empty in Chat.
- Chat uses `[data-inline-selection-pill][data-system-hint-type="picture_v2"]` inside the editable textbox. Work uses a native button containing the same `M7 21.005` image icon and a close icon, inside the form's `[data-composer-footer-responsive]`, outside the textbox. Its observed label is `Remove Create image`; localized labels and generated classes must not become selectors.
- `extension/content.js:3199` (`findSelectedComposerToolPill`) searches only inside the editor. `runComposerToolShortcutByIcon` therefore takes the add path in Work. `runStudyShortcut:7585` separately checks that same inline-only detector before its query preparation.
- `tests/playwright/shortcut-fast-fixture.mjs:401,1235` models persistent tools only as inline pills. `tests/playwright/lib/shortcut-fast-cases.mjs:1515` extracts the real helpers and must include any new dependencies.
- The user reports the tool toggles appear to work both ways and asked to stop further per-tool live probing. Keep automated structural coverage for Search, Study, Create Image and Deep Research; do not alter live bindings or repeat tool-by-tool UI checks. Live CDP proof remains scoped to the requested Create Image Alt+Q round trip in Chat and Work.
- Context checked first: [official Work overview](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex), [upstream inline Search report](https://community.openai.com/t/search-should-be-a-composer-level-toggle-not-an-inline-mention-inserted-at-the-caret/1394560). These explain product context, not the specific removal contract; the live DOM above is authoritative.

## Design and limits

- [x] Reuse one selected-tool resolver for shared tool dispatch and Study's early exit: retain inline-pill removal; additionally find the matching visible, enabled native tool-removal button in the active editor's owning form/footer. Identify by verified icon structure, exclude menu items/openers, and reject ambiguous matches. Click the native button so ChatGPT owns state changes; do not delete footer DOM or manipulate React state.
- [ ] Inspect the other tools' selected-state structure before generalizing. Add Photos + Files currently invokes file selection with no persistent pill in code/specs. Preserve that boundary unless live evidence shows a distinct removable tool selection; never interpret this request as permission to remove uploaded files or dismiss a chooser using an invented toggle.
- [ ] Preserve existing bindings, Chat behavior, Study query ownership, draft formatting/text, other tool selections, and hidden/unavailable-target no-ops. No settings, permissions, manifest, model routing, packaging or deployment changes.
- Risk: a broad icon search could activate a menu row or a different composer. Keep matching scoped to the active form and prove exclusions. Rapid presses/async menu completion must not duplicate selections; await actual state in tests.
- Related specs: `specs/0004-model-picker-and-shortcuts-spec.md` and `specs/0006-runtime-scrape-selector-validator-spec.md`. Active audit/quality plans do not own this focused behavior repair.

## Luna Batch 01 - Repair and focused regression

- [x] Objective: support both selected-tool representations and make the fast validator expose this failure. Current source and the earlier CDP capture confirmed the editor pill and footer button boundaries.
- [x] Change the Work selected-button path in `extension/content.js`; use it from shared tool dispatch and Study's early selected-state check. Keep inline editor deletion; use native footer-button activation; reject ambiguous matches. Add Photos + Files remains one-shot for native removal, so an attached file is never treated as a toggle target.
- [x] Extend existing persistent-tool cases in both modes using extracted handlers and trusted keys. Each adds, removes, re-adds exactly once, preserves draft text, and removes without reopening Plus. Study consumes only its fixture-owned query and removes without opening Plus when selected.
- [x] Assert selected DOM and draft contents. Work fixtures include hidden/disabled buttons, wrong icon and out-of-form decoys, plus a duplicate selected-button ambiguity case. The old add-only path is invoked directly in the fixture and shown to duplicate the Work selection; the actual shortcut then removes the single selected button. No duplicate catalogue rows or live-proof claims were added.
- [x] Keep the Add Photos + Files activation, ambiguity and file-chooser boundaries. `tests/study-composer-capture.test.js` has no dependency on this selected-tool helper; no change to the capture test/collector or report contract was needed.
- [x] Focused acceptance passed: `npm run test:shortcuts:fast -- --shortcut-action-id shortcutKeyCreateImage --shortcut-action-id shortcutKeySearchWeb --shortcut-action-id shortcutKeyStudy --shortcut-action-id shortcutKeyDeepResearch --shortcut-action-id shortcutKeyAddPhotosFiles` (5/5 passed; partial-coverage warnings retain the existing external/native boundaries).
- [x] `npx biome check extension/content.js tests/playwright/shortcut-fast-fixture.mjs tests/playwright/lib/shortcut-fast-cases.mjs` passed.
- [x] Batch result: Chat pill and Work button add/remove/re-add are covered for Search, Study, Create Image and Deep Research. Add Photos + Files keeps its file-selection action boundary. Live proof and owning specs remain required; fixtures alone do not prove live DOM behavior.

## Luna Batch 02 - Live proof, owning docs and closure

- [ ] Objective: verify the shared change and document its supported boundaries. Prerequisite: Batch 01 fully proven.
- [ ] Reload the unpacked extension through the documented Chrome setup, then verify only the requested Create Image Alt+Q round trip in Chat and after Alt+W in Work, including a disposable nonempty draft. Use the existing automated fixture coverage for Search, Study and Deep Research; do not continue per-tool live probing unless a focused check exposes a mismatch. Preserve the Add Photos + Files one-shot chooser boundary without uploading/removing user files or sending messages. Preserve settings/tabs and clean up only owned state.
- [ ] Update the composer-tool contract in spec 0004 and the fast-check proof scope in spec 0006, including the observed Add Photos boundary. Run `npm run test:shortcuts:fast` once for final shared-helper acceptance, `npm run test:shortcuts:contracts`, and `npm run check:text`; run additional focused tests only for newly changed owners. No popup suite or release build is required by this scope.
- [ ] Acceptance: live Create Image round trips pass in both modes; fixture regressions cover the other persistent tools and preserve the Add Photos + Files boundary. All focused/final checks and docs pass. Record commands, failures/skips, live scope and remaining risk here; rename this plan to `Done-0110-work-composer-tool-toggle-plan.md` only when complete.
- [ ] Rollback: revert only this workstream's runtime/test/doc hunks and reload the extension; preserve unrelated work. No publication/deployment is requested. Results / remaining risk: pending.

## Acceptance matrix

| Requirement | Batch | Proof |
| --- | --- | --- |
| Chat remains a toggle; Work removes its selected tool | 01, 02 | Trusted fixture round trips and live Alt+Q in both modes |
| Search, Study, Image, Research use correct selected-state routing | 01, 02 | Per-tool mode assertions in the fast fixture; no extra live probes unless a mismatch appears |
| Add Photos + Files retains its verified native boundary | 01, 02 | Ambiguity/activation assertions plus live inspection |
| Draft and other tools survive; decoys cannot be removed | 01 | DOM/draft assertions and unavailable/wrong-modifier cases |
| Fast validator catches the original bug; dependent tests stay accurate | 01, 02 | Inline-only mutation fails; extraction, focused and final contract checks pass |
| Owning docs and final evidence agree | 02 | Spec review, text check and recorded live limitations |
