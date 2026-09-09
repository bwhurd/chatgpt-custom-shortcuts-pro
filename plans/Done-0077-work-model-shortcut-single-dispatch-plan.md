# Plan 0077: Work Model Shortcut Single-Dispatch Repair

## Goal

- [x] Ensure one Work model-picker shortcut keypress performs exactly one intended action: an effort shortcut changes only effort on the current model, and Toggle Speed works from a closed picker.

## Current posture

- [x] A Work effort shortcut could replay as a second model/effort transition (for example, Astra plus Medium becoming Terra plus High) because a missing live effort target automatically switched to the latest model and replayed the action.
- [x] Missing or unsupported Work effort targets are a no-op; they never select a different model as a recovery path.
- [x] Closed-menu Toggle Speed opens the live Work picker once, resolves the structural speed control, and confirms one native state change.

## Scope

- [x] Touch the model-picker runtime dispatch and its focused fixtures only.
- [x] Preserve profile-local shortcut storage, catalog state, and existing Chat/Work structural selectors.
- [x] Do not change extension permissions, popup assignments, or the broader keyboard-audit harness.

## Implementation

- [x] Remove the latest-model-and-replay fallback so Work effort shortcuts always remain scoped to the currently selected model.
- [x] Wait for the live Work picker before committing an integrated effort action from a closed menu.
- [x] Repair closed-menu Speed routing through the live integrated or compact Work control and require a single observed toggle.
- [x] Add focused regression assertions for effort-only routing and closed-menu Speed activation.

## Validation

- [x] Run the focused model-picker fixtures, JavaScript syntax check, Biome on changed files, and `git diff --check`.
- [x] Add regression guards for the Astra/Medium no-model-fallback case and for closed-menu Toggle Speed routing.

## Related spec

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`

## Release check

After reloading the unpacked extension, confirm Astra remains selected when its Medium shortcut runs, then invoke Toggle Speed with the picker closed.
