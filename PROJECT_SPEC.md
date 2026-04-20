# Project Spec

This file is the durable project overview for ChatGPT Custom Shortcuts Pro. Use it for broad architecture, stable conventions, and cross-cutting constraints that should survive across threads. Use `AGENTS.md` for routing, `SPECS/` for deeper subsystem detail, `PLANS/` for active/deferred work, and `_temp-files/` for ignored scratch or copied reference artifacts.

## Project identity

- ChatGPT Custom Shortcuts Pro is an MV3 Chrome extension for `chatgpt.com`.
- It adds configurable keyboard shortcuts, popup-controlled UI tweaks, model-switcher hotkeys, copy helpers, and optional Google Drive settings sync.
- The unpacked extension source lives under `extension/`. The extension shell is defined by `extension/manifest.json`, `extension/background.js`, and the popup files; runtime behavior on ChatGPT pages is driven primarily by `extension/content.js` plus the Fast Mode bootstrap and bridge files.

## User-facing capabilities

- configurable shortcuts for scrolling, copying, regenerate flows, compose and send helpers, message tools, and utilities
- popup-controlled UI tweaks such as moving the top bar to the bottom, fading the slim sidebar, showing legacy arrows, and click-to-copy inline code
- model switching and Configure Models actions through popup-assigned hotkeys and the Ctrl+/ overlay
- copy flows that preserve code fences and Word-friendly spacing
- optional Google login plus Drive save or restore for settings
- experimental Fast Mode wiring for very long conversations

## Architecture at a glance

### Extension shell

- `extension/manifest.json`
  - MV3 manifest, default locale `en`, `storage` permission, optional `identity`, popup entrypoint, and content-script registration for `*://*.chatgpt.com/*`
- `extension/background.js`
  - service worker and OAuth broker for `chrome.identity.launchWebAuthFlow`

### Runtime on ChatGPT pages

- `extension/content.js`
  - main content-world runtime for shortcuts, DOM automation, overlays, copy helpers, UI tweaks, and model actions
- `extension/lazy-fast-bootstrap.js`
  - `document_start` gate for Fast Mode enablement and bridge injection
- `extension/lazy-fast-bridge.js`
  - page-world Fast Mode interception and native conversation mutation path

### Popup and shared settings surface

- `extension/popup.html`, `extension/popup.js`, `extension/popup.css`
  - settings UI, import or export, Cloud Sync actions, tooltip and duplicate-shortcut behavior, and popup preview surface
- `extension/options-storage.js`
  - storage defaults, migrations, and the canonical shipped settings key set
- `extension/settings-schema.js`
  - shared settings schema for popup grouping and content-side visibility wiring
- `extension/shared/model-picker-labels.js`
  - canonical grouped model-action metadata and label helpers shared by popup and content

### Cloud Sync helpers

- `extension/auth.js`
  - token fetch, refresh, and logout helper for popup or content contexts
- `extension/storage.js`
  - filtered local or Drive save and restore helper for settings

## Stable conventions and constraints

- `chrome.storage.sync` is the single source of truth for settings. New settings should originate from `OPTIONS_DEFAULTS` in `options-storage.js` and flow through popup and runtime wiring.
- Popup-visible text must be localized in every shipped locale file under `extension/_locales/*/messages.json`.
- `extension/shared/model-picker-labels.js` is the canonical source for model labels, grouped model actions, and popup or overlay parity. Do not split model-action truth across multiple hardcoded lists.
- The Ctrl+/ overlay depends on both linked `extension/popup.css` and the embedded `FULL_POPUP_CSS` copy in `extension/content.js`; shared popup styling changes must keep those in sync.
- `extension/background.js` is the only component allowed to launch the OAuth flow. Tokens stay in `chrome.storage.session`, not in sync or local storage.
- The extension does not request the `tabs` permission. Popup or background logic must not depend on URL-filtered `chrome.tabs.query({ url: ... })` lookups.
- The current top-bar-to-bottom approach keeps the injected bottom bar in normal document flow immediately after the composer form. Do not switch back to a fixed or body-mounted model without explicit project direction.
- `rememberSidebarScrollPositionCheckbox` is intentionally hidden and inert pending a redesign.
- If a task adds shipped files or folders under `extension/`, `scripts/build-zip.js` `includeItems` must be updated so release zips remain complete. Release zips must still place `manifest.json` at the zip root, not inside an `extension/` folder.
- `netlify.toml` stays at the repo root because Netlify discovers project configuration there; keep `netlify/functions/` paired with it unless a deployment-specific pass changes the provider wiring.
- When a version bump or release zip build is part of the task, the generated `dist/*.zip` archive is part of the expected release artifact set unless the user says otherwise.

## Validation and tooling posture

- Popup and other extension-context UI work should be validated through the Playwright helper scripts in `tests/playwright/`, not by opening static HTML directly.
- `package.json` owns the authoritative local scripts for popup preview, popup screenshots, popup visual tests, and ChatGPT extension scenarios.
- Playwright extension-loading helpers load the unpacked extension from `extension/`; reload that folder in `chrome://extensions` during manual checks.
- `npm test` runs the popup visual Playwright suite and is the default shipped-behavior merge gate.

## Documentation posture

- `AGENTS.md` routes work and owns guardrails.
- `SPECS/` holds deep subsystem detail that is too specific or volatile for this overview.
- `PLANS/` holds active, deferred, blocked, and completed plan markdown using status-in-filename protocol.
- `_temp-files/` is a fully ignored local scratch area for copied inspector captures, reference scripts, and support material that should not be default startup reading.
- Older Codex plan material now lives under `PLANS/Done-*` as archive-only reference material.
