# Deferred Luna Max implementation prompt

This is a future prompt, not active work. Use it only after separate user authorization and review of `plans/Done-0104-validation-gate-simplification-analysis.md` against current source. Work through the plan in order, one Luna batch per turn, and keep the goal active across automatic continuations without asking the user to say “continue.”

```text
/goal If separately authorized, implement the validation-gate simplification recommendations in plans/Done-0104-validation-gate-simplification-analysis.md, executing Luna Batch 01, Batch 02, and Batch 03 in order. Keep the goal active across automatic continuations without asking me to say “continue.” Finish only after all batch acceptance criteria and the final focused validation pass.

If authorized, implement the plan in C:\Users\bwhurd\Dropbox\CGCSP-Github. Read the repository AGENTS.md and the complete plan first. Follow its scope, validation ownership, and file boundaries. Preserve unrelated and concurrent user/agent changes. Do not overwrite an existing target file; inspect and integrate any changes already present.

Execution rules:
- Work on one batch at a time. At the start of each turn, identify the active batch, inspect only its listed files and direct dependencies, and verify source facts before editing.
- When a batch has three separable strands, assign them to three Luna Max subagents (`gpt-6-luna` with Max reasoning) and own the fourth cross-cutting spec/integration strand yourself. Coordinate shared contracts and avoid simultaneous edits to the same file.
- Keep the plan checkboxes current: [ ] not started, [~] in progress, [x] complete, [!] blocked, with a short evidence note for each completed item. Do not mark a batch complete until its acceptance criteria and required focused checks pass.
- Keep the source-of-truth contracts: optional artifact diagnostics remain visible; required target failures/incompleteness remain blockers; requested live-probe failures remain blockers; target-only probe status remains explicitly unverified; the exact current invocation, capture-root containment, source fingerprint, privacy projection, freshness, complete coverage, and published-SHA checks remain enforced.
- Do not add a universal captureExitCode===0 gate, fallback to the newest/oldest capture folder, new guessed DOM selectors, an automated phase runner, confirmation seal, npm aliases, or publishing automation. Do not change the snapshot state cap unless current measurements prove it blocks valid inventory growth; if changing it, preserve an independent aggregate resource bound and boundary tests.
- Preserve intentional request pacing. Replace only readiness delays for which existing semantic page/control readiness can provide a bounded condition.
- Batch 03 may edit C:\Users\bwhurd\.codex\skills\run-checks-for-chatgpt-custom-shortcuts-pro\SKILL.md only if the user’s authorization in the active conversation includes that external file. If not, complete repo-owned work and report the external skill update as pending user scope; do not pause unrelated work to ask.
- No authenticated browser actions, Git changes, publishing, or deployment. No broad suite runs for unchanged code. Use the focused tests and validators specified by the plan, Biome on changed code, and text-format validation on changed docs. If a command fails, diagnose the specific failure and rerun only checks affected by the fix.

Batch sequence:
1. Scope-aware artifact classification and spec alignment.
2. Registry-derived inventory tests, structured invocation handoff, readiness waits, and measured resource-limit policy.
3. Operator skill and final contract alignment.

After each batch, summarize changed files, acceptance evidence, checks run, and any remaining risk. Continue with the next batch only when its dependencies are satisfied. At the end, verify all checkboxes and acceptance matrix rows against the final code, then report the exact final validation results and any deferred item.
```

## Handoff note

This prompt is for a later implementation pass. The current task stops after these planning documents are complete; it does not authorize implementation, browser actions, Git operations, or publication in this turn.
