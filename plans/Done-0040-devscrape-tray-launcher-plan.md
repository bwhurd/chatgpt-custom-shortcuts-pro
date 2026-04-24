- Investigation findings:
  - The real validation entrypoint already exists at `tests/playwright/run-devscrape-validation.ps1`, which delegates to `node tests/playwright/devscrape-wide.mjs --action validate-wide`.
  - The runtime validator already opens the generated HTML report on the simple `validate-wide` path, but it currently has no Windows tray/controller surface for repeated manual use.
  - The `create-ahk-tray-launcher` skill expects a thin root AHK tray, a root startup PowerShell controller, and a root shutdown PowerShell script that stop only the project-owned processes.

- Scope:
  - Add a root Windows tray launcher for the runtime scrape validator.
  - Add a root startup controller that can run the validation, show status, and open the latest report automatically after the scrape/check completes.
  - Add a root shutdown script that stops only the launcher/controller and validation processes owned by this repo.
  - Make the report surface clearly show likely broken shortcuts by reusing the existing HTML report output.

- Out of scope:
  - Replacing the Playwright validator flow itself.
  - Shipping any of this in the extension release surface.
  - Building a heavy desktop app beyond a small practical launcher/controller window.

- Implementation:
  - Add a root `Start*.ps1` controller that reuses the existing `validate-wide` entrypoint, launches it as a managed process, surfaces live status, and opens the generated report automatically when validation succeeds.
  - Add a root `Stop*.ps1` shutdown script that uses project-root-aware command-line matching to stop only the validator controller and its child validation processes.
  - Add a root AutoHotkey v1 tray script that stays thin and delegates to the start/stop scripts, plus one thin helper action to open the latest report when useful.
  - Add minimal `.cmd` wrappers only if they materially improve handoff or launching from Explorer.
  - Update `specs/0006-runtime-scrape-selector-validator-spec.md` with the new tray/controller entrypoint so the workflow stays discoverable.

- Validation:
  - Launch the startup controller directly and confirm it stays open without syntax/runtime errors.
  - Run one real validation from the controller and confirm the report opens automatically.
  - Launch the AHK tray with the installed AutoHotkey v1 runtime if available and confirm it stays alive.
  - Verify tray start, open-latest-report, shutdown, reload, and shutdown-and-exit behavior.
  - Run narrow checks on the edited scripts.

- Done when:
  - A root tray script exists and can start or stop the validator workflow reliably.
  - The controller reuses the real Playwright validation path instead of a parallel code path.
  - The latest HTML report opens automatically after a validation run.
  - The report remains the place where likely broken shortcuts are highlighted for manual follow-up.

- Related specs:
  - `specs/0006-runtime-scrape-selector-validator-spec.md`
