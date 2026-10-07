# Codex Plan

## Active

### 📚 AGENTS And Specs Audit

- Decision:
  - `AGENTS.md` should stay a routing/guardrails file, not a second architecture manual.
  - durable cross-file behavior and troubleshooting notes should live in `specs/`.
  - `CodexPlan.md` should keep the live backlog, not absorb durable implementation references.
- [x] Audit `AGENTS.md` for sections that are too deep or volatile to keep inline.
- [x] Create root `specs/` folder and move the existing subsystem reference docs out of `plans/`.
- [x] Establish `specs/` as the durable spec home and boundary guide.
- [x] Add durable specs for Cloud Sync/settings data flow and model picker/shortcut architecture.
- [x] Update `AGENTS.md` search/scope guidance to include `specs/**`, `CodexPlan.md`, and `scripts/build-zip.js`.
- [x] Replace redundant AGENTS deep-dive sections with short references to the new spec set.
