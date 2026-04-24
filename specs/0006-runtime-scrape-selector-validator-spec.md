# Spec: Runtime Scrape Selector Validator

Use this when changing or repairing:
- the Playwright-based dev-only runtime scrape/check workflow under `tests/playwright/`
- the Chrome/CDP attach posture in `tests/playwright/chatgpt-local-profile-test-setup.md`
- runtime selector presence audits against scrape dumps
- the dump registry, checker rules, and report outputs used by the runtime validator
- the temporary shared page-side scrape logic sourced from `extension/lib/DevScrapeWide.js`

This is the durable reference for the repo's dev-only runtime scrape validator. It defines the live-page scrape/check contract, the boundary from the static popup/settings validator, and the rules for keeping the workflow deterministic without shipping it in release zips.

## Purpose

The runtime scrape selector validator complements the static popup/settings validator.

Its job is to:
- collect deterministic live DOM dumps from specific ChatGPT UI states that shortcut actions depend on
- verify that the current canonical language-agnostic identifiers still appear in at least one expected dump
- make missing identifiers or missing dump states obvious in a simple report

It proves selector presence from scrape dumps and, for explicitly safe shortcut metadata, verifies that the configured shortcut actually activates the expected live target.

## Boundary From `0005`

`specs/0005-popup-settings-validator-spec.md` stays the static popup/settings wiring validator only.

This runtime validator owns:
- live page capture
- menu/popup traversal
- canonical identifier presence audits against scrape dumps
- Playwright attach, scrape, check, and report generation for that flow

Do not merge this work into `tests/validate-keys.js` or `tests/lib/settings-wiring-validator.js`.

## Primary Entry Point

- `tests/playwright/devscrape-wide.mjs` is the primary runtime scrape/check entrypoint.
- `extension/shared/shortcut-action-metadata.js` owns the explicit shortcut action metadata and target descriptor source of truth used by the checker.
- `tests/playwright/lib/shortcut-target-inventory.mjs` adapts that metadata to the saved scrape registry, runtime defaults, handler keys, labels, and report rows.
- Supported actions are:
  - `setup-login`
  - `scrape-wide`
  - `check-wide`
  - `validate-wide`
  - `probe-shortcuts`
- `tests/playwright/chatgpt-local-profile-test-setup.md` owns the standard Chrome/CDP attach posture.
- `tests/playwright/run-devscrape-validation.ps1` is the simplest manual entrypoint on this machine. It should run the full validation flow and open the generated HTML report automatically.
- `StartDevScrapeValidator.ps1` is the root Windows controller entrypoint for repeated manual use. It should reuse the real `validate-wide` path, surface the latest validation summary, and list likely broken shortcuts from the latest report for quick manual follow-up.
- `DevScrapeValidatorTray.ahk` is the thin AutoHotkey v1 tray surface for starting the controller, opening the latest report, and shutting the validator workflow down.
- `StopDevScrapeValidator.ps1` should stop only the repo-owned controller and validation processes by project-root-aware command-line matching.
- `extension/lib/DevScrapeWide.js` is currently the page-side scrape logic donor that the Playwright runner injects into the page so the step engine does not drift.
- The old Tampermonkey path under `tests/tampermonkey-dev-scrape/` is no longer the primary runtime validator path. Treat it as an unsupported experiment unless a future pass deliberately revives it.

## Browser Posture

- Use standard Chrome, not Chrome for Testing, for the authenticated manual profile used by this workflow.
- The standard attach profile is `CodexCleanProfile` under the local Chrome user-data root.
- The standard CDP endpoint is `http://127.0.0.1:9333`.
- Launch the browser first, then attach over CDP for scrape/check work.
- `scrape-wide` and `validate-wide` may auto-launch the standard Chrome/CDP profile when no candidate endpoint is reachable; use `--no-auto-launch` only when deliberately testing attach-only behavior.
- `validate-wide --require-extension-capture` is the strict full-state mode. It must write the scrape/check reports and then exit non-zero if any scrape artifact failed, including optional extension-backed `1c`.
- `validate-wide --probe-shortcuts` runs the no-token-safe live shortcut activation probes after scrape collection and writes `live-probes.json` into the scrape folder.
- `probe-shortcuts` runs only the live activation layer against the attached browser and accepts repeated `--shortcut-action-id` filters. Use it for failure-point iteration after a full report has already shown which shortcut needs attention.
- Live shortcut probes read the active stored shortcut assignment from the loaded extension profile first, then fall back to `shortcutDefaults`, so blank-default shortcuts can be tested when assigned locally.
- `--pause-for-extension-setup` may be used with setup/scrape/validate commands to launch or attach Chrome, print the unpacked extension folder, and wait for manual Developer Mode extension setup before continuing. When this flag launches Chrome, it must open `chrome://extensions` without `--load-extension` or `--disable-extensions-except`; the manual profile should own the installed unpacked extension. Do not use it from hidden tray/controller runs unless the caller is intentionally waiting at a console.
- `setup-login` may launch that browser on `about:blank` with the local unpacked extension loaded for non-manual automation, but manual extension repair should use the normal `chrome://extensions` path above.
- `scrape-wide` may open the required fixture URL itself after attach so the capture path stays bounded and deterministic.
- `check-wide` should not require a live browser because it operates on saved dump folders.

## Shipping Rules

- This workflow is dev-only.
- Keep all primary runtime validator code under `tests/playwright/` and `_temp-files/`.
- Keep `extension/shared/shortcut-action-metadata.js` out of release zips unless runtime code deliberately starts importing it.
- Keep `extension/lib/DevScrapeWide.js`, `extension/lib/DevScrapeNarrow.js`, and any other dev-only scrape helpers out of release zips through `scripts/build-zip.js`.
- Do not add shipped popup controls, manifest permissions, host access, or `web_accessible_resources` for this workflow.

## Required Fixture

The required validation fixture for `scrape-wide` is:

`https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1`

The runtime flow should:
- verify that the page under capture is exactly that URL
- stop cleanly if the loaded page does not match
- treat that authenticated conversation as the required validation fixture because it is short, has multiple threads, and includes one response with web search and one without

## Capture Root And Folder Naming

- Dumps belong under `_temp-files/inspector-captures/`.
- Browser-side directory pickers and handle persistence are not part of the primary path anymore.
- Each run writes to a lexically sortable folder:
  - `YYYY-MM-DD_HH-mm-ss_devscrapewide_c-69ea4723`
- If the base run folder name already exists, append `_01`, `_02`, and so on.
- `check-wide` should target the newest scrape by default, using the folder timestamp first and the manifest timestamp as fallback.
- `check-wide` may also accept an explicit folder name for debugging.

## Dump Registry Contract

The collector must own a deterministic registry that records:
- dump filename
- revealed state id
- click path steps required to reveal it
- capture scope
- status rules such as `captured`, `failed`, `deferred`, or `alias`

The step engine must support click paths from 1 to 5 steps deep, including dropdowns and popups that only exist after prior clicks.

The first-pass `scrape-wide` inventory is:
- `1a_SideBarCollapsed_body.txt`
- `1b_SidebarExpaneded_body.txt`
- `1c_TopbarToBottomEnabled_ThreadBottom.txt`
- `1d_TopbarToBottomDisabled_ThreadBottom.txt`
- `1e_TopbarToBottomDisabled_HeaderArea.txt`
- `1f_UserTurnWithButtonsExposedOnHover.txt`
- `1g_AgentTurnWithButtons_MultipleThreads_2of2_DidntSearchWeb.txt`
- `1h_AgentTurnWithButtons_SingleThread_SearchedTheWeb.txt`
- `2a_AgentOrUserTurn_SubmenuMoreActions3Dots_ReadAloudBranchButtons.txt`
- `2b_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu - Copy.txt`
- `2c_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu.txt`
- `2d_SubmenuForModelSwitcher_data-testid_model-switcher-dropdown-button.txt`
- `2e_ModelSwitcher_ConfigureDialog_CurrentSelection.txt`
- `2f_ModelSwitcher_ConfigureDialog_ModelSelectionListbox.txt`
- `2g_ModelSwitcher_ConfigureDialog_ConfigureLatest_FrontendRows.txt`
- `2h_ModelSwitcher_ConfigureDialog_Configure5-2_FrontendRows.txt`
- `2i_ModelSwitcher_ConfigureDialog_Configure5-4_FrontendRows.txt`
- `2j_ModelSwitcher_ConfigureDialog_ConfigureO3_FrontendRows.txt`
- `2k_Composer_AddFilesAndMore_Menu.txt`
- `2l_Composer_AddFilesAndMore_More_Submenu.txt`
- `2m_Header_ConversationOptions_Menu.txt`

`1c` is captured as the last scrape step after the rest of the dump family is already captured successfully. The Playwright runner should:
- toggle the extension setting that enables `MoveTopBarToBottom`
- wait for the page to restabilize
- capture the thread-bottom state as `1c_TopbarToBottomEnabled_ThreadBottom.txt`
- restore the setting to its default disabled state after capture
- stop without triggering any ChatGPT response-generation action

If Chrome is authenticated but the local unpacked extension is not loaded, the default Playwright runner may mark only `1c` as `deferred` with a clear profile/setup message. The shortcut target validator should still complete because no current shortcut target depends on the optional `1c` state. When `--require-extension-capture` is present, the same condition must be recorded as a failed artifact and `validate-wide` must fail after writing the HTML report.

For extension-backed setup, the runner should first discover the loaded extension id from the CDP service worker list, then fall back to the standard profile's `Default\Secure Preferences` entry for the local unpacked `extension/` path. Browser-level failures such as `ERR_BLOCKED_BY_CLIENT` should stay visible in the artifact/report reason so a blocked profile is distinguishable from a missing scrape selector.

The model-refresh dump family should mirror the bounded `scrapeModelCatalogOnce` flow in `extension/content.js`:
- open the model switcher main menu
- open the `model-configure-modal` dialog from that menu
- open the configure combobox listbox
- capture the dialog state for each configure option the refresh flow iterates

Keep that implementation simple and exact. Prefer the same stable targets used by the refresh-model scrape path over adding another generic submenu abstraction.

After the model-refresh menu family, the same no-reload scrape pass should also capture:
- the composer `Add files and more` menu opened from `button[data-testid="composer-plus-btn"]`
- the deeper submenu reached from the composer menu's nested `More` trigger
- the header conversation menu opened from `button[data-testid="conversation-options-button"]` while `MoveTopBarToBottom` is still disabled

Those menu captures should reuse the same bounded menu-open pattern already used elsewhere in the Playwright collector:
- close prior transient UI
- open the requested menu or submenu
- pause long enough for the radix menu state to settle
- capture the newest open menu without reloading the page

The runtime validator should preserve a no-token-spend posture wherever practical:
- navigating to or reopening an existing conversation is acceptable
- opening menus, toggling local extension settings, and scraping DOM is acceptable
- actions that submit, retry, regenerate, or otherwise ask ChatGPT for a new response are not acceptable as part of routine scrape collection

Live activation probes may declare bounded setup modes in `extension/shared/shortcut-action-metadata.js`:
- `new-conversation` may leave the fixed fixture briefly, create a blank conversation, and test only targets that are available before any prompt is sent; `shortcutKeyTemporaryChat` is the current user.
- `gpt-conversation` may navigate to `https://chatgpt.com/g/g-vU0PtzgAJ-step-1-2-nbme-medical-school-question-analysis-v2/c/69eba3bf-6f18-83ea-aa31-9a995aca7bc0`; `shortcutKeyNewGptConversation` is the only current user.
- setup modes must restore the primary fixture before the live probe run exits.
- live probes must space browser navigations/reloads so repeated validation runs do not look like rapid automated request bursts.
- live probes must also pause at least 350ms around browser-mutating clicks and keystrokes.
- extension-page setup/storage tabs must pause at least 1 second around open, storage mutation/read, close, and any following ChatGPT reload.
- when a probeable shortcut has no stored/default key, the validator may temporarily assign an unused validation-only key, run the probe, and restore the original storage value before exit.
- `shortcutKeyPreviousThread` requires a `shortcutKeyNextThread` activation first, followed by a 1500ms settle delay, before probing the Previous Thread click.
- account-unavailable options, such as Pro-only thinking effort levels on a non-Pro profile, must be explicit `not-applicable` metadata instead of reported as broken selectors.

`2b ... - Copy.txt` is a compatibility alias of the same captured submenu state as `2c` until the inventory is deliberately cleaned up.

## Capture Format

- Capture raw DOM from the live page first.
- Persist normalized `.txt` HTML fragments for the dump files.
- Use the smallest deterministic normalization that keeps the HTML easy to scan in Codex.
- Write a `run-manifest.json` alongside the dumps that records:
  - fixture URL
  - started/completed timestamps
  - dump statuses
  - click-path metadata
  - missing/failed states
  - deferred states

## Canonical Identifier Rules

The checker should prefer authoritative extraction over a hand-maintained selector list.

Use this order:
1. derive canonical identifiers from current runtime source where practical
2. prefer `data-testid`, ids, `aria-controls`, `name`, role/state markers, and other non-localized anchors
3. allow a small explicit registry only for action-to-state mapping or icon-token identifiers that cannot be derived mechanically

Do not treat every fallback selector in runtime code as a required dump hit for this fixture.
The checker should audit the canonical identifiers that the current fixture is meant to prove, not every alternative branch in the runtime.

## Checker Contract

`check-wide` should:
- locate the newest scrape folder by default, or use the explicitly requested folder
- read the run manifest and dump files
- build the runtime shortcut inventory deterministically from:
  - `extension/shared/shortcut-action-metadata.js` explicit action metadata and target descriptors
  - `extension/content.js` `shortcutDefaults`
  - the active runtime handler map keys in `keyFunctionMappingAlt`
  - `extension/settings-schema.js` label and overlay metadata
- require every runtime shortcut to have either:
  - shortcut action metadata with an explicit validation mode, ordered target refs, required scrape state refs, and activation probe classification, or
  - an explicit exclusion classification such as `manual-only` or `not-applicable`
- fail the guard when any runtime shortcut lacks metadata, metadata references an unknown target ref, metadata references an unknown scrape state id, activation probe metadata references an unknown mode/target/state, or a required handler/default is missing
- verify each canonical identifier appears in at least one relevant dump through explicit target match groups:
  - each match group is an all-needles requirement
  - multiple match groups are alternatives for the same target
  - scrape-covered targets must declare at least one deterministic match group
- treat missing expected dump files as explicit failures, not silent skips
- write a machine-readable report and a human-readable HTML report into the scrape folder
- make `validate-wide` the one-command automation path for launch/attach, fixture scrape, metadata check, report generation, guard failure, and opening the latest HTML report
- merge live probe rows and summary into `check-report.json` when `live-probes.json` exists

The report must open on a compact Dashboard tab and preserve detailed diagnostics on a Details tab. The dashboard should fit the common status view in a small table with:
- metadata guard health
- scrape artifact health
- shortcut target audit health
- live activation probe health
- a short top-follow-up table for broken shortcuts, missing coverage, live probe failures, or setup issues
- the full scrape folder path as a local `file:///` link
- a report history footer built deterministically from timestamped scrape folders, showing the latest report when viewing an older report and up to five previous report links

Report interpretation rules:
- The Dashboard is the human-facing source of truth for routine pass/fail triage.
- The Details tab may still show static `PARTIAL` rows for targets that are intentionally absent from the main fixture scrape, such as blank-new-conversation or GPT-specific controls.
- A `PARTIAL` static shortcut should not appear in Top Follow-Up when the same action has a passing live activation probe.
- Top Follow-Up should contain only actionable items: metadata guard failures, failed shortcut rows, unresolved coverage gaps, live probe failures, or setup/environment failures.
- Manual-only rows are expected follow-up only when the behavior cannot be safely automated without drafting text, starting dictation, submitting, stopping generation, or entering another stateful/manual-only context.

The Details tab must keep the full shortcut-first and target-second diagnostic tables.

The shortcut table must show:
- shortcut action id
- user-facing label
- default key code
- validation mode
- ordered target ids
- activation probe mode and expected target ref
- required scrape state ids and dump files
- overall status such as `PASS`, `FAIL`, `PARTIAL`, `MANUAL`, or `N/A`
- the reason when a shortcut looks broken or only partially covered

The target table must show:
- target id
- target kind
- canonical identifier searched
- deterministic match groups used for matching
- expected scrape state ids
- matching dump files, possibly multiple
- expected dump files
- dependent shortcut action ids
- status such as `PASS`, `FAIL`, or `NO SCRAPE COVERAGE`

If an identifier is missing from the scrape set, the report should say it likely needs repair because the underlying page changed.

The report should pin likely broken shortcuts near the top by deriving them from failed shortcut rows, not from a flat identifier list alone.

## Validation Posture

Prefer narrow validation:
- syntax-check the new Playwright runner and helper modules
- run the real `scrape-wide` command only against the required fixture
- run `check-wide` against an existing scrape folder after a successful capture
- use `probe-shortcuts --shortcut-action-id <actionId>` for targeted live rechecks instead of rerunning the whole browser workflow
- avoid repeated full live runs when a saved report plus a targeted probe can prove the fix
- keep browser-launch troubleshooting in the support doc, not in repeated workflow-specific hacks

Do not reintroduce popup or userscript UI as the primary runtime validator path without a deliberate spec update.
