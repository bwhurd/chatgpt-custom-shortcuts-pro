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
- `npm run audit:selectors` runs the dev-only source-selector presence audit. Acorn derives DOM lookup groups and fallback alternatives from the manifest's first-party content scripts, with source locations and explicit unresolved dynamic expressions. A dedicated tab inspects an existing signed-in CDP conversation and up to 12 safe menu openers; it sends no prompts and changes no settings. JSON/HTML reports go to `_temp-files/inspector-captures/source-selector-audit-latest/`, and the HTML report opens automatically unless `--no-open-report` is passed. `matched`, `unmatched`, `invalid`, and `unresolved` are distinct; an unmatched target is a drift candidate, not proof of a broken feature. Missing states/source errors remain visible. This does not exercise nested submenus, responsive variants, feature toggles, relative-root behavior, or action completion, and does not replace the full shortcut audit. No browser/profile means an explicit environment failure, not a clean audit.
- `extension/shared/shortcut-action-metadata.js` owns the explicit shortcut action metadata and target descriptor source of truth used by the checker.
- `tests/playwright/lib/shortcut-target-inventory.mjs` adapts that metadata to the saved scrape registry, runtime defaults, handler keys, labels, and report rows.
- `extension/shared/model-picker-selectors.js` owns the shared model-picker opener selector contract used by `content.js`, shortcut target metadata, and the Playwright scrape opener. Do not reintroduce a separate hardcoded model opener list in the validator.
- Supported actions are:
  - `setup-login`
  - `scrape-wide`
  - `check-wide`
  - `validate-wide`
  - `probe-shortcuts`
- `tests/playwright/chatgpt-local-profile-test-setup.md` owns the standard Chrome/CDP attach posture.
- `ahk-tray-tools/StartDevScrapeValidator.ps1` is the Windows controller entrypoint for repeated manual use. It should call `tests/playwright/run-devscrape-validation.ps1`, surface the latest validation summary, and list likely broken shortcuts from the latest report for quick manual follow-up.
- `tests/playwright/run-devscrape-validation.ps1` is the direct Playwright validation entrypoint on this machine. It should run the full validation flow and open the generated HTML report automatically.
- `ahk-tray-tools/DevScrapeValidatorTray.ahk` is the thin AutoHotkey v1 tray surface for starting the controller, opening the latest report, and shutting the validator workflow down.
- `ahk-tray-tools/StopDevScrapeValidator.ps1` should stop only the repo-owned controller and validation processes by project-root-aware command-line matching.
- `extension/lib/DevScrapeWide.js` is currently the page-side scrape logic donor that the Playwright runner injects into the page so the step engine does not drift.

## Browser Posture

- Use standard Chrome, not Chrome for Testing, for the authenticated manual profile used by this workflow.
- The standard attach profile is `CodexCleanProfile` under the local Chrome user-data root.
- The standard CDP endpoint is `http://127.0.0.1:9333`.
- Launch the browser first, then attach over CDP for scrape/check work.
- `scrape-wide` and `validate-wide` may auto-launch the standard Chrome/CDP profile when no candidate endpoint is reachable; use `--no-auto-launch` only when deliberately testing attach-only behavior.
- `validate-wide --probe-shortcuts` runs the no-token-safe live shortcut activation probes after scrape collection and writes `live-probes.json` into the scrape folder.
- `probe-shortcuts` runs only the live activation layer against the attached browser and accepts repeated `--shortcut-action-id` filters. Use it for failure-point iteration after a full report has already shown which shortcut needs attention.
- By default, a global live-probe run starts from ChatGPT home, requires a visible blank composer with no conversation or draft, then waits 2.5 seconds before creating its audit fixture or probing. Reusing a prior audit-owned fixture is reserved for an explicitly named `--audit-owned-fixture-from-run` recovery.
- Before the wide scrape or `probe-shortcuts` refreshes the model catalog, it likewise opens and verifies a fresh blank ChatGPT conversation, waits 2.5 seconds, then navigates to the audit fixture for structural capture/probes. The console reports this pre-scan settle wait.
- Live shortcut probes read the active stored shortcut assignment from the loaded extension profile first, then fall back to `shortcutDefaults`, so blank-default shortcuts can be tested when assigned locally.
- Validation auto-launch may request the local unpacked extension with `--load-extension`, but it must not use `--disable-extensions-except` for the persistent `CodexCleanProfile`; that flag makes manual Developer Mode repair unreliable in the same browser profile.
- The tray validation wrapper should fail fast if a reachable `CodexCleanProfile` CDP Chrome root is already running with `--disable-extensions-except`, directing the user to the manual setup action instead of silently reusing stale flags.
- Use `--pause-for-extension-setup` only when performing manual Developer Mode extension installation or repair. It launches or attaches Chrome, prints the unpacked extension folder, and waits for that manual setup; when it launches Chrome, it must open `chrome://extensions` without `--load-extension` or `--disable-extensions-except`, and the manual profile should own the installed unpacked extension. Routine scrape or validation with the extension already installed and reachable should run without this pause. Do not use it from hidden tray/controller runs unless the caller is intentionally waiting at a console.
- `ahk-tray-tools/StartDevScrapeExtensionSetup.ps1` is the visible manual repair entrypoint. It should detect a stale DevScrape CDP Chrome root process that was launched with extension command-line flags, ask before closing only that dedicated profile browser, then run `setup-login --pause-for-extension-setup`.
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

For a fresh complete `validate-wide --probe-shortcuts` invocation, reserve its run folder and prepare the existing disposable two-turn audit fixture before the wide scrape. Persist setup intent/checkpoints before each prompt, require the owned fixture's two user and two assistant turns, and carry the exact ownership record through capture, manifest writing and probes. Reuse the reserved folder; an interruption leaves its recovery checkpoint there. This opt-in path does not fall back to fixed conversations or older evidence. The routine prompt-free path below retains its static fixture selection.

The primary validation fixture for `scrape-wide` is:

`https://chatgpt.com/c/69ea4723-7070-83ea-a069-89aaa4e6f9a1`

If that fixture is not ready immediately, the Playwright tray validation path should fall back to:

`https://chatgpt.com/c/6a0618aa-6bc4-832a-9d75-6500d0a40890`

The runtime flow should:
- verify that the page under capture is exactly the chosen fixture URL
- stop cleanly if the loaded page does not match
- wait for a web-backed assistant turn before scrape capture so `1h_AgentTurnWithButtons_SingleThread_SearchedTheWeb.txt` cannot race ahead of late-loaded citation DOM
- trigger the extension-backed single-surface `CSP_SCRAPE_MODEL_CATALOG` flow after fixture readiness and before collecting scrape artifacts or live probes, so model target metadata is based on the fixed conversation fixture; popup refresh uses the separate dual-surface coordinator that starts a blank conversation and visits both Chat and Work
- use the chosen fixture URL for the rest of that scrape run, including resets and optional live probes
- treat the authenticated conversation fixture as required because it is short, has multiple threads, and includes one response with web search and one without

## Capture Root And Folder Naming

- Dumps belong under `_temp-files/inspector-captures/`.
- Browser-side directory pickers and handle persistence are not part of the primary path anymore.
- Each run writes to a lexically sortable folder:
  - `YYYY-MM-DD_HH-mm-ss_devscrapewide_c-69ea4723`
- Keep the historical folder suffix for report discovery compatibility even when the fallback fixture is used; the actual chosen fixture URL belongs in `run-manifest.json` and the generated report.
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

The message-scroll target descriptors use the runtime's message-unit, role-message, and conversation-turn anchor alternatives in the three registered turn captures. This proves static anchor presence only. The four scroll actions retain their independent `dom-state` probes for actual scroll-position changes; an anchor match does not prove scrolling works. Up One/Up Two start at the bottom and Down One/Down Two start at the top, so a near-midpoint anchor does not make an otherwise valid action fail a meaningful-movement assertion. Collector coordinates normalize the observed `column-reverse` native thread root's negative range to logical top-to-bottom coordinates; ordinary roots retain their normal range.

Scroll setup, baseline, target checks and semantic snapshots must use the same rendered conversation container. Playwright's page world cannot assume access to the extension's isolated-world `getScrollableContainer`. Prefer a valid available helper result, otherwise the rendered `.thread-scroll-container`, then the legacy document fallback. A zero document extent does not establish that the conversation is unscrollable; fresh owned-fixture inspection observed a zero document extent with 514 pixels in the native conversation container. Preserve movement thresholds and verify the actual shortcut against that root.

Registered `probeOnly` states cover code blocks, enabled codebox wrapping, Edit and Send Edit, draft-send, generation-stop, Temporary Chat, the GPT conversation control, blank-chat Chat/Work controls, searched Study and Deep Research items, active dictation controls and blank-chat dictation start. Send Edit preparation captures its Edit opener before opening the edit card, then captures Send Edit; states and producer actions are not one-to-one. Default current-page collection invokes fresh `validate-wide --prepare-capture-only` preparation for these required states, without dispatching shortcut activations or assigning temporary shortcut keys. Activation rows remain `not-live-probed`. A fresh `validate-wide --probe-shortcuts` invocation instead supplements its own run folder while probing actions. The two flags cannot be combined. Capture transient controls before shortcut dispatch; capture wrapping only after observing the enabled root class. Serialize matched fragments, including the real root class for wrapping and observed structural wrappers for scoped controls, rather than unrelated conversation content. Normalize supplemental HTML locally and update the same manifest before generating the final report. Standalone probes on a prior run must not attach new evidence to that run. Structural presence and semantic probe results stay independent; a failed activation cannot become a pass because its target was captured. Preparation restores owned drafts/storage and stops owned generation or dictation with verified native controls. Chat/Work activation remains unprobed and Stop-and-Transcribe remains manual-only even when their controls are captured.

The registered Search Chats state `search-chats-dialog` writes `2n_SearchChats_Dialog.txt`. The Playwright collector uses the runtime Search button's SVG-path/test-id selectors, refuses a preexisting visible dialog, captures the single newly opened dialog, and requires Escape dismissal before recording success. Search capture and activation verify the rendered opener: if the matching opener is hidden, one trusted click on the observed sidebar trigger must reveal it. The trigger's `aria-expanded` value alone does not prove availability. Genuinely absent openers fail without an arbitrary toggle. Its target matcher accepts the observed dialog/input/combobox conjunction with `placeholder="Search…"` and retains the legacy `Search chats...` alternative. Both are observed English-page contracts; localized pages need fresh evidence and a verified selector update.

The extension state `shortcut-overlay` writes `2o_ShortcutOverlay_Dialog.txt`. The Playwright collector reads only `shortcutKeyShowOverlay` from the loaded extension content-script context and dispatches its trusted Alt chord. An explicitly blank assignment stays disabled; absent storage may use the existing runtime default. Missing extension context, an unavailable opener, or failed dismissal produces a failed artifact rather than fabricated HTML. Neither capture sends a prompt or changes a setting. The page-side donor cannot synthesize the overlay opener; it can only capture an overlay already opened through the trusted path. Use the primary Playwright collector for complete overlay provenance.

The first-pass `scrape-wide` inventory is:
- `1a_SideBarCollapsed_body.txt`
- `1b_SidebarExpaneded_body.txt`
- `1d_TopbarToBottomDisabled_ThreadBottom.txt`
- `1e_TopbarToBottomDisabled_HeaderArea.txt`
- `1f_UserTurnWithButtonsExposedOnHover.txt`
- `1g_AgentTurnWithButtons_MultipleThreads_2of2_DidntSearchWeb.txt`
- `1h_AgentTurnWithButtons_SingleThread_SearchedTheWeb.txt`
- `2a_AgentOrUserTurn_SubmenuMoreActions3Dots_ReadAloudBranchButtons.txt`
- `2b_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu - Copy.txt`
- `2c_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu.txt`
- `2d_SubmenuForModelSwitcher_data-testid_model-switcher-dropdown-button.txt`
- `2d_ModelSwitcher_ThinkingEffort_Submenu.txt`
- `2k_Composer_AddFilesAndMore_Menu.txt`

The current compact pill menu's main, Model, and Effort states are the primary required model-picker family; Work additionally requires Speed when that third structural trigger is present. Optional `2e`-`2j` legacy Configure captures and their zero-action targets are removed from current shortcut validation. The extension's runtime Configure fallback remains available, and configure-route capability is inferred from the primary menu and fresh model-catalog evidence. Absence of Speed on Chat or Configure on either surface must not fail the scrape.

For extension-backed setup, the runner should first discover the loaded extension id from the CDP service worker list, then fall back to the standard profile's `Default\Secure Preferences` entry for the local unpacked `extension/` path. Browser-level failures such as `ERR_BLOCKED_BY_CLIENT` should stay visible in the artifact/report reason so a blocked profile is distinguishable from a missing scrape selector.

The model-refresh dump family should mirror the bounded primary pill flow in `extension/content.js`:
- open the model switcher main menu
- structurally expand the compact Power menu's direct Advanced control when `aria-expanded="false"`, then wait for Model and Effort plus optional Work Speed without matching localized text
- capture the structurally controlled Model submenu
- capture the structurally controlled Effort submenu
- capture the structurally controlled Speed submenu when present
- when the integrated Intelligence menu exposes a single `role="menuitemcheckbox"[data-fast-mode-enabled]`, capture its 1.5x/fast capability and the structural Reset to default row as explicit catalog capabilities
- retain integrated/two-level compatibility fallbacks only when those surfaces are present; do not collect optional Configure-dialog snapshots

Keep that implementation simple and exact. Prefer the same stable targets used by the refresh-model scrape path over adding another generic submenu abstraction.

After the model-refresh menu family, the same no-reload scrape pass should also capture:
- the composer `Add files and more` menu opened from `button[data-testid="composer-plus-btn"]`
- a narrow-viewport header scrape for `button[data-testid="open-sidebar-button"][aria-controls="stage-popover-sidebar"]`, because that target is responsive-only and should not be expected in the normal desktop header dump

The composer menu capture should reuse the same bounded menu-open pattern already used elsewhere in the Playwright collector:
- close prior transient UI
- open the requested menu or submenu
- pause long enough for the radix menu state to settle
- capture the newest open menu without reloading the page

The runtime validator should preserve a no-token-spend posture wherever practical:
- navigating to or reopening an existing conversation is acceptable
- opening menus, toggling local extension settings, and scraping DOM is acceptable
- actions that submit, retry, regenerate, or otherwise ask ChatGPT for a new response are not acceptable as part of routine scrape collection
- side-effectful live activation probes are allowed only when explicitly declared in shortcut metadata and isolated in a disposable blank conversation; this currently covers Send, Stop, Send Edit, dictation state, and codebox probes

Live activation probes may declare bounded setup modes in `extension/shared/shortcut-action-metadata.js`:
- `shortcutKeyNewConversation` may leave the fixed fixture briefly and should verify that a blank conversation target is available after a 500ms settle delay.
- Blank-state setup may create or reuse a blank conversation for targets available before prompts. The `shortcutKeyNewConversation` activation probe must instead start from a verified existing audit-owned conversation, dispatch the shortcut, then confirm a blank conversation; blank-state preparation cannot prove that transition. Capture blank Chat/Work controls after that successful transition. `shortcutKeyTemporaryChat` should run immediately after `shortcutKeyNewConversation` when both are in the live probe set so it can reuse the resulting blank state.
- Study setup clicks Plus before typing its owned query. Capture accepts a unique visible `book-open-light-16/20` control within the observed composer overlay and mention-list structure while Plus remains open; a filtered list may contain only one item. Legacy menu structures remain supported. Activation requires the scoped Study inline pill to appear after the shortcut and disappear after a second shortcut; a visible menu item or dismissed menu alone is insufficient. Match the pill's verified book icon inside `[data-inline-selection-pill]`, keep query/pill ownership explicit, and preserve concurrent unexpected edits during cleanup.
- Deep Research uses the same owned blank-chat search preparation with the fixed query `deep research` after Plus opens. Capture the observed list-navigation button containing `deep_research_app/icon.png` in `3m_Probe_ComposerDeepResearchSearch.txt`; the unfiltered Plus menu need not contain it. This capture proves target presence and leaves activation unverified.
- Temporary Chat preparation selects verified Chat mode before inspecting the blank composer. Its observed off/on sprites are `chat-bubble-dashed-light-20` and `chat-bubble-checkmark-dashed-light-20`; a unique visible control can be resolved without the legacy header-actions ID. Keep legacy selectors as compatibility alternatives.
- Prepared-state cleanup records `clean`, `not-needed`, or a diagnostic outcome without downgrading verified target evidence. Capture-only cleanup outcomes do not discard an already verified target artifact or veto target-only acceptance. Preserve an earlier capture failure cause when cleanup also fails; keep requested activation results distinct from capture presence.
- `gpt-conversation` may navigate to `https://chatgpt.com/g/g-vU0PtzgAJ-step-1-2-nbme-medical-school-question-analysis-v2/c/69eba3bf-6f18-83ea-aa31-9a995aca7bc0`; `shortcutKeyNewGptConversation` is the only current user.
- GPT menu collection identifies the observed three-path GPT actions trigger separately from the generic header More trigger. Select the unique visible trigger in `#page-header`, then `#bottomBarContainer`, then the document fallback, and click that same scoped Playwright locator. Reuse an already-open associated menu. Readiness requires the open Radix menu to be associated with the selected trigger through its ID or `aria-controls` and contain the observed New Chat icon. The current item uses `square-and-pencil-light-16`; retain legacy compose tokens as compatibility alternatives. Unrelated open menus are insufficient capture proof.
- Current Share behavior copies the public link and shows a toast, as confirmed by the user. A dialog-only postcondition is obsolete for this route. Its acceptance probe must prove a successful action-scoped write of a new valid ChatGPT share link and the notification outcome. The user explicitly excludes clipboard recovery from this probe. Keep clipboard payloads and share URLs local; publish only code-owned proof fields. A click, HTTP success or notification alone cannot establish the clipboard result.
- Acceptance depends on required target coverage, requested observable shortcut results, and fresh source-bound evidence. Capture process exits and incidental checkpoint, fixture-restoration or recovery labels remain diagnostics; they do not independently veto passing evidence. Restore settings or bindings deliberately changed by probes, but do not require repeated passes or unrelated recovery proofs.
- Local evidence eligibility uses a single maximum age of 24 hours from capture completion, as directed by the user. Keep invocation/source matching and timestamp chronology; do not add a shorter confirmation or publication clock. Historical snapshot replay retains its separate seven-day warning window.
- Prepared capture cleanup records diagnostic outcomes without discarding an already verified target artifact. GPT capture-only collection does not require the menu dismissal used before dispatch. Original preparation errors stay in local diagnostic fields and are excluded from the strict public snapshot projection.
- Previous/Next Response shortcuts are temporarily disabled at the user's request because the current interface no longer retains navigable response alternatives. Remove their popup controls, assigned storage keys, dispatch routes and canonical audit requirements. Retained inert helpers are not active features. Update migration must clear both custom and default assignments so they cannot conflict after update; imports must not restore them. Re-enabling requires new runtime evidence, not repeated regeneration.
- setup modes must restore the primary fixture before the live probe run exits.
- live probes must space browser navigations/reloads so repeated validation runs do not look like rapid automated request bursts.
- live probes must also pause at least 350ms around browser-mutating clicks and keystrokes.
- extension-page setup/storage tabs must pause at least 1 second around open, storage mutation/read, close, and any following ChatGPT reload.
- when a probeable shortcut has no stored/default key, the validator may temporarily assign an unused validation-only key, run the probe, and restore the original storage value before exit.
- response-navigation probes must be primed from both directions so the fixture's current response-variant position cannot create a false negative: before validating Next Thread, try Previous Thread twice and then probe Next Thread twice; before validating Previous Thread, try Next Thread twice and then probe Previous Thread twice.
- send/stop/edit live probes must not mutate the fixed fixture conversation; they should create a blank conversation, use `this is a message I sent` as disposable draft content, use Extended thinking for the in-flight Stop setup, wait 500ms before the Stop shortcut assertion, and use `this is an edited message` for the Send Edit active-card assertion.
- Edit and Send Edit are available in Chat conversations, not Work conversations. Their disposable setup must select Chat before sending the owned message and prove that message is committed before revealing its scoped Edit control; inheriting Work mode is a setup mismatch, not evidence of a broken Edit target.
- codebox live probes must not mutate the fixed fixture conversation; `shortcutKeyToggleCodeboxWrap` creates a blank conversation and requests one fenced JavaScript code block containing a single quoted 500-digit physical source line, waits at least 15 seconds, and verifies an assistant codebox exists before toggling wrap. The overlong physical line makes rendered wrapping testable. `shortcutKeyCopyAllCodeBlocks` reuses that owned conversation when available or creates it when run alone, sends its single-codebox story prompt, waits at least 15 seconds, verifies at least two assistant codeboxes exist, then asserts the clipboard contains the multi-codeblock separator.
- dictation live probes should grant microphone permission in the attached Playwright context when possible, test the start target from a blank conversation, and create an active dictation state before asserting Cancel Dictation.
- Wrap persistence requires saved storage, the enabled root class, and rendered wrapping of an overlong line without horizontal overflow after reload and after navigating from the owned conversation to a verified blank root and back. Descendant text can wrap while the native code container computes to `white-space: pre`; that shorthand alone must not reject proven wrapping. Genuine single-line nonwrapping and overflow still fail.
- account-unavailable options, such as Pro-only thinking effort levels on a non-Pro profile, must be explicit `not-applicable` metadata instead of reported as broken selectors.
- Conditional scope uses a code-owned capability marker from the current invocation: `schemaVersion: 2`, `source: fresh-model-picker-v2`, with `proEffort`, `configureRoute` and `dedicatedEffortControls` values of `available`, `unavailable`, or `unknown`. Exact v1 markers remain readable but cannot establish the new capability. A passing same-invocation `fresh-current-model-catalog-action-projection-v2` with explicit `integratedEffort: true` proves that the current popup hides dedicated Light/Heavy and Pro Standard/Extended controls; only their annotated targets, actions and states become not applicable. Missing or incomplete proof stays unknown. The generic slider frontend ID `pro` denotes High and cannot establish Pro-only support or absence. Configure absence requires a captured primary model menu that passes its structural matcher. Metadata errors and primary model-picker requirements remain blocking. Never infer absence from old storage or account labels.
- Composer probes use trusted keyboard input and preserve an exact known audit-draft ownership record. Failure cleanup may clear only that unchanged draft on a verified blank audit page or owned conversation, and must preserve unknown or changed text. Persist cleanup status, scope and code-owned reasons without draft contents.
- At workflow setup, the user authorizes deleting a blocking composer draft on the blank home page so drafts do not block checks. Use trusted keyboard actions, verify emptiness before test prompts, and record status without draft text. Do not submit arbitrary draft text or delete existing conversation messages. Treat line-break-only empty editors consistently with semantic blank-chat readiness. This setup authorization does not weaken per-probe ownership checks for concurrent edits.

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
1. derive canonical identifiers from current runtime/shared source where practical, especially `extension/shared/model-picker-selectors.js` for model-picker opener checks
2. prefer `data-testid`, ids, `aria-controls`, `name`, role/state markers, and other non-localized anchors
3. allow a small explicit registry only for action-to-state mapping or icon-token identifiers that cannot be derived mechanically

Do not treat every fallback selector in runtime code as a required dump hit for this fixture.
The checker should audit the canonical identifiers that the current fixture is meant to prove, not every alternative branch in the runtime.

The unused `assistant-thinking-option-*` descriptor copies and the unreferenced general `model-switcher-thinking-effort-standard` / `model-switcher-thinking-effort-extended` descriptors are retired from the canonical inventory. Action-linked Pro Standard/Extended descriptors remain. Legacy icon fallback code and option IDs remain in the runtime; their presence is not evidence that the fallback menu was captured or exercised. The current Simple slider's shared structural presence does not prove legacy Light/Heavy or Pro Standard/Extended action-value semantics.

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

### Canonical fast shortcut check

`npm run test:shortcuts:fast` owns fresh source-based catalogue discovery, automatic isolated bindings, trusted keyboard dispatch, target/effect assertions and final reporting. From a fresh clone run `npm ci`, then `npm run playwright:install` once; Linux hosts needing system dependencies can use `npm run playwright:install -- --with-deps`. No login, extension reload, CDP, manual F-keys, saved conversations, private reports or live settings are prerequisites.

`npm run checks` automatically installs missing or changed locked dependencies and ensures Chromium is available, then runs `check`, `test:validators`, `validate:keys`, `test:shortcuts:contracts` and one normal `test:shortcuts:fast` run. Independent check failures are retained while later checks continue. `npm run checks -- --ci` adds Linux browser system dependencies and publishes the Markdown report to the Actions summary. Use Node 24 and npm. Reuse passing evidence for unchanged relevant inputs during follow-up review.

Each normal or filtered fast run replaces `test-results/shortcuts-fast/report.json`, `report.md` and `report.html`; the aggregate command also writes `checks.md`. These ignored artifacts are fresh outputs, never prerequisites. The visual report attributes exercised failures to actions, recorded chords, target references and source owners; coverage warnings and native/external limitations appear separately. Catalogue-only mode leaves the last keyboard report intact. Setup/source failures replace stale results with a blocked report. The local `$run-checks-for-chatgpt-custom-shortcuts-pro` skill runs these commands and displays actionable findings in a final chat table.

- Develop with `npm run test:shortcuts:fast -- --shortcut-action-id shortcutKeyEdit` or `-- --type scroll-message`; repeated filters are supported. Intentionally unselected implemented cases remain not-run and are not missing coverage. Unknown requested IDs/types warn while available selected cases continue. A zero-case selection explicitly reports that no checks ran.
- `npm run shortcuts:catalog` optionally lists global actions, fixed contracts, sparse model profiles, declared browser commands and first-party listener boundaries without opening a browser. Counts follow current inputs and are not acceptance constants. Chrome Alt+U/`_execute_action` has static popup-target wiring proof; browser-native activation remains external and unexercised.
- Missing metadata, adapter or case coverage is collected and printed in a warning section at the end. Warning-only runs exit successfully with warnings and partial coverage; untested rows never claim a pass. Exercised missing targets, wrong effects, runtime errors, attempted environment failures, broken serial barriers or unsafe scheduling fail after final reporting. Unrecoverable startup/source errors identify blocked scope and say no checks ran.
- One headless Chromium browser uses fresh fixture state and a rolling pool of at most ten independent tabs. Shared-state cases run serially after the pool settles. External network is blocked and owned pages are closed. Blank bindings and sparse profile positions are preserved; fixture-only assignments and actual tested chords are recorded without changing live storage.
- Proof covers extension dispatch and effects against recorded structural DOM states. Derived contracts require explicit matching keyboard assertions in the same run. Negative unavailable-model proof establishes inert handling, not a working target. Native clipboard permissions, OS behavior, audio/transcription, upload completion, account/network outcomes and current live ChatGPT selector availability remain outside controlled proof.
- During construction run focused browser-free inventory/report fixtures first, then only affected cases when needed. Reserve one normal fast command for final source acceptance. After failures, rerun only invalidated actions/types and preserve prior evidence scope; do not manufacture a full-current pass from historical hashes. Timings are diagnostic rather than machine-speed acceptance thresholds.
- `tests/playwright/shortcut-fast-fixture.mjs` and `tests/playwright/lib/shortcut-fast-cases.mjs` own execution/reporting; existing inventory builders own source reconciliation. Ignored `shortcut-fast-*.local.json` outputs are optional evidence, never fresh-clone inputs. `node tests/shortcut-fast-acceptance-fixture.mjs` is an opt-in saved historical proof checker with source/catalogue/case/fixture fingerprints; it is not a required second command.
- The Windows tray **Fast Shortcut Check** action delegates to the same npm command through `ahk-tray-tools/RunShortcutFastCheck.ps1`. It adds a duplicate-launch guard and displays command output/exit status; npm remains the portable contributor entry point.
- Static settings wiring stays in spec 0005. Fast validation Actions runs the same aggregate command with browser-free report/inventory contracts and actual controlled keyboard/target assertions. It uploads the latest report even after failure. Missing/native coverage warns; structural or exercised failures fail. Catalogue-only success remains discovery/static wiring proof. Completed evidence and past measurements belong to [Done-0090](../plans/Done-0090-shortcut-deferred-coverage-plan.md) and [Done-0098](../plans/Done-0098-retired-shortcut-cleanup-and-study-restore-plan.md), not fixed present-day totals.

### Current-page validation

Prepared fixture HTML exercises current extension code but cannot establish today's ChatGPT selector availability. GitHub runs code/fixture regressions and marks current-page validation **unverified**. Current-page claims require new local evidence from an authenticated browser; saved inspector dumps provide historical evidence only.

The skill's repair cycle confirms repaired targets live before updating minimal synthetic fixture markup, bindings and regression assertions. The fast runner extracts runtime handlers from current code; prepared page structures are maintained fixtures. Repair reruns may select previously failed actions and affected dependencies, retaining recorded passing results only when their relevant source, shared helpers, metadata, fixture and runner inputs are unchanged. Reports distinguish reused passes from executed passes. Shared changes or uncertain impact require the appropriate broader gate; a filtered pass cannot establish full-suite coverage. Source or fixture edits still require fresh final live evidence and confirmation before publication.

- `npm run checks:live` reuses automatic dependency/browser setup and code/fixture checks, then invokes `npm run check:current-page`. This Windows-local stage verifies the standard Chrome `CodexCleanProfile` root process on port 9333 without `--disable-extensions-except`, constrains the engine to that endpoint and disables auto-launch. It never silently tries a different profile or endpoint. Prepare/authenticate that profile once; use `--pause-for-extension-setup` only when manual extension installation or repair is needed. Routine live collection can run without the pause when the installed extension is reachable. Reload the extension after shipped changes. The agent-managed skill workflow requires no tray.
- The stage invokes `validate-wide` and requires exactly one versioned structured result bound to the parent invocation ID. It accepts only that result's report from a direct child of the configured capture root, verifies the exact `check-report.json`, and checks the source fingerprint before and after collection. The console's human-readable `Run folder:` line is not a handoff protocol. The configured conversation URL chooses the required UI state; its rendered DOM is captured afresh. Missing, stale or mismatched evidence is unverified; no latest-folder fallback is allowed.
- Default live capture checks target presence. `-- --probe-shortcuts` opts into activation probes, including disposable-conversation prompts described above. Omitted probes remain unverified. Observed target/probe failures are failed; missing required target evidence makes target coverage incomplete. Missing, failed or deferred artifacts that no current target requires remain visible diagnostics and do not by themselves reject otherwise complete required-target evidence. Intentional native/not-applicable boundaries retain their reported scope and do not imply successful activation.
- `scripts/run-current-page-check.mjs` and `tests/playwright/lib/current-page-validation.mjs` own adjudication. Exit 0 means the reported scope passed, exit 1 means an observed failure, and exit 2 means partial or unavailable scope. A target-only run may exit 2 because activation or unrelated scope is unverified while its `targetSummary` passes. The receipt preserves the capture process exit code as diagnostic; the parent classifies the exact structured report. The snapshot exporter is the eligibility gate: it requires a current-source receipt, privacy-safe complete required-target coverage and the single 24-hour capture-completion window; a requested observed activation failure also blocks. A process exit code alone does not establish or reject target evidence.
- The separate `test-results/shortcuts-live/report.{json,md,html}` records page URL, check time, endpoint, configured profile, target/probe summaries, failures and coverage limitations. It does not assert an account identity or proof for another profile. Failed setup replaces old aggregate live results with unverified output. Private captures and these reports stay local and are excluded from GitHub artifact uploads. Browser access refusals remain unverified and must not be bypassed.
- Visual code/fixture reports show current-page status explicitly and cannot turn fixture success into a live pass. A supplied passed label requires provenance plus passed target/probe summaries. Final chat reports distinguish code/fixture regressions, live target presence, activation coverage and unresolved work.
- `scripts/live-snapshot.mjs` projects only observed allowlisted target tokens into schema v2 evidence, including the exact code-owned capability marker. Export requires matching markers in the fresh manifest, saved report and recomputed report. Schema v1 evidence remains readable as `unverified` with `snapshot-schema-outdated`; it cannot establish current scope or authorize publication. Raw page fragments, account data and conversations remain local.
- GitHub's `npm run checks -- --ci` sequence runs `npm run check:live-snapshot` without a browser. It replays only `tests/playwright/live-snapshot/latest.json` against the current source and target contract. Missing, stale, source-mismatched or incomplete evidence reports an explicit unverified warning and exits 0; target drift is visible but does not turn an old external observation into a fresh live failure. Malformed or private evidence and evaluator/schema contract violations exit 1. The workflow publishes only the safe `checks.md` and `live-snapshot.md` summaries; receipts, raw captures, profile data and detailed local reports remain excluded.
- Snapshot source fingerprints include `extension/manifest.json`, `extension/composer-layout-bootstrap.js`, `extension/composer-layout.css` and `tests/playwright/lib/shortcut-audit-artifacts.mjs`. Changes to any fingerprinted input invalidate the earlier capture receipt and candidate; the exporter refuses that stale pairing. The manifest remains fingerprinted because its content-script matches, load order and service-worker routing affect runtime provenance.

### Optional live and selector diagnostics

Use targeted selector audits, `probe-shortcuts --shortcut-action-id <actionId>`, or existing narrow live checks only when reported drift needs current DOM evidence. They have separate account/extension/environment prerequisites and do not expand fast fixture proof.

The opt-in `npm run playwright:chatgpt:audit-shortcuts -- --fast` attaches to standard Chrome/CDP and currently admits only focus. Optional `--fixture-id` selections reuse audit-owned direct conversation URLs in ignored `tests/playwright/shortcut-fast-conversations.local.json`; the schema is `{ "schemaVersion": 1, "fixtures": { "id": { "url": "https://chatgpt.com/c/ID", "conversationId": "ID", "auditOwned": true } } }`. Missing state is an environment gap. This diagnostic does not prove response/code semantics. Unsupported fixed/model/action filters reject instead of silently substituting focus.

Default fast validation must not provision conversations, send messages, prompt for login/CDP, restart wide scrapes or recover native audio/upload. Optional diagnostics preserve user tabs/drafts/settings, close only runner-created pages and detach sessions. A refused CDP connection is not live product proof. Existing scrape/check tools below remain available for their distinct capture and selector scope.

Prefer narrow validation:
- syntax-check the new Playwright runner and helper modules
- run the real `scrape-wide` command only against the required fixture
- run `check-wide` against an existing scrape folder after a successful capture
- use `probe-shortcuts --shortcut-action-id <actionId>` for targeted live rechecks instead of rerunning the whole browser workflow
- avoid repeated full live runs when a saved report plus a targeted probe can prove the fix
- keep browser-launch troubleshooting in the support doc, not in repeated workflow-specific hacks

Do not reintroduce popup or userscript UI as the primary runtime validator path without a deliberate spec update.
