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
- [~] Validate the skill and update contributor/spec guidance; GitHub Actions acceptance remains pending publication.
- [ ] Synchronize the reviewed work with GitHub without discarding other work; verify a clean tracked tree and matching main/origin/main heads.
- [ ] Rename this plan Done only after these gates pass. Related rules: PROJECT_SPEC validation posture and spec 0006 canonical shortcut check.
