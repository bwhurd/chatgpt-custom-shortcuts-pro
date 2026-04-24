# Playwright DevScrape Runtime Validator Plan

## Investigation Findings

- [x] `specs/0006-runtime-scrape-selector-validator-spec.md` currently describes the runtime scrape validator around the Tampermonkey userscript path, but the recent thread established that this path is not reliable enough for the actual scrape/check workflow.
- [x] `tests/playwright/chatgpt-local-profile-test-setup.md` already defines a better manual-plus-automation posture for live ChatGPT work on this machine: launch standard Chrome manually on `CodexCleanProfile`, then attach over CDP at `http://127.0.0.1:9333` instead of trying to make the browser itself host dev controls.
- [x] `tests/playwright/chatgpt-session.mjs` already gives the repo an existing Playwright entrypoint and profile/session vocabulary, so the new runtime scrape flow should extend the Playwright toolchain rather than inventing a third execution environment.
- [x] The unstable parts of the Tampermonkey path are exactly the parts Playwright and Node handle well: deterministic multi-step DOM traversal, waiting for transient menus/popups, filesystem writes to `_temp-files/inspector-captures/`, and report generation without browser UI glue.
- [x] The current broad scrape logic in `extension/lib/DevScrapeWide.js` is still useful as a source of dump inventory, step semantics, and checker rules, but the owning runtime entrypoint should move to `tests/playwright/` so the critical path is no longer tied to extension APIs, popup routing, or userscript behavior.
- [x] The required fixture is the authenticated conversation `https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1`, the dump family remains the same as already defined in `0006`, and `1c_TopbarToBottomEnabled_ThreadBottom.txt` is now captured as the final no-token-spend step.

## Scope

- [x] Replace the dev scrape/check execution path with a Playwright-based workflow under `tests/playwright/`.
- [x] Reuse the existing dump inventory, click-path model, canonical identifier audit intent, and output folder contract rather than restarting the design from scratch.
- [x] Use the attach support doc’s Chrome + `CodexCleanProfile` + CDP posture as the standard way to get an authenticated browser without turning this into another login/debugging workstream.
- [x] Keep the static popup/settings validator and `specs/0005-popup-settings-validator-spec.md` unchanged in scope.

## Out Of Scope

- [x] Do not keep iterating on the Tampermonkey scrape buttons as the primary runtime validator path.
- [x] Do not add new shipped extension UI, popup buttons, background relays, or manifest permissions for this workstream.
- [x] Do not broaden this into general end-to-end shortcut testing across arbitrary conversations.
- [x] Do not implement the deferred `1c_TopbarToBottomEnabled_ThreadBottom.txt` family in the first Playwright pass.

## Simplification Decisions

- [x] The browser is only the page under test. It is no longer the place where this workflow stores state, renders controls, or decides what to do next.
- [x] Node/Playwright owns filesystem writes, latest-run selection, checker execution, and report generation.
- [x] Chrome is launched manually using the support-doc attach posture; Playwright attaches to the already-open authenticated browser instead of trying to produce a “special” browser launch that also behaves like a normal manual browser.
- [x] The first implementation should favor one CLI entrypoint with explicit subcommands or flags such as `setup-login`, `scrape-wide`, and `check-wide`, not a spread of half-connected dev surfaces.
- [x] Setup and attach should favor quick parallel probes of likely working CDP endpoints before launching a new browser, so routine use does not devolve into one-endpoint-at-a-time troubleshooting.

## Boundaries

- [x] Static validator responsibilities: remain limited to source-only popup/settings wiring validation under `0005`.
- [x] Playwright collector responsibilities: attach to the live authenticated ChatGPT browser, verify the required fixture URL, traverse the defined states, capture raw DOM, normalize dumps, and write the run folder plus manifest.
- [x] Playwright checker responsibilities: load the newest or explicitly named scrape folder, verify canonical identifiers against the dump set, and emit a machine-readable report plus a human-readable HTML report.
- [x] Support-doc responsibilities: define the standard Chrome/CDP attach posture and keep browser-launch troubleshooting out of the scrape/check script itself.
- [x] Extension responsibilities: none on the critical path beyond remaining the source of truth for runtime identifiers that the checker audits.

## Likely Owning Files

- [x] `specs/0006-runtime-scrape-selector-validator-spec.md` should be updated to make Playwright the primary runtime scrape/check entrypoint and demote or retire the Tampermonkey path.
- [x] `tests/playwright/chatgpt-local-profile-test-setup.md` should remain the attach/runbook source and may need tightening so the scrape workflow points at one exact manual launch path.
- [x] A new Playwright runner such as `tests/playwright/devscrape-wide.mjs` should own attach, scrape, check, and report orchestration.
- [x] A new helper module such as `tests/playwright/lib/devscrape-wide-core.mjs` is justified if it keeps the CLI runner small and separates collector/checker logic from attach/bootstrap logic.
- [x] `extension/lib/DevScrapeWide.js` should be mined for dump registry, step semantics, and checker rules; after the Playwright path is stable, a follow-up may either keep it as a shared definition file or move the durable registry into a neutral source under `tests/` or `shared/`.
- [x] `package.json` should likely gain one or two narrow scripts for the new workflow, for example `playwright:chatgpt:devscrape-wide` and `playwright:chatgpt:check-scrape`.
- [x] `_temp-files/inspector-captures/` remains the output root; no browser-side picker or handle persistence should survive in the new primary path.

## Phased Implementation

- [x] Phase 1: rewrite `specs/0006-runtime-scrape-selector-validator-spec.md` so the primary runtime validator is Playwright-based, explicitly retire the Tampermonkey buttons from the critical path, and preserve the existing dump inventory, checker intent, and deferred `1c` decision.
- [x] Phase 1: tighten `tests/playwright/chatgpt-local-profile-test-setup.md` so it is the single attach source of truth for this workflow, including the exact Chrome binary, `CodexCleanProfile`, CDP endpoint, and “launch manually first, then attach” rule.
- [x] Phase 2: add a new Playwright CLI entrypoint under `tests/playwright/` that supports at least two bounded actions: `scrape-wide` and `check-wide`; if setup/login helpers are included, keep them as a separate bounded action instead of mixing them into the scrape logic.
- [x] Phase 2: implement CDP attach first, using the support doc’s `http://127.0.0.1:9333` endpoint and failing fast with a clear message if the browser is not already running or the endpoint is unavailable.
- [x] Phase 2: keep the script from auto-opening ChatGPT during attach/setup mode; when running `scrape-wide`, either require the fixture tab to already be open or open only that exact fixture URL as part of the bounded scrape command.
- [x] Phase 3: port the current broad scrape registry into the Playwright runner, preserving the explicit file inventory, alias handling for `2b`, and deferred handling for `1c`.
- [x] Phase 3: implement a deterministic step engine in Playwright for 1-step through 5-step click paths, including hover exposure, turn menu opening, model switcher opening, sidebar state changes, and waits for transient Radix menu surfaces.
- [x] Phase 3: capture raw DOM from the intended scope first, then normalize it into the `.txt` artifacts already named in `0006`; keep the naming contract identical so older captures remain comparable.
- [x] Phase 3: write each scrape run under `_temp-files/inspector-captures/` using the existing dated folder naming rule `YYYY-MM-DD_HH-mm-ss_devscrapewide_c-69ea4723`, with `_01`, `_02`, and so on when needed.
- [x] Phase 3: emit a `run-manifest.json` that records fixture URL, timestamps, artifact statuses, click-path metadata, missing/failed states, deferred states, and any attach/precondition failure that prevented a complete scrape.
- [x] Phase 4: implement canonical identifier auditing in Node, preferring authoritative extraction from current runtime source where practical and keeping only a small explicit rule map for expectations that cannot be derived mechanically.
- [x] Phase 4: have `check-wide` read the newest scrape by default, verify each canonical identifier appears in at least one relevant dump, and treat missing expected dump files as explicit failures rather than silent skips.
- [x] Phase 4: generate a simple HTML report alongside the machine-readable report so the output is immediately reviewable without reopening extension pages or browser UI surfaces.
- [x] Phase 5: add narrow package scripts for the new Playwright workflow and remove or clearly de-emphasize the old Tampermonkey workflow from the active docs once the Playwright path is proven.
- [x] Final phase after the rest of the dump family is stable: have Playwright toggle the extension flag for `MoveTopBarToBottom`, wait for the page to restabilize, capture `1c_TopbarToBottomEnabled_ThreadBottom.txt`, and keep the scrape flow no-token-spend.
- [ ] Phase 5: decide whether `extension/lib/DevScrapeWide.js` should remain as a temporary registry donor, be reduced to a thin shared-data module, or be retired after the Playwright path fully owns the runtime validator.

## Validation

- [x] Verify the manual Chrome attach path by checking `http://127.0.0.1:9333/json/version` before attempting the scrape.
- [x] Run the new Playwright scrape command against the required authenticated-conversation fixture and confirm the full dump set, including `1c`, is written under `_temp-files/inspector-captures/`.
- [x] Force at least one controlled failure in the step engine or expected dump set and confirm the manifest calls out the exact failed state rather than collapsing into a generic scrape failure.
- [x] Run the new Playwright check command on a good scrape and confirm the machine-readable report plus HTML report show identifier, matching dump files, and `✓`/`X` status clearly.
- [x] Confirm the checker selects the newest scrape deterministically and can also target a named folder for debugging when needed.
- [x] Run narrow validation only on touched Playwright/spec/package files; do not expand into popup or shipped extension validation unless the implementation actually touches those surfaces.

## Done When

- [x] The runtime scrape validator has one clear primary path under `tests/playwright/` and is no longer dependent on popup routing or Tampermonkey controls.
- [x] The attach path for authenticated ChatGPT work is documented once and reused, rather than rediscovered in each scrape/debug thread.
- [x] A `scrape-wide` run produces the agreed dump inventory, folder naming, normalization, and run manifest under `_temp-files/inspector-captures/`.
- [x] A `check-wide` run audits canonical identifiers against the newest scrape and emits both machine-readable and human-readable report output.
- [x] The workstream is execution-ready without turning into another long browser-troubleshooting loop.

## Open Questions And Blocked Details

- [ ] Decide whether the Playwright runner should reuse `extension/lib/DevScrapeWide.js` directly, copy the relevant registry into `tests/playwright/`, or extract a neutral shared-data file; the implementation should choose the smallest path that avoids two drifting handwritten inventories.
- [ ] Decide whether the new report should be a standalone HTML file written into the scrape folder or a stable file path under `test-results/`; the simpler and more debuggable option should win.
- [ ] Decide whether the scrape command should require the fixture tab to already be open in the attached browser or whether it should open that exact fixture URL itself after attach; the plan should keep one rule, not both.
- [ ] After Playwright is live, decide whether the Tampermonkey folder should be deleted, archived, or left as an explicitly unsupported experiment under `tests/`.

## Related Specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0005-popup-settings-validator-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
