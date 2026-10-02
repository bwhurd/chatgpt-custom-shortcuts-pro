# Contributor validation audit

## Goal

- [x] Ground contributor review commands in actual coverage rather than a blanket test requirement.

## Execution

- [x] Inspect the package scripts, Biome configuration, text checker, popup screenshot test, and settings validator.
- [x] Run current checks and verify the settings validator rejects deliberate defects without changing source files.
- [x] Update CONTRIBUTING.md and PROJECT_SPEC.md to match the practical validation scope.
- [x] Validate the documentation changes with `git diff --check` and `npm run check:text`, verify command names against package.json, and rename this plan to Done-.

## Findings

- [x] `npm run validate:keys` passes for 67 popup controls and 13 supplemental keys. In-memory negative controls detect an unknown storage key, an incorrect checkbox default, and missing export coverage. This proves selected static wiring checks, not browser behavior.
- [x] `npm test` passes its single default-popup screenshot comparison. It changes overflow and height styles and uses an expanded viewport; it does not exercise settings interactions, shortcuts, normal popup scrolling, or live ChatGPT selectors. Keep it scoped to popup rendering changes.
- [x] `npm run check` fails with 13 formatting errors and 27 warnings already present before this audit's edits. It scans unrelated tooling and artifacts; its text check never runs when Biome fails. Prefer Biome on changed supported files plus the separate text check for contributor reviews.
- [x] Leave runtime source, test implementations, baselines, and unrelated formatting untouched. Broader behavioral test development is outside this contributor-documentation change.
