# Pro Standard Extended Shortcuts Plan

## Goal

- [x] When model refresh detects an available Configure-dialog `Pro` row, show two optional Model Picker shortcut rows: `Switch model to Pro Standard` and `Switch model to Pro Extended`.

## Scope

- [x] Reuse the existing catalog-backed popup visibility pattern used by optional Thinking Light/Heavy rows.
- [x] Route activation through the Configure dialog by selecting `Pro`, then selecting the requested Standard/Extended thinking effort.
- [x] Keep defaults blank unless the user assigns keys.

## Likely owning files

- [x] `extension/shared/model-picker-labels.js`
- [x] `extension/popup.html`
- [x] `extension/popup.js`
- [x] `extension/content.js`
- [x] `extension/settings-schema.js`
- [x] `extension/options-storage.js`
- [x] `extension/_locales/*/messages.json`
- [x] `extension/shared/shortcut-action-metadata.js`
- [x] `tests/fixtures/settings.json`
- [x] `tests/model-picker-slot-uniqueness.mjs`

## Validation

- [x] Run `node --check extension/content.js`.
- [x] Run `node --check extension/popup.js`.
- [x] Run `node tests/validate-keys.js`.
- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Run Biome on changed source/test files.

## Done when

- [x] The popup hides the new Pro Standard/Extended rows before a Pro catalog is present and shows them after a Pro row scrapes.
- [x] The overlay and key validator know about the new keys.
- [x] The runtime handlers select Pro Standard/Extended without affecting existing Thinking Standard/Extended/Light/Heavy behavior.
