# Plan 0078: Work Effort Mapping and Close Latency Repair

## Goal

- [x] Make the Work Medium shortcut select Medium on the active model, and close the picker promptly after an effort change.

## Current posture

- [x] The integrated Work effort mapping sent the shortcut assigned to Medium to the High slider position on Astra.
- [x] The effort flow waited on a synthetic Escape path before closing the picker, leaving a visible delay after switching to Light.

## Scope

- [x] Touch only integrated Work effort routing, its focused regression fixture, and the existing changelog entry.
- [x] Preserve the existing live structural slider and closed-menu picker routing.

## Implementation

- [x] Correct the structural Work slider offset for Medium.
- [x] Use the native composer-pill close path immediately after an effort commit, with a bounded confirmation wait.
- [x] Add focused source-level regression assertions for the Medium offset and prompt close behavior.

## Validation

- [x] Run focused model-picker fixtures, JavaScript syntax, Biome, and diff check.

## Related spec

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
