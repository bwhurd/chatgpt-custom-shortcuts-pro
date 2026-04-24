# Show Shortcut Overlay Shortcut Swap Plan

## Goal

- [x] Promote `shortcutKeyShowOverlay` to the real shortcuts-overlay opener on `Alt + .` and retire `shortcutKeyShowShortcuts` from popup, schema, storage-default, and overlay-row wiring while keeping the `showShortcutOverlay(...)` render function.

## Scope

- [x] Keep this pass limited to the shortcut setting surfaces governed by `specs/0001-adding-new-settings-spec.md` and `specs/0004-model-picker-and-shortcuts-spec.md`: popup wiring, schema metadata, runtime defaults, content hotkey hydration, locale strings, fixtures, and changelog text.
- [x] Do not add Playwright work, overlay-layout changes, or new speculative diagnostics in this pass.

## Execution

- [x] Move the live opener in `extension/content.js` from `shortcutKeyShowShortcuts` to `shortcutKeyShowOverlay`.
- [x] Set `shortcutKeyShowOverlay` to `Period` across schema defaults, popup fallbacks, content defaults, options defaults, fixtures, and the popup HTML seed value.
- [x] Remove the old `Show Shortcuts` popup row and remove `shortcutKeyShowShortcuts` from overlay sections, shortcut labels, runtime shortcut defaults, and stored defaults.
- [x] Hide stale `shortcutKeyShowShortcuts` values from overlay rendering by deprecating the retired key in schema metadata.
- [x] Normalize the temporary `Alt + i` test value for `shortcutKeyShowOverlay` back to the live `Alt + .` default during storage-backed migrations and content-side hotkey hydration.
- [x] Update the tooltip and changelog copy so the new `Show Shortcut Overlay` label reflects the actual bound runtime action instead of the earlier unbound test slot.

## Validation

- [x] Run `node --check extension/content.js`.
- [x] Run `node --check extension/popup.js`.
- [x] Run `node tests/validate-keys.js`.
- [ ] Reload the unpacked extension and the ChatGPT tab, then confirm `Show Shortcut Overlay` appears in the popup and overlay on `Alt + .` and the retired `Show Shortcuts` row is gone.
