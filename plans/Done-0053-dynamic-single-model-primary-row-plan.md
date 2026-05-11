# Dynamic Single Model Primary Row Plan

## Goal

- [x] Make refreshed dynamic configure models with no frontend variants, such as `4.5`, render their real primary row (`GPT-4.5`, `Configure...`) instead of falling back to `Instant`, `Thinking`, `Configure...`.

## Investigation Findings

- [x] `o3` works because its frontend row label maps to the static `configure-o3` action.
- [x] `4.5` is dynamic, so its frontend row cannot survive scrape/catalog normalization through static-only `getActionById(...)` paths.
- [x] When `frontendByConfig[configure-dynamic-4-5]` is missing or filtered empty, popup rendering correctly but undesirably falls back to the default primary row.

## Scope

- [x] Preserve the existing catalog-backed design; do not add a hardcoded `4.5` special case.
- [x] Keep dynamic configure slots stable and shared between the second-row configure item and the first-row self item.
- [x] Do not change manifest permissions or live browser setup in this pass.

## Likely Owning Files

- [x] `extension/shared/model-picker-labels.js`
- [x] `extension/content.js`
- [x] `extension/popup.js`
- [x] `tests/model-picker-slot-uniqueness.mjs`

## Implementation Plan

- [x] Add shared dynamic catalog action resolution by id so popup/content normalization can resolve catalog-backed dynamic actions, not only static actions.
- [x] During refresh scrape, let a selected dynamic configure option claim its own non-variant frontend row when the row label/version matches the active option and does not map to a static frontend action like `Instant` or `Thinking`.
- [x] Preserve the observed frontend label for the self row, so `GPT-4.5` can display while using the `4.5` configure slot.
- [x] Add regression coverage proving a catalog with dynamic `4.5` renders primary actions `GPT-4.5`, `Configure...` and shares the configure slot.

## Validation

- [x] Run `node --check extension/content.js`.
- [x] Run `node --check extension/popup.js`.
- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Run targeted Biome on changed files with formatter disabled if unrelated fixture formatting is still noisy.

## Done When

- [x] Dynamic self rows no longer disappear during catalog normalization.
- [x] `4.5` and future no-variant dynamic configure models render as one model action plus `Configure...`.
- [x] `o3`, Pro, Instant/Thinking, and Configure row behavior remain intact.
