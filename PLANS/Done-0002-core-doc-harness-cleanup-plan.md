# Core Doc Harness Cleanup Plan

## Goal

- Clean up the project documentation harness without changing extension runtime behavior.
- Leave one canonical planning folder, a clear scratch/reference home, and root docs that route instead of carrying startup noise.
- Preserve existing plan and reference content by moving or renaming it, not rewriting it.

## Constraints

- Do not touch shipped extension runtime files, popup files, manifest wiring, locale files, or release artifacts.
- Keep the repo's existing uppercase `PLANS/` and `SPECS/` folder names unless a separate project decision changes casing later.
- Treat current on-disk docs as the source of truth; preserve existing modified content.
- Prefer status-in-filename plan cleanup over deep edits to old plan bodies.

## Checklist

- [x] Add `_temp-files/README.md` and update ignore rules so scratch artifacts have a standard home.
- [x] Move `PLAN/reference-scripts/**` to `_temp-files/reference-scripts/**`, then remove the empty singular `PLAN/` folder.
- [x] Move inspector captures and copied support artifacts out of `PLANS/` into `_temp-files/inspector-captures/`.
- [x] Rename the active Fast Mode plan to the active numbered protocol.
- [x] Rename completed archive/history plans to `Done-...` protocol names.
- [x] Rename incomplete or ambiguous workstream plans to `Deferred-...` protocol names unless they are clearly active.
- [x] Move root `AGENT-PLANNING.md` into `PLANS/` under a deferred protocol name so live or unresolved checklist material is no longer in the root.
- [x] Update `CodexPlan.md` pointers after plan renames.
- [x] Update `AGENTS.md`, `PROJECT_SPEC.md`, and `SPECS/README.md` so folder roles, plan protocol, `_temp-files/`, and shared-tool paths match the cleaned structure.
- [x] Validate with targeted searches for stale `PLAN/`, old plan filenames, moved inspector filenames, and incorrect workstation paths.
