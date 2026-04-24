# Tampermonkey DevScrapeWide

This folder holds the dev-only Tampermonkey entrypoint for the ChatGPT runtime scrape validator.

Files:

- `build-userscript.mjs`
  Reads `extension/lib/DevScrapeWide.js` and the current `extension/content.js`, derives the source-audit metadata the checker needs, then generates the installable userscript.
- `chatgpt-devscrape-wide.user.js`
  Generated userscript output for Tampermonkey.

Usage:

1. Run:
   `node tests/tampermonkey-dev-scrape/build-userscript.mjs`
2. Install or reload `chatgpt-devscrape-wide.user.js` in Tampermonkey.
3. Open ChatGPT. Three tiny bottom-right floating buttons should appear for:
   `Set Path`, `DevScrapeWide`, and `Check-Scrape`

Notes:

- The userscript is the current dev-only entrypoint for runtime scrape collection/checking.
- `extension/lib/DevScrapeWide.js` remains the source of truth for the scrape/check logic.
- The generated script carries only build-time source-presence metadata derived from the current `extension/content.js`, not the whole file contents.
