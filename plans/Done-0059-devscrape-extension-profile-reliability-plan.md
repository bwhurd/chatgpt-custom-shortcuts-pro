# DevScrape Extension Profile Reliability Plan

## Goal

- [x] Make the tray-driven DevScrape validator reliably use a Chrome profile where the local unpacked extension can be loaded, discovered, and used for extension-backed capture and live shortcut probes.

## Current posture

- [x] `tests/playwright/devscrape-wide.mjs` auto-launches standard Chrome/CDP on the `CodexCleanProfile` profile when no endpoint is reachable.
- [x] The old validation auto-launch used extension override flags that can leave the manual browser in a state where Developer Mode extension repair is unreliable.
- [x] The tray currently starts validation with live probes but does not expose a clear manual setup/repair path.
- [x] `StopDevScrapeValidator.ps1` stops repo-owned controller/validation processes but does not close the CDP Chrome profile window.

## Scope

- [x] Touch only the DevScrape Playwright launcher, tray/controller scripts, and owning spec notes needed for this browser/extension setup path.
- [x] Do not change shipped extension files, manifest permissions, host access, or release zip behavior.
- [x] Do not close user Chrome processes automatically unless the target is clearly the dedicated DevScrape CDP profile and the user explicitly starts that repair workflow.

## Implementation plan

- [x] Keep validation auto-launch from using restrictive extension whitelist flags.
- [x] Add a dedicated manual extension setup entrypoint that launches `setup-login --pause-for-extension-setup` in a visible console and opens `chrome://extensions` without extension override flags.
- [x] Make the manual setup path identify and handle stale DevScrape CDP Chrome instances launched with extension override flags so setup does not silently reuse the bad browser.
- [x] Surface the setup action from the tray/controller UI with concise status text.
- [x] Update the runtime scrape spec with the final expected behavior.

## Validation

- [x] Run the PowerShell syntax helper on edited PowerShell scripts.
- [x] Run targeted JS syntax/formatter checks for the edited Playwright launcher.
- [x] Inspect the current DevScrape Chrome command line after changes and report whether a stale old-flag browser must be closed before the new behavior takes effect.

## Done when

- [x] A fresh tray validation launch no longer includes `--disable-extensions-except`.
- [x] Manual setup opens a visible, interactive flow that can load the local unpacked `extension/` folder.
- [x] The user has a deterministic recovery path when the existing CDP profile browser was launched with old flags.
