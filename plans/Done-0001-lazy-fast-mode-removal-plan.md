# Lazy Fast Mode Removal

## Goal

- [x] Remove the inert experimental Lazy Fast Mode feature from shipped extension code, settings wiring, release packaging, validation fixtures, and live subsystem docs.
- [x] Leave only concise historical notes where they prevent confusion about prior Fast Mode references.

## Investigation Findings

- [x] Before cleanup, Fast Mode shipped inert behind full-disable constants in `extension/lazy-fast-bootstrap.js`, `extension/content.js`, `extension/popup.js`, and `extension/options-storage.js`.
- [x] Before cleanup, the runtime still included two disabled proof blocks plus the native controller in `extension/content.js`.
- [x] Before cleanup, the manifest still registered `lazy-fast-bootstrap.js` at `document_start`, and `lazy-fast-bridge.js` was still listed as a web-accessible resource.
- [x] Before cleanup, `scripts/build-zip.js` still packaged both lazy-fast scripts.
- [x] Before cleanup, `lazyFastModeEnabled` still appeared in options defaults, popup preset defaults, settings schema visibility defaults, popup HTML/JS, locale strings, and the settings fixture.
- [x] Before cleanup, `PROJECT_SPEC.md`, `specs/0001-adding-new-settings-spec.md`, `specs/0002-lazy-fast-mode-spec.md`, `CHANGELOG.md`, and historical plans still described Fast Mode as active or upcoming.

## Scope

- [x] Delete shipped Lazy Fast Mode entrypoint files once all references are removed.
- [x] Remove content-world Fast Mode code from `extension/content.js` without changing unrelated shortcut, model, copy, or UI tweak logic.
- [x] Remove the `lazyFastModeEnabled` setting from first-run defaults, import/export/default preset data, popup UI, locale strings, schema visibility defaults, and test fixtures.
- [x] Update package and manifest surfaces so release zips no longer include or expose lazy-fast scripts.
- [x] Update docs so current docs say the experiment was removed instead of documenting live behavior.

## Out of Scope

- [x] Do not introduce replacement lazy loading, virtualized rendering, new ChatGPT DOM hooks, or new extension permissions.
- [x] Do not modify archived `Done-` or `Deferred-` plans except this plan's final rename.
- [x] Do not broaden popup cleanup beyond removing the Fast Mode toggle and its supporting strings/wiring.

## Likely Owning Files

- [x] Runtime and packaging: `extension/content.js`, `extension/lazy-fast-bootstrap.js`, `extension/lazy-fast-bridge.js`, `extension/manifest.json`, `scripts/build-zip.js`.
- [x] Settings and popup: `extension/options-storage.js`, `extension/settings-schema.js`, `extension/popup.html`, `extension/popup.js`, `extension/_locales/*/messages.json`, `tests/fixtures/settings.json`.
- [x] Docs: `AGENTS.md`, `PROJECT_SPEC.md`, `specs/0001-adding-new-settings-spec.md`, `specs/0002-lazy-fast-mode-spec.md`, `CHANGELOG.md`, this plan.

## Execution Batches

- [x] Remove runtime entrypoints.
  - [x] Delete `extension/lazy-fast-bootstrap.js` and `extension/lazy-fast-bridge.js`.
  - [x] Remove the corresponding `content_scripts` and `web_accessible_resources` manifest entries.
  - [x] Remove the lazy-fast files from `scripts/build-zip.js`.
- [x] Remove content runtime code.
  - [x] Delete the disabled Lazy Fast Mode POC block.
  - [x] Delete the disabled Lazy Fast Mode history surface block.
  - [x] Delete the native manual expansion controller block.
  - [x] Remove `lazyFastModeEnabled` from the content visibility fallback/default map.
- [x] Remove settings and popup wiring.
  - [x] Delete the option default and migration/kill-switch code in `extension/options-storage.js`.
  - [x] Delete the visibility default in `extension/settings-schema.js`.
  - [x] Delete the popup toggle row, popup kill-switch constants, popup default preset key, and availability sync function.
  - [x] Delete Fast Mode label/tooltip/runtime message keys from every locale file.
  - [x] Remove `lazyFastModeEnabled` from `tests/fixtures/settings.json`.
- [x] Update docs and notes.
  - [x] Remove Fast Mode from current project capability and architecture descriptions.
  - [x] Convert `specs/0002-lazy-fast-mode-spec.md` into a short tombstone that says the experiment was removed and where historical detail lives.
  - [x] Remove the Fast Mode worked example from `specs/0001-adding-new-settings-spec.md` or replace it with a brief removed-feature note.
  - [x] Update `CHANGELOG.md` so the in-development note no longer promises Fast Mode.
  - [x] Update `AGENTS.md` routing so Fast Mode is historical cleanup context, not a live runtime surface.
- [x] Run a final reference sweep for `lazyFast`, `lazy-fast`, `csp-lazy`, `Lazy Fast`, and `Fast Mode`.
  - Current docs may retain only concise removed-experiment notes.
  - Shipped code and fixtures must retain no Fast Mode wiring.

## Validation

- [x] Run `npm run validate:keys`.
- [x] Run `npx biome check` on changed shipped JS/HTML/JSON/Markdown files where supported.
- [x] Run a targeted reference sweep and verify remaining Fast Mode hits are only historical docs or archived plans.

## Done When

- [x] No shipped extension file registers, packages, injects, reads, writes, renders, or localizes Lazy Fast Mode.
- [x] The removed setting no longer appears in settings defaults, schema, popup presets, or fixtures.
- [x] Current docs clearly state the experiment was removed instead of presenting Fast Mode as active or upcoming.
- [x] Targeted validators pass or any remaining validation limitation is documented here and in the final response.
