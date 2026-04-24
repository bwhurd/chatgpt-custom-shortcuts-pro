# Root Cleanup Audit Plan

- [x] Move the approved Group 2 root entries out of the project root.
- [x] Treat `scripts/build-zip.js` `includeItems` as the Chrome Web Store release zip authority.
- [x] Use `_temp-files/cleanup-root-of-project/` only for approved archive moves.
- [x] Move packaged extension files under `extension/` without changing their internal Chrome package layout.

## Root Entries Found

- `.css-cleanup/`
- `.git/`
- `.gitattributes`
- `.gitignore`
- `.playwright/`
- `.vscode/`
- `_locales/`
- `_temp-files/`
- `AGENTS.md`
- `Ahks - Shortcut.lnk`
- `auth.js`
- `background.js`
- `based-on-this.html`
- `biome.json`
- `scripts/build-zip.js`
- `CGCSP-Github.code-workspace`
- `CHANGELOG.md`
- `Clean-CSS-Interactive.ps1`
- `plans/Done-0019-codexplan-root-pointer-archive.md`
- `content.js`
- `CONTRIBUTING.md`
- `css-cleanup/`
- `dist/`
- `icon128.png`
- `icon16.png`
- `icon32.png`
- `icon48.png`
- `lazy-fast-bootstrap.js`
- `lazy-fast-bridge.js`
- `lib/`
- `manifest-with-lazy-fast-loaded.json`
- `manifest.json`
- `netlify/`
- `netlify.toml`
- `node_modules/`
- `options-storage.js`
- `package-lock.json`
- `package.json`
- `plans/`
- `popup.css`
- `popup.html`
- `popup.js`
- `Privacy-Policy.md`
- `PROJECT_SPEC.md`
- `README.md`
- `scrub-this-css.css`
- `settings-schema.js`
- `settings.json`
- `Setup-And-Clean-CSSv2.ps1`
- `shared/`
- `specs/`
- `storage.js`
- `docs/policies/TERMS.md`
- `test-results/`
- `tests/`
- `docs/reference/THIRD_PARTY.md`
- `tmp-bottom-bar-check.mjs`
- `tools/`
- `validate-keys.js`
- `vendor/`

## Release Zip Shipping List

- `manifest.json`
- `_locales/`
- `lib/`
- `vendor/`
- `shared/`
- `background.js`
- `content.js`
- `lazy-fast-bootstrap.js`
- `lazy-fast-bridge.js`
- `popup.js`
- `popup.html`
- `popup.css`
- `options-storage.js`
- `settings-schema.js`
- `storage.js`
- `auth.js`
- `icon128.png`
- `icon48.png`
- `icon32.png`
- `icon16.png`

## Group 1: Keep In Place

- `.git/` - repository metadata.
- `.gitattributes` - Git normalization metadata.
- `.gitignore` - root ignore policy, including scratch and generated folders.
- `.vscode/` - ignored local editor configuration; keep unless explicitly cleaning local editor state.
- `_locales/` - ships in the release zip.
- `_temp-files/` - designated scratch/reference archive root.
- `AGENTS.md` - root routing and policy doc.
- `auth.js` - ships in the release zip.
- `background.js` - ships in the release zip.
- `biome.json` - lint/format configuration used by package scripts.
- `scripts/build-zip.js` - release zip builder and shipping authority.
- `CGCSP-Github.code-workspace` - ignored local workspace file; keep unless explicitly cleaning local editor state.
- `CHANGELOG.md` - release/support documentation referenced by root docs and README.
- `plans/Done-0019-codexplan-root-pointer-archive.md` - legacy Codex plan pointer archive kept under `plans/`.
- `content.js` - ships in the release zip.
- `CONTRIBUTING.md` - contributor documentation referenced by README and package metadata.
- `dist/` - release output folder; `.gitignore` preserves `dist/*.zip`.
- `icon128.png` - ships in the release zip.
- `icon16.png` - ships in the release zip.
- `icon32.png` - ships in the release zip.
- `icon48.png` - ships in the release zip.
- `lazy-fast-bootstrap.js` - ships in the release zip.
- `lazy-fast-bridge.js` - ships in the release zip.
- `lib/` - ships in the release zip.
- `manifest.json` - ships in the release zip.
- `netlify/` - referenced by `netlify.toml`; do not inspect or move without a Netlify-specific pass.
- `netlify.toml` - Netlify function routing/config; manifest CSP allows the deployed Netlify endpoint.
- `node_modules/` - generated dependency install; do not archive to `_temp-files/`.
- `options-storage.js` - ships in the release zip.
- `package-lock.json` - dependency lockfile.
- `package.json` - script and dependency authority.
- `plans/` - active/deferred/done workstream plans.
- `popup.css` - ships in the release zip.
- `popup.html` - ships in the release zip.
- `popup.js` - ships in the release zip.
- `Privacy-Policy.md` - support/policy document kept at the repo root.
- `PROJECT_SPEC.md` - durable project overview.
- `README.md` - project public overview.
- `settings-schema.js` - ships in the release zip.
- `settings.json` - validation fixture used by `validate-keys.js`; if moved later, move with that helper instead of archiving alone.
- `shared/` - ships in the release zip.
- `specs/` - durable subsystem specs.
- `storage.js` - ships in the release zip.
- `docs/policies/TERMS.md` - support/policy document.
- `tests/` - active Playwright validation folder referenced by package scripts and routing docs.
- `docs/reference/THIRD_PARTY.md` - third-party attribution/reference document.
- `tools/` - ignored tool/archive folder referenced by root routing; keep as a whole unless a later tools-specific pass says otherwise.
- `vendor/` - ships in the release zip.

## Group 2: Moved Out Of Root

- [x] `.css-cleanup/` -> `_temp-files/cleanup-root-of-project/.css-cleanup/`
- [x] `.playwright/` -> `_temp-files/cleanup-root-of-project/.playwright/`
- [x] `Ahks - Shortcut.lnk` -> `_temp-files/cleanup-root-of-project/Ahks - Shortcut.lnk`
- [x] `based-on-this.html` -> `_temp-files/cleanup-root-of-project/based-on-this.html`
- [x] `Clean-CSS-Interactive.ps1` -> `_temp-files/cleanup-root-of-project/Clean-CSS-Interactive.ps1`
- [x] `css-cleanup/` -> `_temp-files/cleanup-root-of-project/css-cleanup/`
- [x] `manifest-with-lazy-fast-loaded.json` -> `_temp-files/cleanup-root-of-project/manifest-with-lazy-fast-loaded.json`
- [x] `scrub-this-css.css` -> `_temp-files/cleanup-root-of-project/scrub-this-css.css`
- [x] `Setup-And-Clean-CSSv2.ps1` -> `_temp-files/cleanup-root-of-project/Setup-And-Clean-CSSv2.ps1`
- [x] `test-results/` -> `_temp-files/cleanup-root-of-project/test-results/`
- [x] `tmp-bottom-bar-check.mjs` -> `_temp-files/cleanup-root-of-project/tmp-bottom-bar-check.mjs`
- [x] `validate-keys.js` -> `tests/validate-keys.js`

## Implemented Root Reorganization

- [x] Use one new top-level `extension/` folder for the actual Chrome extension source. This keeps the root simple while making the Chrome-loaded source obvious at a glance.
- [x] Preserve the internal extension layout inside `extension/`; do not add deeper `src/`, `popup/`, `assets/`, or `docs/` folders in this pass.
- [x] Keep the repo root for project control files and docs: `AGENTS.md`, `PROJECT_SPEC.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, package metadata, `.gitignore`, `.gitattributes`, and provider config like `netlify.toml`.
- [x] Keep purpose folders at root: `plans/`, `specs/`, `tests/`, `tools/`, `_temp-files/`, `dist/`, `netlify/`, and generated local folders such as `node_modules/`.
- [x] Rewire `scripts/build-zip.js` to read `extension/manifest.json` and archive every `includeItems` entry from `extension/` into the zip root, preserving the Chrome Web Store package layout.
- [x] Rewire Playwright extension-loading helpers to load the unpacked extension from `extension/` instead of the repo root.
- [x] Move `settings.json` to `tests/fixtures/settings.json`, update `tests/validate-keys.js`, and add `npm run validate:keys`.
- [x] Remove the stale `package.json` `clean` script instead of reviving the archived CSS cleanup workflow.
- [x] Update `AGENTS.md` file boundaries so future agents know shipped files live under `extension/` and validation helpers live under `tests/`.
- [x] Update `PROJECT_SPEC.md` broad architecture language so it says the extension shell/source lives under `extension/`, release zips are built from that folder, and root-level docs/tooling remain outside the packaged extension.

## Intended Layout

- [x] `extension/` - unpacked MV3 extension source and the source of the release zip payload.
- [x] `tests/` - Playwright workflows, validation helpers, and test fixtures.
- [x] `netlify/` - Netlify support service code.
- [x] `tools/` - retained local utilities and support archives.
- [x] `plans/` and `specs/` - workstream plans and durable subsystem docs.
- [x] `_temp-files/` - ignored scratch, archived cleanup items, inspector captures, and reference material.
- [x] `dist/` - generated release zips.

## Remaining Validation

- [x] Run key validation via bundled Node: `node tests/validate-keys.js` completed with no missing or unused keys after updating the fixture and JSON-only whitelist.
- [x] Run zip build via bundled Node: `node scripts/build-zip.js` created `dist/4.5.1.4-1.zip`.

## Final Tooling Placement

- [x] Move the release builder from the repo root to `scripts/build-zip.js`.
- [x] Keep `biome.json` at the repo root because Biome expects a root configuration file there.
- [x] Inspect the zip file list: `manifest.json` is at the zip root and no entries are prefixed with `extension/`.
- [x] Run a popup smoke load from `extension/`: Chromium loaded `popup.html`, found `.shortcut-container`, found 86 controls, and reported no console or page errors.
- [x] Resolve the popup visual baseline mismatch: update the popup screenshot harness to expand the scrollable popup container only for full-content snapshots, regenerate `popup-visual-win32.png` at `1100x2737`, and rerun `popup-visual.spec.mjs` successfully.
- [x] Confirm extension reload path through Playwright: fresh Chromium contexts load the unpacked extension from `extension/`, open `popup.html`, and render without console or page errors. Manual reload in a persistent personal Chrome profile remains a user action before interactive use.

## Final Local Clutter Cleanup

- [x] Remove ignored root-local leftovers that were still making the repo look noisy: `.playwright/`, `.vscode/`, `CGCSP-Github.code-workspace`, `node_modules/`, and `test-results/`.
- [x] Keep intentional root surfaces in place: `extension/`, `tests/`, `dist/`, `plans/`, `specs/`, `_temp-files/`, project docs, packaging metadata, and `netlify/`.
