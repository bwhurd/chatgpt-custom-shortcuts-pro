# Pending GitHub PR Feature Integration

## Goal

- [ ] Integrate the Copy Lowest and Command Palette features from PRs #79 and #80 without losing existing shortcut customizations or disrupting the in-progress copy-selector work in the primary checkout.

## Current posture

- [ ] PR #79 is mergeable with no reported checks; it changes Copy Lowest target ordering and adds feature documentation.
- [ ] PR #80 is in a merge-conflict state with no reported checks; it adds a command palette, shortcut defaults/migration, locale strings, docs, and navigation actions.
- [ ] The primary checkout has uncommitted changes in `extension/content.js` and `specs/0004-model-picker-and-shortcuts-spec.md`, plus a plan rename. Preserve those changes.

## Implementation plan

- [ ] Review both patches against the shortcut/settings contracts and determine the repository's supported merge method.
- [ ] Use an isolated checkout to combine the PR changes in dependency order, resolve conflicts, and address any behavior or migration risks found in review.
- [ ] Run the narrow checks needed for popup/settings wiring, syntax, formatting, and the repository's shipped-behavior merge gate.
- [ ] Merge only after the combined result passes review and validation; verify both PRs reach the intended GitHub state.

## Done when

- [ ] The accepted features are integrated on `main`, both PR states are resolved, validation results are recorded, and the primary checkout's existing edits remain intact.

## Related specs

- [ ] `specs/0001-adding-new-settings-spec.md`
- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
- [ ] `plans/0081-alt-c-plain-text-clipboard-plan.md`
