# Live Shortcut Activation Validator Plan

Related specs: `specs/0004-model-picker-and-shortcuts-spec.md`, `specs/0006-runtime-scrape-selector-validator-spec.md`

## Findings

- [x] The deterministic shortcut metadata inventory is the right source of truth for target ownership, scrape coverage, and future drift guards.
- [x] The remaining validation gap is behavioral: a target can exist in a scrape dump while the runtime shortcut handler still fails to find or activate it.
- [x] A live shortcut probe should reuse the metadata inventory and only execute explicitly safe actions; it must not infer targets from handler bodies or trigger token-spending ChatGPT actions.
- [x] The current detailed HTML report is useful for debugging, but the tray/controller needs a small human-facing first tab that summarizes success and failure without scrolling.

## Minimum Passes

- [x] Pass 1: Add explicit `activationProbe` metadata and inventory guards so every shortcut is classified before any live execution exists.
- [x] Pass 2: Implement the Playwright live activation runner for safe `click-target` and `focus-target` probes, with event instrumentation, state setup, cleanup, and no-token safeguards.
- [x] Pass 3: Merge live probe results into the report schema and generated HTML, preserving the current detailed shortcut/target tables as a second tab.
- [x] Pass 4: Add tray/controller summary handling so the default view is a compact dashboard table and detailed diagnostics remain one click away.

## Pass 1 - Metadata Foundation

- [x] Add activation probe modes to `extension/shared/shortcut-action-metadata.js`.
- [x] Require each shortcut action to carry an explicit `activationProbe` declaration, with manual-only and not-applicable shortcuts classified automatically by their helpers.
- [x] Add inventory guards for unknown probe modes, unknown probe target refs, and executable probes on manual-only/not-applicable shortcuts.
- [x] Surface activation probe metadata in shortcut inventory/report JSON without changing runtime behavior.
- [x] Validate the metadata module, inventory adapter, and existing saved-folder report.

## Pass 1 Validation

- [x] `node --check extension/shared/shortcut-action-metadata.js`
- [x] `node --check tests/playwright/lib/shortcut-target-inventory.mjs`
- [x] `node --check tests/playwright/lib/devscrape-wide-core.mjs`
- [x] `node tests/playwright/devscrape-wide.mjs --action check-wide --folder 2026-04-24_11-50-52_devscrapewide_c-69ea4723`
- [x] `npx biome check extension/shared/shortcut-action-metadata.js tests/playwright/lib/shortcut-target-inventory.mjs tests/playwright/lib/devscrape-wide-core.mjs tests/playwright/devscrape-wide.mjs`
- [x] Saved report has 7 `click-target`, 1 `focus-target`, 21 `not-live-probed`, 5 `manual-only`, 12 `not-applicable`, and 0 inventory issues.

## Pass 2 - Live Probe Runner

- [x] Add a Playwright action such as `probe-shortcuts` or a `validate-wide --probe-shortcuts` flag that runs after scrape/check.
- [x] For each executable probe, restore the fixture to its required state, install temporary page instrumentation, press the configured shortcut, and record the activated element.
- [x] Implement only no-token-safe probe types first:
  - `click-target`: confirms the click target matched the declared target ref.
  - `focus-target`: confirms active element or focus intent matched the declared target ref.
- [x] Block or skip probes for send, stop, regenerate, dictation submit, edit send, and any action that can submit, retry, generate, or depend on uncontrolled state.
- [x] Record result fields: `actionId`, `probeMode`, `expectedTargetRef`, `status`, `reason`, `observedSelector`, `observedTextSnippet`, and `durationMs`.

## Pass 3 - Report Shape

- [x] Extend `check-report.json` with a `liveProbeRows` array and a compact `summary.liveProbes` block.
- [x] Keep the existing shortcut-first and target tables intact as detailed diagnostics.
- [x] Add a simple first-tab dashboard to `check-report.html`:
  - one small summary table for metadata, scrape target audit, live probes, and artifact health
  - one short failure table grouped by human action: broken shortcut, missing target, unsafe/manual follow-up, environment/setup issue
  - no scrolling required for the common pass/fail summary
- [x] Move detailed shortcut rows, target rows, artifact failures, inventory issues, and match groups to a second tab.

## Pass 2-3 Validation

- [x] `node tests/playwright/devscrape-wide.mjs --action validate-wide --probe-shortcuts`
- [x] Live probe rows were written to `live-probes.json`; current profile reports 8 executable probes as `environment-fail` because Chrome blocks the unpacked extension URL.
- [x] `check-report.json` includes `summary.liveProbes` and `liveProbeRows`.
- [x] `check-report.html` opens on a Dashboard tab and keeps detailed diagnostics on a Details tab.
- [x] `--pause-for-extension-setup` and PowerShell `-PauseForExtensionSetup` are available for the next manual Chrome startup so the unpacked extension can be loaded once in Developer Mode before validation continues.
- [x] `node --check tests/playwright/devscrape-wide.mjs`
- [x] PowerShell parse check for `tests/playwright/run-devscrape-validation.ps1`

## Pass 4 - Tray/Controller Summary

- [x] Update `StartDevScrapeValidator.ps1` to read the new compact summary and show the same human-facing statuses as the report first tab.
- [x] Keep “Open Latest Report” opening the HTML report, with the simple dashboard as the default visible tab.
- [x] Add a strict/full run option only if it is clear in the UI; avoid making optional extension-profile issues look like shortcut regressions.
- [x] Verify `DevScrapeValidatorTray.ahk` still launches and stops without owning duplicate validation logic.

## Pass 4 Validation

- [x] `node tests/playwright/devscrape-wide.mjs --action setup-login --pause-for-extension-setup` skips the pause when the installed extension is already reachable.
- [x] `node tests/playwright/devscrape-wide.mjs --action validate-wide --probe-shortcuts`
- [x] Latest live probe run produced 4 pass, 2 fail, 0 environment-fail, 23 not live-probed.
- [x] `StartDevScrapeValidator.ps1` parses and runs validation with `-ProbeShortcuts` by default.
- [x] AutoHotkey v1 tray launch smoke test started `DevScrapeValidatorTray.ahk` and stopped only the launched process.

## Done When

- [x] New shortcuts cannot enter the inventory without explicit activation probe classification.
- [x] Safe live probes exercise the real runtime shortcut path in browser without token spend.
- [x] Failures identify whether the issue is metadata, missing scrape target, live handler activation, manual-only coverage, or environment setup.
- [x] The default report first tab is a compact human dashboard, while detailed tables remain available on a second tab.
- [x] Tray/controller users can understand the latest run from one small table and open detailed diagnostics only when needed.
