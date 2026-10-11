/goal Audit maintained code and implement consequential improvements to correctness, determinism, recurring cost, and simplicity using plans/0109-deterministic-code-quality-pass-plan.md. Work on one earliest unfinished batch per execution turn. Keep the goal active across automatic continuations without asking me to say "continue." Finish only after all five batches and the final acceptance gate are proven.

# GPT-6-Luna Max audit and repair handoff

Use GPT-6-Luna with Max reasoning. This prompt does not switch models. Work in the current repository task; do not launch another task. All paths below are relative to the repository root.

Plan: `plans/0109-deterministic-code-quality-pass-plan.md`.
Paired prompt: `plans/luna-deterministic-code-quality-pass-thread-prompt.md`.

## Outcome

Audit the maintained code and implement repairs with a concrete payoff: prevent incorrect or duplicate effects, preserve data, report failures honestly, stop obsolete work, reduce demonstrated recurring work, or remove a maintenance hazard such as duplicated policy. Naming taste, function length, fewer lines, and lint counts are insufficient grounds to refactor. Zero edits in an area is acceptable when inspection supports that conclusion.

Read `AGENTS.md`, the plan, relevant `PROJECT_SPEC.md` sections, and only the owning specs for the current route. Verify source observations before using them. Preserve unrelated work. The plan defines scope, reachability, required audit routes, candidate admission, proof, check selection, and closure.

## Ordered work

1. **Risk map and triage:** account for maintained code and its execution owners; rank consequential candidates. This is a short triage pass. Permit a focused isolated reproduction when needed; do not require exhaustive review or full suites before the first repair.
2. **Data, errors, and settings integrity:** trace services through storage and UI. Start with current cloud retry-outcome leads; review applicable ordering, transformation and rendering boundaries.
3. **Dispatch, lifecycle, and recurring work:** trace event → gate → target/state → effect; exercise relevant repeated input, reversed completion, route change and teardown cases; measure actual owned work before optimizing.
4. **Developer code and evidence reliability:** check failure/status propagation, empty or stale evidence, source-backed fixtures and cleanup; complete remaining triage/review at the stated depth.
5. **Combined acceptance and closure:** prove the aggregate changes, reconcile findings and coverage, update owning docs when necessary, and archive only when required gates pass.

The active 0087 audit provides hypotheses. Read relevant findings once and verify them; do not duplicate its reports or wait for that audit to finish. Current planning inspection found retry failure paths in `storage.js`, but these still need isolated behavioral proof. The historical Send Edit candidate-search migration was not found in current source; never recreate it just to satisfy CSP-AUD-007. Record any 0087 evidence invalidated by source edits once at closure, leaving its records intact.

## Work and proof contract

- Keep compact coverage and finding records in the plan. Record actual paths/symbols, execution owner, inspected scenario, depth (`triaged` or `traced`), and evidence. Inventory alone is not review; unreviewed code is a gap. All eligible files need triage and every required risk route needs a trace. State the coverage depth honestly.
- Before accepting an edit, identify the reachable trigger, expected versus actual effect, consequence/reach, confidence, smallest repair, risk, and exact check/assertion. Rank consequence first. Defer only for a specific scope/evidence/authority gap or disproportionate redesign risk. A failing accepted repair cannot be relabeled deferred to close the goal.
- For behavioral repairs, run a focused reproduction on the original implementation where feasible and show the repaired outcome, including a meaningful failure/negative case. Load actual source; stub external boundaries rather than copying the algorithm. A precise static argument can support a static finding, but must retain its runtime-unverified limitation.
- For cost reductions, compare actual calls/resources for the same workload and preserve results. For simplification, show the duplicated policy or responsibility removed and the different contracts preserved. Avoid broad rewrites, new audit/benchmark infrastructure, or tests that merely mirror implementation structure.
- Choose checks by the claim. `npm run check` establishes hygiene; `validate:keys` establishes static wiring; `npm test` covers popup layout and one setting round trip. None proves cloud failures, races, full migration behavior or teardown. Inspect existing fixture assertions and fill only a material gap.
- Use documented shortcut filters during repair and inspect the report’s executed cases/warnings. Exit 0 with zero or partial cases is not proof for an unexercised action. Shared changes need broader coverage; final shortcut acceptance uses the unfiltered fast suite. Controlled fixtures do not prove current live DOM, OS or account outcomes.
- Reuse passing proof while relevant inputs stay unchanged. Select final checks from the actual diff; if `npm run checks` supplies the required aggregate gates, do not immediately rerun those component suites. Keep Windows popup checks separate when popup code changes. Report pre-existing failures and unavailable proof accurately.

## Scope and continuation

Use the source boundary and exclusions in the plan/`AGENTS.md`. Ordinary local refactors and focused regression fixtures are authorized when this goal is executed. Follow the documented locked dependency/browser setup when required checks need it. New shipped helpers require build inclusion. Do not invent extra approval gates for routine choices. Manifest permissions/host access and destructive actions retain the repo’s explicit approval rule; major product redesigns, releases, publishing and live account writes are outside this workstream.

Follow the repository’s official-docs/upstream research route when diagnosing uncertain API behavior. Validate changed PowerShell before running it. Use an authorized prepared session only when the changed contract requires live proof; reload the installed extension first. If required proof is unavailable, record the precise missing input instead of claiming success or repeatedly retrying it.

At each turn, work on the earliest unfinished batch and update its gate: `[ ]` not started, `[~]` incomplete, `[x]` proven, `[!]` concrete blocker. Record useful progress and yield after that batch; retain the overall goal across automatic continuations. An unfinished batch may span turns. Continue independent work within it while resolving blockers. Follow the host’s goal-status rules; never mark completion merely to stop.

On resume, read the checkpoint and relevant results, compare changed inputs, and reopen only affected evidence. At completion, all five batch gates and every accepted repair must be proven; reconcile each deferred finding and its next action. Rename the plan to `plans/Done-0109-deterministic-code-quality-pass-plan.md` and update this prompt’s references in the same closure step. No deployment is required.

Return concrete improvements and their evidence, review depth and limits, meaningful deferrals, check results, any 0087 evidence needing revalidation, and links to the final plan and prompt. Do not equate an archived plan with every possible improvement having been made.
