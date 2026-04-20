# Spec: Cloud Sync And Settings Data Flow

Use this when changing or repairing:
- Google login / logout
- Drive save or restore
- local settings export or import
- allowlisting of synced settings
- `modelNames` handling across local storage, exports, and Drive

This is the durable data-flow reference. Keep live task sequencing in `PLANS/` when a Cloud Sync change needs a plan; do not use this file as a backlog.

## Owning files

- `background.js`
  - the only place allowed to launch `chrome.identity.launchWebAuthFlow`
- `auth.js`
  - popup/content helper for interactive token fetch, refresh, and logout
- `storage.js`
  - Drive file read/write and filtered local save/restore helper
- `popup.js`
  - login/save/restore buttons plus local file export/import UI
- `options-storage.js`
  - source of truth for which option keys are considered real settings

## Core auth invariants

- `identity` is optional and must be requested from a user gesture in the popup.
- The service worker cannot prompt for that permission on its own.
- OAuth tokens must stay in `chrome.storage.session` under the `csp_auth_*` keys.
- Do not move tokens into sync or local storage.
- `background.js` stays event-driven and is the only component allowed to run the web auth flow.

If login breaks, check this sequence first:
1. popup requests `identity`
2. popup calls `CloudAuth.googleLogin`
3. service worker launches web auth flow
4. exchanged tokens land in `chrome.storage.session`

## Drive save / restore flow

### Save

Popup path:
- `popup.js` Cloud Sync tile
- `CloudStorage.loadLocalSettings()`
- `CloudStorage.saveSyncedSettings()`

Important data rules:
- `loadLocalSettings()` reads current local settings, prefers `optionsStorage.getAll()` when available, then filters through `pickOptions()`
- `pickOptions()` uses `OPTIONS_DEFAULTS` as the allowlist
- `modelNames` is excluded from the payload
- Drive target is `appDataFolder/extension_settings.json`
- cached Drive file id key: `csp_cloud_file_id_v1`

### Restore

Popup path:
- `CloudStorage.loadSyncedSettings()`
- `CloudStorage.saveLocalSettings()`
- `rehydrateSettingsUI()`

Important data rules:
- downloaded Drive JSON is filtered back through the same known-key allowlist
- `modelNames` is excluded again on restore
- `saveLocalSettings()` writes only filtered keys back to sync storage
- `rehydrateSettingsUI()` refreshes popup state, shortcut inputs, and `modelPickerKeyCodes`

Retry behavior:
- `CloudStorage` clears stale token/file-id state on `401` / `403` style failures and retries through the helper path

## Local file export / import flow

### Export

Popup path:
- `settingsBackupInit()`
- `exportSettingsToFile()`

Important data rules:
- allowlist is built from `DEFAULT_PRESET_DATA` plus `shortcutKeys`
- snapshot source is the full `chrome.storage.sync` object
- only allowlisted keys are serialized
- every shortcut is normalized through `effectiveShortcutCode()`
- `modelPickerKeyCodes` are normalized to the full picker slot count
- `modelNames` is explicitly removed
- file shape is `{ __meta, data }`

### Import

Popup path:
- `importSettingsFromFile()`
- `importSettingsObj()`

Important data rules:
- parsed JSON uses `data` when present
- `modelNames` is dropped before merge
- imported keys are filtered against the same popup allowlist
- shortcut values are normalized back to `KeyboardEvent.code` / NBSP
- imported values merge over the current sync snapshot before save
- popup UI is rehydrated after save

## `modelNames` invariant

`modelNames` is intentionally local/scraped state, not a portable user setting.

That means:
- do not export it
- do not import it
- do not upload it to Drive
- do not restore it from Drive

Current sources of truth:
- `options-storage.js` seeds defaults
- `shared/model-picker-labels.js` defines label fallbacks and slot count
- `content.js` can scrape fresh model labels from ChatGPT into sync storage
- `popup.js` hydrates visible model labels from local storage / shared defaults

If model labels look wrong after restore, do not try to “fix” it by syncing `modelNames`. Fix the local hydration or scraping path instead.

## What must stay aligned

- `OPTIONS_DEFAULTS`
  - real setting keys
- `DEFAULT_PRESET_DATA`
  - popup-side export/import allowlist base
- `pickOptions()`
  - Drive allowlist
- popup rehydration
  - visible state after restore/import

If one of those drifts, cloud or import/export behavior becomes partial and confusing.

## Common failure modes

### New setting does not survive Drive restore

Usually means one of:
- key missing from `OPTIONS_DEFAULTS`
- key missing from popup defaults / allowlist
- popup rehydration does not mirror it back into UI

Use `SPECS/SPEC_ADDING_NEW_SETTINGS.md` for the full wiring path.

### Login button appears to do nothing

Usually means one of:
- popup never requested `identity`
- service worker was not the component asked to launch auth
- token state in `chrome.storage.session` is stale

### Imported shortcuts look wrong

Usually means one of:
- value was not normalized to `KeyboardEvent.code`
- cleared values were not preserved as NBSP
- `modelPickerKeyCodes` were not padded back to the expected slot count

## Repair checklist

When this subsystem breaks:
1. verify the key is in `OPTIONS_DEFAULTS`
2. verify popup defaults / allowlisting include it
3. verify Drive paths still filter through known keys only
4. verify `modelNames` is still excluded
5. verify popup rehydration mirrors imported/restored values back into controls
