# Show Shortcuts Alt Default Plan

## Goal

- [x] Move the configurable `Show Shortcuts` binding into the normal Alt-based popup shortcut domain so the shipped default becomes `Alt + O`, while keeping `Search Chats` on `Alt + K`.

## Current posture

- [x] Ground the work against the current implementation, not memory:
  - `extension/options-storage.js` still seeds `shortcutKeyShowShortcuts` as `/` (`Slash` after popup normalization).
  - `extension/popup.html` still renders the `Show Shortcuts` row with a `Ctrl +` label and `/` input default.
  - `extension/settings-schema.js` still marks `shortcutKeyShowShortcuts` as a Ctrl-domain popup shortcut through `shortcuts.ctrlShortcutKeys`.
  - `extension/content.js` still hydrates the overlay opener with a `Slash` fallback and only opens the overlay on Ctrl/Cmd-only keydown.
  - `shortcutKeySearchConversationHistory` is already the shipped `Alt + K` shortcut and must stay that way.
- [x] Keep the plan tied to the actual current baseline: the repo is changing from configurable Ctrl/Cmd + `/`, not from Ctrl + `K`, even though the user request described the old behavior loosely.

## Scope

- [x] Touch only the files that directly own this behavior unless validation exposes one more hardcoded dependency:
  - `plans/0022-show-shortcuts-alt-default-plan.md`
  - `plans/Deferred-0003-agent-planning-open-workstreams-plan.md`
  - `plans/Deferred-0004-shortcut-overlay-validation-plan.md`
  - `extension/options-storage.js`
  - `extension/popup.html`
  - `extension/settings-schema.js`
  - `extension/content.js`
  - `tests/fixtures/settings.json`
  - `PROJECT_SPEC.md`
  - `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] Leave unrelated shortcut rows, model-picker bindings, popup layout, overlay section membership, permissions, and host access unchanged.
- [x] Do not add a migration unless grounding shows one is necessary; this change is a shipped default and modifier-domain update, not a storage-shape change.

## Success gate

- [x] A clean/default path stores `shortcutKeyShowShortcuts` as `KeyO` and still stores `shortcutKeySearchConversationHistory` as `KeyK`.
- [x] The popup row for `Show Shortcuts` displays `Alt +` and defaults its visible key to `o`.
- [x] Popup duplicate detection treats `Show Shortcuts` as an Alt-domain shortcut, so it participates in the same conflict set as the other popup shortcuts.
- [x] The content runtime opens the shortcuts overlay on Alt-only plus the configured key, using `KeyO` as the fallback default.
- [x] Repo docs that describe the overlay no longer claim the trigger is the old Ctrl+/ shortcut.

## Detailed execution batches

- [x] Batch 1: update the stored defaults and fallback baseline.
  - `extension/options-storage.js`: change `shortcutKeyShowShortcuts` from the raw `/` default to raw `o` so popup default seeding continues to normalize it into `KeyO`.
  - `extension/content.js`: change the `showShortcutsCode` fallback path from `Slash` to `KeyO`, including the local default variable, the `chrome.storage.sync.get` fallback object, and the post-normalization fallback assignment.
  - `tests/fixtures/settings.json`: update the exported-settings fixture so `shortcutKeyShowShortcuts` matches the new canonical stored default (`KeyO`), while leaving `shortcutKeySearchConversationHistory` at `KeyK`.
  - Keep the value canonicality invariant intact: storage still uses `KeyboardEvent.code`, and empty values still remain empty/`NBSP` where the existing code expects them.
- [x] Batch 2: move the popup UI and modifier metadata into the Alt domain.
  - `extension/popup.html`: change the `Show Shortcuts` modifier label from the Ctrl/Cmd styling class to the Alt styling class and change the visible default value from `/` to `o`.
  - `extension/settings-schema.js`: remove `shortcutKeyShowShortcuts` from the Ctrl-domain shortcut list so popup duplicate detection and modifier-aware conflict checks treat it like the other Alt shortcuts.
  - Keep `shortcutKeySearchConversationHistory` untouched so `Search Chats` remains `Alt + K`.
- [x] Batch 3: switch the runtime opener from Ctrl/Cmd-only to Alt-only.
  - `extension/content.js`: replace the overlay keydown gate so the shortcuts overlay opens only for Alt-only key chords, not Ctrl/Cmd-only chords.
  - Keep the existing configurable-key behavior intact: the opener should still read `shortcutKeyShowShortcuts` from sync storage and still honor user-customized values after the default change.
  - Update nearby comments so they describe the current behavior accurately instead of calling it the Ctrl+/ overlay opener.
  - Do not touch the overlay contents filter that excludes `shortcutKeyShowShortcuts`; that exclusion is unrelated to the trigger change and avoids self-referential overlay rows.
- [x] Batch 4: align durable docs with the new shipped behavior.
  - `PROJECT_SPEC.md`: replace the old Ctrl+/ wording with neutral or current wording for the shortcuts overlay so the repo-wide architecture summary matches code.
  - `specs/0004-model-picker-and-shortcuts-spec.md`: update the overlay terminology and trigger references so the shortcuts/model-picker spec no longer documents Ctrl+/ as the active overlay trigger.
  - Keep the durable rules intact: popup and overlay still share schema metadata, duplicate detection must still hold, and grouped model metadata still has one source of truth.
- [x] Batch 5: reconcile related deferred planning docs so future overlay work does not reopen the old trigger assumptions.
  - `plans/Deferred-0004-shortcut-overlay-validation-plan.md`: replace the old hardcoded `Ctrl + /` assumptions with the current `shortcutKeyShowShortcuts` / `Alt + O` behavior and clarify that the key stays excluded from overlay rows by design, not because it is pseudo or unstored.
  - `plans/Deferred-0003-agent-planning-open-workstreams-plan.md`: replace remaining Ctrl+/ overlay wording with generic shortcuts-overlay wording where the deferred work depends on current overlay behavior.

## Validation plan

- [x] Run a targeted structural check on the edited files with Biome so the patched JS/HTML/JSON/Markdown stays syntactically clean.
  - Ran `npx @biomejs/biome check ...` on the edited files. It reported unrelated pre-existing diagnostics and whole-file formatting debt in repo files outside this change slice, so it was useful as a guardrail but not as a clean pass gate for this task.
- [x] Run `npm run test:popup-visual` after the popup row changes.
- [x] If the popup visual test fails only because the approved baseline changed from `Ctrl + /` to `Alt + o`, update the popup snapshot intentionally and rerun the visual test to green.
- [x] Add a syntax-only validation pass for the edited JavaScript owners.
  - Ran `node --check extension/content.js`
  - Ran `node --check extension/settings-schema.js`
  - Ran `node --check extension/options-storage.js`
- [x] Manually verify by code inspection after the test run that:
  - `shortcutKeyShowShortcuts` fallback reads now point to `KeyO`.
  - popup modifier-domain logic no longer classifies `shortcutKeyShowShortcuts` as Ctrl-only.
  - `shortcutKeySearchConversationHistory` still resolves to `KeyK`.

## Stop rules

- [x] Do not broaden this into an overlay redesign, shortcut-list reshuffle, or model-picker cleanup.
- [x] Do not change user-customized stored bindings outside the shipped default/fallback behavior.
- [x] Do not edit `_locales` strings unless a concrete tooltip or label mismatch appears; the current copy does not encode the old modifier.
