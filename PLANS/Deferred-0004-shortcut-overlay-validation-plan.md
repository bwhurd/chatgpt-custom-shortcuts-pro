## Goal
Fix the `Ctrl + /` shortcuts overlay in `content.js` so that:
- The **model picker grid** stays unchanged (still driven by `modelPickerKeyCodes` + existing model label extraction/hydration).
- All **non-model** sections show **only currently assigned** shortcuts.
- Overlay **labels match** the popup’s setting labels (what users see in `popup.html` after i18n).
- Newly added shortcut inputs in `popup.html` automatically appear in the overlay (no future “update the overlay list too” work); if categorization is unknown, they still appear in a safe catch‑all section.

## Constraints / invariants
- [x] Do **not** touch or reason about the large minified `FULL_POPUP_CSS` template string in the overlay IIFE (treat as opaque).
- [x] Preserve current overlay open/close behavior (trigger, close button, ESC, click-outside).
- [x] Keep key display formatting unchanged (`displayFromCode(...)` behavior and output).
- [x] Keep model picker grid logic unchanged (names + keys remain sourced the same way as today).
- [x] Make minimal, low-risk adjustments; add guards/fallbacks instead of brittle assumptions.

## What I verified in the current codebase (so the plan matches reality)
- The overlay IIFE in `content.js` currently groups items using `window.CSP_SETTINGS_SCHEMA.shortcuts.overlaySections` (with a hardcoded fallback list).
- Labels for non-model shortcuts are currently derived from storage keys via `keyToLabel(...)`, which causes multiple label mismatches vs the popup.
- `settings-schema.js` `overlaySections` currently omits several popup shortcut keys (e.g., Share, New Custom GPT Conversation, Branch In New Chat, Cancel Dictation, Read Aloud), so those never render even when assigned.
- The popup’s “true” labels come from i18n keys on `popup.html` elements (e.g., `label_focus_input`, `label_copy`, `label_select_copy`, etc.), not from camel-case storage key names.

---

## Proposed plan (checklist style; execute 5 items at a time)

### Phase 0 — Confirm baseline + identify sources of truth
- [x] Confirm the exact overlay entrypoint(s) (the `Ctrl + /` handler in `content.js`) and verify we can change label/list logic without touching model grid logic.
- [x] Confirm the overlay is shortcuts-focused (no non-shortcut “state rows” like icon-only items; `label_off` is out of scope).
- [x] Inventory all `input.key-input[data-sync]` in `popup.html` and capture, per key: section header context + label source (i18n key and/or fallback text).
- [x] Cross-check the issue list (111): confirm each mismatch/missing item maps to a real popup shortcut input + user-visible label.
- [x] Validate which popup “shortcut” inputs are actually persisted in `chrome.storage.sync` (exclude read-only/pseudo inputs like `shortcutKeyShowShortcuts` that are not in `OPTIONS_DEFAULTS`).

Notes captured during Phase 0 (to guide implementation)
- Overlay open trigger is hardcoded to `Ctrl + /` in `content.js` and does not depend on `shortcutKeyShowShortcuts`.
- Missing overlay items are primarily caused by `settings-schema.js` `overlaySections` omitting keys that exist in `popup.html` (e.g., Share, New Custom GPT Conversation, Branch In New Chat, Cancel Dictation, Read Aloud).
- Label mismatches are primarily caused by `keyToLabel(...)` deriving labels from storage key names instead of the popup’s i18n labels.

### Phase 1 — Make the overlay list/labels popup-driven (future-proof)
- [x] Add a safe way for `content.js` to obtain a “shortcut metadata” view of the popup (section ordering + per-shortcut label source) from `popup.html` at runtime, with caching to avoid repeated work.
- [x] Validate the above works without new permissions/manifest changes (implemented via `fetch(chrome.runtime.getURL('popup.html'))`; failure falls back cleanly).
- [x] Implement robust fallbacks if metadata can’t be loaded (offline/blocked/error): keep overlay functional using current schema grouping + current label fallback, rather than failing.
- [x] Ensure the overlay’s “assigned only” filter is driven exclusively by actual stored shortcut values (NBSP/empty/unset are omitted), not by whether a key exists in schema lists.
- [x] Add a low-risk catch‑all section for any assigned shortcut keys that are not found in the popup-derived metadata (so newly added shortcuts still surface even if something changes).

Notes captured during Phase 1 (superseded by Phase 5 pivot)
- The popup-fetch metadata approach was implemented but removed because MV3 blocks content-script fetches of extension resources without `web_accessible_resources` (see Phase 5).
- `shortcutKeyShowShortcuts` remains intentionally excluded from overlay rows because it’s a read-only/pseudo popup control and not a normal stored shortcut key.

### Phase 2 — Render non-model sections from metadata (fix labels + missing items)
- [x] Replace `keyToLabel(...)` usage for non-model rows with popup-aligned labels (prefer i18n keys used by `popup.html`; fallback to popup text; last-resort to `keyToLabel`).
- [x] Ensure the specific label mismatches in (111) are corrected when assigned:
  - [x] `shortcutKeyActivateInput` → “Focus Chat Input”
  - [x] `shortcutKeyPreviousThread` → “Go to Previous Thread”
  - [x] `shortcutKeyNextThread` → “Go to Next Thread”
  - [x] `shortcutKeySearchConversationHistory` → “Search Chats”
  - [x] `shortcutKeyClickNativeScrollToBottom` → “Scroll to Bottom”
  - [x] `selectThenCopy` → “Select + Copy One Message”
  - [x] `selectThenCopyAllMessages` → “Join + Copy All Messages”
  - [x] `shortcutKeyCopyAllCodeBlocks` → “Join + Copy All Code Boxes”
  - [x] `shortcutKeyEdit` → “Edit Message”
  - [x] `shortcutKeyToggleDictate` → “Dictate”
- [x] Ensure the missing items in (111) appear in the overlay when assigned (and are omitted when unassigned):
  - [x] Share (`shortcutKeyShare`)
  - [x] New Custom GPT Conversation (`shortcutKeyNewGptConversation`)
  - [x] Click Copy Button (`shortcutKeyCopyLowest`)
  - [x] Branch In New Chat (`shortcutKeyMoreDotsBranchInNewChat`)
  - [x] Cancel Dictation (`shortcutKeyCancelDictation`)
  - [x] Read Aloud (`shortcutKeyMoreDotsReadAloud`)
- [x] Confirm model picker grid output is unchanged (same model names, same shortcut rendering rules, same ordering).

### Phase 3/4 — Superseded by Phase 5
The original popup-fetch approach is being replaced. Validation + final sanity are now tracked in Phase 5.

---

### Phase 5 — Pivot + Full Checklist (authoritative plan going forward)
Context (why we’re pivoting)
- The current “popup-driven” approach attempts `fetch(chrome.runtime.getURL('popup.html'))` from the **content script** to derive overlay section/label metadata.
- In MV3, that fetch fails with `TypeError: Failed to fetch` unless the target file is declared in `manifest.json > web_accessible_resources` for the current origin.
- Exposing `popup.html` as a WAR is not ideal (page scripts on `chatgpt.com` could fetch it). So the simplest, lowest-risk plan is to stop scraping `popup.html` at runtime and instead use a shared schema (already loaded before `content.js`) that maps shortcut keys → i18n keys.

Decision
- [x] **Path A: Shared schema with i18n keys** (no WAR, no background/offscreen).

Path A — Shared schema with i18n keys (authoritative checklist)
- [x] Define `window.CSP_SETTINGS_SCHEMA.shortcuts.labelI18nByKey` in `settings-schema.js` (key → popup label i18n key).
- [x] Convert `window.CSP_SETTINGS_SCHEMA.shortcuts.overlaySections` in `settings-schema.js` to use localized section headers (store `headerI18nKey`, keep a `header` fallback), and include all shortcut keys that should appear in the overlay.
- [x] Remove the content-script `fetch(chrome.runtime.getURL('popup.html'))` metadata path from the overlay IIFE in `content.js` (no WAR dependency).
- [x] Render overlay row labels from `labelI18nByKey` via `chrome.i18n.getMessage(...)`, with safe fallback to `keyToLabel(...)`.
- [x] Keep the existing “assigned only” filtering + catch-all “Other” section (now also using `labelI18nByKey` where possible).
- [x] Keep the model picker grid logic unchanged (continue using `modelPickerKeyCodes` + existing hydration).
- [x] Add/keep a defensive “extension reload / stale content script” guard: detect invalidated extension context, log once, and stop intercepting Ctrl+/ until the page is reloaded.

Quick validation (after implementation)
- [ ] Reload extension + reload ChatGPT tab, then open overlay: labels match popup (localized) and no “Failed to fetch” errors.
- [ ] Verify the (111) list items (mismatches + missing keys) display correctly when assigned and are omitted when unassigned.
- [ ] Verify an unknown/new assigned shortcut still appears under “Other” with a reasonable fallback label.

Docs / cleanup (after pivot)
- [x] Update `AGENTS.md` to reflect the real source-of-truth after the pivot (schema-driven, not popup-fetch-driven).
- [x] Ensure `CHANGELOG.md` entry remains accurate after pivot.
- [x] Add a reminder in `AGENTS.md` to include new shipped files in `build-zip.js` (and confirm no new extension-runtime files were added for this fix).
