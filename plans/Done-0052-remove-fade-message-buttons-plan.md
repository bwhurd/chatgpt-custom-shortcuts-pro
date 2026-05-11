# Remove Fade Message Buttons

## Goal

- [x] Remove the `Fade Message Buttons` popup setting and all shipped code that depends on `fadeMessageButtonsCheckbox`.

## Scope

- [x] Remove the popup row, locale strings, defaults, schema entries, fixture data, runtime style/hover behavior, and test-only extension marker references tied only to this setting.
- [x] Keep unrelated fade behavior intact, including slim sidebar fade, toast fading, bottom bar opacity/fade, disclaimer hiding, and shortcut behavior.
- [x] Update old notes so the removed setting is not described as an active feature.

## Likely owning files

- [x] `extension/popup.html`
- [x] `extension/popup.js`
- [x] `extension/options-storage.js`
- [x] `extension/settings-schema.js`
- [x] `extension/content.js`
- [x] `extension/_locales/*/messages.json`
- [x] `tests/fixtures/settings.json`
- [x] `tests/playwright/chatgpt-scenario-benchmark.mjs`
- [x] `tests/playwright/chatgpt-load-profiler.user.js`
- [x] `CHANGELOG.md`

## Implementation plan

- [x] Remove the popup control and user-facing strings.
- [x] Remove `fadeMessageButtonsCheckbox` from defaults, schema hydration, fixtures, and preset data so import/export and sync no longer treat it as an active option.
- [x] Remove the content-script runtime that injects `csp-fade-message-buttons-style` and listens for the setting.
- [x] Remove test marker checks for the deleted style id.
- [x] Update old changelog notes to clearly mark the feature as removed.

## Validation

- [x] Run `npm run validate:keys`.
- [x] Run `npx biome check` on changed source/test files.
- [x] Search for removed identifiers to confirm no active code references remain.
