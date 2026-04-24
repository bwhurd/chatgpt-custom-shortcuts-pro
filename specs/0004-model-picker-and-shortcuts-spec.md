# Spec: Model Picker And Shortcuts

Use this when changing or repairing:
- popup shortcut inputs
- duplicate shortcut detection
- model picker hotkeys
- the shortcuts overlay
- ChatGPT model switching / Configure Models routing

This is the durable architecture reference for the shared shortcut and model-picker system.

## Owning files

- `shared/model-picker-labels.js`
  - canonical model-action metadata, grouped rows, label helpers, and slot expectations
- `popup.js`
  - shortcut input binding, duplicate handling, popup model-picker rendering, import/export normalization
- `popup.html`
  - visible shortcut inputs and segmented modifier controls
- `content.js`
  - runtime key handlers, shortcuts overlay, and model selector automation
- `settings-schema.js`
  - overlay labels/sections and popup radio-group metadata

## Shortcut normalization invariants

`ShortcutUtils` is the shared normalization layer.

Rules that must stay true:
- stored shortcut values are `KeyboardEvent.code`
- cleared shortcut values persist as NBSP (`\u00A0`)
- digits treat `DigitX` and `NumpadX` as equivalent
- duplicate detection must compare canonical codes, not raw visible text

If popup display and runtime behavior disagree, start by checking normalization before changing handlers.

## Model picker data model

The model picker has two separate but related state shapes:

- `window.MODEL_NAMES`
  - actionable visible model labels used by popup/content after hydration
  - must not keep the legacy `→` arrow entry once hydrated
- `modelPickerKeyCodes`
  - flat persisted shortcut array
  - full slot count stays fixed even when popup rows are grouped visually

Shared grouped rendering comes from `shared/model-picker-labels.js`, not hardcoded popup rows.

Important invariant:
- the popup and shortcuts overlay must render from the same grouped model-action source of truth

## Popup behavior

`popup.js` owns:
- binding `input.key-input` controls
- saving canonical codes
- duplicate modal behavior
- segmented Alt vs Control model-hotkey mode
- model grid rendering from shared metadata

The popup should not invent its own model-row grouping or label rules separate from `shared/model-picker-labels.js`.

## Shortcuts overlay parity

The overlay in `content.js` must stay aligned with the popup:
- same grouped model rows
- same label source
- same assigned-only shortcut visibility rules
- same shared styling contract with `popup.css`

Key wiring:
- overlay open key comes from `shortcutKeyShowOverlay` in storage and ships as `Alt + .` (`Period`) by default
- overlay grouping comes from `settings-schema.js` `shortcuts.overlaySections`
- overlay labels come from `settings-schema.js` `shortcuts.labelI18nByKey`
- fallback is key-name text only when no better label exists
- assigned popup shortcuts should render in the overlay through that same schema path; the overlay opener is not a permanent exception

If a shortcut shows in the popup but lands in the overlay “Other” bucket unexpectedly, check the schema mapping before changing overlay rendering.

## Runtime shortcut activation

For ChatGPT-native actions that now have first-party customizable shortcuts, prefer direct DOM activation over simulating the old native keystrokes.

Keywords worth `rg` first:
- `shortcutKeySearchConversationHistory`
- `shortcutKeyActivateInput`
- `shortcutKeyNewConversation`
- `shortcutKeyToggleSidebar`
- `create-new-chat-button`
- `search-conversation-button`
- `stage-sidebar-tiny-bar`
- `prompt-textarea`
- `unified-composer`

Current direct-DOM pattern:
- keep the user-configurable shortcut in the normal runtime handler map
- resolve the live ChatGPT control by stable `data-testid`, structural selector, or inspector-confirmed non-localized DOM shape
- use a narrow storage migration when changing a shipped default key such as `KeyK` to `Comma`
- do not leave temporary standalone IIFEs in parallel once the main shortcut path owns the action

For dev-only runtime selector validation, the deterministic shortcut inventory should derive from:
- `extension/shared/shortcut-action-metadata.js` for explicit shortcut validation metadata
- `shortcutDefaults` for the shipped shortcut universe
- `keyFunctionMappingAlt` for active runtime handler ownership
- `settings-schema.js` for user-facing labels and overlay sections

If a runtime shortcut is intentionally handled outside the main handler map, the validator inventory must mark that explicitly rather than treating it as an accidental missing handler.

New runtime shortcut actions must add an explicit metadata row in `extension/shared/shortcut-action-metadata.js` at the same time as the default or handler change. The row must declare the action id, validation mode, ordered target refs, required scrape state refs, activation probe classification, and any manual-only or not-applicable reason. The Playwright validator uses `content.js` only for completeness guards; it must not infer targets from arbitrary handler bodies.

Activation probe metadata is the source of truth for future live shortcut checks. Use executable modes only for no-token-safe probes whose expected target can be verified deterministically, such as `click-target` for a stable button or `focus-target` for the composer input. Stateful, multi-step, token-spending, native-dialog, manual-only, or not-applicable shortcuts must be explicitly classified instead of left for the runner to guess.

If a report shows a shortcut as static `PARTIAL` but the same action has a passing live probe, treat that as a resolved state-specific target rather than a broken shortcut. The Dashboard and Top Follow-Up sections should be used for routine repair priority; the Details tab preserves static scrape diagnostics for deeper investigation.

Removed ChatGPT features should stay inert for existing installs while disappearing from user-facing shortcut grids. `shortcutKeyStudy` and `shortcutKeyThinkLonger` are legacy storage/default keys only; keep them explicit as `not-applicable` metadata and do not show them in `popup.html` or overlay schema unless ChatGPT restores those features.

## Runtime model switching

`window.toggleModelSelector` in `content.js` must support:
- current single-level ChatGPT model menus
- older submenu-based layouts if that path returns

Do not assume the submenu path always exists.

The Configure Models path should stay language-agnostic:
- `data-testid=\"model-configure-modal\"`
- nearby `#model-selection-label`
- `button[role=\"combobox\"][aria-controls]`
- controlled `role=\"listbox\"` / `role=\"option\"`
- `data-testid=\"close-button\"`

## Duplicate detection rule

Duplicate handling depends on model-hotkey mode:
- normal popup shortcuts and model slots do not always share the same conflict set
- the active Alt vs Control model-picker mode changes which assignments should conflict

If duplicate prompts feel inconsistent, inspect the active modifier mode first.

### Duplicate-shortcut safeguard invariant

- If a change touches shortcut editing, shortcut normalization, shortcut save flows, import/restore flows, model picker controls tied to shortcuts, or the shortcuts overlay, keep duplicate-shortcut detection and blocking working.
- Preserve duplicate-shortcut safeguards for add, edit, import, and restore paths unless the task explicitly changes duplicate-handling behavior.

## Tab-targeting invariant

This extension does not request the `tabs` permission.

That means popup/background routing for ChatGPT actions must not depend on URL-filtered `chrome.tabs.query({ url: ... })`.

Safe targeting patterns are:
- `sourceTabId`
- `active/currentWindow`
- `active/lastFocusedWindow`
- remembered explicit tab ids

Do not “fix” a model-picker routing bug by adding `tabs` permission unless the user explicitly approves it.

## Common failure modes

### Popup key looks right but runtime shortcut does nothing

Usually means one of:
- value saved as visible text instead of `KeyboardEvent.code`
- content shortcut defaults/handler map missing the key
- duplicate clearing silently overwrote the assignment

### Overlay label or grouping is wrong

Usually means one of:
- key missing from `settings-schema.js` `labelI18nByKey`
- key missing from `overlaySections`
- popup and overlay are not using the same shared metadata path

### Model labels drift after import/restore

Check `specs/0003-cloud-sync-and-settings-data-flow-spec.md`.

`modelNames` is intentionally excluded from export/import/Drive flows.

## Repair checklist

When this subsystem breaks:
1. verify the stored value shape is still canonical `KeyboardEvent.code`
2. verify popup and overlay still share grouped model metadata
3. verify the key exists in schema label/section maps when user-visible
4. verify the runtime handler map still consumes the stored key
5. verify model-targeting code still uses the no-`tabs` permission routing invariant
