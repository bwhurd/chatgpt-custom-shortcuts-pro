# Shortcut Metadata Matching Closeout Plan

Related specs: `specs/0006-runtime-scrape-selector-validator-spec.md`

## Findings

- [x] Shortcut metadata is now harvested from `extension/shared/shortcut-action-metadata.js`, but checker matching still treats every target's `searchNeedles` as loose alternatives.
- [x] Composite targets need deterministic match groups so multi-token identifiers require all tokens while fallback selectors can remain alternatives.
- [x] The report already preserves shortcut-first and target-second shape, so this pass should keep JSON compatibility while adding matcher detail.

## Implementation

- [x] Add target `matchGroups` metadata and helper normalization in `extension/shared/shortcut-action-metadata.js`.
- [x] Convert composite targets, especially multi-token icon targets, to require grouped matches instead of loose any-token matches.
- [x] Update `tests/playwright/lib/devscrape-wide-core.mjs` to use match groups for expected/all matched file checks.
- [x] Add guard issues for scrape-covered targets that lack deterministic match groups.
- [x] Update `specs/0006-runtime-scrape-selector-validator-spec.md` with the target match group convention.

## Validation

- [x] `node --check extension/shared/shortcut-action-metadata.js`
- [x] `node --check tests/playwright/lib/shortcut-target-inventory.mjs`
- [x] `node --check tests/playwright/lib/devscrape-wide-core.mjs`
- [x] `node tests/playwright/devscrape-wide.mjs --action check-wide --folder 2026-04-23_21-18-54_devscrapewide_c-69ea4723`
- [x] Metadata drift probe still reports baseline zero issues and missing metadata when a probe shortcut is injected.
- [x] Archive this plan as `Done-0043-shortcut-metadata-matching-closeout-plan.md`.
