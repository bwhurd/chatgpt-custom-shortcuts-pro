# Fade Slim Sidebar Current-Host Repair

## Goal

- [x] Restore fade and reveal behavior against ChatGPT's current sidebar host while preserving the existing slim-bar target and idle opacity.

## Investigation findings

- [x] The current catalog identifies `#app-shell-sidebar` through the native trigger's `aria-controls`; the fade resolver recognized only the retired `stage-*` hosts.
- [x] Because the current host was missed, fade state checks could not track its open/closed state and hover handling fell back to the slim rail.
- [x] The shared host resolver is also used by the sidebar keyboard shortcut; leave its action path unchanged while teaching the resolver about the current host.

## Scope

- [x] Update only the slim-sidebar host resolution/refresh logic in `extension/content.js`, its focused fixture, and this catalog's layout-only entry.
- [x] Preserve the stored enable flag, configured idle opacity, overlay suppression, shortcut flashes, and disabled-state cleanup.
- [x] Do not change popup wiring, storage schema, manifest permissions, or unrelated sidebar shortcuts.

## Implementation plan

- [x] Resolve `#app-shell-sidebar` first, then retain the `stage-*` fallbacks and derive expanded state from explicit `data-state` when available.
- [x] Attach enter/leave handling to the stable sidebar host, reset horizontal scroll only while collapsed, and observe the host state/style attributes.
- [x] Remove redundant click-specific rail state handling and narrow overlay detection so ordinary open-state widgets do not suppress hover.
- [x] Exercise the actual fade IIFE with the current host: idle opacity, host-bound hover, open suppression, and close-to-idle recovery.
- [x] Add the repaired, manual-review-ready Fade Slim Sidebar row to the catalog's layout-only table.

## Validation

- [x] Run the focused regression fixture and Biome on the changed runtime and fixture.
- [x] Do not reload or browser-test; hand off as ready for the user's manual review after extension reload.

## Done when

- [x] The focused fixture proves the fade state follows the current host and returns to configured idle opacity after hover or host close.
- [x] Catalog entry explicitly distinguishes source/fixture repair from pending manual browser verification.
