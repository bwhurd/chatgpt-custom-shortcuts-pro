# Plan 0086: Repair shortcut validation findings

## Goal

- [x] Remove the unused selector and dead activation helpers reported by Biome without changing active behavior.
- [x] Replace assertions for the retired three-submenu refresh path with current Chat/Work picker coverage; retain the overlay rendering and profile checks.
- [x] Run focused fixtures, syntax checks and Biome; all pass.

## Boundaries

- [x] Preserve the existing workspace changes and make no live browser, release or deployment changes.
