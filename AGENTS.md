# ChatGPT Custom Shortcuts Pro agent

- ChatGPT Custom Shortcuts Pro is a Chrome extension that adds configurable shortcuts and UI tweaks to chatgpt.com.  
- This file tells the coding agent how to modify the extension safely and which files it can touch.  
- IMPORTANT: If required information is missing, stop and ask the user instead of guessing (for example, ask them to copy relevant HTML from the ChatGPT page’s inspector into the prompt).

## Repository search

- files to include: `AGENTS.md, auth.js, background.js, content.js, manifest.json, options-storage.js, popup.css, popup.html, popup.js, storage.js, shared/model-picker-labels.js, vendor/webext-options-sync.js, _locales/**/messages.json, icons/icon16.png, icon32.png, icon48.png, icon128.png, CHANGELOG.md, lib/*.min.js, tools/*.zip`
- exclude any files and folders not listed above
- explicitly exclude these folders: `node_modules`, `dist`, `netlify`, `css-cleanup`, `.git`

## Scope
Only read, edit, and consider the files listed below when working on this project. Ignore all other files and directories unless explicitly directed otherwise:

- `AGENTS.md`                     : main spec for this agent, scope rules, invariants

1. Core logic and behavior
   - `content.js`                 : main runtime logic acting on chatgpt.com DOM, shortcuts, scrolling, copy, overlays
   - `options-storage.js`         : central option defaults, migrations, chrome.storage wiring
   - `storage.js`                 : CloudStorage helper syncing settings to Drive appDataFolder
   - `auth.js`                    : CloudAuth helper for Google OAuth tokens and refresh
   - `shared/model-picker-labels.js` : canonical model labels and test IDs used by content and popup

2. UI surfaces (extension settings popup)
   - `popup.html`                 : settings popup markup and i18n attributes
   - `popup.js`                   : settings popup behavior and bindings to chrome.storage and Cloud helpers
   - `popup.css`                  : settings popup visual styles mirrored in the Ctrl+/ overlay

3. Extension shell and wiring
   - `manifest.json`              : MV3 manifest, permissions, content script and background registration
   - `background.js`              : service worker handling OAuth flows via chrome.identity

4. Config and localization
   - `_locales/*/messages.json`   : localized strings for popup, overlays, toasts

5. Assets
   - `icons/icon16.png, icon32.png, icon48.png, icon128.png` : shipped UI icons for browser and extension surfaces
   - `CHANGELOG.md`               : release notes for behavior visible changes

6. Read only vendor and bundles
   - `vendor/webext-options-sync.js` : options sync shim used by options-storage
   - `lib/*.min.js`               : bundled GSAP and third party scripts, never modify
   - `tools/*.zip`                : backup archives, never modify


## Role
- You are a senior MV3 extension engineer maintaining ChatGPT Custom Shortcuts Pro with GSAP-driven DOM automation.
- Ship the smallest correct change that honors existing behavior, shortcut semantics, and UI structure unless the user explicitly asks otherwise.
- Keep chrome.storage sync the single source of truth for settings; propagate changes through `options-storage.js`, `popup` UI, and `content.js`.
- Treat the popup authoring experience as high-priority: respect i18n keys, tooltip balancing, and duplicate-shortcut safeguards.
- Use the provided helpers (`ShortcutUtils`, GSAP plugins, CloudAuth/CloudStorage) instead of reimplementing similar logic.

## Project summary
This MV3 extension layers a programmable shortcut system over chatgpt.com. Users can:
- Configure dozens of Alt/Ctrl-based shortcuts for scrolling, copying, regenerating, and tool toggles via the popup UI.
- Toggle UI tweaks such as moving the ChatGPT header to the bottom, fading the slim sidebar, remembering sidebar scroll position, injecting legacy arrow buttons, and clicking inline code to copy (opt-in).
- Copy formatted messages or code blocks with Markdown stripping and Word-friendly formatting.
- Trigger model switches (main and legacy) with Alt+digits, including a Ctrl+/ overlay that lists all assigned shortcuts.
- Sync their settings to Google Drive (`appDataFolder`) and restore them across devices.

## Tech stack & layout
- Manifest (manifest.json): MV3, default locale `en`, exposes `_execute_action` command (`Alt+U`) and a service-worker background (`background.js`). Content script runs on `*://*.chatgpt.com/*` and preloads GSAP libraries plus `shared/model-picker-labels.js`.
- Content script (`content.js`): Massive vanilla JS file registered after GSAP plugins; manipulates ChatGPT DOM, handles keyboard shortcuts, scroll automation, copy flows, menu automation, UI tweaks, and overlays.
- Popup (`popup.html`, `popup.js`, `popup.css`): Config UI with Google login tile, segmented control for model-switcher modifier, dynamically injected model grid, and grouped shortcut inputs. `popup.js` binds storage, enforces conflicts, renders tooltips/search/filter, and orchestrates Cloud sync.
- Service worker (`background.js`): OAuth broker. Launches `chrome.identity.launchWebAuthFlow`, exchanges codes via Netlify token proxy, and keeps tokens in `chrome.storage.session`.
- Auth & storage helpers (`auth.js`, `storage.js`): `auth.js` exposes `window.CloudAuth` for popup/content, including token refresh and logout. `storage.js` exposes `window.CloudStorage` for local<->sync<->Drive persistence (file `extension_settings.json` in `appDataFolder`).
- Options & shared data (`options-storage.js`, `vendor/webext-options-sync.js`, `shared/model-picker-labels.js`): Central defaults, migrations, and canonical model labels/test IDs. `OptionsSync` stub lives in `vendor/` and must be loaded before `options-storage.js`.
- Assets: `_locales/*/messages.json` for every user-facing string, `lib/` GSAP bundles (read-only), `icons/` shipped assets, `tools/` backups/scripts (read-only). Tests (if added) live under `tests/`.

## Core modules & responsibilities
### content.js
- Registers GSAP plugins (`ScrollToPlugin`, `Observer`, `Flip`) before doing anything else. All scrolling and animation helpers depend on GSAP being present.
- `applyVisibilitySettings` hydrates globals (checkboxes/radios/faders). It is wrapped later to reinject legacy arrow buttons, so any new toggles must be inserted into this map.
- Mutation observers:
  - `observeConversationContainer` watches chat thread children and throttles expensive work via `requestIdleCallback`.
  - Multiple observers handle top-bar relocation, slim sidebar fading, tooltip adjustments, and auto-click flows.
- Shortcut infrastructure:
  - Loads all shortcut keys from `chrome.storage.sync` (defaults defined in `options-storage.js`), normalizes them via `ShortcutUtils`, and builds Alt/Ctrl/Command key maps.
  - Handles Alt+digit model switching, Alt+Ctrl preview mode for thread navigation, Ctrl+Enter/Backspace gating (only intercepts if send/stop toggles are enabled and a stop button exists), and global Ctrl+/ overlay.
  - Exposes `window.ShortcutUtils` to the popup (code equality, char mapping, conflict clearing).
- Automation helpers:
  - Menu utilities (`clickGptHeaderThenSubItemSvg`, `clickLowestSvgThenSubItemSvg`, `runActionByIcon`, `clickButtonByTestId`) wrap pointer+keyboard events so selectors stay reliable across header/bottom bar variants.
  - Scroll helpers (`scrollUpByMessages`, `goDownOneMessage`, `PageUp/PageDown` takeover) always reference `getScrollableContainer()` and respect `moveTopBarToBottomCheckbox`.
- Copy flows (`copyFromLowestButton`, `selectThenCopy`, `selectThenCopyAllMessages`) sanitize Markdown, preserve code fences, and ensure Word output (CRLF delimiting, spacing guards). Never bypass these helpers when touching copy behavior.
- Inline code click-to-copy is gated by `clickToCopyInlineCodeEnabled`; keep the listener/style in sync with storage.
- UI tweaks:
  - Injects the bottom bar when `moveTopBarToBottom` is enabled, including static toggle/new-chat buttons, opacity sliders, and arrow fades. Blacklists routes (`/gpts`, `/codex`, `/g/`, `sora.chatgpt.com`, `/library/`) via hostname/path gate.
  - Fades the slim sidebar (`stage-sidebar-tiny-bar`) with user-configurable opacity, pausing when overlays or the full sidebar are open.
  - Keeps edit buttons visible via forced opacity classes and styles.
  - Auto-click convenience flows: “Something went wrong” → Try again, “Open link” warnings, “Read Aloud”/“Stop” menu items, etc.
  - Remembers sidebar scroll in both rail and overlay modes using sessionStorage keys keyed by pathname + mode.
- Overlays:
  - `window.toggleModelSelector` ensures both the main menu and legacy submenu open, even if the UI changes.
  - `Ctrl+/` shortcut overlay copies `popup.css` (stored as `FULL_POPUP_CSS`) to a shadow DOM to display current assignments.
- Global exports include `window.toggleSidebar`, `window.newConversation`, `window.globalScrollToBottom`, `window.clickGptHeaderThenSubItemSvg`, `window.toggleModelSelector`, clipboard helpers, and toast utilities.

### popup.html / popup.js / popup.css
- UI sections (Cloud Sync, Model Picker, UI Tweaks, Quick Clicks, Scroll, Clipboard, Compose+Send, Regenerate, Message Tools, Utilities) map 1‑1 with chrome.storage keys. Every label/tooltip is localized via `_locales`.
- `popup.js` duties:
  - Localizes `<title>` and `[data-i18n]` text, then runs `initTooltips()`, `balanceWrappedLabels()`, and tooltip-boundary nudging to keep tooltips legible.
  - Maintains `ShortcutUtils` shared API (display text, normalization, conflict detection). `saveShortcutValue` writes canonical KeyboardEvent.code strings, enforces duplicates via `showDuplicateModal`, and persists NBSP (`\u00A0`) for cleared slots.
  - Model picker chips: `window.MODEL_NAMES` (10 visible entries, no `'→'` arrow) and `window.__modelPickerKeyCodes` caches load from storage, merge with defaults from `shared/model-picker-labels.js`, and update chips + tooltips. A segmented pill component (`.p-segmented-controls`) toggles Alt vs Control for model hotkeys by wiring hidden radios.
  - Popup search/filter bar attaches to `.shortcut-container`, builds a list of headings/items, and filters + highlights matches without destroying layout.
  - Cloud Sync UI: login button requests `identity` permission, then triggers `CloudAuth.googleLogin`. Save/Restore buttons call `CloudStorage.saveSyncedSettings/loadSyncedSettings`, showing spinner states via `busy()` and success checkmarks via `successFlash()`. Logout clears CloudAuth tokens/profile.
  - Duplicate modal: Reusable overlay that lists conflicting assignments, supports “Don’t ask again”, and can run in simple HTML mode for general confirmations.
  - Toast queue: `window.toast.show()` uses GSAP when available, falls back to CSS transitions.
- `popup.css` mirrors the overlay CSS inside `content.js`. When tweaking layout, keep the embedded `FULL_POPUP_CSS` string in sync to avoid drift between popup and the Ctrl+/ overlay.

### Cloud sync helpers (background.js, auth.js, storage.js)
- `background.js` is the only component allowed to launch the OAuth flow (`chrome.identity.launchWebAuthFlow`). It requires the popup to request the optional `identity` permission first; the service worker cannot prompt on its own due to the lack of a user gesture.
- Tokens (`access_token`, `refresh_token`, expiry) are stored in `chrome.storage.session` under `csp_auth_*` keys to avoid syncing credentials. `auth.js` (running in the popup/content context) requests tokens via `CloudAuth.getAuthToken({interactive})`, refreshing only on explicit user actions.
- `CloudStorage` (storage.js) reads/writes only the known option keys (derived from `OPTIONS_DEFAULTS`). It caches the Drive file id (`csp_cloud_file_id_v1`), retries on 401/403 by clearing cached tokens, and merges remote data with local settings when needed.

### Options & shared data
- `options-storage.js` centralizes all defaults, including slider values (stored as strings), boolean toggles, shortcut defaults, model names, and `modelPickerKeyCodes`. It registers migrations to normalize Arrow key symbols, pad model key arrays to 15 entries, and collapse legacy message-selection flags into `messageSelection`.
- `vendor/webext-options-sync.js` is a stub that mimics the `webext-options-sync` API (with `getAll`, `set`, `setAll`, `migrations.removeUnused`). Always load it before `options-storage.js`.
- `shared/model-picker-labels.js` exposes `window.ModelLabels` (canonical test-id→name map, default names with a `→` slot, helpers to strip hint text, and label fallback logic). Both popup and content script rely on this to keep model names resilient to ChatGPT DOM changes.

### Assets, localization, and directories
- `_locales/*/messages.json` contains all user-facing strings (labels, tooltips, status messages). Any new UI copy must be added to every locale.
- `lib/` GSAP bundles and `tools/*.zip` backups are read-only; do not modify them.
- `icons/` contains shipped UI icons; add new assets rather than replacing existing ones.
- Tests (if/when added) belong in `tests/` and should be runnable via `npm test`.

## Behavior & workflow invariants
- Settings propagation: `chrome.storage.sync` is the authority. `content.js` calls `chrome.storage.sync.get([...])` once, applies defaults through `applyVisibilitySettings`, and listens to `chrome.storage.onChanged` to update runtime flags. Any new key must be added to (1) the initial `get` list, (2) the `applyVisibilitySettings` map, and (3) `options-storage.js` defaults.
- Shortcut handling: `ShortcutUtils` normalizes everything to `KeyboardEvent.code`. Digits treat `DigitX` and `NumpadX` as equivalent. Clearing an input writes NBSP to storage. Duplicate detection distinguishes between model slots and popup shortcuts depending on whether the model picker is set to Alt or Control.
- Model picker: `window.MODEL_NAMES` must never include the legacy `→` arrow once data is hydrated; storage arrays are filtered to 10 visible slots. `window.toggleModelSelector` opens both main and legacy menu content and relies on selectors from `shared/model-picker-labels.js`. Keeping these helpers synced avoids DOM-fragile selectors throughout the codebase.
- Copy sanitization: `selectThenCopy` and `selectThenCopyAllMessages` transform DOM content into HTML+plain text pairs that preserve code fences, CRLF endings, and Word-friendly spacing. Don’t bypass these helpers; adjust their utilities (`splitByCodeFences`, `removeMarkdown`, `buildPlainTextWithFences`) if you need new behavior.
- Top bar to bottom + slim sidebar: The bottom bar injector is guarded by URL checks and login-state detection. It diff-injects static buttons, segmented model switcher, and opacity sliders, and re-runs on DOM mutations. Slim sidebar fading respects overlay state and full sidebar visibility; both features rely on chrome.storage flags and should remain in sync.
- PageUp/PageDown takeover: Toggleable via `pageUpDownTakeover`. It installs/removes keydown & wheel/touch listeners dynamically.
- Remember sidebar scroll position: Stores per-path/mode scroll positions in `sessionStorage`, using mutation observers to detect when the overlay or rail becomes visible.
- Auto-click helpers: Watch for warning dialogs and “Something went wrong” containers; they must remain resilient and only target relevant nodes to avoid accidental clicks.

## Adding or adjusting shortcuts/toggles
1. Defaults & storage: Add the key to `OPTIONS_DEFAULTS` (with migrations if needed), update `popup.html` input/label/tooltip (plus `_locales` entries), and insert the key into the `chrome.storage.sync.get` list inside `content.js`.
2. Runtime wiring: Update `applyVisibilitySettings` (if it’s a toggle) and add logic inside the relevant shortcut map (Alt/Ctrl sections) in `content.js`. For Alt shortcuts, ensure conflicts are handled via `ShortcutUtils.buildConflictsForCode`.
3. Popup binding: Add the input ID to the arrays handled by `popup.js` (the script pulls most inputs via selectors, but new IDs must be included wherever `shortcutKeys` or other lists are defined). Use `data-sync="<storageKey>"` so the generic binding logic persists it.
4. Localization: Create `_locales` entries for labels/tooltips/status messages, then reference them via `data-i18n` or `data-tooltip`.
5. Documentation: Update `CHANGELOG.md` for user-visible changes.

## Cloud sync workflow
- Optional permission `identity` must be granted from a user gesture (popup buttons). The service worker will reject login attempts if that permission is missing.
- Tokens live in `chrome.storage.session` only. Never store them in sync or local storage.
- Saving (`popup.js` Cloud Sync tile) calls `CloudStorage.loadLocalSettings` then `saveSyncedSettings` (both in `storage.js`). `loadLocalSettings` uses `optionsStorage.getAll()` when available, or `chrome.storage.sync.get(null)`, then filters to `OPTIONS_DEFAULTS` keys via `pickOptions`; `modelNames` is excluded from this payload so Drive snapshots never carry model labels. `saveSyncedSettings` writes the filtered object as JSON to Drive `appDataFolder/extension_settings.json` (file id cached as `csp_cloud_file_id_v1`).
- Restoring calls `CloudStorage.loadSyncedSettings` → `saveLocalSettings` → `rehydrateSettingsUI` (all from `storage.js` or `popup.js`). `loadSyncedSettings` downloads the Drive JSON, trims it to `OPTIONS_DEFAULTS` keys, and excludes `modelNames`; `saveLocalSettings` writes the filtered object back to sync storage (via `optionsStorage.setAll` when present). `rehydrateSettingsUI` refreshes shortcut inputs, mirrors non-shortcut options, reapplies `modelPickerKeyCodes`, and ignores `modelNames` so local labels/migrations stay authoritative.
- `CloudStorage._clearKnownFileId()` should be used if you ever invalidate the cached Drive file id.

## Settings export, import, and sync wiring
- Local file export lives in `popup.js` (`settingsBackupInit` → `exportSettingsToFile`). It builds an allowlist from `DEFAULT_PRESET_DATA` (popup defaults, not `OPTIONS_DEFAULTS`) plus all `shortcutKeys`, reads the entire `chrome.storage.sync` snapshot, and emits only keys that exist in that set. Every shortcut is forced into a `KeyboardEvent.code` via `effectiveShortcutCode`; `modelPickerKeyCodes` are read from the visible grid/UI cache and normalized to `MODEL_PICKER_MAX_SLOTS`; `modelNames` are explicitly removed before serialization so exports never include model labels. The downloaded JSON is `{ __meta, data }`, where `__meta` holds the manifest version and timestamp.
- Local file import is also in `popup.js` (`importSettingsFromFile` → `importSettingsObj`). Parsed JSON uses `data` when present, drops any `modelNames` field, then filters keys against the same allowlist. Shortcut values are normalized to codes/NBSP, merged over the current `chrome.storage.sync` snapshot, and saved; UI is rehydrated, with `modelPickerKeyCodes` cached + `modelPickerHydrated` dispatched when provided. Model names from the file are ignored so local labels and migrations remain intact.
- Drive save/restore flows reuse `CloudStorage` (see Cloud sync workflow above). Those paths exclude `modelNames` via `pickOptions`, so Drive uploads/downloads never read or write model labels.
- Model name sources: `options-storage.js` seeds `modelNames` defaults (10 entries, no `→`); `shared/model-picker-labels.js` defines `MAX_SLOTS=15` and `defaultNames()` (includes an arrow slot and legacy labels); `content.js` scrapes menu labels into `modelNames` + `modelNamesAt` in sync storage via `__cspSaveModelNames`; `popup.js` hydrates `window.MODEL_NAMES` from storage/`ModelLabels` defaults (dropping the arrow) for rendering and ignores external sources (exports, imports, Drive) for `modelNames`.

## Testing & validation
- Run `npm ci && npm test` before merging any change. This is the canonical pass/fail gate.
- Optional scripts: `npm run lint` / `npm run format` (if they exist) can be used to maintain consistency.

## Style & safety rails
- JS: 4-space indentation, single quotes, semicolons. HTML: 4 spaces. CSS: 2 spaces. Keep comments concise and only for non-obvious logic.
- Localization is mandatory for all user-visible text (popup labels, tooltips, toasts, status lines, Cloud sync messages, overlay copy).
- Do not edit or remove third-party bundles in `lib/`, archived builds (`*.zip`), or shipped icons. Add new assets instead.
- Service worker code must stay event-driven; don’t introduce timers or long-lived loops.
- Respect existing permissions; do not add new permissions or host matches without explicit approval.
- Update `CHANGELOG.md` for behavior-visible changes and keep `_locales` in sync.
- The user may have edited files already; never revert unrelated changes and avoid destructive git commands.
