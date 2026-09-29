/goal Complete the comprehensive Chrome extension audit in C:/Users/bwhurd/Dropbox/CGCSP-Github/plans/0087-comprehensive-extension-audit-plan.md, one earliest unfinished batch per execution turn. Keep the overall goal active across automatic continuations without asking me to say "continue". Finish only when all six batches and their final acceptance gate are proven.

# GPT-6-Luna Max audit handoff

Use GPT-6-Luna with Max reasoning for execution. This text does not itself switch models: select those settings before launching. Work directly in this chat; do not create another chat or delegate agents.

Repository root: `C:/Users/bwhurd/Dropbox/CGCSP-Github`.
Extension source: `C:/Users/bwhurd/Dropbox/CGCSP-Github/extension`.
Plan: `C:/Users/bwhurd/Dropbox/CGCSP-Github/plans/0087-comprehensive-extension-audit-plan.md`.

## Task and boundaries

Perform an evidence-backed audit of ChatGPT Custom Shortcuts Pro, an MV3 extension for chatgpt.com. Deliver a consolidated findings register, coverage record, final report, and dependency-ordered repair roadmap. Repairs require a separate request. Preserve extension source, tests, fixtures, browser settings, permissions, package files, root/subsystem docs, and unrelated work. Do not publish, upload, build releases, install dependencies, or run format/fix/snapshot-update commands.

Read the root `AGENTS.md`, the plan, and only the overview/subsystem sections needed for the current batch. Verify planning observations against current source before using them. The requested `contents.html` was absent; `extension/content.js` is the likely intended page runtime and is declared by the manifest. Begin mapping from it plus `popup.html`, `popup.js`, and `manifest.json`, then follow actual dependencies.

The installed skills are project-local to a different workspace. Use the skill catalog if available; otherwise read these existing files when applicable, without reinstalling:
- `C:/Users/bwhurd/tools/install-with-codex/.agents/skills/chrome-extensions/SKILL.md`
- `C:/Users/bwhurd/tools/install-with-codex/.agents/skills/modern-web-guidance/SKILL.md`

Use official Chrome documentation to resolve disputed API, privilege, CSP, lifecycle, and store-policy claims. Skill examples do not override official facts or repository evidence. For troubleshooting, follow AGENTS.md's official-support/upstream-research rule. Record source URLs and access dates for externally grounded findings.

## Execution and resumption

1. Read the plan's checkpoint, existing audit registers, and any recorded recovery obligation. Verify relevant source fingerprints before trusting prior observations.
2. Work on exactly the earliest unfinished batch per execution turn. Finish its independent work and record concrete blockers if required evidence is unavailable. Do not skip a blocked prerequisite to mark a dependent batch complete.
3. Update status using `[ ]` not started, `[~]` incomplete, `[x]` fully proven, and `[!]` concrete blocker. Record results, exact commands/exits, proof links, remaining risk, and what the next batch consumes.
4. Yield after recording the batch. Keep the overall goal active across automatic continuations; do not ask for a routine "continue". Follow the host's goal-tool rules when tracking status. A genuine external boundary needs an explicit unblock condition, not repeated identical probes or fabricated success.
5. If source changes during the audit, mark implicated evidence stale and reopen its owning gate. Preserve concurrent work. Context compaction is a reason to resume from records, not restart the audit.

Ordered batches:
1. Architecture and baseline.
2. Manifest, security, privacy, and packaging.
3. Runtime and data reliability.
4. Content and page interaction.
5. Popup and other user interfaces.
6. Cross-component verification and final report.

The plan is authoritative for exact scope, prerequisites, commands, proof, and acceptance for each batch. Existing plan 0076 and other active plans are evidence pointers only; their code-edit, agent, live-action, or repair permissions do not transfer to this task.

## Artifact and evidence contract

Durable writes are limited to the plan (including its final `Done-0087-comprehensive-extension-audit-plan.md` rename), this paired prompt if correction is necessary, and:
- `plans/audit-0087/coverage.md`
- `plans/audit-0087/findings.md`
- `plans/audit-0087/evidence/`
- `plans/audit-0087/final-report.md`
- `plans/audit-0087/repair-roadmap.md`

Use stable `CSP-AUD-001` onward finding IDs. Each finding includes classification, severity, confidence, owning batch, file/line/symbol, evidence, trigger/reproduction, expected and observed behavior, user impact, smallest reasonable fix, verification status/method, fingerprints, relevant citations, and uncertainty. Keep confirmed defects, potential risks, and optional improvements distinguishable. Do not pad the report with style preferences.

Coverage must distinguish static source proof, isolated test proof, and actual browser behavior. `npm run validate:keys` proves static wiring, not live behavior. The popup screenshot harness adjusts layout and cannot alone prove the native popup's dimensions, close/reopen lifecycle, focus, or persistence. Existing command definitions and executable wrappers were found during planning; no command pass or usable browser/account has been established.

Run the plan's focused checks only when they add necessary proof. Read existing harness setup/output effects first; use the specified output redirection for popup visual checks, never baseline updates. No dependency/browser installation. No ignored captures, vendor/minified bodies, or release archive inspection outside AGENTS.md's scope rules. `npm run zip` is outside this audit's write scope. Do not invent CLI flags or use an automatic repair mode.

Use an already prepared authorized browser session for necessary live proof. Preserve user data. No live Drive uploads, login/logout/revocation, ChatGPT sends/deletes, browser-setting changes, user clipboard writes, or user-setting mutations without specific authorization. Prefer existing isolated test fixtures for failure cases. If a required live boundary is unavailable, mark it incomplete and state the exact access or authorization needed. Do not borrow permission from historical plans. Do not treat elapsed time as approval.

Where transient test-state changes are authorized, record originals and intent before mutation, restore in finally with compare-before-restore, and verify recovery without overwriting concurrent user changes. Keep evidence free of tokens, chats, account data, clipboard contents, and personal settings exports. Do not let normal harness output escape the durable artifact allowlist; disposable temporary harness state may be cleaned by its existing teardown.

## Completion

Batch 06 must reconcile all coverage and acceptance rows, verify findings against current source, and produce the final report and repair roadmap. Fixes may remain unimplemented; product health and audit completeness are separate conclusions. Missing required live proof, stale evidence, unexplained gaps, or unresolved recovery prevents goal completion. Label actual archive/store checks unperformed and limit release-readiness claims accordingly.

At proven audit completion, follow the repo convention by renaming the plan to `Done-0087-comprehensive-extension-audit-plan.md` and updating this prompt's paths and all audit-artifact links in the same closure step. Verify the handoff still resolves. No deployment is required or authorized. Mark the overall goal complete only after all six batches, required proof, final artifacts, and recovery gates pass. Return links to the report, findings, coverage, and repair roadmap, with the most consequential findings and verification limitations.
