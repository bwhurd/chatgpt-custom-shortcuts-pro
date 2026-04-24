## Scope

- Add one simple validation entrypoint for the Playwright scrape/check workflow.
- Keep the existing scrape and check actions intact.
- Make the simple path open the generated HTML report automatically.

## Implementation

- Add a `validate-wide` action to `tests/playwright/devscrape-wide.mjs`.
- Have it run `scrape-wide`, then `check-wide` against the new folder, then open the HTML report.
- Add one simple wrapper file for manual use.
- Add a package script for the same path.

## Validation

- Syntax-check the touched files.
- Run the simple validation entrypoint once and confirm it produces a passing report.
