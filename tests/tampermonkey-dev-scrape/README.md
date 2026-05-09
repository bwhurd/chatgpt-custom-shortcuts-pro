# Retired Tampermonkey DevScrapeWide

This folder is retained only as a historical experiment. Do not use it for the current runtime scrape validator.

Use one of these instead:

- `ahk-tray-tools/StartDevScrapeValidator.ps1` for the Windows tray/controller workflow.
- `tests/playwright/run-devscrape-validation.ps1` for the direct Playwright validator.

Files:

- `build-userscript.mjs`
  Reads `extension/lib/DevScrapeWide.js` and the current `extension/content.js`, derives the source-audit metadata the checker needs, then generates the installable userscript.
- `chatgpt-devscrape-wide.user.js`
  Generated userscript output for Tampermonkey.

Notes:

- `extension/lib/DevScrapeWide.js` remains the source of truth for the scrape/check logic.
- The generated script is not part of the supported validation workflow.
