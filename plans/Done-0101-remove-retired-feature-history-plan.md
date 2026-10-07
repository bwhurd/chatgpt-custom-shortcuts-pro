# Remove stale retired-feature history

## Goal

- [x] Remove obsolete routing, current-document notes, and archived implementation material for a feature that no longer ships.

## Scope

- [x] Remove the historical-only routing trigger and retired-feature passages from current guidance, settings guidance, and the changelog.
- [x] Delete the dedicated obsolete spec and completed removal log; prune related entries from neighboring archives while preserving unrelated audit history.
- [x] Keep references to current model-picker controls and fast-shortcut validation intact.

## Implementation

- [x] Update `AGENTS.md`, `PROJECT_SPEC.md`, `specs/0001-adding-new-settings-spec.md`, and `CHANGELOG.md`.
- [x] Remove feature-specific archived material and stale file-name entries from the relevant completed plans.
- [x] Sweep maintained repository files for obsolete identifiers and routing targets.

## Validation

- [x] Reread changed documentation and confirm all remaining `AGENTS.md` spec targets exist.
- [x] Run `npm run check:text`; that historical run reported formatting issues in five unrelated files not changed by this work. The later 0100 checkpoint repaired the identified newline formatting and its integrated text check passed.
- [x] Search for obsolete feature identifiers and confirm remaining fast-related references describe current, separate functionality.

## Done when

- [x] No current guidance, shipped code, or retained archive refers to the removed experiment or its files.
- [x] The dedicated obsolete documents are deleted and unrelated model-picker and shortcut behavior remains documented.
