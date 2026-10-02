# Project Spec

This file is the durable project overview for ChatGPT Custom Shortcuts Pro. Use it for broad architecture, stable conventions, and cross-cutting constraints that should survive across threads. Use `AGENTS.md` for routing, `specs/` for deeper subsystem detail, `plans/` for active or deferred work, and `_temp-files/` for ignored scratch or copied reference artifacts.

## Project identity

- ChatGPT Custom Shortcuts Pro is an MV3 Chrome extension for `chatgpt.com`.
- It adds configurable keyboard shortcuts, popup-controlled UI tweaks, model-switcher hotkeys, copy helpers, and optional Google Drive settings sync.
- The unpacked extension source lives under `extension/`. The extension shell is defined by `extension/manifest.json`, `extension/background.js`, and the popup files; runtime behavior on ChatGPT pages is driven primarily by `extension/content.js`.

## User-facing capabilities

- configurable shortcuts for scrolling, copying, regenerate flows, compose and send helpers, message tools, and utilities
- popup-controlled UI tweaks such as moving the top bar to the bottom, fading the slim sidebar, showing legacy arrows, and click-to-copy inline code
- model switching and Configure Models actions through popup-assigned hotkeys and the configurable shortcuts overlay
- copy flows that preserve code fences and Word-friendly spacing
- optional Google login plus Drive save or restore for settings

## Architecture at a glance

### Extension shell

- `extension/manifest.json`
  - MV3 manifest, default locale `en`, `storage` permission, optional `identity`, popup entrypoint, and content-script registration for `*://*.chatgpt.com/*`
- `extension/background.js`
  - service worker and OAuth broker for `chrome.identity.launchWebAuthFlow`

### Runtime on ChatGPT pages

- `extension/content.js`
  - main content-world runtime for shortcuts, DOM automation, overlays, copy helpers, UI tweaks, and model actions

### Retired experiments

- Experimental Fast Mode / lazy-loading code was removed after shipping inert. There is no live setting, manifest entry, bootstrap script, page bridge, or content runtime for it.

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
- Prefer existing shared helpers and sources of truth before adding new wiring. Check `ShortcutUtils`, GSAP plugins, `CloudAuth`, `CloudStorage`, and `extension/shared/model-picker-labels.js` before introducing parallel logic.
- `extension/shared/model-picker-labels.js` is the canonical source for model labels, grouped model actions, and popup or overlay parity. Do not split model-action truth across multiple hardcoded lists.
- The shortcuts overlay depends on both linked `extension/popup.css` and the embedded `FULL_POPUP_CSS` copy in `extension/content.js`; shared popup styling changes must keep those in sync.
- `extension/background.js` is the only component allowed to launch the OAuth flow. Tokens stay in `chrome.storage.session`, not in sync or local storage.
- The extension does not request the `tabs` permission. Popup or background logic must not depend on URL-filtered `chrome.tabs.query({ url: ... })` lookups.
- The current top-bar-to-bottom approach keeps the injected bottom bar in composer document flow: mount it inside ChatGPT's native post-composer utility row when that structural row is available, otherwise fall back immediately after the composer form. Prefer a fully populated utility row, but accept its one-menu-button hydration state when no complete candidate exists. During blank-chat cold hydration, keep an unresolved or Work-mode standalone row pending until the mode resolves to Chat or the native row appears, so the fallback never paints as a separate blank-Work row. Leave blank-chat `#conversation-header-actions` and its temporary/group-chat controls in the native header; move that React-owned container into the bottom-right slot only after stable post-conversation Share or conversation-options controls materialize, and return it to its remembered native header parent whenever those controls disappear. Do not switch back to a fixed or body-mounted model without explicit project direction.
- When relevant first-message DOM changes arrive during the bottom-bar controller's own-mutation suppression window, schedule one bounded reconcile after suppression ends. Do not replace that event-driven repair with polling, a permanent timer, or a second broad observer.
- The current app shell uses `form[data-chatgpt-composer]`, `[data-thread-scroll-footer]`, and the main-titlebar header-obstacle slot instead of the older IDs. Keep its native model/effort controls in the composer. Keep the React-owned header-obstacle slot in its native parent and position its conversation actions at the bottom using the bottom row's CSS anchor; reparenting this slot can crash ChatGPT during React reconciliation. `composer-layout.css` loads at `document_start`, removes the hidden disclaimer's reserved row, and leaves 20px below the composer with the bar disabled, or no bottom padding with the bar enabled (20px lower, as requested). A single early settings read reserves the bar's 38px flow footprint until the controller mounts it; no new layout observer or polling is needed.
- `rememberSidebarScrollPositionCheckbox` is intentionally hidden and inert pending a redesign.
- If a task adds shipped files or folders under `extension/`, `scripts/build-zip.js` `includeItems` must be updated so release zips remain complete. Release zips must still place `manifest.json` at the zip root, not inside an `extension/` folder.
- `netlify.toml` stays at the repo root because Netlify discovers project configuration there; keep `netlify/functions/` paired with it unless a deployment-specific pass changes the provider wiring.
- When a version bump or release zip build is part of the task, the generated `dist/*.zip` archive is part of the expected release artifact set unless the user says otherwise.

## Validation and tooling posture

- Run `npm test` for popup changes. For other UI or overlay work, use Playwright only when the user explicitly asks for it or smaller local/manual checks cannot prove the change.
- If Playwright is explicitly requested, first-time local setup in this repo is `npm ci` followed by `npm run playwright:install`; keep the install project-local so the scripted commands in `package.json` stay the source of truth.
- Reload the unpacked extension from `extension/` in `chrome://extensions` before trusting manual or Playwright checks after shipped `extension/**` changes.
- If Playwright is explicitly requested, prefer the narrowest command that can fail on the change: popup preview/screenshot for quick inspection, `npm run test:popup-visual` for popup regressions, and `npm run playwright:chatgpt:*` only for live ChatGPT-page flows.
- `npm run playwright:install` installs browsers before the first Playwright run on a machine.
- `package.json` owns the authoritative local scripts for popup preview, popup screenshots, popup visual tests, and ChatGPT extension scenarios.
- `npm run preview:popup` and `npm run screenshot:popup` are the quick popup inspection paths.
- `npm run test:popup-visual` is an alias for the popup regression suite; `npm run test:popup-visual:update` is only for intentional popup baseline updates.
- `npm run playwright:chatgpt:*` covers ChatGPT-page extension flows.
- `npm test` runs three isolated Chromium checks: the approved expanded-popup image, unmodified 784x580 layout/scrolling plus one toggle's sync-storage save/reopen round trip, and rejection of deliberately clipped content. It checks unexpected page errors and console warnings/errors. It does not prove every setting, shortcut execution, or live ChatGPT selectors. The existing image baseline is Windows-specific; no login is required.
- For contributor reviews, run `npm run check` and `npm run test:validators` for maintained code/tool changes; use `npm run check:text` for doc-only changes. `check` combines Biome with the text checker; `test:validators` tests static-validator success/failure cases in isolated fixtures. Run `npm run validate:keys` for changes to popup controls, settings defaults/schema, locale keys, or settings fixtures; it checks real-project static settings wiring.
- Biome includes maintained `.mjs` source and excludes generated outputs, captured benchmarks, personal editor settings, deployment-owned Netlify files, and plan evidence. The text checker covers eligible tracked and nonignored untracked files, preserves empty modules, and ignores generated/vendor/minified/personal inputs. `--write` repairs that same candidate set only when explicitly requested; contributor review commands stay read-only.
- Popup test aliases use `scripts/run-popup-tests.js` to avoid conflicting color environment flags while preserving warning reporting, CLI arguments, and failure exit status. Tests wait for observable hydration and fonts, use fresh temporary profiles, and leave shipped runtime and approved baselines unchanged.
- `specs/0006-runtime-scrape-selector-validator-spec.md` owns the dev-only runtime selector scrape/check workflow. Its dumps belong under `_temp-files/inspector-captures/` and its popup/report assets must stay out of shipped release zips.

## Documentation posture

- `AGENTS.md` routes work and owns guardrails.
- `specs/` holds deep subsystem detail that is too specific or volatile for this overview.
- `plans/` holds active, deferred, blocked, and completed plan markdown using status-in-filename protocol.
- `_temp-files/` is a fully ignored local scratch area for copied inspector captures, reference scripts, and support material that should not be default startup reading.
- Older Codex plan material now lives under `plans/Done-*` as archive-only reference material.
- `ahk-tray-tools/README.md` owns local usage, settings, credential, privacy, and recovery guidance for the developer tray.

### Instruction ownership test: `AGENTS.md` vs. specs

Use this test to decide where an instruction belongs:

- Keep an instruction in `AGENTS.md` only if omitting it would likely cause Codex to read the wrong files, expand scope unnecessarily, skip a required plan or validation step, use the wrong tool, or make an unsafe change before opening subsystem docs.
- Put an instruction in `PROJECT_SPEC.md` when it defines a stable project fact or cross-cutting rule that more than one subsystem relies on.
- Put an instruction in a file under `specs/` when it changes the correct implementation only after the task matches a specific feature, file family, or subsystem.
- In `AGENTS.md`, keep only the trigger that tells Codex when to open the owning spec plus any repo-wide safety rule that must be followed first.
- If a rule names files, modules, UI behaviors, or data flow that only matter inside one subsystem, move the rule to that subsystem spec.
- If Codex could follow the rule correctly only after reading subsystem context, the rule does not belong in `AGENTS.md`.
