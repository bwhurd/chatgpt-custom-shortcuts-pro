# Playwright Chromium Install Plan

- [x] Confirm project command surface
  - Use the existing npm scripts in `package.json`; prefer `npm run playwright:install`.
  - Fall back to the bundled Node runtime only if npm is unavailable in this shell.

- [x] Install Chromium browser assets
  - Run the smallest project-local Playwright install command needed for Chromium.
  - Treat existing browser assets as acceptable when Playwright reports they are already present.

- [x] Validate popup visual workflow
  - Run `npm run test:popup-visual` after install.
  - If npm is unavailable, run the equivalent direct Playwright command through the available Node runtime.
  - Report the exact command outcomes and any remaining failure separately from install success.
  - Result: the direct Playwright command ran, but the existing visual assertion failed because the approved popup snapshot is `1100x2757` while the received screenshot is `1100x1200`.
