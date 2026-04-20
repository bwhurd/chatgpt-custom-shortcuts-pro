# Specs Index

Use `SPECS/` for durable implementation references that are too deep or volatile to keep inline in `AGENTS.md` or `PROJECT_SPEC.md`.

Read this file when you need to:

- decide whether a topic belongs in `AGENTS.md`, `PROJECT_SPEC.md`, `SPECS/`, or `PLANS/`
- choose which existing spec to open first
- create, move, split, or retire a durable spec

Do not stop here when `AGENTS.md` already points at a specific spec for the task. In that case, open the named spec directly and use this file only for folder rules or spec maintenance decisions.

Division of responsibility:

- `AGENTS.md`: scope, workflow, routing, guardrails, and repo-default validation posture
- `PROJECT_SPEC.md`: durable project overview, architecture shape, and tricky stable conventions
- `PLANS/`: active, deferred, blocked, and completed plan markdown using status-in-filename protocol
- `_temp-files/`: ignored scratch artifacts, copied inspector captures, reference scripts, and temporary support notes outside the startup path
- `CodexPlan.md`: legacy archive pointer only
- `SPECS/`: durable cross-file behavior, invariants, migrations, and troubleshooting references

Add a spec when a topic is:

- cross-file and easy to miswire
- likely to break when ChatGPT or Chrome behavior changes
- too detailed to keep root docs readable
- worth preserving as a repair guide for future Codex passes

Do not add a spec when the information is only:

- a live backlog item
- a one-off migration note
- a narrow task checklist better kept in `PLANS/`
- a high-signal routing or scope guardrail that belongs in `AGENTS.md`
- a broad project overview point that belongs in `PROJECT_SPEC.md`

Current specs:

- `SPECS/SPEC_ADDING_NEW_SETTINGS.md`
  - Canonical wiring reference for new toggles, shortcuts, radio groups, popup defaults, bootstrap gates, and legacy/default handling.
- `SPECS/SPEC_LAZY_FAST_MODE.md`
  - Fast Mode architecture, page-world/content-world split, native expansion path, and troubleshooting.
- `SPECS/SPEC_CLOUD_SYNC_AND_SETTINGS_DATA_FLOW.md`
  - OAuth, Drive save or restore, local import or export, allowlisting, and `modelNames` exclusion rules.
- `SPECS/SPEC_MODEL_PICKER_AND_SHORTCUTS.md`
  - Model picker data model, shortcut normalization, popup and overlay parity, model-routing invariants, and troubleshooting.

Rule of thumb:

- if the information helps decide where to edit or what to open first, keep it in `AGENTS.md`
- if the information is broad project posture or architecture that should survive across threads, keep it in `PROJECT_SPEC.md`
- if the information explains how a subsystem works across files, keep it in `SPECS/`
- if the information is only about what to do next, keep it in `PLANS/`
- if the information is a copied inspector capture, temporary reference script, log, or scratch note, keep it in `_temp-files/`
