# Fade Slim Sidebar Hover Repair

## Goal

- [ ] Restore reliable reveal-on-hover for the collapsed ChatGPT sidebar without flashing while the pointer remains over the upper icon rail.

## Investigation findings

- [x] ChatGPT now owns collapsed/open state on `#stage-slideover-sidebar[data-state]`; the fade runtime still observes the retired `#stage-sidebar`.
- [x] After the wide sidebar closes, the current host can retain a horizontal scroll offset that shifts `#stage-sidebar-tiny-bar` offscreen, so rail-bound hover listeners cannot reveal it.
- [x] Hovering the stable host avoids child-icon boundary churn and gives the runtime a reliable place to restore the collapsed rail position.
- [x] Upper-rail icon tooltips use `[data-radix-popper-content-wrapper]`; treating that generic wrapper as a blocking overlay hides the rail, dismisses the tooltip, and creates a self-repeating flash.

## Scope

- [x] Update only the slim-sidebar runtime in `extension/content.js` plus one focused regression fixture under `tests/`.
- [x] Preserve the stored enable flag, configured idle opacity, overlay suppression, shortcut flashes, and disabled-state cleanup.
- [x] Do not change popup wiring, storage schema, manifest permissions, or unrelated sidebar shortcuts.

## Implementation plan

- [x] Resolve the current sidebar host with a legacy fallback and derive expanded state from its explicit `data-state` when available.
- [x] Attach enter/leave handling to the stable sidebar host, reset horizontal scroll only while collapsed, and observe the host state/style attributes.
- [x] Remove redundant click-specific rail state handling and narrow overlay detection so ordinary open-state widgets do not suppress hover.
- [x] Add a fixture that locks the current-host selector, collapsed scroll repair, host-bound hover handling, and legacy fallback.

## Validation

- [x] Run the focused regression fixture.
- [x] Run Biome on the changed runtime and fixture.
- [ ] Reload the installed extension and verify the open ChatGPT tab: upper-rail hover reveals once, stays visible while steady, fades after leaving, and recovers after opening and closing the wide sidebar.

## Done when

- [ ] The collapsed rail remains aligned with the browser edge and reveals consistently across the full 52-pixel host, including the upper icon area.
- [ ] No repeated fade/flash occurs while the pointer is stationary over the host.
