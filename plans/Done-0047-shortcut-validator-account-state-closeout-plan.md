# Shortcut Validator Account/State Closeout Plan

Related specs: `specs/0004-model-picker-and-shortcuts-spec.md`, `specs/0006-runtime-scrape-selector-validator-spec.md`

## Findings

- [x] Thinking Standard and Thinking Extended need model-switcher state setup that starts from Latest, then opens Thinking before validating the options.
- [x] Thinking Light and Thinking Heavy are account-level unavailable for this profile and should be explicit expected-unavailable items, not broken shortcuts.
- [x] Search conversation works manually, so the live probe likely needs better focus/state setup instead of treating the current failure as a product break.
- [x] Temporary Chat requires a blank new conversation state before triggering the shortcut.
- [x] Study and Think Longer have been removed from ChatGPT and should become inert/hidden from user shortcut grids.
- [x] New GPT Conversation must be live-probed only from the GPT conversation fixture URL, and it needs active storage key lookup because it has no shipped default key.
- [x] Previous Thread requires a prior Next Thread activation and a 1500ms settle delay before the previous button is available.
- [x] Repeated live probe runs can trigger ChatGPT security warnings, so final iteration should use targeted probes and pause browser-mutating actions.

## Implementation

- [x] Update shortcut metadata for account-level unavailable and removed ChatGPT features.
- [x] Remove Study and Think Longer from popup/settings/overlay user-facing shortcut grids while keeping legacy metadata explicit.
- [x] Add live probe setup modes for search, temporary-chat new-conversation state, GPT-conversation state, and thinking model menu state.
- [x] Read active extension shortcut assignments for live probes before falling back to defaults.
- [x] Temporarily assign validation-only shortcut keys for probeable actions with no active key, then restore storage.
- [x] Add targeted `probe-shortcuts` action for failure-point iteration without full scrape/report reruns.
- [x] Add 350ms browser-interaction pacing and larger URL/reload spacing for live probes.
- [x] Keep no-token safeguards: do not submit, regenerate, or start a response.
- [x] Re-run targeted live probes for changed/failing paths and stop repeated full live runs after security warning.

## Validation

- [x] `node --check extension/shared/shortcut-action-metadata.js`
- [x] `node --check tests/playwright/lib/shortcut-target-inventory.mjs`
- [x] `node --check tests/playwright/lib/devscrape-wide-core.mjs`
- [x] `node --check tests/playwright/devscrape-wide.mjs`
- [x] `node --check extension/lib/DevScrapeWide.js`
- [ ] PowerShell parse check for controller/wrapper scripts if edited
- [x] `node tests/playwright/devscrape-wide.mjs --action validate-wide --probe-shortcuts`
- [x] `node tests/playwright/devscrape-wide.mjs --action probe-shortcuts --shortcut-action-id shortcutKeyNewGptConversation`
- [x] `node tests/playwright/devscrape-wide.mjs --action probe-shortcuts --shortcut-action-id shortcutKeyPreviousThread`
- [x] `node tests/playwright/devscrape-wide.mjs --action probe-shortcuts --shortcut-action-id shortcutKeySearchWeb --shortcut-action-id shortcutKeyCreateImage --shortcut-action-id shortcutKeyToggleCanvas --shortcut-action-id shortcutKeyAddPhotosFiles`

## Closeout Note

- Browser live probes were stopped after repeated runs produced a ChatGPT security warning. Treat the last targeted results as the closeout state: New GPT Conversation, Previous Thread, and the buried composer tool targets passed individually with paced interaction. Avoid additional full live reruns unless a new code change requires it.
