# Plan: TFEL / Configure Models Canonical Bindings

## Goal

- Keep the current extraction flow mostly intact.
- Make TFEL, the Configure Models grid, and the config combo dropdown list behave like one coherent system.
- Make visible labels, hotkeys, highlighting, click behavior, and reload persistence match the same canonical commands.

## Terms

- `TFEL`
  - first row
  - top row of the popup model selector UI
  - the active front-end action list for the active backend config
- `Configure Models grid`
  - second row under the compact `Configure Models` label
  - clickable popup representation of the backend config combo dropdown list
- `Config combo dropdown list`
  - backend list reached from `Configure...`
  - canonical backend options:
    - `configure-latest`
    - `configure-5-2`
    - `configure-5-0-thinking-mini`
    - `configure-o3`

## Current Reality

- `modelPickerKeyCodes` is still a flat persistent array.
- `modelNames` is still dynamic/local-only scraped label storage.
- Popup and content already share grouped metadata, but the current first row is still effectively treated like a static row, not a view of the active backend config.
- `Configure...` is still just slot 2 in the current model grid behavior, not yet the single persistent command the spec now requires.
- `Use latest model` has no stable `data-testid` in the supplied TFEL HTML. Do not make future behavior depend on clicking that row by localized text.
- The supplied `configure-o3` prose conflicts with the supplied `configure-o3` TFEL HTML. Implementation should trust live DOM signals at runtime and keep the inference path conservative.

## Canonical Commands

- `instant`
  - one canonical command shared by TFEL when `configure-latest` is active and when `configure-5-2` is active
- `thinking`
  - one canonical command shared by TFEL when `configure-latest` is active and when `configure-5-2` is active
- `configure`
  - one canonical persistent TFEL command across every state
  - always the last TFEL item
  - always opens the config combo dropdown list
  - default hotkey target: `Alt+0`
- `configure-latest`
  - canonical backend-config command
  - appears in the Configure Models grid as the backend latest option
  - appears in TFEL only as `Use latest model` when latest is not already active
- `configure-5-2`
  - canonical backend-config command
  - second-row Configure Models item
  - drives the TFEL state that exposes `Instant`, `Thinking`, `Use latest model`, `Configure...`
- `configure-5-0-thinking-mini`
  - canonical backend-config command
  - second-row Configure Models item
  - appears in TFEL as `Thinking mini`
- `configure-o3`
  - canonical backend-config command
  - second-row Configure Models item
  - appears in TFEL as `o3`

## TFEL State Map

- Active `configure-latest`
  - TFEL shows:
    - `instant`
    - `thinking`
    - `configure`
- Active `configure-5-2`
  - TFEL shows:
    - `instant`
    - `thinking`
    - `configure-latest` rendered as `Use latest model`
    - `configure`
- Active `configure-5-0-thinking-mini`
  - TFEL shows:
    - `configure-5-0-thinking-mini` rendered as `Thinking mini`
    - `configure-latest` rendered as `Use latest model`
    - `configure`
- Active `configure-o3`
  - TFEL shows:
    - `configure-o3` rendered as `o3`
    - `configure-latest` rendered as `Use latest model`
    - `configure`

## Configure Models Grid Map

- The second row is always the backend config selector.
- It always contains exactly:
  - `configure-latest`
  - `configure-5-2`
  - `configure-5-0-thinking-mini`
  - `configure-o3`
- It is not a duplicate of TFEL.
- Clicking a second-row item should behave like selecting that same option from the config combo dropdown list.
- The active second-row item must always be highlighted with `#4da3ff`.
- Every second-row item must use pointer cursor on hover.

## Mission-Critical Notes

- Keep the flat canonical storage slots if possible, but make them canonical command slots, not “whatever happens to be visible right now.”
- Recommended canonical slot meaning:
  - slot 0: `instant`
  - slot 1: `thinking`
  - slot 2: `configure`
  - slot 3: `configure-latest`
  - slot 4: `configure-5-2`
  - slot 5: `configure-5-0-thinking-mini`
  - slot 6: `configure-o3`
- The first row should become a presentation of canonical commands for the active backend config, not an independent storage row.
- `configure-latest`, `configure-5-0-thinking-mini`, and `configure-o3` can safely execute via the backend configure path every time, even when they appear in TFEL. That avoids relying on localized unlabeled TFEL rows.
- `Use latest model` should be a TFEL alias for canonical `configure-latest`, not a separate stored command.
- `Thinking mini` in TFEL should be a TFEL alias for canonical `configure-5-0-thinking-mini`.
- `o3` in TFEL should be a TFEL alias for canonical `configure-o3`.
- `Configure...` must remain one persistent command across every state. Its hotkey must follow the canonical command, not the visible slot order.
- Do not rely on `modelNames` for persistence of active backend config or canonical bindings:
  - `modelNames` is intentionally excluded from Drive save/restore and local export/import
  - it remains useful for dynamic label extraction only
- Add a dedicated persisted active-config setting in sync storage for the active backend config. That setting should participate in normal settings persistence, unlike `modelNames`.
- Reload persistence requires more than popup highlight restoration:
  - if persisted active config is non-latest, content must restore that backend config after page load once the model selector is available
- Manual model changes on the page must also update the stored active backend config so the popup stays truthful.
- Use language-agnostic selectors wherever possible:
  - `data-testid="model-configure-modal"`
  - `#model-selection-label` + nearby `button[role="combobox"][aria-controls]`
  - combobox-controlled `role="listbox"` / `role="option"`
  - `data-testid="close-button"`
- Do not make the implementation depend on clicking `Use latest model` by text. The supplied HTML shows no stable `data-testid` for that row.

## Recommended Fresh-Install Defaults

- Keep:
  - `instant` = `Digit1`
  - `thinking` = `Digit2`
- Move:
  - `configure` = `Digit0`
- Recommended for canonical backend commands:
  - `configure-latest` = `Digit3`
  - `configure-5-2` = `Digit4`
  - `configure-5-0-thinking-mini` = `Digit5`
  - `configure-o3` = `Digit6`
- Upgrade migration must be conservative:
  - move `configure` to `Digit0` only when the old value is still the untouched default path
  - preserve user customizations
  - never silently steal an occupied user key

## Checklist

- [ ] Add shared metadata helpers that can derive:
  - canonical command registry
  - TFEL presentation row for the active backend config
  - second-row Configure Models grid
  - view-specific alias labels for the same canonical command
- [ ] Add a dedicated sync-storage key for the active backend config and seed it in `OPTIONS_DEFAULTS`.
- [ ] Update migrations/defaults/reset flows so `configure` becomes the stable `Alt+0` command without clobbering customized installs.
- [ ] Refactor popup first-row rendering so TFEL is derived from the active backend config, not hard-coded as `Instant / Thinking / Configure...`.
- [ ] Keep the second-row Configure Models grid permanently mapped 1:1 to backend config commands.
- [ ] Make the second-row grid clickable, blue-highlighted for the active config, and immediately re-render TFEL after a click.
- [ ] Keep duplicate/conflict labels view-aware:
  - second row should use backend-config labels
  - TFEL should use TFEL alias labels like `Use latest model`
- [ ] Make content infer the active backend config from reliable DOM signals and persist it whenever the live state changes.
- [ ] Make TFEL hint labeling use the active TFEL state map so every visible hotkey label matches the actual command it invokes.
- [ ] Make `configure-latest`, `configure-5-0-thinking-mini`, and `configure-o3` use the robust configure-path runner rather than fragile TFEL-row text selection.
- [ ] Restore persisted non-latest backend config on reload once the model selector is ready.
- [ ] Keep overlay generation on the same shared source of truth if shared model metadata changes during implementation.

## Validation Targets For The Implementation Pass

- `configure-latest`
  - TFEL shows `Instant`, `Thinking`, `Configure...`
  - second-row `configure-latest` highlighted blue
- `configure-5-2`
  - TFEL shows `Instant`, `Thinking`, `Use latest model`, `Configure...`
  - visible hotkey for `Use latest model` triggers `configure-latest`, not `Configure...`
  - `Configure...` is still visible and labeled
- `configure-5-0-thinking-mini`
  - TFEL shows `Thinking mini`, `Use latest model`, `Configure...`
  - `Thinking mini` stays canonically tied to second-row `configure-5-0-thinking-mini`
- `configure-o3`
  - TFEL mapping must follow the actual live DOM/runtime state and update storage accordingly
  - verify the prose-vs-inspector mismatch before locking final inference rules
- Reload
  - active backend config restores correctly
  - second-row highlight restores correctly
  - TFEL first row restores correctly
  - customized hotkeys remain attached to the same canonical commands
