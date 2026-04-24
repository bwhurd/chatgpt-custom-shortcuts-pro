# Spec: Adding New Settings

This file is the durable reference for adding new settings to ChatGPT Custom Shortcuts Pro.

Use it when you need to add:
- a new popup toggle
- a new slider, color value, or other non-boolean option
- a new content-consumed setting
- a new early bootstrap gate
- a new setting that must survive import/export, cloud sync, and legacy installs

This is not a backlog file. It is a repair and implementation reference.

## Why this exists

`AGENTS.md` already has a short wiring map, but the full setting path in this repo is easy to miss because defaults, popup seeding, export/import, content hydration, and early bootstrap code do not all live in one file.

This reference explains the full path and the common failure modes.

## Core rule

`chrome.storage.sync` is the single source of truth for settings.

Everything else should either:
- seed from it
- render from it
- or gate behavior from it

If a new setting does not flow back to `chrome.storage.sync`, it is not really wired.

## File responsibilities

### `options-storage.js`

This is the storage source of truth.

Why it matters:
- defines `OPTIONS_DEFAULTS`
- controls first-run stored defaults
- controls which keys are considered real option keys
- drives cloud sync allowlisting through `OPTIONS_DEFAULTS`
- is the safest place to keep back-compat/migration logic

If a setting is missing here:
- popup guardrails may warn
- first-run storage may not seed it
- cloud save/restore may ignore it
- legacy installs may behave inconsistently

### `popup.js`

This is the popup default and import/export source of truth.

Why it matters:
- `DEFAULT_PRESET_DATA` is used for popup seeding
- export/import allowlisting depends on the popup defaults set
- popup warnings check `data-sync` keys against defaults

Important detail:
- `DEFAULT_PRESET_DATA` is built from `OPTIONS_DEFAULTS`, then overridden by `EXPLICIT_PRESET_OVERRIDES`
- for user-facing settings, especially toggles and non-boolean popup values, check whether the key should also exist in `EXPLICIT_PRESET_OVERRIDES`

### `popup.html`

This is the user-visible control.

Why it matters:
- generic popup sync wiring depends on `data-sync`
- label order and section placement live here
- tooltip wiring lives here

### `settings-schema.js`

This is the shared content-side settings contract.

Why it matters:
- `content.visibilityDefaults` seeds `window.<settingKey>` in `content.js`
- `visibilityExtraKeys` handles non-boolean content values fetched alongside those defaults
- popup radio-group definitions live here

### `content.js`

This is where most content-consumed settings become behavior.

Important split:
- normal content settings can rely on schema-driven `window.<settingKey>`
- very early behavior cannot

### Early bootstrap files

Examples:
- `lazy-fast-bootstrap.js`

These run before normal content hydration.

Important rule:
- if a feature must be gated at `document_start` or before `content.js` initializes, it must read `chrome.storage.sync` itself
- schema-driven `window.<settingKey>` hydration happens too late for this case

## Setting categories

## 1. Standard popup toggle

Use this for a normal checkbox that controls runtime behavior after the content script is loaded.

### Required checklist

- `options-storage.js`
  - add `settingKey: defaultValue` to `OPTIONS_DEFAULTS`
- `popup.html`
  - add `<input data-sync="settingKey" ... type="checkbox">`
- `_locales/*/messages.json`
  - add label key
  - add tooltip key if user-visible
- `popup.js`
  - if the setting is part of normal popup defaults, make sure it exists in `DEFAULT_PRESET_DATA`
  - in practice, that usually means:
    - it exists in `OPTIONS_DEFAULTS`
    - and it is added to `EXPLICIT_PRESET_OVERRIDES` if the popup currently keeps that section explicit
- `settings-schema.js`
  - add it to `content.visibilityDefaults` if `content.js` should read `window.settingKey`
- `content.js`
  - implement behavior from `window.settingKey`
- `CHANGELOG.md`
  - one short line if user-visible

## 2. Content-consumed non-boolean setting

Examples:
- sliders
- color values
- mode strings

### Required checklist

- `options-storage.js`
  - add real stored default
- `popup.html`
  - add `data-sync`
- `popup.js`
  - make sure popup coercion/default handling covers the value type
- `settings-schema.js`
  - if content consumes it and it is not a simple boolean, add it to `visibilityExtraKeys`
- `content.js`
  - consume the hydrated value

## 3. Early bootstrap gate

Use this when the feature must be stopped before page-world injection or other early work.

This is the category that `lazyFastModeEnabled` falls into.

### Required checklist

- do all normal toggle steps above
- also update the early bootstrap file to read `chrome.storage.sync` directly
- keep the default off unless there is a strong reason not to
- verify:
  - off state means no bootstrap side effects
  - on state enables the early path only after reload

### Important invariant

If a feature is supposed to be fully inert when disabled, it is not enough to hide its later UI.

You must gate the earliest entry point that injects or installs the feature.

For Fast Mode that meant:
- gate `lazy-fast-bootstrap.js`
- gate the active native controller in `content.js`

## 4. Radio-group settings

Use this when several storage keys are mutually exclusive.

### Required checklist

- `options-storage.js`
  - add all keys with defaults
- `popup.html`
  - add `data-sync` on each input
- `settings-schema.js`
  - update `popup.radioGroups`

## 5. Shortcut settings

Shortcut keys are not normal toggles.

For new shortcuts, also update:
- `content.js` shortcut defaults and handler maps
- `settings-schema.js`
  - `shortcuts.labelI18nByKey`
  - `shortcuts.overlaySections`
- `extension/shared/shortcut-action-metadata.js`
  - add an explicit shortcut action metadata row
  - declare validation mode, ordered target refs, required scrape states, activation probe mode/setup, and notes for manual-only or not-applicable shortcuts
  - add or reuse target descriptors for any ChatGPT DOM target the shortcut touches

When changing a shipped shortcut default, also update:
- `options-storage.js` `OPTIONS_DEFAULTS`
- `popup.js` popup default preset data
- any matching `content.js` runtime default map
- a narrow `options-storage.js` migration only if the old default should move automatically for untouched installs and the new target key is still free

Do not treat shortcut additions like ordinary checkbox settings.

The runtime selector validator is intentionally deterministic. Do not rely on it to infer shortcut targets from handler bodies. A new runtime shortcut should fail validation until its explicit metadata exists.

After adding or changing shortcut metadata:
- run `node tests/playwright/devscrape-wide.mjs --action check-wide` against the latest saved scrape to catch metadata, target-ref, and scrape-state drift without opening the browser
- run `node tests/playwright/devscrape-wide.mjs --action probe-shortcuts --shortcut-action-id <actionId>` only when the shortcut has a safe live activation probe and the saved report indicates a live behavior needs rechecking
- reserve full `validate-wide --probe-shortcuts` for a complete audit, not every metadata edit

## The minimum safe wiring path

If you want the shortest reliable rule set, use this:

### For a new popup toggle that affects content behavior

1. Add the key to `OPTIONS_DEFAULTS`
2. Add the popup control with `data-sync`
3. Add locale strings
4. Add popup default coverage in `popup.js`
5. Add schema coverage in `settings-schema.js`
6. Add the actual runtime behavior in `content.js`
7. For shortcuts, add `extension/shared/shortcut-action-metadata.js` coverage before running validation
8. Validate stored value, popup state, and page behavior

If any of those are skipped, the setting is likely only partially wired.

## Import/export and cloud sync behavior

### Export/import

Popup file export/import is driven from `popup.js` using `DEFAULT_PRESET_DATA` plus shortcut keys.

That means a new setting should be visible to import/export if:
- it exists in `DEFAULT_PRESET_DATA`
- and it is not explicitly excluded

### Cloud sync

Cloud sync uses `OPTIONS_DEFAULTS` as the allowlist through `storage.js`.

That means a new setting will participate in cloud save/restore if:
- it exists in `OPTIONS_DEFAULTS`

### Legacy installs

For legacy installs, the safest pattern is:
- set the new default in `OPTIONS_DEFAULTS`
- keep popup defaults aligned
- add a migration only if you need to normalize or backfill old data

For experimental or risky features:
- default should usually be `false`
- popup input should not hardcode `checked`

## Common failure modes

### Popup toggle appears, but does not persist

Usually caused by:
- missing `data-sync`
- missing key in `OPTIONS_DEFAULTS`
- missing popup default coverage

### Setting persists, but content never changes

Usually caused by:
- missing `settings-schema.js` coverage
- content logic not reading the setting
- using schema-driven hydration for a feature that actually needs early bootstrap gating

### Setting works on first run, but import/export misses it

Usually caused by:
- missing popup default coverage in `popup.js`

### Setting works locally, but cloud sync misses it

Usually caused by:
- missing key in `OPTIONS_DEFAULTS`

### Setting is “off” but feature still partially runs

Usually caused by:
- only gating later UI
- forgetting an earlier bootstrap or page-world entry point

## Worked example: `lazyFastModeEnabled`

This is the full pattern for a risky opt-in feature.

### Files touched

- `options-storage.js`
  - `lazyFastModeEnabled: false`
- `popup.js`
  - `DEFAULT_PRESET_DATA` / `EXPLICIT_PRESET_OVERRIDES` coverage
- `popup.html`
  - switch inserted between:
    - `moveTopBarToBottomCheckbox`
    - `fadeSlimSidebarEnabled`
- `settings-schema.js`
  - `content.visibilityDefaults.lazyFastModeEnabled = false`
- `_locales/*/messages.json`
  - label + tooltip keys
- `lazy-fast-bootstrap.js`
  - direct storage read at `document_start`
  - no bridge injection unless enabled
- `content.js`
  - no native Fast Mode controller install unless enabled

### Why this was more than a normal toggle

Fast Mode has two independent entry points:
- bootstrap/page-world injection
- content-world native controller

If only one was gated, the feature would not be truly inert.

## Validation checklist

When adding a new setting, validate at the level that matches the setting type.

### Popup validation

- control exists in the intended section/order
- label and tooltip render
- actual visible switch path writes storage

### Storage validation

- stored value changes in `chrome.storage.sync`
- default value is correct on a clean path

### Feature-off validation

If the setting is meant to disable a feature:
- confirm the feature is actually inert
- confirm no early script or hidden side effect still runs

### Feature-on validation

- confirm the intended behavior still works when enabled

### Legacy/default validation

- confirm default value is safe for existing users

## When to update this file

Update this reference if:
- popup default behavior changes
- import/export allowlisting changes
- cloud sync stops using `OPTIONS_DEFAULTS`
- schema-driven content hydration changes
- early bootstrap gating patterns change

### Settings source of truth and popup settings UI invariants

- `chrome.storage.sync` is the source of truth for user settings.
- When adding or changing a setting, update `extension/options-storage.js`, the popup wiring that reads or writes that setting, and any content/bootstrap path that reads, enforces, imports, exports, saves, or restores it.
- When editing popup settings controls, keep existing i18n keys unless the task requires new keys.
- When adding or changing a tooltip in popup settings UI, match the tooltip presence and structure used by nearby controls unless the task requires a different pattern.
- Keep shared-label behavior working for popup settings rows that use it.
