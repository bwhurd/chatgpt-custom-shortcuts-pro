# Plan: Model Selector Configure Actions

## Goal

- Extend the model selector so it supports deeper configure-path actions:
  - `Latest`
  - `5.2`
  - `5.0 Thinking Mini` (selects internal option `5.0`)
  - `o3`
- Show these as a second, tightly grouped row under the existing model picker row in the popup.
- Keep the in-app shortcuts overlay model grid and the popup model grid driven from the same source of truth.
- Preserve the current top-level model actions (`Instant`, `Thinking`, `Configure...`) and legacy submenu handling.

## Current Reality

- Popup and overlay are not fully shared today.
- Popup uses popup-local ordering logic in `popup.js`:
  - `CANON_ORDER = ['Instant', 'Thinking', 'Configure...']`
- Overlay falls back to `window.ModelLabels.defaultNames()` in `content.js`.
- Both consume `window.MODEL_NAMES` and `modelPickerKeyCodes`, but they build/render the grids independently.

- Current hotkey execution only supports direct visible menu rows.
- `content.js` model-switcher hotkeys resolve a flat index, open the model menu, then click a currently visible row.
- There is no current concept of a virtual action like:
  - open main menu
  - click `Configure...`
  - open combobox
  - choose deep option
  - click close

## Mission-Critical Notes

- Keep one flat `modelPickerKeyCodes` array if possible.
- That avoids a large ripple through:
  - duplicate/conflict logic
  - popup key capture
  - import/export
  - cloud save/restore
  - overlay hydration
- Current conflict labeling already uses `window.MODEL_NAMES`, so a single flattened action order is the least disruptive path.

- But a flat-array expansion has one important trap:
  - current defaults already prefill `modelPickerKeyCodes` with `Digit1` through `Digit0`
  - today only 3 model slots are visible, so hidden slots 4+ are harmless
  - if we simply surface 4 new configure actions, those hidden default digits become active immediately on existing installs
- Implementation must include a migration / default strategy so the new configure-row slots do **not** suddenly steal `Alt+4` through `Alt+7` from existing popup shortcuts.
- Safest direction:
  - keep top row defaults as-is
  - make newly surfaced configure-row slots blank by default
  - migrate existing hidden default digits in those newly visible slots to blank

- Popup currently merges partial stored names with fallback defaults.
- Overlay currently does **not**.
- If configure-row labels come from shared defaults, overlay hydration must also merge partial storage with fallback metadata or it will only show the scraped top row.

- `modelNames` is local-only and intentionally excluded from import/export/cloud sync.
- That is good for this feature.
- Configure-row labels should come from shared canonical metadata, not from cloud/import/export payloads.

- Current popup grid builder assumes a single flat grid.
- Current overlay builder assumes a single flat grid.
- The new UI needs grouped rendering:
  - existing main row
  - compact sublabel like `Configure Models`
  - second row for deep configure actions

## Reliable Selector / Path Notes From Inspector

- Top-level configure action:
  - `[data-testid="model-configure-modal"]`
- Configure dialog close:
  - `[data-testid="close-button"]`
- Model combobox inside configure dialog:
  - stable label id `#model-selection-label`
  - nearest `button[role="combobox"][aria-controls]`
- Deep options list:
  - `role="listbox"` with id from the combobox `aria-controls`
  - options are `role="option"`

- Selection strategy should stay language-agnostic where possible:
  - `Configure...` click by `data-testid="model-configure-modal"`
  - close by `data-testid="close-button"`
  - combobox by role + `aria-controls` + nearby `#model-selection-label`
- For deep options:
  - `5.2`, `5.0`, and `o3` are safe invariant values
  - `Latest` is not language-safe by text; with the provided HTML the safest non-text strategy is “first option in the listbox”
- `5.0 Thinking Mini` is popup/overlay display text only; the actual deep option target is `5.0`

## Recommended Architecture

- Add shared model-action metadata to `shared/model-picker-labels.js`.
- The shared helper should define:
  - grouped sections/rows
  - canonical display labels
  - flattened action order used for code indexing
  - helpers to merge scraped top-row names with shared fallback actions
- Recommended flattened order:
  1. `Instant`
  2. `Thinking`
  3. `Configure...`
  4. `Latest`
  5. `5.2`
  6. `5.0 Thinking Mini`
  7. `o3`

- Treat deep configure entries as virtual model actions, not direct DOM rows.
- Main row actions remain direct row clicks.
- Configure-row actions become descriptors that carry:
  - display label
  - action kind
  - deep target identifier/value

- Popup and overlay should both render from the same shared grouped metadata.
- Popup needs a compact subheading between rows, not a full `blank-row section-header`.
- Overlay should mirror the same grouping so the model grid does not drift from the popup.

## Implementation Plan

### Phase 1: Shared source of truth

- Move popup-local model ordering out of `popup.js` into `shared/model-picker-labels.js`.
- Add grouped metadata for:
  - primary actions
  - configure actions
- Add helper(s) for:
  - flattened action order
  - fallback display names
  - merging scraped names with shared defaults

### Phase 2: Safe defaults and migration

- Keep using `modelPickerKeyCodes`.
- Update defaults/migration so the newly visible configure-row slots are blank by default.
- Prevent hidden historical default digits from becoming active configure hotkeys on upgrade.

### Phase 3: Popup grid refactor

- Refactor popup model-picker rendering to use grouped shared metadata instead of the current popup-local 3-item canon list.
- Render:
  - top row with existing model actions
  - compact `Configure Models` label
  - second row with configure actions
- Keep capture, duplicate detection, and save logic aligned to the flattened action indices.

### Phase 4: Overlay grid refactor

- Refactor the overlay model grid to use the same grouped shared metadata.
- Update overlay hydration so it merges partial stored names with shared fallback metadata the same way the popup does.
- If shared styling changes are needed, remember the overlay also depends on `popup.css` and the embedded `FULL_POPUP_CSS` copy in `content.js`.

### Phase 5: Configure action runner in content.js

- Extend model hotkey execution from “visible row click only” to “action descriptor execution.”
- For main-row actions:
  - keep current direct-row behavior
- For configure-row actions:
  - open model menu
  - click `[data-testid="model-configure-modal"]`
  - find the model combobox near `#model-selection-label`
  - open the listbox using the combobox
  - select the target deep option
  - click `[data-testid="close-button"]`
- Reuse existing helper infrastructure where possible:
  - `waitFor`
  - `sleep`
  - `clickButtonByTestId`
  - existing flash/feedback behavior

### Phase 6: Extraction / persistence alignment

- Keep top-row live label scraping in place.
- Configure-row labels should come from shared canonical metadata unless a later ChatGPT DOM change makes richer live extraction worthwhile.
- Do not introduce new cloud/export/import payloads for configure labels unless absolutely required.

## Files Likely Touched On The Next Pass

- `shared/model-picker-labels.js`
- `options-storage.js`
- `popup.js`
- `popup.css`
- `content.js`
- `CHANGELOG.md`
