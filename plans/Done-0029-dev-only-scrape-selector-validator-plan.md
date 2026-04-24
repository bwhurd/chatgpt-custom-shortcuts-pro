# Dev-Only Scrape Selector Validator Plan

## Investigation Findings

- [x] `specs/0005-popup-settings-validator-spec.md` defines the current validator as a static popup/settings wiring check and explicitly keeps live ChatGPT selector validity, menu traversal, and inspector-dump audits out of scope, so this work needs a separate contract instead of extending `0005`.
- [x] `extension/popup.html` already places a hidden `DevScrapeWide` button immediately before `Refresh Models`, and `extension/popup.js` already gates that button by probing `lib/DevScrapeWide.js` through the packaged extension URL without adding permissions or `web_accessible_resources`.
- [x] `extension/popup.js` already has a usable model for popup-driven ChatGPT-tab work: `Refresh Models` sets popup loading state, relays to the active ChatGPT tab, and keeps URL-sensitive behavior out of `tabs`-permission-dependent filtering.
- [x] `scripts/build-zip.js` currently excludes only `lib/DevScrapeWide.js`, `extension/lib/DevScrapeWide.js` and `extension/lib/DevScrapeNarrow.js` both exist but are empty, and there is no `extension/lib/DevScrape.js`.
- [x] `_temp-files/` is the approved ignored scratch area, and the user-named example folder currently shows the initial wide scrape family: `1a`, `1b`, `1c`, `1d`, `1e`, `1f`, `1g`, `1h`, `2a`, `2b`, `2c`, `2d`.
- [x] The example folder gives concrete current filenames, but the repo does not yet define that dump inventory as a durable contract; the new workstream needs to make the initial required set explicit and keep `1c_TopbarToBottomEnabled_ThreadBottom.txt` deferred instead of silently treating the sample folder as already-authoritative.
- [x] Project posture still forbids leaning on new manifest permissions, especially `tabs`, so fixture checks and ChatGPT-tab routing should reuse the existing popup-to-active-tab relay pattern rather than inventing a new permission posture.
- [x] This plan should normalize ownership to `extension/lib/DevScrapeWide.js` for the first broad scrape/check workflow, not a new `DevScrape.js`: the popup gate and current packager exclusion already key off `DevScrapeWide.js`, while `DevScrapeNarrow.js` remains the cleaner reservation for a later dedicated narrow or `1c`-family button.

## Scope

- [x] Keep the current static validator and `specs/0005-popup-settings-validator-spec.md` focused on popup/settings wiring only.
- [x] Add a separate dev-only scrape-and-check workflow for the required shared-conversation fixture `https://chatgpt.com/share/69ea4c43-c770-83ea-8e47-8f23a993ec4a`.
- [x] Support registry-defined click paths that can be 1, 2, 3, 4, or 5 steps deep, including states that only exist after earlier clicks reveal dropdowns or popups.
- [x] Produce dated capture folders under `_temp-files/inspector-captures/`, then check the newest capture set and open a dev-only extension report page with identifier-to-dump results.

## Out Of Scope

- [x] Do not merge live selector auditing into `tests/validate-keys.js` or the static popup settings validator.
- [x] Do not add new Chrome permissions, host-access changes, or manifest broadening for this workstream.
- [x] Do not turn this into Playwright coverage or end-to-end shortcut execution proof in the first pass.
- [x] Do not include the deferred `1c_TopbarToBottomEnabled_ThreadBottom.txt` family in the first `DevScrapeWide` button flow; that belongs to a later dedicated scrape button.

## Boundaries

- [x] Static validator responsibilities: prove popup/settings wiring contracts from source files only, keep `0005` unchanged in scope, and remain the place for `tests/validate-keys.js` and `tests/lib/settings-wiring-validator.js`.
- [x] Scrape collector responsibilities: confirm the required fixture tab, traverse the required UI states on the active ChatGPT tab, capture raw revealed-state DOM, normalize the dumps, write the dated folder, and emit a machine-readable run manifest that records captured, failed, skipped, and deferred states.
- [x] Scrape checker responsibilities: load the newest scrape folder, derive the canonical identifier set from current source-of-truth code where practical, join it with a small explicit state-expectation map, and report whether each identifier appears in at least one required dump.
- [x] Extension report UI responsibilities: read the latest checker result and render a simple dev-only table with the canonical identifier, matching dump files, and status `✓` or `X`, plus a clear repair-needed note when no dump contains the identifier.

## Likely Owning Files

- [x] `specs/0005-popup-settings-validator-spec.md` should stay narrowly static, and this work should instead add `specs/0006-runtime-scrape-selector-validator-spec.md`.
- [x] `extension/popup.html` and `extension/popup.js` own the dev-button cluster, fixture confirmation UX, loading and error states, newest-scrape trigger wiring, and report-page launch.
- [x] `extension/_locales/*/messages.json` will likely need the new `Check-Scrape` button label because popup-visible text stays localized even for hidden dev controls.
- [x] `extension/lib/DevScrapeWide.js` should own the first-pass dev-only registry, collector orchestration, and shared checker entry points; `extension/lib/DevScrapeNarrow.js` stays reserved for later dedicated flows.
- [x] `extension/content.js` and, only if the existing relay path needs a new message type, `extension/background.js` are the smallest likely shipped files that may need narrow bridge changes to execute the scrape against the active ChatGPT tab without new permissions.
- [x] A new dev-only report page should live in a non-shipped folder such as `extension/dev-scrape/` so unpacked builds can open it while release zips omit it by default.
- [x] `scripts/build-zip.js` remains the packager authority for any dev-only file that still sits under an included shipped path such as `extension/lib/`.
- [x] Keep new checker logic out of `tests/` in the first pass unless a separate CLI wrapper becomes necessary later; the popup-triggered report flow is better owned by dev-only extension code than by the static test harness.

## Phased Implementation

- [ ] Phase 1: add `specs/0006-runtime-scrape-selector-validator-spec.md` to define the separate runtime scrape-validator contract, including folder naming, latest-folder selection, registry shapes, failure-manifest rules, and the boundary from `0005`.
- [ ] Phase 1: codify the ownership decision in that spec and the implementation notes: `DevScrapeWide.js` is the broad scrape/check owner now, `DevScrapeNarrow.js` is reserved for later specialized flows, and no new `DevScrape.js` should be introduced unless a later pass proves the wide/narrow split is wrong.
- [ ] Phase 2: extend the existing popup dev controls in `extension/popup.html` and `extension/popup.js` with a second hidden `Check-Scrape` button, shown only when `DevScrapeWide.js` is present and clustered beside `DevScrapeWide` and `Refresh Models`.
- [ ] Phase 2: mirror the `Refresh Models` interaction pattern for `DevScrapeWide`, including popup-owned busy state, content-tab relay, and a hard confirmation step that verifies the active ChatGPT tab is exactly `https://chatgpt.com/share/69ea4c43-c770-83ea-8e47-8f23a993ec4a` before any scrape starts.
- [ ] Phase 2: settle the dev-only local-write posture without new manifest permissions by reusing a developer-granted directory handle for `_temp-files/inspector-captures/` or an equivalent no-new-permission browser-side file access path, and keep that directory choice out of shipped behavior.
- [ ] Phase 3: implement a deterministic capture registry in `extension/lib/DevScrapeWide.js` that maps runtime action or shortcut families to canonical identifiers, maps dump artifacts to revealed UI states, and maps each dump to the 1-step to 5-step click path required to reveal it.
- [ ] Phase 3: prefer canonical identifier extraction from current source-of-truth code over a hand-maintained selector list by targeting stable attributes and identifiers already used by runtime code, such as `data-testid`, ids, roles, `aria-controls`, and other non-localized anchors; allow a small explicit authored registry only for state exposure and expectations that cannot be derived automatically.
- [ ] Phase 3: codify the initial wide scrape inventory from the named example folder as the first required dump set for this button: `1a_SideBarCollapsed_body.txt`, `1b_SidebarExpaneded_body.txt`, `1d_TopbarToBottomDisabled_ThreadBottom.txt`, `1e_TopbarToBottomDisabled_HeaderArea.txt`, `1f_UserTurnWithButtonsExposedOnHover.txt`, `1g_AgentTurnWithButtons_MultipleThreads_2of2_DidntSearchWeb.txt`, `1h_AgentTurnWithButtons_SingleThread_SearchedTheWeb.txt`, `2a_AgentOrUserTurn_SubmenuMoreActions3Dots_ReadAloudBranchButtons.txt`, `2b_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu - Copy.txt`, `2c_AgentOrUserTurn_SubmenuRegenerate_AfterWebSearchResponse_RegenerateSubmenu.txt`, and `2d_SubmenuForModelSwitcher_data-testid_model-switcher-dropdown-button.txt`, with `1c_TopbarToBottomEnabled_ThreadBottom.txt` recorded as explicitly deferred.
- [ ] Phase 3: write each run into a lexically sortable dated folder such as `YYYY-MM-DD_HH-mm-ss_devscrapewide_share-69ea4c43/`, select the newest scrape by parsed timestamp before falling back to modified time, and emit a run manifest that records missing dumps and click-path failures instead of silently skipping them.
- [ ] Phase 3: capture raw DOM first, then normalize the stored dump files with Prettier using the repo's existing config or the smallest equivalent adjustment that produces more Codex-scannable HTML while preserving deterministic output.
- [ ] Phase 4: implement the checker so it inspects the newest scrape folder, verifies every canonical identifier appears in at least one required dump or tagged inventory artifact, and treats a missing expected dump file as an explicit failed state rather than as an ignored identifier miss.
- [ ] Phase 4: store the checker result in a machine-readable summary that the report page can render directly, so the report UI does not need to rediscover identifiers from raw HTML at display time.
- [ ] Phase 4: add dev-only report page files under `extension/dev-scrape/` that open in a new extension tab after `Check-Scrape`, rendering a neat table with identifier, matching dump file list, and status `✓` or `X`, plus a visible note that an `X` likely means the underlying page changed and the selector or repair path needs attention.
- [ ] Phase 5: keep all dev-only artifacts out of release zips by continuing the explicit `lib/DevScrapeWide.js` exclusion, adding any additional `extension/lib/` dev-only helpers to the exclusion set if this pass introduces them, and keeping the report page under a folder that `scripts/build-zip.js` does not include.

## Validation

- [ ] Run `biome check` only on the changed popup, dev-scrape, and packager files.
- [ ] Reload the unpacked extension and confirm `DevScrapeWide` and `Check-Scrape` stay hidden when `lib/DevScrapeWide.js` is absent and appear together when it is present.
- [ ] On the required shared-conversation fixture, run the new `DevScrapeWide` flow and confirm the newest dated folder contains the expected initial dump set, normalized outputs, and a manifest that marks `1c` as deferred rather than missing.
- [ ] Force at least one controlled failure case by blocking a click path or removing a dump and confirm the manifest and `Check-Scrape` report make the root-cause failure obvious.
- [ ] Run `Check-Scrape` on a good scrape and confirm the report page opens in a new extension tab with the expected identifier, dump-file, and `✓` or `X` columns.
- [ ] Verify release packaging still excludes all dev-only scrape assets by inspecting `scripts/build-zip.js` behavior or building the archive once the implementation exists.

## Done When

- [ ] `specs/0005-popup-settings-validator-spec.md` remains the static validator contract and `specs/0006-runtime-scrape-selector-validator-spec.md` owns the new runtime scrape-validator contract.
- [ ] `DevScrapeWide` remains the owning dev-only module, `Check-Scrape` is available only when that module is present, and no unnecessary `DevScrape.js` abstraction was added.
- [ ] A dev-only scrape run on the required fixture writes a newest dated folder under `_temp-files/inspector-captures/` with deterministic dumps, normalization, and manifest coverage for the agreed first-pass inventory except the deferred `1c` family.
- [ ] A dev-only check run derives canonical identifiers from source-driven rules plus a minimal explicit state map, verifies the newest scrape, and opens the report page with clear pass or fail output.
- [ ] Release zips exclude every dev-only scrape, checker, and report asset.

## Open Questions And Blocked Details

- [ ] The repo still needs a durable canonical dump inventory contract for future 3-step, 4-step, and 5-step state names; the example folder gives the current initial set, but it does not yet define how new deeper-state dumps should be named.
- [ ] The exact first audited shortcut or runtime-action set still needs a targeted follow-up read of the current shortcut runtime source of truth, likely `extension/content.js` plus `specs/0004-model-picker-and-shortcuts-spec.md`; this plan intentionally does not guess that list from the limited current read surface.
- [ ] The implementation still needs to lock the precise no-new-permission write/read mechanism for `_temp-files/inspector-captures/` in extension context and document it in the new spec before coding the collector and checker.

## Related Specs

- [x] `specs/0001-adding-new-settings-spec.md`
- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0005-popup-settings-validator-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md` (new)
