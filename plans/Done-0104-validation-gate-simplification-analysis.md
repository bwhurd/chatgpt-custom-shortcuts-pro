# Current-page validation gate simplification

**Status:** Analysis complete. The implementation recommendations below are deferred and require separate authorization.
**Prepared:** 2026-10-08
**Scope:** Review the current-page collection, evidence confirmation, and GitHub publish/check workflow; identify redundant gates while preserving provenance, required target coverage, requested activation checks, privacy boundaries, and exact-SHA verification.

## Objective and method

> This baseline was prepared on 2026-10-08, before the final work in plan 0103. Its implementation batches are recommendations only; plan 0103 later changed overlapping files. Check the completed plan and current source before reusing any recommendation.

Simplify the current-page validation workflow where it currently confuses optional capture artifacts or point-in-time catalogue facts with required evidence. Keep each meaningful safety contract and make the operator instructions match the implemented commands. The three investigation strands were reviewed in parallel, with the end-to-end phase map and documentation synthesis handled in the coordinating task.

The parallel strands covered (1) phase flow and skill procedure, (2) classifier and catalogue-test assumptions, and (3) timing, freshness, and provenance limits. The coordinating task compared those findings with current source, specs, and package/CI wiring.

The analysis deliverable is complete. No implementation was performed by this analysis plan, and none is authorized by it. Its proposed batches remain deferred.

## Baseline workflow observed on 2026-10-08

| Phase | Verified current behavior | Simplification implication |
| --- | --- | --- |
| Collect | `scripts/run-current-page-check.mjs` uses the fixed `CodexCleanProfile` and CDP endpoint, refuses to auto-launch Chrome, requires one unique run folder under the capture root, reads that invocation’s report, and invalidates evidence if the source fingerprint changes during collection (`scripts/run-current-page-check.mjs:15-22, 96-145`). | Keep profile isolation, exact invocation identity, containment, and source fingerprint checks. Replace the child process’s human-readable `Run folder:` handoff with structured output, retaining all parent-side validation. |
| Confirm/export | `node scripts/live-snapshot.mjs export` validates the receipt, source fingerprint, freshness, required target evidence, requested activation failures, and complete projected coverage (`scripts/live-snapshot.mjs:1033-1043, 1249-1293`). The direct CLI has `export` and historical `check` modes (`scripts/live-snapshot.mjs:1390-1413, 1439-1477`). There is no separate confirmation-seal writer or `checks:confirm`/`checks:collect` npm alias. | Treat export as the actual evidence eligibility gate. Do not add a second confirmation clock, seal, or phase orchestrator without evidence that the current gates miss a real failure. Correct instructions that imply those commands or files already exist. |
| Historical replay | `node scripts/live-snapshot.mjs check` replays a saved snapshot; it is distinct from the current-run confirmation step. Historical replay has its own age policy (`scripts/live-snapshot.mjs:44`). | Keep the distinction between fresh local evidence and historical replay explicit. |
| Publish/check | The skill describes publishing through the GitHub connector and checking the exact published SHA (`C:/Users/bwhurd/.codex/skills/run-checks-for-chatgpt-custom-shortcuts-pro/SKILL.md:130-143`). The repository workflow runs `npm run checks -- --ci` and uploads a headless report; it does not run the authenticated current-page collection or snapshot replay (`.github/workflows/validate.yml:51-60`). | Keep exact-SHA review and connector checks for any future publication. Do not describe CI as proof of authenticated live checks, or duplicate the full suite before every local collection. |

`package.json:14-22` defines `checks`, `checks:live`, and `check:current-page`; `test:validators` includes the current-page and snapshot tests. `scripts/run-checks.js:90-103` runs the standard validators and only adds the live current-page check when requested with `--live`. The repo does not define `checks:collect`, `checks:confirm`, or an npm `check:live-snapshot` alias. The existing direct Node commands remain available.

At preparation time, `plans/0103-current-page-validation-status-plan.md:46-53` described the intended receipt, candidate, caps, and publication window. Later 0103 work revised those contracts. This paragraph is historical; the current 0103 source and plan take precedence.

## Prioritized recommendations

### P1 — Classify missing or deferred artifacts by whether required targets depend on them

**Current behavior.** `tests/playwright/lib/current-page-validation.mjs:692-710` adds a partial reason whenever any artifact or expected file is missing and whenever any manifest artifact is deferred. This includes optional `1c` when the local extension is unavailable. Yet `specs/0006-runtime-scrape-selector-validator-spec.md:168-170` says that optional artifact may be deferred when the extension is absent, while required shortcut-target validation can still complete. The current unit test encodes the broad rule (`tests/current-page-validation.test.js:299-308`).

**Current code shape:**

```js
if (report.missingArtifacts.length > 0) {
  partialReasons.push(`${report.missingArtifacts.length} scrape artifact(s) are missing or failed.`);
}
// ...
if (report.runManifest.deferredCount > deferredArtifacts.length || deferredArtifacts.length > 0) {
  partialReasons.push('The capture manifest records deferred scrape artifacts.');
}
```

**Proposed code shape (illustrative, not a drop-in API):**

```js
const requiredArtifactIssues = summarizeRequiredArtifactIssues({
  report,
  requiredFiles: filesRequiredByRegisteredTargets,
});

if (requiredArtifactIssues.length > 0) {
  partialReasons.push(...requiredArtifactIssues);
}
// Keep missing/deferred optional artifacts in diagnostics, without making
// complete required-target evidence partial by themselves.
```

Build `filesRequiredByRegisteredTargets` from the canonical target inventory and registry. Do not blanket-ignore missing artifacts: missing required files must still make target evidence incomplete, and actual requested-probe failures must remain failures. Keep top-level, target, and probe summaries distinct. A complete target-only run remains `partial` overall while its probe summary is `unverified`, as specified by `tests/current-page-validation.test.js:322-344` and the scope distinction in `specs/0006-runtime-scrape-selector-validator-spec.md:354`.

**Why / priority.** This is a confirmed mismatch between optional-artifact policy and classifier behavior. It can make a required-target-complete run look incomplete and can obstruct the user’s intended target-only export.

**Minimum future proof.** Add classifier and integration cases for: optional `1c` deferred with complete required targets; a required target file missing; a requested activation probe failing; and target-only evidence with probes unrun. The optional-deferred case should retain a diagnostic but not degrade required target status or prevent export when coverage is complete. `scripts/live-snapshot.mjs:1250-1289` already gates requested probe failures and incomplete target coverage directly.

### P1 — Make the workflow interpret evidence summaries, not a generic wrapper exit code

**Current behavior.** The wrapper returns 0 for passed, 1 for failed, and 2 for other/partial states (`scripts/run-current-page-check.mjs:202-203`; the skill documents this at `SKILL.md:63-70`). The classifier intentionally marks a target-only run partial because activation was not probed. The runner records the child process exit code as receipt provenance; a nonzero child exit does not itself override a valid report (`tests/current-page-runner.test.js:379-398`). Snapshot integration also demonstrates complete target coverage and successful export with a deferred optional artifact and child exit code 37 (`tests/live-snapshot-integration.test.js:548-627`).

**Recommended operator rule:**

```text
Interpret exit 0 as all reported checks passed, exit 1 as an observed failure,
and exit 2 as partial or unverified. For target-only collection, exit 2 may be
expected because activation probes were not requested. Inspect this invocation's
target and probe summaries. Export is eligible only when required target coverage
passes and export exits 0 with complete coverage. Never infer a pass or failure
from exit 2 alone, and never substitute older evidence.
```

This is a skill/workflow wording change, not a proposal to ignore observed failures. Keep `captureExitCode` as diagnostic provenance and let report classification plus export eligibility decide whether evidence is usable. Keep requested probe failures, missing required targets, stale receipts, fingerprint mismatch, unsafe capture paths, and incomplete projected coverage as blockers.

**Minimum future proof.** Preserve/update the existing nonzero-child-exit and target-only tests; assert observed requested-probe failure still blocks export, while complete target-only coverage can export. Do not add a generic `captureExitCode === 0` gate.

### P1 — Derive catalogue coverage from the live registry instead of pinning current counts

**Current behavior.** `tests/live-snapshot-integration.test.js:21-72` hardcodes probe-only states and current uncaptured target/action IDs. Its assertions at `:399-453` compare dynamically collected inventory against those lists and pin counts such as 50 targets, 37 passing, and 13 partial. `tests/live-snapshot.test.js:910-957` also uses fixed target totals and asserts retired targets are absent. Those figures describe today’s catalogue, not a durable acceptance contract; historical plan notes already show the inventory changing over time (`plans/0103-current-page-validation-status-plan.md:63, 117, 133`).

**Proposed assertion shape:**

```js
assert.deepEqual(uncoveredTargets, [], 'all canonical targets have registered file coverage');
assert.deepEqual(orphanTargets, [], 'the inventory has no unreferenced targets');

const targetSummary = currentEvidence.currentPageValidation.targetSummary;
assert.equal(currentEvidence.checkReport.targetRows.length, currentEvidence.inventory.targets.length);
assert.equal(targetSummary.total, currentEvidence.inventory.targets.length);
assert.equal(
  targetSummary.passed + targetSummary.partial + targetSummary.failed + targetSummary.outOfScope,
  targetSummary.total,
);
```

Replace the expected list of *currently uncaptured* IDs and exact presentation counts with structural invariants derived from the current inventory. Derive probe-only state projections from registry entries and verify every mapped target and state exists. Keep meaningful invariants: registered target file coverage, no orphan targets, correct action/target links, valid probe-only state mappings, and explicit out-of-scope status. Test missing-capture behavior with small synthetic inventories instead of requiring the production catalogue to remain incomplete in the same way.

Keep any retired Previous/Next shortcut migration assertion in a focused migration/regression test; do not make a retired-key migration check part of every routine current-page audit.

**Why / priority.** Catalogue growth or a successful coverage fix currently requires editing tests merely to update snapshots of the expected current state. Structural invariants provide stronger contracts with less maintenance.

**Minimum future proof.** Exercise a synthetic added target, a synthetic missing required capture, and a probe-only registry entry. Confirm summary totals derive from inventory sizes, all target rows are represented exactly once, and genuinely uncovered/orphaned inventory still fails.

### P2 — Replace the run-folder text protocol while preserving run identity checks

**Current behavior.** The wrapper parses `^Run folder: (.+)$` from child stdout and requires one unique normalized folder under the expected capture root (`scripts/run-current-page-check.mjs:119-132`). The child prints that human-readable line (`tests/playwright/devscrape-wide.mjs:658-663`). Uniqueness, containment, and refusal to reuse an older report are important; parsing prose is the fragile part.

**Proposed protocol shape:**

```json
{"schemaVersion":1,"runFolder":"<absolute invocation folder>","status":"completed"}
```

Have the child emit one machine-readable result for the invocation (for example, a documented `--json` mode or a dedicated result file). Continue to reject zero or multiple results, paths outside the capture root, stale folders, and source changes during collection. Do not add fallback-to-latest-folder behavior.

**Minimum future proof.** Cover valid output, malformed output, multiple result records, path traversal/out-of-root result, and no result. Confirm the wrapper only reads the exact current invocation’s report.

### P2 — Remove only unconditional readiness delays; retain semantic readiness and deliberate throttling

**Current behavior.** The scrape spec documents fixed 2.5-second waits (`specs/0006-runtime-scrape-selector-validator-spec.md:65-66`). The Playwright harness has a 2.5-second new-conversation settle delay and request spacing (`tests/playwright/lib/devscrape-wide-core.mjs:87-90, 3601-3612, 4498`). The GPT conversation path waits for `networkidle`, then another fixed 2.5 seconds, before checking existing page elements (`tests/playwright/lib/devscrape-wide-core.mjs:5908-5916`). The fixture runner already has semantic URL/composer readiness helpers and bounded retries (`tests/playwright/devscrape-wide.mjs:194-219`; `waitForFixtureConversationReady` is defined at `tests/playwright/lib/devscrape-wide-core.mjs:946`).

Use existing semantic readiness and bounded timeouts to replace sleeps whose only purpose is to wait for page readiness. Keep explicit request spacing if it is a service-load throttle, and preserve “expected URL + visible composer/current control” checks. Do not invent selectors or fall back to old capture evidence.

Playwright documents that `page.waitForTimeout()` is discouraged for production tests and that `networkidle` is discouraged as a general readiness signal; its actionability checks and retrying assertions already wait for observable conditions: [Page API](https://playwright.dev/docs/api/class-page), [Actionability](https://playwright.dev/docs/actionability).

**Minimum future proof.** Run the focused Playwright fixture tests that cover new-conversation and GPT conversation readiness; assert a bounded timeout yields partial/unverified evidence rather than a false pass. Compare before/after timing only as diagnostic evidence, not as a new brittle pass threshold.

### P2 — Keep provenance and resource limits; make their policy explicit before changing thresholds

**Retain.** The receipt source fingerprint and user-selected 24-hour local invocation age are enforced before export (`scripts/live-snapshot.mjs:1033-1043`); historical replay has a separate seven-day default (`:44`). Keep future-time rejection, fingerprint mismatch, malformed receipt checks, raw capture read limits, token-length/per-state bounds, serialized snapshot byte limit, and exact coverage checks. These preserve evidence integrity and resource safety.

**Review, do not blindly remove.** `MAX_SNAPSHOT_STATES = 64` (`scripts/live-snapshot.mjs:38`) also participates in aggregate token bounds and may eventually constrain inventory growth. No evidence in the inspected source establishes that the current registry has hit this ceiling. Treat it as an explicit capacity policy, not a confirmed current blocker. If changing it, retain an independently bounded aggregate parsing/size limit, measure the present registry and projected snapshots, and test just-below/at/above the selected limit. Do not choose a larger number without evidence.

The former 30-minute candidate age was changed at the user's direction to 24 hours. The reviewed workflow does not establish that an additional confirmation seal or duplicate freshness clock prevents a real failure. Keep one authoritative local receipt age check; keep the distinct historical replay window documented separately.

## Remove, relax, retain

| Decision | Item | Reason |
| --- | --- | --- |
| Remove | Fixed expected lists for “currently uncaptured” production targets/actions and exact catalogue totals. | These are mutable inventory snapshots; structural coverage invariants are the durable contract. |
| Remove | Any universal child-exit-zero gate for target-only collection. | Exit 2 can mean activation was not run; export already evaluates required evidence. Child exit remains provenance. |
| Remove | Unconditional readiness sleeps after equivalent semantic readiness succeeds; `networkidle` as the sole general readiness signal. | Observable state and bounded waits are less timing-sensitive. |
| Relax | Any-artifact-missing/deferred automatically means required evidence is partial. | Only artifacts required by registered targets should affect target eligibility; optional absence remains diagnostic. |
| Relax | Catalog and retired-key checks from every ordinary audit. | Run focused structural or migration checks when the corresponding inventory or migration contract changes. |
| Retain | Exact run identity, capture-root containment, source fingerprint, receipt validity/freshness, complete required target coverage, requested live-probe failures, privacy projection, file/byte bounds, and exact published SHA review. | These protect evidence provenance, safety, and correctness. |
| Retain | Intentional capture request pacing unless measurements justify a safe change. | It may protect the site/service from rapid repeated requests; it is not equivalent to an idle wait. |

## Skill and documentation simplification

The external skill at `C:/Users/bwhurd/.codex/skills/run-checks-for-chatgpt-custom-shortcuts-pro/SKILL.md` has a fixed model ladder and formatting/validation procedure (`:78-101`), unconditional catalog and broad validator steps (`:109-115`), publication cleanup advice (`:142`), and repeated detailed action-check contracts. Tighten it around actual preconditions and outcomes:

- Keep the exact commands that exist, the three phases as operator concepts, isolated profile requirements, requested action postconditions, privacy boundaries, and exact-SHA connector verification.
- Point to `specs/0006-runtime-scrape-selector-validator-spec.md` for detailed runtime behavior rather than duplicating it in the skill.
- Run catalog discovery only when action IDs are unknown or inventory changed. Run validators owned by changed code or direct dependencies; do not run all checks before each capture. Keep popup `npm test` when popup files change, consistent with repo guidance.
- Run the focused retired Previous/Next migration tests only when that migration/binding contract changes.
- Remove a fixed model-escalation ladder and mandatory format-before-validation ritual; choose tools and formatting based on the files and actual failures. Preserve required repository formatter checks for changed code.
- Treat local synchronization, proving old fixtures unused, and deleting fixtures as optional cleanup, not phase success criteria. Preserve user changes.

Suggested compact skill rule:

```text
Run the narrowest checks required by the owning spec. Rerun failed actions and
checks for source or fixture dependencies that changed; reuse a recorded pass
only while its inputs are unchanged. Discover the catalog when action IDs are
unknown or inventory changed. Use formatting, delegation, and model changes
when they help with the task; there is no fixed escalation ladder.
```

Do not add an automated multi-phase runner, confirmation seal, or publish automation as part of simplification unless a measured failure mode demonstrates the need. Keep CI’s current headless ownership clear; an authenticated local check remains a separate workflow.

## Deferred implementation recommendations

These batches are not part of the completed analysis deliverable. Start them only after separate user authorization and a fresh source review.

The work is organized into three ordered Luna batches. Each batch can be reviewed independently; later batches consume the classifier and evidence contracts established in Batch 01. Use three parallel analysis/implementation strands per batch where available, with the coordinating agent owning cross-cutting spec/skill alignment and integrating results. No batch should run authenticated browser actions or publish content.

### Luna Batch 01 — Scope-aware artifact classification

- [ ] Update `tests/playwright/lib/current-page-validation.mjs` to distinguish artifacts required by registered targets from optional artifacts. Preserve failed requested activation probes as failures, missing required target evidence as incomplete, and optional artifact details as diagnostics.
- [ ] Update `tests/current-page-validation.test.js` and `tests/live-snapshot-integration.test.js` with the four cases described under P1, especially optional deferred `1c` plus complete required coverage.
- [ ] Reconcile `specs/0006-runtime-scrape-selector-validator-spec.md:168-170, 354-356` with verified classifier and receipt behavior, including why target-only is partial overall and why `captureExitCode` is diagnostic rather than a universal gate.
- [ ] Run `node --test tests/current-page-validation.test.js tests/current-page-runner.test.js tests/live-snapshot.test.js tests/live-snapshot-integration.test.js`; run Biome on changed source/tests and text-format validation on changed docs.

**Acceptance:** Required-target summary and exporter eligibility depend on required target evidence; optional `1c` absence alone does not block complete coverage; requested probe failures still block; target-only probes remain explicitly unverified.

### Luna Batch 02 — Durable inventory contracts and collection handoff

- [ ] Replace fixed current-uncaptured ID lists and exact production counts in `tests/live-snapshot-integration.test.js` and `tests/live-snapshot.test.js` with registry-derived target/action/state coverage checks and synthetic missing-capture cases. Preserve the no-uncovered-target/no-orphan-target invariants and focused retired-key migration coverage.
- [ ] Replace child stdout `Run folder:` parsing across `tests/playwright/devscrape-wide.mjs` and `scripts/run-current-page-check.mjs` with a versioned structured handoff. Preserve uniqueness, exact invocation, source fingerprint, and capture-root checks.
- [ ] Replace only redundant page-readiness sleeps and general `networkidle` waits in `tests/playwright/lib/devscrape-wide-core.mjs` with bounded semantic state checks already supported by the fixture harness. Preserve intentional request pacing.
- [ ] Measure current registry/snapshot size and document the 64-state cap’s role. Change it only if it is a demonstrated blocker, with an independent aggregate resource bound and boundary tests. Preserve the user-selected 24-hour local age gate and seven-day replay semantics.
- [ ] Run `node --test tests/current-page-validation.test.js tests/current-page-runner.test.js tests/live-snapshot.test.js tests/live-snapshot-integration.test.js tests/probe-state-capture.test.js`; add or update non-authenticated unit coverage for changed readiness helpers, then run it with `node --test`; run Biome on changed code and text-format validation on changed docs.

**Acceptance:** Adding a valid target/state does not require refreshing a current-state allowlist or exact total. Malformed or unsafe invocation handoffs fail closed. Readiness remains semantic and bounded. Resource and provenance limits remain explicit and tested.

### Luna Batch 03 — Operator skill and final contract alignment

- [ ] Update the external skill `C:/Users/bwhurd/.codex/skills/run-checks-for-chatgpt-custom-shortcuts-pro/SKILL.md` only when the user’s current authorization includes that external file. Document the accurate command map, target-only exit-2 interpretation, evidence-based gates, conditional validation, exact-SHA publication check, and optional cleanup. Remove redundant model/format escalation and duplicated spec details.
- [ ] Recheck `package.json`, `scripts/run-checks.js`, `.github/workflows/validate.yml`, `PROJECT_SPEC.md`, and `specs/0006-runtime-scrape-selector-validator-spec.md` against the final instructions. Do not add phase npm aliases or claim CI performs authenticated checks without separately authorized design work.
- [ ] If the external skill is in scope, load the `skill-creator` skill before editing and use its documented validation command. Also run text-format validation and only the focused test commands required by changed contracts.

**Acceptance:** The skill is shorter, commands and exit meanings match current code, optional work is not presented as an acceptance gate, and all retained evidence/privacy/publish protections are accurately stated.

## Acceptance matrix and risks

| Contract | Evidence now | Future proof |
| --- | --- | --- |
| Complete target evidence can be exported independently of unrun activation probes. | Classifier keeps target/probe summaries separate; exporter checks requested probes only and then requires complete target coverage (`tests/current-page-validation.test.js:322-344`; `scripts/live-snapshot.mjs:1250-1289`). | Target-only export succeeds only with complete required coverage; probe summary stays unverified. |
| Optional artifacts do not mask complete required-target evidence. | Spec explicitly allows optional `1c` deferral; classifier currently makes any defer partial (`specs/0006-runtime-scrape-selector-validator-spec.md:168-170`; `tests/playwright/lib/current-page-validation.mjs:692-710`). | Optional deferred fixture with complete required files; required-missing fixture still blocks. |
| Evidence belongs to this source and invocation. | Unique folder under capture root, current receipt, exact source fingerprint (`scripts/run-current-page-check.mjs:119-145`; `scripts/live-snapshot.mjs:1033-1043`). | Structured output tests for malformed, duplicate, outside-root, and stale identities. |
| Snapshot stays bounded and privacy-projected. | Raw read caps, token bounds, state/byte caps and projection (`scripts/live-snapshot.mjs:38-45, 448-460, 480-541, 1275-1293`). | Boundary tests remain; any state-cap change retains an independent aggregate bound. |
| Published source is the reviewed source. | Skill requires exact published SHA; CI currently only runs headless checks (`SKILL.md:130-143`; `.github/workflows/validate.yml:51-60`). | Review/check exact published SHA; no claim that CI supplies local authenticated evidence. |

Risks to control: making optional artifacts universally ignorable could hide a required target dependency; dynamic tests could become too weak if they drop structural invariants; replacing sleeps with selectors not already supported could introduce flakiness; structured output must not permit path escape or old-run fallback; raising state/age limits without measurements could weaken resource and freshness guarantees. The plan preserves these guardrails explicitly.

## Validation ownership

The plan makes no code changes and does not run tests. During later implementation, use the focused commands in each batch rather than repeating the full local suite for unchanged inputs. Repository guidance requires Biome on changed code and text-format validation on changed docs. The GitHub Actions `checks -- --ci` workflow owns the headless CI gate; it should not be rerun locally solely because a current-page audit is being collected. Do not substitute the broader `npm run test:validators` for the targeted Node command unless a changed dependency makes the broader set necessary.
