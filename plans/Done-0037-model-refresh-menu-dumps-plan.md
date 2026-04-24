## Investigation Findings

- `specs/0004-model-picker-and-shortcuts-spec.md` keeps the model-refresh source of truth in `content.js`, especially the `scrapeModelCatalogOnce` flow.
- `scrapeModelCatalogOnce` opens the model switcher menu, enters the `model-configure-modal` dialog, opens the combobox listbox, and iterates configure options to collect frontend rows.
- `specs/0006-runtime-scrape-selector-validator-spec.md` currently only includes the existing `2d` model switcher menu dump, so the Playwright runtime scrape does not yet capture the rest of the model-refresh UI states.

## Scope

- Add runtime scrape dump files for the model-refresh UI states opened by `scrapeModelCatalogOnce`.
- Reuse the existing authenticated Playwright fixture and no-token-spend posture.
- Keep the implementation simple: exact menu/dialog/listbox targets from the model-refresh flow, not a new generic submenu engine.

## Out Of Scope

- Do not change the popup `Refresh Models` user-facing behavior.
- Do not add new checker identifiers unless the new dump family requires them later.

## Implementation

- Extend `extension/lib/DevScrapeWide.js` dump registry with named model-refresh dumps after `2d`.
- Add Playwright helpers in `tests/playwright/lib/devscrape-wide-core.mjs` for:
  - closing the configure dialog cleanly
  - opening the configure dialog from the model switcher menu
  - opening the combobox listbox
  - selecting each configure option and capturing the resulting dialog state
- Update `specs/0006-runtime-scrape-selector-validator-spec.md` with the expanded dump inventory.

## Validation

- Syntax-check the touched Playwright files.
- Run `scrape-wide` on the authenticated fixture and confirm the new model-refresh dump files are written.
- Run `check-wide` on that folder and confirm the existing identifier audit still passes.
