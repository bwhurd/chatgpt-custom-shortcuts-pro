# Weekly Manual Model Refresh Prompt Plan

## Current state
- The manual refresh prompt timing is controlled only in `popup.js`.
- It currently compares `modelCatalogRefreshPromptDay` against `getTodayDateKey()`.
- That means the center manual-refresh prompt is forced once per calendar day, but only when `popup.html` is opened.
- Outside the popup, the extension already appears to rely on stored data:
  - popup rendering hydrates from stored `modelCatalog` / `modelNames`
  - no popup-open auto-scrape remains
  - second-row config preview is popup-local and does not trigger scraping

## Goal
- Force the center manual-refresh prompt once per week instead of once per day.
- Keep the current behavior where nothing forces open `popup.html`; if the user does not open the popup, the extension should continue to rely on stored data only.

## Recommended change
1. Replace the stored day key with a stored week key.
   - Current key: `modelCatalogRefreshPromptDay`
   - Recommended replacement: `modelCatalogRefreshPromptWeek`
   - Store an ISO-like week token such as `2026-W12`

2. Replace `getTodayDateKey()` in `popup.js` with a shared weekly key helper.
   - Example output: `YYYY-Www`
   - The exact formatting is less important than stability.

3. Update `primeManualCatalogRefreshPrompt()` to compare the stored week token instead of the day token.
   - If stored week !== current week:
     - show the center manual-refresh prompt
     - save the current week token
   - Otherwise:
     - keep the prompt hidden

4. Keep the rest of the popup manual-refresh flow unchanged.
   - Header refresh button stays available when the center prompt is not showing.
   - Manual scrape still only runs on explicit user click.

5. Migration / compatibility
   - Smallest safe path:
     - add new storage default `modelCatalogRefreshPromptWeek`
     - leave old `modelCatalogRefreshPromptDay` unused
   - Optional cleanup later:
     - remove the old day key in a migration

## Mission critical note
- The second part of the request already appears satisfied:
  - the weekly prompt logic only runs when the popup opens
  - if the popup is never opened, nothing should force it open
  - the extension should continue using stored model data until the user manually refreshes again

## Files to change on implementation pass
- `options-storage.js`
- `popup.js`
- `AGENTS.md` only if you want the spec to mention weekly instead of daily
- `CHANGELOG.md`
