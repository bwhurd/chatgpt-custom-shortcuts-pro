# Remove unavailable model shortcut entries

## Goal

- [x] Keep model profile catalogues as the source of which slots exist; do not fall back to global legacy slot definitions when an explicit profile catalogue omits a slot.
- [x] Clear shipped and already-saved keys for slots absent from every model/configuration in that profile, while preserving actions that remain available in another profile and dynamic model slots.
- [x] Keep slot indices and array lengths stable for settings sync/import compatibility.

## Implementation

- [x] Trace runtime slot lookup, popup/overlay presentation and profile storage migration under specs 0001 and 0004.
- [x] Make missing slots inert when a profile catalogue is explicit; retain current dynamic and supported legacy actions.
- [x] Remove stale default bindings for legacy Chat slot 10 and latest Work reset slot 14, and migrate only those unavailable mappings without clobbering catalogue-present actions.
- [x] Add a focused regression proof for explicit-catalogue omission and migration/default behavior.

## Validation

- [x] Targeted model-picker/catalog tests, `npm run validate:keys`, scoped Biome, `npm test` (3 popup checks), and `npm run check` passed.
- [x] No live suite or broader full application suite was needed.

## Done when

- [x] Unavailable slots cannot resolve to stale global actions or retain active shipped bindings.
- [x] Existing dynamic model rows and positive same-ID profile cases still resolve.
- [x] Migration preserves settings length, keys outside unavailable slots, and explicit catalog-present actions.
