# DevScrape Validation Automation Closeout Plan

Related specs: `specs/0006-runtime-scrape-selector-validator-spec.md`

## Findings

- [x] `validate-wide` runs scrape, check, report, and open-report, but still fails early when no Chrome/CDP endpoint is already running.
- [x] `setup-login` already knows how to launch the standard `CodexCleanProfile` with remote debugging, so the validation runner can reuse that launch path.
- [x] The Playwright checker now covers metadata harvesting, target match groups, shortcut-first reporting, and guard failures; the remaining closeout is automation and stale-surface cleanup.

## Implementation

- [x] Add automatic Chrome/CDP launch for `scrape-wide` and `validate-wide` when no candidate endpoint is reachable.
- [x] Keep `--no-auto-launch` as a manual troubleshooting escape hatch.
- [x] Keep `setup-login` behavior available for first-time login and load the local unpacked extension for extension-state captures.
- [x] Remove or isolate stale in-extension `CHECK_RULES` reporting so it no longer looks like the authoritative validator path.
- [x] Update `run-devscrape-validation.ps1` and `specs/0006-runtime-scrape-selector-validator-spec.md` for the one-command validation posture.

## Validation

- [x] `node --check tests/playwright/devscrape-wide.mjs`
- [x] `node --check tests/playwright/lib/devscrape-wide-core.mjs`
- [x] `node --check extension/lib/DevScrapeWide.js`
- [x] `node tests/playwright/devscrape-wide.mjs --action check-wide --folder 2026-04-23_21-18-54_devscrapewide_c-69ea4723`
- [x] PowerShell parse check for `tests/playwright/run-devscrape-validation.ps1`
- [x] Live `node tests/playwright/devscrape-wide.mjs --action validate-wide` auto-launched Chrome, scraped the fixture, wrote reports, and opened the HTML report. The existing authenticated profile does not expose the local unpacked extension, so only optional `1c` was deferred; metadata validation completed with zero inventory issues and zero failed artifacts.
