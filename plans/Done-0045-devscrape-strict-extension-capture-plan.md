# DevScrape Strict Extension Capture Plan

Related specs: `specs/0006-runtime-scrape-selector-validator-spec.md`

## Findings

- [x] Default `validate-wide` now completes the shortcut metadata validator even when the authenticated Chrome profile blocks the unpacked extension, because no shortcut target depends on optional `1c`.
- [x] The optional `1c` dump is the remaining gap for a validation run that includes every scrape state.
- [x] The current extension-id lookup only trusts service workers, so blocked or profile-registered extension states need a sharper diagnostic.

## Implementation

- [x] Add a strict extension-capture flag that turns deferred `1c` into a loud validation failure after the HTML report is written.
- [x] Add deterministic extension-id fallback from the Chrome profile's `Secure Preferences` when service worker discovery is unavailable.
- [x] Thread strict mode through `devscrape-wide.mjs`, `runWideScrapeWithPlaywright`, and `run-devscrape-validation.ps1`.
- [x] Update `specs/0006-runtime-scrape-selector-validator-spec.md` with default versus strict validation behavior.

## Validation

- [x] `node --check tests/playwright/lib/devscrape-wide-core.mjs`
- [x] `node --check tests/playwright/devscrape-wide.mjs`
- [x] PowerShell parse check for `tests/playwright/run-devscrape-validation.ps1`
- [x] `node tests/playwright/devscrape-wide.mjs --action check-wide --folder 2026-04-24_11-39-01_devscrapewide_c-69ea4723`
- [x] `node tests/playwright/devscrape-wide.mjs --action validate-wide --require-extension-capture` wrote the report and failed as expected because the current profile blocks `chrome-extension://dnnmjopemocomdffpcamjleolhjnocfm/...`.
- [x] `node tests/playwright/devscrape-wide.mjs --action validate-wide`
- [x] `npx biome check tests/playwright/lib/devscrape-wide-core.mjs tests/playwright/devscrape-wide.mjs extension/shared/shortcut-action-metadata.js tests/playwright/lib/shortcut-target-inventory.mjs`
- [x] AutoHotkey v1 tray launch smoke test started `DevScrapeValidatorTray.ahk` and stopped only the launched process.
