# Shortcut Action Metadata Validator Plan

Related specs: `specs/0004-model-picker-and-shortcuts-spec.md`, `specs/0006-runtime-scrape-selector-validator-spec.md`

## Investigation Findings

- [x] Current runtime shortcut defaults and active Alt handler ownership live in `extension/content.js` under `shortcutDefaults` and `keyFunctionMappingAlt`.
- [x] `tests/playwright/lib/shortcut-target-inventory.mjs` currently owns both shortcut rows and target rows, so it can drift from future runtime shortcut changes even though it already checks defaults and handler keys.
- [x] `tests/playwright/lib/devscrape-wide-core.mjs` already writes a shortcut-first JSON/HTML report with failed and partial shortcut rows promoted near the top.
- [x] `extension/lib/DevScrapeWide.js` owns the scrape state registry and fixture URL used by Playwright; its dev-only helper is excluded from shipped zips by `scripts/build-zip.js`.
- [x] `StartDevScrapeValidator.ps1` already reads `failingShortcutRows`, `partialShortcutRows`, and `summary.shortcuts`, so report shape changes should preserve those fields.

## Ownership Boundaries

- [x] Runtime shortcut action metadata: add a small declarative source file under `extension/shared/` that owns action-level validation metadata and reusable target descriptor helpers without executing `content.js`.
- [x] Runtime behavior: leave `extension/content.js` shortcut defaults, handler bodies, and keydown flow unchanged except for exposing or aligning metadata only if a low-risk reference is needed.
- [x] Scrape state registry: keep `DUMP_REGISTRY` and fixture ownership in `extension/lib/DevScrapeWide.js`; derive known scrape states and filenames from it during checks.
- [x] Target descriptor registry: move target definitions out of the Playwright-only shortcut inventory and into the new metadata source using explicit helpers such as `byTestId`, `byId`, `byAriaControls`, `byInputName`, `byIconToken`, `byMenuChain`, `manualOnly`, and `notApplicable`.
- [x] Playwright checker/report generation: keep scrape/check code under `tests/playwright/`, read the metadata source directly, enforce drift guards, and preserve shortcut-first plus target-second reporting.
- [x] Tray/controller display: keep `StartDevScrapeValidator.ps1` and `DevScrapeValidatorTray.ahk` consuming the current JSON fields unless implementation proves a narrow compatibility tweak is needed.

## Deterministic Harvesting And Enforcement

- [x] Harvest shortcut metadata by importing the new metadata module directly in Node, not by parsing arbitrary handler bodies.
- [x] Harvest runtime shortcut universe from `content.js` `shortcutDefaults` plus `keyFunctionMappingAlt` keys for completeness only.
- [x] Fail loudly when any runtime shortcut lacks explicit metadata, when metadata references an action absent from the runtime universe without an explicit non-handler/default classification, or when a handler/default expectation is not met.
- [x] Fail loudly when action metadata references an unknown target ref or when a target references an unknown scrape state id from `DUMP_REGISTRY`.
- [x] Keep manual-only and not-applicable shortcuts as explicit validation modes with empty or manually covered target refs, so intentional exclusions remain visible in the report.
- [x] Require future shortcuts to add metadata by making missing action metadata an inventory issue that turns the checker result into a failure.

## Implementation Phases

- [x] Phase 1 - Add metadata source (`extension/shared/shortcut-action-metadata.js`):
  - [x] Define the descriptor helper convention and action registry shape.
  - [x] Migrate existing shortcut inventory rows and target rows into explicit action and target metadata.
  - [x] Keep the module safe for Node import and browser loading, with no Chrome or DOM access.
- [x] Phase 2 - Update inventory adapter (`tests/playwright/lib/shortcut-target-inventory.mjs`):
  - [x] Import the metadata source and adapt it into the existing checker inventory model.
  - [x] Resolve scrape state ids to filenames from `DUMP_REGISTRY`.
  - [x] Replace source-pattern target guessing with explicit target descriptors and completeness guards.
- [x] Phase 3 - Update checker/report (`tests/playwright/lib/devscrape-wide-core.mjs` and `tests/playwright/devscrape-wide.mjs` if needed):
  - [x] Pass scrape registry data into inventory construction.
  - [x] Preserve shortcut summary counts, `failingShortcutRows`, `partialShortcutRows`, target rows, and controller-compatible JSON fields.
  - [x] Add required scrape states/files to the shortcut table and dependent shortcut ids to the target table.
- [x] Phase 4 - Verify controller/tray compatibility (`StartDevScrapeValidator.ps1`, `DevScrapeValidatorTray.ahk`):
  - [x] Confirm failed and partial shortcut rows still display from the generated report.
  - [x] Make only narrow compatibility updates if the report fields need to expand.
- [x] Phase 5 - Update durable docs:
  - [x] Update `specs/0004-model-picker-and-shortcuts-spec.md` with the metadata requirement for new shortcuts.
  - [x] Update `specs/0006-runtime-scrape-selector-validator-spec.md` with the new source-of-truth and guard behavior.

## Validation Commands

- [x] `node --check extension/shared/shortcut-action-metadata.js`
- [x] `node --check tests/playwright/lib/shortcut-target-inventory.mjs`
- [x] `node --check tests/playwright/lib/devscrape-wide-core.mjs`
- [x] `node --check tests/playwright/devscrape-wide.mjs`
- [x] `node tests/playwright/devscrape-wide.mjs --action check-wide --folder <latest-known-good-folder>`
- [x] If Chrome/CDP is available: `node tests/playwright/devscrape-wide.mjs --action validate-wide` was skipped because standard CDP ports were unavailable.
- [x] Verify `check-report.html` opens and lists shortcut-level failures/partials clearly.
- [x] Verify `StartDevScrapeValidator.ps1` still reads failed and partial shortcut rows correctly.
- [x] If AutoHotkey v1 exists at `C:\Program Files\AutoHotkey`, verify `DevScrapeValidatorTray.ahk` launches.

## Done When

- [x] Shortcut action metadata is declared in the owned metadata source rather than guessed from handler bodies.
- [x] Existing target inventory behavior is preserved in the shortcut-first report with a second target table.
- [x] Missing action metadata, unknown target refs, unknown scrape states, and runtime source drift all surface as failures.
- [x] Manual-only and not-applicable shortcuts remain explicit and visible.
- [x] The implementation keeps dev-only validation code out of shipped zip artifacts and does not add Chrome permissions.
- [x] Relevant specs are updated and this plan is renamed to `Done-0042-shortcut-action-metadata-validator-plan.md`.

## Open Questions And Blockers

- [x] No design blocker remains; live `validate-wide` still depends on an available Chrome/CDP endpoint.
