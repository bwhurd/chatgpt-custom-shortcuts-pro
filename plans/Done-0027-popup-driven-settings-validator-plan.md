# Popup-Driven Settings Validator Plan

## Goal

- [x] Replace the current loose `tests/validate-keys.js` behavior with a deterministic wiring validator that treats popup-backed controls in `extension/popup.html` as the primary inventory, uses a small explicit supplemental registry for non-popup-backed real settings, skips the model-picker grid, and reports actionable mismatches across the shipped wiring surfaces.

## Investigation findings

- [x] This is practical as a static wiring-contract check because the main surfaces are declarative and readable without running the extension: `popup.html` `data-sync` inputs, `options-storage.js` `OPTIONS_DEFAULTS`, `popup.js` `EXPLICIT_PRESET_OVERRIDES` and `DEFAULT_SHORTCUT_CODE_FALLBACKS`, `settings-schema.js`, locale message keys, and `tests/fixtures/settings.json`.
- [x] `tests/validate-keys.js` is currently too weak because it only compares popup input keys to exported fixture keys and cannot distinguish popup-backed settings from hidden, deprecated, derived, or model-picker-only data.
- [x] `clickToCopyInlineCodeEnabled` is a good prototype for a standard popup toggle: it appears in `popup.html`, `OPTIONS_DEFAULTS`, `EXPLICIT_PRESET_OVERRIDES`, `settings-schema.js` `content.visibilityDefaults`, and the exported fixture.
- [x] `shortcutKeyShowOverlay` is a good prototype for a popup shortcut: it appears in `popup.html`, `OPTIONS_DEFAULTS`, `popup.js` shortcut defaults/fallbacks, `settings-schema.js` shortcut metadata, `content.js` shortcut defaults/runtime binding, and the exported fixture.
- [x] The helper should validate wiring coverage, default alignment, and metadata presence, but it should not claim to prove semantic runtime behavior. Model picker grid items stay out of scope because their generated/dynamic wiring is materially different and is already manually checked.

## Scope

- [x] Keep the inventory source of truth anchored to `extension/popup.html` `data-sync` controls plus a tiny explicit supplemental manifest for hidden-but-real settings.
- [x] Skip model picker grid items and any dynamic model-slot controls entirely.
- [x] Validate only deterministic static wiring surfaces in this pass; do not add browser automation or attempt to simulate extension runtime behavior.
- [x] Keep `npm run validate:keys` working, either by upgrading `tests/validate-keys.js` directly or turning it into a thin entrypoint to the new helper.

## Implementation plan

- [x] Create a small validator module under `tests/`:
  - Likely files: `tests/validate-keys.js` plus a helper such as `tests/lib/settings-wiring-validator.js` or `tests/settings-wiring-validator.js`.
  - Keep the top-level script small: load sources, run checks, print grouped failures, exit non-zero on mismatch.

- [x] Build a popup-driven inventory extractor from `extension/popup.html`:
  - Parse with `cheerio`.
  - Collect only real popup-backed controls with `data-sync`.
  - Record for each control:
    - storage key
    - control kind: checkbox/radio/range/text shortcut/other
    - HTML default value or checked state when present
    - nearby label i18n key and tooltip i18n key when present, for locale validation and readable errors
  - Exclude model-picker-specific controls by selector/rule instead of broad allowlisting.

- [x] Add a narrow supplemental manifest for non-popup-backed or special-case keys:
  - Keep it explicit and tiny.
  - Each entry should declare:
    - key
    - kind
    - why it is not sourced from `popup.html`
    - which surfaces are required
  - Do not use this manifest as a dumping ground for ordinary popup-backed controls.
  - The finished helper covers hidden legacy settings plus out-of-scope export keys such as `modelPickerKeyCodes` and `modelNames`.

- [x] Load deterministic source data from the codebase without executing the full extension:
  - `options-storage.js`: evaluate only enough to recover `OPTIONS_DEFAULTS` in a sandbox with a stub `OptionsSync`.
  - `settings-schema.js`: evaluate in a tiny `window` sandbox and read `window.CSP_SETTINGS_SCHEMA`.
  - `popup.js`: extract the plain object-literal blocks for:
    - `EXPLICIT_PRESET_OVERRIDES`
    - `DEFAULT_SHORTCUT_CODE_FALLBACKS`
  - `content.js`: avoid whole-file execution; use narrow anchored extraction or regex checks only for the specific static maps/patterns the validator needs.
  - `tests/fixtures/settings.json`: treat as export/import key coverage only, not as the source of truth for shipped default values.

- [x] Define explicit rule sets by setting kind instead of one generic “must exist everywhere” check:
  - Popup toggle rule, prototype `clickToCopyInlineCodeEnabled`:
    - must exist in popup inventory
    - must exist in `OPTIONS_DEFAULTS`
    - must exist in `EXPLICIT_PRESET_OVERRIDES`
    - must exist in `settings-schema.js` `content.visibilityDefaults` when it is schema-hydrated
    - must exist in exported fixture keys
    - popup label/tooltip message keys must exist in all shipped locales
  - Popup shortcut rule, prototype `shortcutKeyShowOverlay`:
    - must exist in popup inventory as a shortcut/text input
    - popup HTML default character must normalize to the expected code
    - key must exist in `OPTIONS_DEFAULTS`
    - key must exist in `EXPLICIT_PRESET_OVERRIDES`
    - key must exist in `settings-schema.js`:
      - `shortcuts.defaultCodeByKey`
      - `shortcuts.labelI18nByKey`
      - `shortcuts.overlaySections` when the row is overlay-visible
    - key must exist in `popup.js` `DEFAULT_SHORTCUT_CODE_FALLBACKS` when that shortcut relies on a popup fallback path
    - key must exist in exported fixture keys
    - key must match a content-side runtime/default rule when it is one of the explicitly bound shortcuts covered by the validator

- [x] Keep content-side checks narrow and explicit:
  - Do not try to infer all runtime behavior from `content.js`.
  - Add a small registry for shortcuts/settings that need content-specific proof points.
  - For `shortcutKeyShowOverlay`, check deterministic patterns such as:
    - schema-backed default code usage
    - storage hydration on the same key
    - `chrome.storage.onChanged` listener on the same key
  - Leave broad semantic behavior checks to manual validation.

- [x] Normalize shortcut defaults in the validator instead of comparing raw popup display chars to code strings by eye:
  - Add a small internal char-to-code normalizer covering the popup shortcut defaults used in this repo.
  - Use it to compare:
    - popup HTML `value`
    - `OPTIONS_DEFAULTS` raw character form
    - popup/schema/content code-form defaults
  - Fail with a clear message when the validator encounters a new default character it cannot normalize, so the helper stays honest instead of silently guessing.

- [x] Make the output actionable:
  - Group failures by key.
  - Within each key, print the missing/mismatched surfaces.
  - Distinguish:
    - missing key
    - default mismatch
    - missing locale message
    - missing schema membership
    - missing content binding proof point
  - Keep success output short.

## Validation plan

- [x] Run the validator locally via `npm run validate:keys`.
- [x] Confirm it passes for the current `clickToCopyInlineCodeEnabled` toggle wiring.
- [x] Confirm it passes for the current `shortcutKeyShowOverlay` shortcut wiring.
- [x] Use the first live validator run as the mismatch proof step:
  - it caught a real stale popup default for `shortcutKeySearchConversationHistory`
  - it flagged the arrow-glyph normalization gap for `shortcutKeyScrollUpTwoMessages` / `shortcutKeyScrollDownTwoMessages`
  - it flagged missing supplemental coverage for deprecated export-only keys
- [x] Re-run `node tests/validate-keys.js` and `npm run validate:keys` after the fixes and confirm clean output.

## Done when

- [x] `tests/validate-keys.js` (or its new helper) inventories popup-backed settings from `popup.html` plus the explicit supplement and validates the deterministic wiring surfaces automatically.
- [x] The validator gives a clean pass for `clickToCopyInlineCodeEnabled` and `shortcutKeyShowOverlay` in the current repo state.
- [x] The validator intentionally ignores model picker grid items and does not require manual allowlisting for ordinary popup-backed settings.

## Related specs

- [x] `specs/0001-adding-new-settings-spec.md`
- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
