# Automatic checks and report skill

## Goal

- [x] Provide one fast check command that installs missing project dependencies and Chromium, checks current source, and writes a visual shortcut repair report.
- [x] Run that command automatically on relevant GitHub pull requests and main pushes, retaining failure reports and scope warnings.
- [x] Install `$run-checks-for-chatgpt-custom-shortcuts-pro` with explicit commands and a visual findings table in its final chat response. Coordinator authored the final skill directly, replacing the agent draft at the user's request; bundled validation passed.

## Implementation

- [x] Coordinator: implement check orchestration, package/workflow wiring, runner integration and documentation; own final review and synchronization.
- [x] Luna Max report writer: implement the dependency-free visual report helper and failure/escaping tests. Coordinator repaired warning duplication during aggregate enrichment and clarified passed-action counts.
- [x] Luna Max skill writer stopped after the user's steering; coordinator wrote and validated the final skill directly. The agent's subsequent read-only review found no material issue in the other chat's source/fixture handoff.
- [x] Luna Max auditor proved the model-control/unassigned one-off wrappers unused and redundant with the canonical runner. Coordinator deleted only those wrappers and the retired sidecar, preserving shared helpers and historical measurements with a retirement note. Agent added isolated setup/report regression tests.
- [x] Preserve active 0099 fixtures and review the stable handoff. Its target-profile live gate remains open; the separate CodexCleanProfile probe is not target-profile proof.

## Acceptance

- [x] Run automatic setup and the complete local command. Initial npm ci encountered a transient Windows .bin lock and emitted a blocked report; retry installed 119 packages and Chromium successfully. The canonical run passed 74/74 in 9.6 seconds with native/external warnings. A formatting defect in the new test was repaired; code/text and the expanded validator suite passed (31/31), reusing unchanged keyboard proof. Report/installer tests prove failure attribution, escaping, no stale results, warning deduplication, cache reuse, changed-lock reinstall and blocked setup.
- [x] Remove only proven obsolete fixtures; retire active references and preserve optional diagnostics still in use.
- [x] Validate the skill and update contributor/spec guidance. Published source commit `bb6f93f7b0f5ac1111ba950ba23f8a4cae1a0401` passed [Fast validation run 37719544661](https://github.com/bwhurd/chatgpt-custom-shortcuts-pro/actions/runs/37719544661): full automatic Linux setup/checks and report upload succeeded; the report artifact is present. The workflow ran in 46 seconds.
- [x] Synchronize the reviewed work without discarding other work. GitHub connector tree/blob verification covered all 24 published paths before updating main; protected local backups and an ordinary fast-forward synchronized main/origin/main and left the tracked tree clean.
- [x] Rename this plan Done after the acceptance gates pass. The closure change is documentation only and reuses the passing source-revision CI result. Related rules: PROJECT_SPEC validation posture and spec 0006 canonical shortcut check. The adjacent 0099 target-profile live gate remains active, accurately scoped and independent of this completed workflow feature.
