# Thread Closeout Data-Contract Repairs Plan

## Goal

- [x] Restore the Chat/Work mode that was active before a dual-surface model refresh starts.
- [x] Keep aggregate Chat/Work scrape results assigned to their explicit surface profiles and preserve successful profile data when the other surface fails.
- [x] Keep the blank-Work bottom bar hidden until its native utility row exists, including across an already-revealed SPA transition.
- [x] Keep scraped model catalogs, names, and timestamps out of local backups and Drive save/restore flows.

## Scope

- [x] Reuse the existing structural Chat/Work mode helper, model-profile caches, bottom-bar observer, and settings allowlists.
- [x] Do not add polling, a permanent observer, Chrome permissions, or new storage keys.
- [x] Preserve independent model-picker shortcut arrays and all user-customized assignments.

## Implementation

- [x] Capture native mode before starting a new conversation; use the blank-chat radio state only as fallback and validation.
- [x] Bypass menu-shape reclassification for aggregate responses, preserve an interactive partial-success grid, and treat global no-switcher as valid only when no profile succeeded.
- [x] Gate visible standalone layout while the blank-chat mode is unresolved or Work until the native row appears.
- [x] Exclude all `modelCatalog*` / `modelNames*` scrape snapshots and timestamps from popup backup and Cloud filtering.
- [x] Add focused regressions for initial-mode ordering, aggregate profile ownership, partial success, blank-Work pending state, and backup filtering.

## Validation

- [x] Run the focused model-catalog, bottom-bar, backup-filter, settings-wiring, syntax, Biome, and text-format checks.
