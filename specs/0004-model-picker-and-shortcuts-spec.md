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
- `modelPickerKeyCodesLatest` / `modelPickerKeyCodesLegacy`
  - independent persisted 15-slot shortcut arrays for Work and Chat
  - matching defaults may reuse the same keys, but later edits are never mirrored or linked
- `modelPickerKeyCodes`
  - legacy shared-array input retained only for one-time migration and backward-compatible export/import
- `modelPickerKeyCodeProfilesVersion`
  - gates the one-time shared-array split; normal popup hydration and catalog refresh never rerun it
- `modelCatalogLatest` / `modelNamesLatest`
  - Work snapshot; an explicit Work scrape writes here regardless of which ordered scraper succeeds
- `modelCatalogLegacy` / `modelNamesLegacy`
  - Chat snapshot; an explicit Chat scrape writes here regardless of which ordered scraper succeeds
- `modelCatalog` / `modelNames`
  - current-page compatibility keys used by content-script shortcut execution; dual refresh leaves them aligned with the restored initial mode
  - menu-shape inference is compatibility fallback only when no explicit Chat/Work destination is supplied
- `modelCatalogSelectedProfile`
  - sync-backed popup view preference storing internal `legacy` (Chat) or `latest` (Work)
  - defaults to Chat when absent; changing it never mutates either catalog or launches a scrape
- `modelCatalog.configureOptions`
  - refreshed Configure Models entries must persist their canonical `slot`
  - dynamic configure entries must never reuse a slot, even when ChatGPT inserts a new model between existing rows
- `modelCatalog.frontendByConfig`
  - dynamic configure entries with no frontend variants, such as a scraped `4.5` row, must preserve their self row as a catalog-backed primary action
  - the self row shares the same slot as its second-row Configure Models entry, so one assigned key activates the same model from either visual position

Shared grouped rendering comes from `shared/model-picker-labels.js`, not hardcoded popup rows.

Important invariant:
- the popup and shortcuts overlay must render from the same grouped model-action source of truth
- the popup opens on its last stored Chat/Work snapshot selection, defaulting to Chat/Legacy for a new install; its segmented selector changes only the rendered snapshot and persisted view preference and never launches or changes a scraper
- the popup and overlay read the requested profile array directly at each action's persisted `slot`
- edits, clears, and resets write only the selected profile; they never modify the other profile
- pristine effort-row positions use `F1` through `F5`; pristine model and non-reset Model Toggles positions use sequential digits, while Reset uses `Digit0`
- both profiles render shared `shortcutKeyToggleChatWork` as the first item in a third `Model Toggles` group; it is a normal shortcut setting, not an entry in either model-picker array
- the Work profile additionally renders `Toggle Speed` and `Reset to default`; Chat renders only the shared Chat/Work toggle in that group
- every shipped locale supplies translated `Work Models` and `Chat Models` labels of at most 15 Unicode characters

## Popup behavior

`popup.js` owns:
- binding `input.key-input` controls
- saving canonical codes
- duplicate modal behavior
- segmented Alt vs Control model-hotkey mode
- segmented Chat Models vs Work Models profile view
- model grid rendering from shared metadata

The Chat Models / Work Models selector appears first on the upper header line, followed by the Alt / Control selector. The Effort label and model-grid top edge sit 18 px lower. Alt/Control wiring targets `#mp-model-switcher-modifier-selector`; it must never use the first generic `.p-segmented-controls`. Internal storage identifiers remain `legacy` for Chat and `latest` for Work.

The popup should not invent its own model-row grouping or label rules separate from `shared/model-picker-labels.js`.

### Catalog refresh lifecycle

The popup's manual model refresh is a two-surface operation:
- call the same native new-conversation helper used by the configurable New Conversation shortcut
- wait for the blank-chat native Chat/Work radio group, then remember its selected mode
- select Chat by structural radio order and run the existing catalog scraper into the Chat/Legacy snapshot
- select Work and run the existing catalog scraper into the Work/Latest snapshot
- in cleanup, collapse any model menus or Configure dialog opened by either scrape, restore the initially selected Chat/Work mode, and make the generic `modelCatalog` / `modelNames` compatibility keys match that restored mode

Mode selection must use the blank-chat two-radio structure and reciprocal checked state, not localized Chat/Work labels. A failure on one surface must not prevent the coordinator from attempting the other surface, and cleanup must run for success and failure.

Catalog refresh owns catalogs and names only. It must not read, rewrite, normalize, reseed, or repair either model-picker shortcut array. Popup hydration and profile-change events follow the same rule.

`Toggle Chat / Work` uses the same native New Conversation helper as the configurable new-chat shortcut. On a nonblank conversation it starts a blank conversation, waits 500 ms for the native two-radio surface selector, then selects the unchecked radio. On an already blank conversation it toggles directly. Runtime detection uses structural radio order and reciprocal checked state, never localized labels.

## Shortcuts overlay parity

The overlay in `content.js` must stay aligned with the popup:
- same grouped model rows
- same label source
- same assigned-only shortcut visibility rules
- same shared styling contract with `popup.css`
- same ephemeral Chat/Work segmented view, defaulting to Chat/Legacy each time the overlay opens
- the requested profile's own shortcut array read directly at `action.slot`

The overlay profile selector reads `modelCatalogLatest` / `modelNamesLatest` and `modelCatalogLegacy` / `modelNamesLegacy` directly from the settings snapshot. Unlike the popup selector, the overlay remains ephemeral and defaults to Chat/Legacy each time it opens. Switching it only replaces the overlay model grid; it does not persist a selected tab, mutate either catalog, or launch a scrape.

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
- `extension/shared/model-picker-selectors.js` for the model-picker opener selector contract shared with `content.js`
- `shortcutDefaults` for the shipped shortcut universe
- `keyFunctionMappingAlt` for active runtime handler ownership
- `settings-schema.js` for user-facing labels and overlay sections

If a runtime shortcut is intentionally handled outside the main handler map, the validator inventory must mark that explicitly rather than treating it as an accidental missing handler.

New runtime shortcut actions must add an explicit metadata row in `extension/shared/shortcut-action-metadata.js` at the same time as the default or handler change. The row must declare the action id, validation mode, ordered target refs, required scrape state refs, activation probe classification, and any manual-only or not-applicable reason. The Playwright validator uses `content.js` only for completeness guards; it must not infer targets from arbitrary handler bodies.

Activation probe metadata is the source of truth for future live shortcut checks. Use executable modes only for no-token-safe probes whose expected target can be verified deterministically, such as `click-target` for a stable button or `focus-target` for the composer input. Stateful, multi-step, token-spending, native-dialog, manual-only, or not-applicable shortcuts must be explicitly classified instead of left for the runner to guess.

### Response thread navigation contract

- Resolve a response navigator structurally as a `div.tabular-nums` counter with button siblings on both sides; do not identify it from localized text or a bare `<` / `>` glyph.
- Alt+Previous and Alt+Next scroll to and click the lowest visible enabled button for their direction. Disabled direction buttons are not actionable fallbacks.
- Ctrl+Alt+Previous and Ctrl+Alt+Next are scroll-only previews: they never click a response button.
- Repeated Ctrl+Alt+Previous moves upward through navigator groups and wraps from the top group to the bottom group.
- Repeated Ctrl+Alt+Next moves downward through navigator groups and wraps from the bottom group to the top group.
- Preview traversal must tolerate scroll-boundary clamping. Do not infer the current preview solely from exact pixel centering.
- ChatGPT may mount additional navigator groups only after directional scrolling. At a mounted-list edge, scan to that direction's real scroll boundary and rescan before deciding to wrap.

If a report shows a shortcut as static `PARTIAL` but the same action has a passing live probe, treat that as a resolved state-specific target rather than a broken shortcut. The Dashboard and Top Follow-Up sections should be used for routine repair priority; the Details tab preserves static scrape diagnostics for deeper investigation.

Removed ChatGPT features should stay inert for existing installs while disappearing from user-facing shortcut grids. `shortcutKeyStudy`, `shortcutKeyToggleCanvas`, `shortcutKeyThinkLonger`, `shortcutKeyThinkingStandard`, and `shortcutKeyThinkingExtended` are legacy storage/default keys only; keep them explicit as `not-applicable` metadata and do not show them in `popup.html` or overlay schema unless ChatGPT restores those features. The retired standalone Thinking Standard/Extended keys are cleared to NBSP by the options migration so updates cannot retain an active assignment.

## Runtime model switching

`window.toggleModelSelector` in `content.js` must support:
- current single-level ChatGPT model menus
- older submenu-based layouts if that path returns

Do not assume the submenu path always exists.

Thinking effort shortcuts must support both current account surfaces:
- Configure-dialog route: `#thinking-effort-selection-label` plus controlled `role="listbox"` options
- Model-selector route: `data-model-picker-thinking-effort-action` opens a `role="menu"` with `menuitemradio` Standard/Extended options

For the integrated first-level model menu, map the semantic effort label even when ChatGPT appends a model-version badge inside the same row (for example, `Instant` plus `5.5`). The badge is metadata, not part of the effort label; catalog refresh, popup first-row rendering, and exposed-menu shortcut hints must continue to recognize the effort option.

The three-submenu pill must expose shortcut hints in all three open submenus:
- Model rows use the existing catalog-backed model action mapping.
- Effort rows use the active catalog's shared popup-primary action order and slots.
- Both Speed radio rows display the one `toggle-speed` utility shortcut because that shortcut toggles between the two states.

For a known Work `configure-option` shortcut, activation opens the structurally first submenu trigger and verifies that its controlled menu is the Model menu before selecting the catalog action directly. Full submenu discovery and hint scanning are fallback paths only when that verified direct route fails.

Runtime shortcut resolution first selects the current native Chat/Work profile, scans only that profile's presented slots for the assigned code, and dispatches the exact matching action. On a blank conversation, the native two-radio state and captured mode changes own profile selection. After those radios disappear, the live shared composer trigger identifies Work structurally by its `[data-animated-slider-trigger="true"]` wrapper; the same trigger without that wrapper identifies Chat. Catalog/menu inventory scanning remains a fallback for DOM activation, not a way to discover the user's stored assignment.

Pill hint discovery must follow structural menu relationships (`role`, `aria-controls`, open/visible state, direct radio-row order, and shared submenu classification), never localized `Model`, `Effort`, `Speed`, or option text. Keep the older integrated and Configure-dialog hint functions active as the Legacy fallback path.

After a successful runtime model, effort, speed, reset, or legacy model-picker selection, focus the visible composer input so Radix dismisses the picker. Catalog refresh uses the same composer-refocus helper in cleanup, including fallback and failure exits, so no scrape path leaves the menu open.

Duplicate shortcut checks must iterate the exact sparse slot numbers in the relevant catalog-backed presentation groups; action count must never be treated as a contiguous array boundary.

Keep the older assistant icon fallback as a last resort for accounts that still expose that route.

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
- A model edit checks only the selected profile plus same-modifier global shortcuts. A global shortcut edit checks both profiles because that command is available in either mode.
- The same canonical code may appear once in Chat and once in Work. Matching defaults are allowed; cross-profile reuse must not trigger a duplicate prompt or clear either assignment.
- Within one profile, assigning an already-used canonical code transfers ownership deterministically as one user edit: clear the old owner, then write the exact requested slot. Never renumber, autofill, mirror, or reorder other assignments.
- Explicit import/restore and the one-time v0-to-v1 migration may clear a later canonical duplicate within a profile. They must preserve all nonduplicate customizations, including values in slots not present in the current catalog.
- Catalog scrape, catalog hydration, popup open, and profile switching never repair or reseed shortcut assignments.

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

The auto-managed `modelCatalog*` and `modelNames*` scrape snapshots are intentionally excluded from export/import/Drive flows.

## Repair checklist

When this subsystem breaks:
1. verify the stored value shape is still canonical `KeyboardEvent.code`
2. verify popup and overlay still share grouped model metadata
3. verify the key exists in schema label/section maps when user-visible
4. verify the runtime handler map still consumes the stored key
5. verify model-targeting code still uses the no-`tabs` permission routing invariant
