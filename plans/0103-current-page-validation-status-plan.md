# Current-page validation status

## Goal

- [x] Make fresh authenticated ChatGPT target validation the authoritative local check for current-page drift. Fixture regressions remain distinct GitHub evidence.
- [x] Show current-page validation as unverified unless this invocation collects and checks fresh live evidence; avoid global zero-fix or all-targets-valid claims from fixture results.

## Work

- [x] Identify the gap: GitHub's isolated fixture pages and 74 keyboard checks cannot establish selector presence in the current authenticated ChatGPT page.
- [x] Reuse the existing local scrape/check engine and its report; expose one explicit current-page command with fresh-run provenance, blocked/partial/failure handling and no stale-report reuse.
- [x] Correct the combined visual report, contributor/spec wording and the directly authored local skill. Keep authenticated evidence local and excluded from GitHub uploads.
- [x] Use Luna Max for the live-engine audit, pure classifier/tests and runner review/tests; coordinator owns integration and writes the skill directly.
- [x] Respect the prior refusal on the Brian-profile extension popup. Record unavailable current-page proof honestly; do not use another surface to bypass it.

## Acceptance

- [x] Test status attribution using isolated synthetic report data: fixture success cannot imply live success, stale captures cannot pass, and live failures/blocked scope remain visible.
- [ ] Run changed code/text and report/runner regressions, reuse unchanged keyboard proof, and validate the local skill.
- [ ] Publish reviewed changes through GitHub, verify the controlled CI job, synchronize cleanly, and close this plan only after the status/report gates pass.
- [x] Preserve adjacent 0099's live acceptance boundary. Route live contracts to spec 0006 rather than expanding fixture proof.

## Evidence

- Classifier tests: 13/13; isolated local-runner tests: 2/2; changed JavaScript/Biome and PowerShell syntax/analyzer checks passed. The directly authored local skill passed its validator.
- All four runtime/catalogue/case/fixture fingerprints match the prior 74/74 prepared-page keyboard proof, so that unchanged local execution evidence is reused.
- `npm run check:current-page` produced a fresh unverified report and exit 2: no standard Chrome root matched the configured `CodexCleanProfile` and CDP port 9333. No older capture or alternate profile was used. This is workflow/status evidence, not a live product pass; 0099 remains separate.
- Final aggregate regression/text results, GitHub publication/CI and clean synchronization are pending.
