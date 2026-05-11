# Packaged Extension Biome Pass Plan

## Goal

- [x] Run Biome against the Biome-supported files that enter the extension release zip and leave the packaged surface passing without refactoring shipped behavior.

## Current posture

- [x] `scripts/build-zip.js` defines the packaged surface with `includeItems` and archive exclusions for `lib/DevScrapeWide.js`, `lib/DevScrapeNarrow.js`, and `shared/shortcut-action-metadata.js`.
- [x] The packaged surface currently contains 23 Biome-supported files: 14 JavaScript files, 7 JSON files, 1 CSS file, and 1 HTML file.
- [x] Project-local Biome is already installed as `@biomejs/biome@2.3.2`; use `.\node_modules\.bin\biome.cmd` instead of the machine-level Biome on `PATH`.
- [x] Initial packaged-file `biome check` reported 3,135 diagnostics:
  - 3,124 linter diagnostics in `extension/lib/*.min.js`.
  - 11 format-only diagnostics in locale JSON, `background.js`, `options-storage.js`, `popup.css`, `settings-schema.js`, and `vendor/webext-options-sync.js`.
- [x] `extension/vendor/webext-options-sync.js` is user-managed source and should remain in the packaged Biome target set.

## Scope

- [x] Touch only Biome configuration and packaged files with safe, equivalent formatting changes.
- [x] Treat minified GSAP library files as third-party packaged assets: exclude their lint surface in Biome config rather than rewriting generated/minified code.
- [x] Fix format-only diagnostics when Biome can apply a mechanical formatter change without altering runtime flow or file ordering.

## Out of scope

- [x] Do not refactor extension runtime logic, event wiring, storage flow, or shortcut invariants.
- [x] Do not apply optional chaining or other linter rewrites inside minified third-party libraries.
- [x] Do not broaden extension permissions, manifest host access, or release zip contents.

## Execution batches

- [x] Add a narrow `biome.json` file exclusion for `extension/lib/*.min.js` so Biome does not lint minified packaged dependencies.
- [x] Apply formatter-only fixes to the 11 non-minified packaged files flagged by the initial check.
- [x] Re-run the same packaged-file Biome check generated from `scripts/build-zip.js` include and exclusion rules.
- [x] If any remaining diagnostic is behavior-sensitive, suppress it narrowly or flag it for a separate pass instead of making a speculative code change.

## Validation

- [x] Validate the project-local Biome install with `.\node_modules\.bin\biome.cmd --version` and `npm ls @biomejs/biome --depth=0`.
- [x] Run `.\node_modules\.bin\biome.cmd check --reporter=json <packaged supported files>` using the generated packaged-file list.
- [x] Run a final readable packaged-file `biome check` after fixes.

## Done when

- [x] Packaged supported files pass Biome with the local project Biome binary.
- [x] Any risky diagnostics are suppressed or explicitly called out for separate evaluation.
- [x] The plan is archived as `Done-0050-packaged-extension-biome-pass-plan.md`.
