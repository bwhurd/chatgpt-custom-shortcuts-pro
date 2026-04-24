- Investigation findings:
  - The Playwright scrape path already captures menu-only states without reloads via `latest-open-menu` and bounded step sequences in `tests/playwright/lib/devscrape-wide-core.mjs`.
  - The runtime dump registry in `extension/lib/DevScrapeWide.js` currently ends at the model-refresh dump family (`2j`) and does not yet include composer plus-menu or header conversation-options menu states.
  - Live probing already confirmed stable triggers for the requested menus: `button[data-testid="composer-plus-btn"]`, the nested composer `More` submenu item, and `button[data-testid="conversation-options-button"]`.

- Scope:
  - Add deterministic runtime dump definitions for the composer `Add files and more` menu, its nested `More` submenu, and the header `conversation-options-button` menu.
  - Extend the Playwright step engine to open and capture those menus after the existing menu-digging path, with no extra reloads.
  - Update the runtime scrape validator spec inventory and capture-path notes to include the new menu states.

- Out of scope:
  - New popup, userscript, or extension-hosted dev controls.
  - Broad redesign of the checker beyond low-risk identifier coverage that naturally fits these new dump states.
  - New Chrome permissions, host access changes, or release-surface changes.

- Implementation:
  - Extend `extension/lib/DevScrapeWide.js` dump registry with three new post-`2j` dump definitions and any small checker additions that directly map current shortcut identifiers to those captured menus.
  - Extend `tests/playwright/lib/devscrape-wide-core.mjs` with simple helpers to open the composer plus-menu, open its nested `More` submenu, and open the header conversation-options menu, then route them through the existing no-reload step engine and `latest-open-menu` capture type.
  - Keep the new path bounded: close prior transient UI between artifacts, probe multiple matching buttons/menuitems where necessary, and avoid reloads between captures.
  - Update `specs/0006-runtime-scrape-selector-validator-spec.md` so the dump inventory and durable capture notes reflect the new composer/header menu states.

- Validation:
  - `node --check tests/playwright/lib/devscrape-wide-core.mjs`
  - `node --check tests/playwright/devscrape-wide.mjs`
  - `node --check extension/lib/DevScrapeWide.js`
  - `node tests/playwright/devscrape-wide.mjs --action scrape-wide`
  - `node tests/playwright/devscrape-wide.mjs --action check-wide --folder <new-folder>`

- Done when:
  - The scrape produces the three new menu dump files in the same no-reload run as the existing inventory.
  - The new dumps are recorded in the run manifest and spec inventory.
  - The follow-up checker run still succeeds, or any newly surfaced missing identifiers are explicit in the report rather than silent omissions.

- Related specs:
  - `specs/0006-runtime-scrape-selector-validator-spec.md`
  - `specs/0004-model-picker-and-shortcuts-spec.md`
