# Model Refresh Pro And Dynamic Hints Plan

## Goal

- [x] Make model refresh extract Configure-dialog `Pro` rows and render them in the popup model grid for every refreshed configure model where `Pro` is available.
- [x] Make refreshed dynamic configure options such as `4.5` use their persisted catalog slots when rendering live menu shortcut hints.

## Investigation Findings

- [x] The Configure dialog inspector shows `Pro` as a plain `button.__menu-item[role="radio"]` with no stable Pro-specific data attribute; the current extractor only finds `Pro` by stable attributes, so the row is skipped.
- [x] `4.5` is scraped into `modelCatalog.configureOptions` and runtime shortcut activation can use it, but live listbox hinting recomputes the dynamic slot from option index instead of looking up the refreshed catalog slot.
- [x] Static entries such as `5.2` can sit between dynamic entries, so index-based dynamic fallback slots can drift from persisted catalog slots.

## Scope

- [x] Touch only the model picker label source, content refresh/hinting code, focused tests, and this plan.
- [x] Do not change extension permissions, manifest host access, or unrelated shortcut behavior.

## Likely Owning Files

- [x] `extension/shared/model-picker-labels.js`
- [x] `extension/content.js`
- [x] `tests/model-picker-slot-uniqueness.mjs`

## Implementation Plan

- [x] Expose a shared catalog-aware configure-option lookup that prefers refreshed `modelCatalog.configureOptions` slots by action id or label before falling back to index-derived dynamic slots.
- [x] Use the catalog-aware lookup in content listbox hinting and configure-option targeting so refreshed dynamic slots self-resolve after model refresh.
- [x] Preserve existing dynamic slots during refresh when a catalog already knows them, while assigning new dynamic entries to the next open dynamic slot.
- [x] Add Configure-dialog frontend row label extraction so `Pro` can be recognized from the provided plain radio-row DOM when stable attributes are absent.
- [x] Add focused regression assertions for interleaved dynamic configure options including `4.5`.

## Validation

- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Run `npx biome check extension/shared/model-picker-labels.js extension/content.js`.
- [x] Note: `tests/model-picker-slot-uniqueness.mjs` is ignored by Biome config; the direct Node test covers it.

## Done When

- [x] `Pro` rows scrape into `frontendByConfig` with slot `7` and render in the popup primary grid after model refresh.
- [x] `4.5` retains its refreshed catalog slot for grid rendering, runtime shortcut activation, and live menu hint labels.
- [x] The active plan is renamed to `Done-` after validation.

## Related Specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
