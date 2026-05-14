# Popup Model Effort Grid Reorg Plan

## Goal

- [x] Reorganize the popup's model shortcut area so the generated `Switch Models` row, generated `Configure Models` row, and moved effort shortcut row each present as six compact grid tiles wide.
- [x] Move the existing Thinking and Pro effort shortcut controls out of the visible `Model Picker` section and into a new `Effort` row directly under the generated model-picker grid.
- [x] Keep model extraction, model-picker slot metadata, shortcut storage keys, import/export, duplicate handling, and runtime model-switch behavior unchanged.

## Current posture

- [x] `extension/popup.html` contains the static effort shortcut rows after the `Model Picker` header: `shortcutKeyThinkingStandard`, `shortcutKeyThinkingExtended`, `shortcutKeyThinkingLight`, `shortcutKeyThinkingHeavy`, `shortcutKeyProStandard`, and `shortcutKeyProExtended`.
- [x] `extension/popup.js` injects `#model-picker-grid` before `#mp-grid-anchor`; each generated group uses an inline `grid-template-columns: repeat(5, minmax(0, 1fr))`.
- [x] `extension/shared/model-picker-labels.js` owns the generated model-picker groups, slots, labels, and catalog-gated Thinking/Pro metadata; this plan should not change that source of truth.
- [x] `popup.js` excludes inputs inside `#model-picker-grid` from normal shortcut-input wiring, so the moved effort shortcut inputs must stay outside `#model-picker-grid`.
- [x] `syncCatalogGatedShortcutVisibility()` already controls optional Thinking Light/Heavy and Pro Standard/Extended row visibility from the model catalog.

## Scope

- [x] Touch only popup presentation surfaces unless validation exposes a direct layout dependency:
  `extension/popup.html`, `extension/popup.css`, `extension/popup.js`, and popup-only locale strings if needed.
- [x] Use popup-only display labels for the moved effort tiles:
  `Thinking Light`, `Thinking Standard`, `Thinking Extended`, `Thinking Heavy`, `Pro Standard`, and `Pro Extended`.
- [x] Add the `Effort` row label and conditionally show the `Pro Effort` label only when the Pro effort tiles are visible.
- [x] Remove the info icons and tooltip wiring from only the six moved effort tiles.

## Out of scope

- [x] Do not change `modelPickerKeyCodes`, model-picker slot numbers, `ModelLabels` canonical action labels, catalog extraction, or stored shortcut keys.
- [x] Do not change `settings-schema.js` overlay labels or grouping unless a validator failure proves the existing shortcut wiring contract requires it.
- [x] Do not change the generated top-grid item list, Configure Models click handling, active-state handling, import/export, or duplicate-shortcut conflict behavior.
- [x] Do not add or remove Chrome permissions or manifest host access.

## Likely owning files

- [x] `extension/popup.html`
  - Move the six existing effort shortcut rows to a new full-width effort-grid wrapper after `#mp-grid-anchor` and before the `Model Picker` section header.
  - Keep their existing `id`, `name`, `data-sync`, `data-thinking-option-id`, and `data-pro-option-id` attributes.
- [x] `extension/popup.css`
  - Add compact six-column styling for the generated model picker rows and the new effort row.
  - Keep the effort row outside `#model-picker-grid` while visually matching the generated model-picker tiles.
- [x] `extension/popup.js`
  - Change generated model-picker row layout from five to six columns.
  - Preserve catalog-gated visibility and update only the visual label visibility for `Pro Effort`.
- [x] `extension/_locales/en/messages.json`
  - Add popup-only short labels only if static text should remain i18n-backed without changing existing overlay label messages.

## Implementation plan

- [x] Make the generated model-picker rows six columns wide:
  - Replace the current hardcoded `repeat(5, minmax(0, 1fr))` layout in `buildGroupWrapper()` with a six-column layout for `.mp-shortcut-grid-row`.
  - Keep the generated action arrays and slot assignments untouched.
  - Update the stale `popup.html` comment that still describes the model picker grid as `5x2`.
- [x] Create a separate effort grid wrapper in `popup.html`:
  - Place it after `#mp-grid-anchor` so it renders under the injected `#model-picker-grid`.
  - Do not nest it inside `#model-picker-grid`, because those inputs must remain part of the normal shortcut-input path.
  - Order the tiles as columns 1-6: Thinking Light, Thinking Standard, Thinking Extended, Thinking Heavy, Pro Standard, Pro Extended.
- [x] Preserve stable column placement for optional catalog-gated tiles:
  - Assign explicit grid columns or placeholder behavior so Pro Standard and Pro Extended remain the fifth and sixth effort tiles when visible.
  - Keep unavailable optional tiles disabled and hidden from accessibility/focus behavior, matching the existing catalog-gated intent.
- [x] Add row labels:
  - Add an `Effort` label aligned with the first effort tile.
  - Add a `Pro Effort` label aligned with the fifth effort tile.
  - Default `Pro Effort` hidden, then toggle it from the same catalog-gated visibility pass that shows/hides Pro Standard and Pro Extended.
- [x] Shorten only the popup-visible effort labels:
  - Keep existing storage keys and existing schema/overlay labels intact.
  - Use popup-only display text or popup-only i18n keys rather than changing `label_switchToThinking*` and `label_switchToPro*` messages that other surfaces consume.
- [x] Remove effort info icons and tooltips:
  - Delete the six moved effort rows' `info-icon-tooltip` spans and their `data-tooltip` references.
  - Do not remove tooltip keys from locale files unless a targeted unused-key check exists and confirms they are popup-only dead strings.
- [x] Keep popup filters and refresh behavior working:
  - Re-run the existing search/filter visibility update after catalog-gated visibility changes.
  - Ensure hidden optional effort tiles do not produce visible blanks during filtering or model-catalog refresh states.

## Validation

- [x] Run `node --check extension/popup.js`.
- [x] Run `npm run validate:keys`.
- [x] Run `npx biome check extension/popup.html extension/popup.css extension/popup.js extension/_locales/en/messages.json`.
- [x] Run `npm run screenshot:popup` and inspect the popup screenshot for:
  - six compact tiles across `Switch Models`;
  - six compact tiles across `Configure Models`;
  - an `Effort` row below the generated model-picker grid;
  - `Pro Effort` aligned above columns 5-6 only when Pro effort tiles are visible;
  - no info icons on the six moved effort tiles.
- [x] If the existing popup visual suite is available and the screenshot posture changes intentionally, run `npm run test:popup-visual` before deciding whether a baseline update is needed.
  - Result: failed only at the approved screenshot comparison because the intentional layout change produced a 1100x2707 screenshot versus the 1100x2737 baseline with 2% pixel difference. Baseline was not updated pending manual review.

## Done when

- [x] The popup shows the generated model-picker rows at six tiles wide without changing the generated slot list or saved model-picker shortcut values.
- [x] The effort shortcuts appear as a compact third row with the requested order and short labels.
- [x] Pro effort controls and the `Pro Effort` label appear only under the same Pro availability conditions that currently show Pro Standard and Pro Extended.
- [x] The six moved effort controls still save, clear, import, export, and conflict-check through their existing `shortcutKey*` storage keys.
- [x] The moved effort controls no longer show info icons or tooltip bubbles.

## Related specs

- [x] `specs/0001-adding-new-settings-spec.md`
- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
