# Spec: Popup Settings Validator

Use this when changing or repairing:
- `tests/validate-keys.js`
- `tests/lib/settings-wiring-validator.js`
- popup/settings wiring validation rules
- supplemental validator inventory rules
- popup-backed settings contract checks across `popup.html`, `options-storage.js`, `popup.js`, `settings-schema.js`, `content.js`, locales, and exported settings fixtures

This is the durable reference for the repo's static settings-wiring validator. It describes what the validator proves, what it reads, what it intentionally skips, and how to extend it without turning it into a fragile runtime test.

## Purpose

The popup settings validator is a static wiring-contract check.

Its job is to prove that popup-backed settings are wired consistently across the repo's authoritative files without running the extension in the browser.

It is meant to answer questions like:
- does this popup-backed setting exist in the right source-of-truth files?
- do the popup/storage/schema defaults still agree?
- do the locale keys exist everywhere they should?
- for selected runtime-bound shortcuts, does the expected content-side binding still point at the same key?

It is not meant to prove that the live ChatGPT page still exposes the same DOM selectors or that runtime behavior still works end to end in the browser.

## Owning files

- `tests/validate-keys.js`
  - thin CLI entrypoint
  - resolves repo root, runs the validator helper, prints the report, exits non-zero on failure
- `tests/lib/settings-wiring-validator.js`
  - main validator logic
  - popup inventory extraction
  - authoritative source loading
  - rule sets, supplemental inventory, normalization, and reporting
- `extension/popup.html`
  - primary inventory source of truth for popup-backed settings
- `extension/options-storage.js`
  - canonical stored defaults source of truth via `OPTIONS_DEFAULTS`
- `extension/popup.js`
  - popup default and shortcut fallback sources of truth via:
    - `EXPLICIT_PRESET_OVERRIDES`
    - `DEFAULT_SHORTCUT_CODE_FALLBACKS`
- `extension/settings-schema.js`
  - schema-side membership and metadata source of truth
- `extension/content.js`
  - narrow runtime proof-point source for selected explicitly bound settings/shortcuts
- `tests/fixtures/settings.json`
  - export/import key coverage source, not shipped default-value truth
- `extension/_locales/*/messages.json`
  - popup label/tooltip locale coverage source

## Core posture

### Primary inventory rule

`extension/popup.html` is the primary inventory source of truth for popup-backed settings.

The validator should discover ordinary popup-backed settings from `data-sync` controls in `popup.html`, not from a large manual allowlist.

### Supplemental inventory rule

Only settings that are real but intentionally not sourced from `popup.html` should live in the validator's supplemental manifest.

Keep that list small and explicit.

Use the supplemental manifest for cases like:
- hidden legacy settings that still persist in storage/export
- popup-excluded defaults that still matter to contract checks
- out-of-scope persisted/exported data that must remain visible to the validator

Do not use the supplemental manifest as a dumping ground for ordinary popup-backed controls.

### Static-only rule

This validator is static.

It may read source files, evaluate small declarative modules in a sandbox, and search for narrow proof patterns, but it should not:
- launch Playwright
- execute the extension in Chrome
- inspect the live ChatGPT page
- scrape runtime DOM
- claim to prove semantic browser behavior

## Out of scope

The validator intentionally does not own:
- model picker grid slot validation
- generated `mp-input` / `#model-picker-grid` controls
- live selector validity on `chatgpt.com`
- ChatGPT menu traversal or popup/dropdown scrape coverage
- end-to-end shortcut execution behavior

The model picker grid is excluded because its generated/dynamic wiring is materially different from ordinary popup-backed settings and is validated separately.

## Inventory extraction

The validator parses `extension/popup.html` with `cheerio` and collects real popup-backed controls from elements with `data-sync`.

For each collected control it records:
- storage key
- DOM id
- control kind
- HTML default value or checked state
- nearby popup label i18n key
- nearby popup tooltip i18n key

### Control kinds

The validator currently distinguishes:
- `shortcut`
- `checkbox`
- `radio`
- `range`
- `color`
- `textarea`
- `select`
- generic `text`

Rule selection depends on the control kind.

### Model picker exclusion

The validator must exclude model picker grid controls by rule, not by broad manual key allowlisting.

Current exclusion patterns include:
- `.mp-input`
- anything under `#model-picker-grid`
- ids like `mpKeyInput-*`

If model picker rendering changes, update the exclusion rule rather than broadening inventory manually.

## Authoritative source loading

The validator should prefer deterministic, narrow source loading over executing the full extension.

### `options-storage.js`

Load `OPTIONS_DEFAULTS` by evaluating only enough of `extension/options-storage.js` in a Node `vm` sandbox with a stub `OptionsSync`.

Goal:
- recover canonical stored defaults
- avoid full extension execution

### `settings-schema.js`

Load `window.CSP_SETTINGS_SCHEMA` by evaluating `extension/settings-schema.js` in a small `window` sandbox.

Goal:
- recover schema membership and metadata

### `popup.js`

Do not execute the whole popup script.

Extract and evaluate only the object literal blocks needed for validation:
- `EXPLICIT_PRESET_OVERRIDES`
- `DEFAULT_SHORTCUT_CODE_FALLBACKS`

The validator may use a small brace-matching parser for this.

### `content.js`

Do not execute `extension/content.js`.

Use narrow proof-point pattern checks only for explicitly audited runtime-bound settings/shortcuts.

### `tests/fixtures/settings.json`

Treat `tests/fixtures/settings.json` as export/import key coverage only.

Do not treat it as the source of truth for shipped default values.

This distinction matters because the fixture may intentionally lag or preserve migrated/exported shapes that are not the same thing as shipped defaults.

## Effective popup defaults

The validator should construct an effective popup-default map that mirrors popup seeding behavior closely enough for contract comparison.

Current shape:
1. start from `OPTIONS_DEFAULTS`
2. exclude keys filtered by `settings-schema.js` `excludeDefaultsKeys`
3. coerce shortcut-like keys into `KeyboardEvent.code` form
4. coerce slider defaults into popup-comparable numeric form
5. overlay `EXPLICIT_PRESET_OVERRIDES`

Use this map to compare popup HTML defaults against popup/storage/schema expectations.

## Shortcut normalization invariants

Shortcut comparisons should not compare raw visible characters by eye.

The validator should normalize popup-visible shortcut defaults into `KeyboardEvent.code`.

Current normalization expectations:
- letters map to `KeyX`
- digits map to `DigitX`
- punctuation and bracket keys map to their canonical code names
- arrow glyphs like `↑` and `↓` map to `ArrowUp` / `ArrowDown`
- blank values map to empty or NBSP semantics as appropriate for the surface under test

If a new display character appears and the validator cannot map it deterministically, fail loudly instead of silently guessing.

## Rule families

The validator should use explicit rule families by setting kind rather than one generic “must exist everywhere” check.

### Core popup-backed rule

Ordinary popup-backed settings should generally satisfy:
- present in popup inventory
- present in `OPTIONS_DEFAULTS`
- present in effective popup defaults
- present in exported settings fixture
- popup label/tooltip locale coverage exists where those keys are present

### Popup toggle / schema-hydrated UI rule

For popup-backed toggles and related UI controls, the validator should also check the relevant schema-side membership:
- `content.visibilityDefaults`
- `content.visibilityExtraKeys`
- `popup.radioGroups`

Which schema surface is required depends on the control kind.

### Popup shortcut rule

For popup-backed shortcuts, the validator should additionally check:
- popup HTML default normalizes to a canonical code
- normalized popup default matches:
  - `OPTIONS_DEFAULTS`
  - effective popup defaults
  - `shortcuts.defaultCodeByKey` when present
  - `DEFAULT_SHORTCUT_CODE_FALLBACKS` when present
- `shortcuts.labelI18nByKey` contains the key unless it is intentionally deprecated
- `shortcuts.overlaySections` contains the key unless it is intentionally deprecated or deliberately out of overlay scope

## Prototype rules

The validator currently has two explicit prototype checks. Keep them working unless the validator contract itself changes.

### `clickToCopyInlineCodeEnabled`

This is the standard popup-toggle prototype.

It should prove the normal popup-toggle path by requiring:
- popup inventory presence
- `OPTIONS_DEFAULTS` presence
- `EXPLICIT_PRESET_OVERRIDES` presence
- `settings-schema.js` `content.visibilityDefaults` presence
- exported fixture presence
- locale coverage

### `shortcutKeyShowOverlay`

This is the popup-shortcut prototype.

It should prove the popup-shortcut path by requiring:
- popup inventory presence
- `OPTIONS_DEFAULTS` presence
- `EXPLICIT_PRESET_OVERRIDES` presence
- `settings-schema.js`:
  - `shortcuts.defaultCodeByKey`
  - `shortcuts.labelI18nByKey`
  - `shortcuts.overlaySections`
- `popup.js` `DEFAULT_SHORTCUT_CODE_FALLBACKS` presence
- exported fixture presence
- narrow `content.js` proof points on the same key

### Content-side proof points

For `shortcutKeyShowOverlay`, content-side checks should stay narrow and deterministic.

Current proof-point expectations include:
- schema-backed default usage in content shortcut defaults
- `chrome.storage.sync.get({ shortcutKeyShowOverlay: ... })` hydration on the same key
- `chrome.storage.onChanged` listener on the same key

Do not expand this into broad semantic runtime inference.

## Supplemental inventory

The supplemental manifest currently covers hidden, deprecated, or out-of-scope-but-real keys that should still remain visible to contract checks.

Examples include:
- `rememberSidebarScrollPositionCheckbox`
- `hideArrowButtonsCheckbox`
- `hideCornerButtonsCheckbox`
- `modelPickerKeyCodes`
- `modelNames`
- deprecated legacy shortcut keys still preserved in export/default data

For each supplemental key, keep the rule explicit about which surfaces are required, such as:
- `OPTIONS_DEFAULTS`
- exported fixture presence
- schema deprecation membership
- schema exclude-defaults membership

## Output contract

The validator should produce:
- short success output
- grouped failure output by key

Failure categories should stay explicit and actionable, for example:
- missing from `OPTIONS_DEFAULTS`
- missing from effective popup defaults
- missing from exported fixture
- missing locale key
- missing schema membership
- default mismatch between popup/storage/schema/fallback
- missing `content.js` proof point

Keep success output concise. The current success summary includes:
- overall pass line
- number of popup-backed controls validated
- number of supplemental keys validated
- confirmation that the prototype checks passed

## Repair expectations

If the validator fails, first determine which class of contract drift occurred:
1. popup inventory drift
2. storage default drift
3. popup explicit default drift
4. schema membership/metadata drift
5. locale drift
6. exported fixture drift
7. selected runtime proof-point drift

Fix the owning source of truth rather than weakening the validator to accommodate accidental divergence.

## Common failure modes

### Popup default mismatch

Usually means:
- popup HTML `value` or `checked` drifted from the canonical default path
- `OPTIONS_DEFAULTS` changed without matching popup/schema updates
- `EXPLICIT_PRESET_OVERRIDES` no longer matches the popup-visible default

### Missing fixture-only key report

Usually means:
- a real hidden/deprecated/out-of-scope key exists in exported settings but is not represented in popup inventory or the supplemental manifest

Fix by:
- adding the key to the supplemental manifest only if it is truly non-popup-backed
- otherwise fixing popup inventory coverage

### Missing schema membership

Usually means:
- popup control was added or changed without updating `settings-schema.js`

### Missing locale key

Usually means:
- popup label/tooltip wiring changed without updating every shipped locale file

### Missing content proof point

Usually means:
- an explicitly audited runtime-bound shortcut changed its key path in `content.js`
- or the validator's narrow proof rule needs a deliberate update because the runtime contract changed

## Maintenance rules

- Prefer updating the validator's rule families over piling on special cases.
- Add supplemental keys only when the key is real and intentionally outside popup inventory.
- Add explicit prototype/content proof rules only for settings where narrow runtime evidence materially improves confidence.
- Keep the validator deterministic and source-driven.
- Do not broaden it into a browser automation harness or live selector validator.

## Relationship to runtime selector validation

This validator is the popup/settings wiring validator only.

Runtime selector and shortcut target auditing is owned by `specs/0006-runtime-scrape-selector-validator-spec.md`, not this static settings validator. Keep these contracts separate:
- live page capture
- menu/popup traversal
- selector presence audits against inspector dumps
- no-token live activation probes for explicitly safe shortcut metadata

Do not merge that runtime selector-audit responsibility into this static popup/settings validator.

When adding a popup-backed shortcut setting, this validator should prove the static settings wiring. The runtime shortcut target metadata and any live probe classification belong in `extension/shared/shortcut-action-metadata.js` under the `0006` contract.
