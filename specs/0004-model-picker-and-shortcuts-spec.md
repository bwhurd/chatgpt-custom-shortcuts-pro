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

## Fast keyboard audit

The canonical command is `npm run test:shortcuts:fast`; setup, filters, coverage warnings, reporting and optional live diagnostics are owned by [spec 0006](0006-runtime-scrape-selector-validator-spec.md#canonical-fast-shortcut-check). `npm run shortcuts:catalog` is the optional browser-free listing. Unknown filters and missing coverage warn at the end while available cases continue; observed behavioral or environment failures remain failures.

Controlled fixtures use the real extracted listeners/actions and recorded structural DOM states. They cover overlay hydration/dismissal, response/GPT menus, clipboard payloads (including a deterministic 24-message lazy-loading reference), media-control routing, upload-menu activation, composer focus/tools, Send/Stop gates, editing, sidebar/mode state, wrap and scrolling. Previous/Next Response shortcuts are temporarily disabled because the current site no longer exposes retained response-version navigation. Their popup controls, runtime bindings and canonical audit requirements are removed; startup and install/update cleanup remove their stored assignments, and import/cloud allowlists exclude those keys. Retained inert navigation helpers do not enable the feature. Shipped GSAP/ScrollTo and shared mode selectors are loaded where relevant. IME/AltGraph probes are explicitly synthetic; Mac modifier permutations and current live site compatibility are not implied.

Composer `+` shortcuts share the runtime helper that opens the matching tool menu or removes only that tool pill while preserving draft text. Add Photos invokes file selection without a persistent pill. Native clipboard, audio, upload completion and account generation remain external. Model fixtures preserve profile-specific positional slots, supply blank bindings only in isolated storage, and record unavailable actions as negative/inert proof. The truly empty legacy slot is a positional diagnostic; the slim-sidebar keydown refresh observer is presentation lifecycle rather than a keyboard action.

Historical measurements and accumulated targeted proof are retained in [Done-0090](../plans/Done-0090-shortcut-deferred-coverage-plan.md) and [Done-0098](../plans/Done-0098-retired-shortcut-cleanup-and-study-restore-plan.md). Historical report assembly does not imply a new combined execution.

## Shortcut normalization invariants

`ShortcutUtils` is the shared normalization layer.

Rules that must stay true:
- stored shortcut values are `KeyboardEvent.code`
- cleared shortcut values persist as NBSP (`\u00A0`)
- digits treat `DigitX` and `NumpadX` as equivalent
- duplicate detection must compare canonical codes, not raw visible text; `Digit5` and `Numpad5` are equivalent

If popup display and runtime behavior disagree, start by checking normalization before changing handlers.

## Model picker data model

The model picker has two separate but related state shapes:

- `window.MODEL_NAMES`
  - actionable visible model labels used by popup/content after hydration
  - must not keep the legacy `→` arrow entry once hydrated
- `modelPickerKeyCodesLatest` / `modelPickerKeyCodesLegacy`
  - independent persisted variable-length shortcut arrays for Work and Chat; 15 is historical default padding, not an upper limit
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

When building shortcut groups for an explicit profile catalog, that catalog is authoritative: omit slots it does not present and never recover a missing slot from the global compatibility action table. On popup hydration, clear saved bindings for slots absent from every model/configuration in that profile's catalog, keeping array positions and bindings for actions present in another profile or dynamic model rows. The current defaults leave legacy slot 10 and latest reset slot 14 blank; legacy `o3` and latest effort/speed entries remain when their own profile catalogs expose them.
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
- pristine effort-row positions use `F1` through `F5`; pristine model and visible Model Toggles positions use sequential digits
- both profiles render shared `shortcutKeyToggleChatWork` as the first item in a third `Model Toggles` group; it is a normal shortcut setting, not an entry in either model-picker array
- the Work profile additionally renders `Toggle Speed` when its Speed submenu is present; Chat renders only the shared Chat/Work toggle in that group
- the retired `Reset to default` slot remains storage-compatible but is rendered or activated only when a scrape explicitly records `pillResetAvailable: true`; missing or false capability data must not invent the row
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

Current refresh (2026-09-25) uses the rendered structure catalogued in `specs/model-picker-live-catalog-2026-09-25.md`: blank-composer mode buttons with reciprocal `aria-pressed`, the `data-codex-intelligence-trigger` pill, and its `data-model-picker-view` Simple/Advanced panels. One scanner reads the active Advanced rows in native order, then selects each explicit model and walks its finite reasoning-slider range. Primary titles, effort labels/tokens/indexes and Default's recommended model/effort pairs are separate data. Catalog `surfaceMode` explicitly owns Chat/Work routing. Persist only after the complete surface scan and initial-selection restoration; await the storage acknowledgment before reporting success. Grow model slots and key/name arrays without renumbering assignments or truncating to the historical default length.

The former pill-submenu, integrated-test-id and Configure-dialog **refresh scrapers** are retired. The historical notes below document previous formats and shortcut behavior; they are not fallback routes for the current refresh. Legacy shortcut-only handlers are not migrated by this refresh repair. Focused inventory, dual-surface, and beyond-15-slot fixtures plus syntax and lint checks pass; live extension refresh and storage/UI acceptance remain pending per plan 0082.

Historical refresh cascade, retained for reference:
- call the same native new-conversation helper used by the configurable New Conversation shortcut
- wait for the blank-chat native Chat/Work radio group, then remember its selected mode
- select Chat by structural radio order and run the existing catalog scraper into the Chat/Legacy snapshot
- select Work and run the existing catalog scraper into the Work/Latest snapshot
- in cleanup, collapse any model menus or Configure dialog opened by either scrape, restore the initially selected Chat/Work mode, and make the generic `modelCatalog` / `modelNames` compatibility keys match that restored mode

Mode selection must use the blank-chat two-radio structure and reciprocal checked state, not localized Chat/Work labels. Before scraping or completing restoration, the reciprocal radio state and the same visible composer model button must remain stable for a bounded dwell period. A failure on one surface must not prevent the coordinator from attempting the other surface, and cleanup must run for success and failure.

Chat is a hybrid selector surface: current GPT models use the compact two-submenu Power/Advanced shell, while selecting o3 changes the same surface to the integrated Intelligence menu. One Chat scrape must retain the GPT model/effort rows already collected from the compact shell, collect o3 effort rows from the integrated shell, and switch or restore model names through whichever shell is currently active.

Model actions and hidden scrape model switches must choose the route from the currently open menu shape. A cached catalog may advertise pill capabilities for both shells, but it must not force an integrated o3 menu through the pill-only action path. Compact scrape switches must re-assert the structural Advanced expansion immediately before opening Model, and an integrated scrape must fail rather than persist a catalog missing any discovered model's effort rows.

Visible model-picker shortcut actions are serialized until the current picker closes. A missing effort row (for example Max on GPT-5.5) is a valid unavailable action: it must not change the model and must leave the picker closed. Hidden scrape actions remain independent of the visible-action queue.

Catalog refresh owns catalogs and names only. It must not read, rewrite, normalize, reseed, or repair either model-picker shortcut array. Profile-change events only switch the active profile cache and never alter stored assignments. Popup startup has a separate repair boundary: after defaults, one-time profile migration, and catalog-based unavailable-slot pruning, it normalizes one stable sync snapshot before exposing shortcut controls, as defined by the duplicate-shortcut safeguard below.

For current integrated model catalogs, native-menu model hints resolve exact catalog labels to persisted slots. An uncatalogued live model receives no positional fallback binding; inserted native rows must not borrow another model's shortcut. Refreshing the catalog establishes its own model identity and slot through the existing catalog lifecycle.

Native Chat/Work selection waits for both structural mode buttons to be visible and actionable before clicking. Disabled loading controls do not satisfy the bounded readiness wait; timeout leaves the action unsuccessful rather than treating a refused click as a completed switch.

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

The current app shell's sidebar toggle exposes `data-app-shell-sidebar-trigger="true"`; the narrow header uses `aria-controls="browser-sidebar-popover"`. New Chat lacks a test ID: the inspected sidebar and narrow-header SVG paths begin with `M6.33325 1.88379` and `M6.33325 1.80763` respectively. The shared native helpers prefer these current targets and retain older test IDs as fallbacks, so the bottom bar's static controls use the same native actions as shortcuts.

Search Chats prioritizes the observed sidebar rail button's language-independent SVG path prefix `M9.16211 2.37976`, followed by the prior titlebar path `M7.32849 1.91016` and older `data-testid="search-conversation-button"` locator. Structural routes (the button before `close-sidebar-button` in `#sidebar-header`, or the `data-sidebar-item` after `create-new-chat-button` in the collapsed or narrow sidebar), legacy sprite fragments, and narrow-popover opening remain fallbacks where present. Runtime, audit metadata and collector openers must recognize the same observed control. Keep selectors language-agnostic and ground fallback changes in a current DOM capture.

The current native composer Send button can be an enabled `type="submit"` control without either legacy identifier; its observed arrow begins `M9.33467 16.6663`. During generation the same composer form exposes a `type="button"` square Stop control beginning `M4.5 5.75C4.5 5.05964`. Resolve those glyphs within one rendered form containing the visible contenteditable textbox, reject ambiguous or disabled controls, and retain explicit legacy selectors. Ctrl+Enter must reject Stop state. Runtime, collector and target metadata share that observed structure. Collector selectors passed to native DOM APIs must be valid CSS; Playwright's `:visible` belongs only in Playwright locators. The headless native-button regression checks real browser parsing and hidden, disabled and unrelated-form controls.

The ChatGPT app-shell changed several message-action labels, test IDs, and SVG targets after the earlier observations. Use the [live shortcut-target catalog](chatgpt-shortcut-target-catalog-2026-09-27.md) as a dated September 2026 comparison snapshot, not current runtime authority; it distinguishes confirmed mismatches from targets that require a different UI state. Do not copy a prior localized label or icon fragment into a new handler without current DOM evidence. Keep runtime selectors language-agnostic.

For dev-only runtime selector validation, the deterministic shortcut inventory should derive from:
- `extension/shared/shortcut-action-metadata.js` for explicit shortcut validation metadata
- `extension/shared/model-picker-selectors.js` for the model-picker opener selector contract shared with `content.js`
- `shortcutDefaults` for the shipped shortcut universe
- `keyFunctionMappingAlt` for active runtime handler ownership
- `settings-schema.js` for user-facing labels and overlay sections

If a runtime shortcut is intentionally handled outside the main handler map, the validator inventory must mark that explicitly rather than treating it as an accidental missing handler.

New runtime shortcut actions must add an explicit metadata row in `extension/shared/shortcut-action-metadata.js` at the same time as the default or handler change. The row must declare the action id, validation mode, ordered target refs, required scrape state refs, activation probe classification, and any manual-only or not-applicable reason. The Playwright validator uses `content.js` only for completeness guards; it must not infer targets from arbitrary handler bodies.

Activation probe metadata is the source of truth for future live shortcut checks. Use executable modes only for no-token-safe probes whose expected target can be verified deterministically, such as `click-target` for a stable button or `focus-target` for the composer input. Stateful, multi-step, token-spending, native-dialog, manual-only, or not-applicable shortcuts must be explicitly classified instead of left for the runner to guess.

Edit and Send Edit operate on Chat conversations. Work conversations do not expose these controls; validation must prepare an owned Chat conversation before asserting the Edit target rather than reporting the expected Work absence as a selector failure.

### Conversation scroll target ownership

ChatGPT retains previous conversations in connected but hidden panels after navigation. Resolve the rendered `.thread-scroll-container` on each scroll action and scope message-unit, role-wrapper, and legacy-turn lookup to that container. A document-wide common ancestor can combine hidden and current messages and incorrectly target the non-scrolling document root. Legacy layouts without the native container may use rendered connected messages and their shared scrollable ancestor; the document fallback must have a real scroll range.

One/two-message stepping, top/bottom actions, and PageUp/PageDown takeover share this active-container lookup. Animation updates and delayed settling must stop when their container is hidden or detached. PageUp/PageDown must respect negative scroll positions for `column-reverse` as well as ordinary positive positions.

For a reload-works/navigation-fails report, compare the visible and hidden conversation scrollers before and after an in-page switch. `isConnected` alone does not establish current conversation ownership. Validate A → B → A without intervening reloads; an initial-page geometry fixture cannot prove this contract.

### Response thread navigation contract

- Ordinary Alt-domain shortcuts require Alt/Option without Shift or either control-like
  modifier. Primary-Control+Alt (Ctrl+Alt on Windows/Linux, Command+Option on macOS) is
  reserved exclusively for the Previous/Next preview shortcuts below; unmatched compound
  chords must pass through without falling back to an ordinary Alt action. This preserves
  layout text entry such as German `Ctrl+Alt+Q` for `@`, even when Chromium does not report
  `AltGraph`.
- Resolve a response navigator structurally as a `div.tabular-nums` counter with button siblings on both sides; do not identify it from localized text or a bare `<` / `>` glyph.
- Alt+Previous and Alt+Next scroll to and click the lowest visible enabled button for their direction. Disabled direction buttons are not actionable fallbacks.
- Ctrl+Alt+Previous and Ctrl+Alt+Next are scroll-only previews: they never click a response button.
- Repeated Ctrl+Alt+Previous moves upward through navigator groups and wraps from the top group to the bottom group.
- Repeated Ctrl+Alt+Next moves downward through navigator groups and wraps from the bottom group to the top group.
- Preview traversal must tolerate scroll-boundary clamping. Do not infer the current preview solely from exact pixel centering.
- ChatGPT may mount additional navigator groups only after directional scrolling. At a mounted-list edge, scan to that direction's real scroll boundary and rescan before deciding to wrap.

If a report shows a shortcut as static `PARTIAL` but the same action has a passing live probe, treat that as a resolved state-specific target rather than a broken shortcut. The Dashboard and Top Follow-Up sections should be used for routine repair priority; the Details tab preserves static scrape diagnostics for deeper investigation.

The nine retired shortcut actions are removed from shipped settings and shortcut surfaces; the existing remove-unused migration clears their stale stored assignments. `shortcutKeyStudy` is active and configurable with a blank default. It opens the composer `+` menu, appends the `study` query without replacing the draft, and selects the live Study target by its verified icon. The retired standalone Thinking Standard/Extended shortcut keys are removed while the separate model-effort and Pro actions remain.

Dictation controls resolve inside the observed composer form. Current start uses the `microphone-light-16` / `microphone-light-20` SVG symbols, distinct from Voice. Active Cancel and Stop use `xmark-lg-light-20` and `stop-fill-light-20`; Transcribe uses `arrow-up-lg-light-20` only with the active Cancel/Stop context, so an ordinary Send control cannot substitute. Keep the previously verified SVG path alternatives for older layouts. Current symbol controls do not require a `type` attribute. Live setup waits for active controls after microphone acquisition rather than treating its loading spinner as an active dictation state.

## Runtime model switching

For the current Chat and Work picker (`[data-model-picker-view]`), shortcut execution must use the active model catalog and only rows in the active panel. Model shortcuts open Advanced once, resolve the catalog option by its primary row title, activate it once, and verify the checked row before saving the selection. Effort shortcuts use the active Simple panel's `[data-reasoning-slider="true"]` control and the current model's catalog `sliderValue`; when Work's native Default row is selected, use the active model profile's catalog mapping or the semantic slider offset. Never activate a mounted inactive row or fall through to a legacy action after recognizing the current picker. Preserve legacy selector paths only when the current picker marker is absent.

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

Both current surfaces now open as compact Power menus. Their direct Advanced control is identified structurally as the non-submenu `role="menuitem"` with `aria-expanded`; never select it by localized text. Before scraping, model selection, effort selection, speed toggle, reset, or fallback hint discovery, click that control only when it is collapsed and wait until the required Model and Effort triggers are ready. Chat exposes those two submenus; Work adds Speed as a third submenu. Older two- or three-submenu menus without this control remain valid and must not be rejected.

The current integrated Work picker uses a two-step model route: open the composer pill, then click the central model/effort `role="menuitem"[data-interactive="true"][aria-expanded]` inside `[data-model-selection-view="true"]`. Its visible model and effort strings are dynamic and localized; they are not selector inputs. That trigger switches the same menu to the in-place Advanced panel, whose rows must be read structurally from `[data-testid="composer-model-picker-slider-advanced-view"][data-active="true"]`. A native `Default` row remains visible for ChatGPT's own `Alt+F5`, but is not persisted as an extension model slot; all observed model rows after it retain distinct catalog action ids and slots.

When hydrating a Work catalog, the popup must preserve those scraped action ids and row order. It must not re-infer the first dynamic row as the static latest action, and stale persisted `configure-latest` aliases from the native `Default` row must be dropped rather than rendered as a duplicate model.

Catalogs persist `pillSpeedMenu` and `pillResetAvailable` from the observed menu. Popup/overlay utilities must follow those capabilities: never invent Speed for Chat or Reset when ChatGPT did not render the corresponding control.

The current integrated Intelligence menu may expose its speed control as a single `role="menuitemcheckbox"[data-fast-mode-enabled]` (the 1.5x/fast mode toggle) instead of a two-row Speed submenu. When present, the scrape persists `integratedSpeedMenu` and the popup exposes the existing `toggle-speed` slot; `Reset to default` uses the same main-menu structural reset row and persists `integratedResetAvailable`. Runtime actions must route through the live integrated controls. Their configured `Alt+key` hints sit just below the native icons as out-of-flow labels; never insert the hint into the icon's flex row or change the icon layout.

The integrated simple Power slider is an effort control, not a model-list hint target. Show no shortcut labels on the horizontal effort slider or its ticks; specifically remove ChatGPT's native `Alt+F4` label there. Effort shortcuts must still target this control: when Advanced is active, close the mounted picker and reopen the composer pill so the simple slider is live, then activate the matching structural tick directly. If a future shell omits tick metadata, a bounded `role="slider"` keyboard fallback may move the range. The integrated reset row's native hint is hidden before the extension's configured `Alt+key` utility hint is placed below its icon.

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
- Popup startup waits for default seeding and one-time profile migration/filtering, then repairs duplicates in a stable full sync snapshot using the effective model modifier and both profile registries. Canonical scalar shortcut owners claim matching-modifier keys before model slots; within each profile, utility actions claim before supported model slots in ascending slot order. Scalar losers are cleared to NBSP and model losers to an empty string; supported profile positions and cross-profile reuse remain intact. When present, the `modelPickerKeyCodes` compatibility snapshot is aligned to normalized Chat so it cannot retain stale duplicate values. Startup verifies the persisted patch before hydrating controls. Pending or failed repair keeps shortcut controls hidden, with existing error feedback on failure.
- Startup filtering prunes model codes only from slots absent from every configuration in their profile. Catalog refresh and profile switching do not otherwise reseed supported assignments.
- Import, local persistence after Drive restore, export and clear/reset boundaries use the same deterministic full-snapshot normalizer as startup, preserving nonduplicate supported customizations and existing confirmations. Profile arrays remain independent; the compatibility field is aligned to Chat after normalized profile writes. Focused popup fixtures prove these boundaries. Runtime storage propagation is covered by a controlled fixture; the available live Chrome/CDP acceptance remains in [active 0099](../plans/0099-popup-shortcut-duplicate-scrub-plan.md).

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
