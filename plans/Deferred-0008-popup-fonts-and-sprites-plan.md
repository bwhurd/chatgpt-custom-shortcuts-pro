# Plan: Popup Fonts And SVG Sprites

## Goal

- Make the extension popup render reliably even on poor or offline connections.
- Remove the popup's dependency on remote Google font and icon CSS.
- Keep the visual risk low.
- Keep the file size increase small.
- Keep the font change easy to revert if the popup looks worse in review.

## Current Likely Problem

- `popup.css` currently uses remote `@import` rules for Google fonts and Material icon fonts.
- On weak internet, those remote CSS and font requests are the most obvious reason the popup could appear late or feel blocked compared with fully local extension popups.

## Chosen Direction

- Replace popup icon fonts with a local SVG sprite that contains only the icons the popup actually uses.
- Replace remote text fonts with the existing system font stack already present in the CSS.
- Keep a very easy path back to the previous Google font imports if the visual result is not good enough after manual review.

## Why This Direction

- SVG sprite for icons:
  - avoids loading full icon font families
  - avoids remote requests
  - keeps size small
  - keeps rendering crisp
  - fits the popup because the icon set is small and stable
- System fonts for text:
  - are normal and modern for extension UI
  - are already partially represented in the current CSS stack
  - add no package weight
  - are the simplest way to make the popup offline-first
- Avoid bundling full local font families:
  - adds more size than needed
  - creates extra maintenance
  - does not solve a problem that system fonts already solve well enough for popup UI

## Estimated Size Impact

- SVG sprite only: roughly `+5 KB` to `+10 KB` zipped
- Text font fallback switch: roughly `+0 KB`
- Total expected increase: roughly `+5 KB` to `+10 KB` zipped

## Popup Icons To Include In The Sprite

- `info`
- `forum`
- `3p`
- `mode_comment`
- `remove_selection`
- `label_off`
- `cloud_sync`
- `cloud_upload`
- `cloud_download`
- `logout`
- `settings_backup_restore`
- `check_circle`

## Proposed File Changes

- `popup.html`
- `popup.css`
- `popup.js`
- `CHANGELOG.md`

## Proposed New Shipped File

- Add one popup icon sprite file, likely at one of these paths:
- `vendor/popup-icons.svg`
- `vendor/sprites/popup-icons.svg`

## Packaging Reminder

- If a new shipped file or folder is added, update `scripts/build-zip.js` `includeItems` so the sprite is included in the Chrome Web Store upload zip.

## Implementation Checklist

### Phase 1: Prepare The Icon Sprite

- [ ] Create a single local SVG sprite file containing only the popup icons listed above.
- [ ] Use stable symbol ids for each icon so JS and HTML can reference them consistently.
- [ ] Keep the sprite small and readable.
- [ ] Prefer a single sprite file over many separate SVG files unless implementation friction proves otherwise.

### Phase 2: Update Popup Markup To Use The Sprite

- [ ] Replace ligature-based Material icon spans in `popup.html` with sprite-based SVG usage.
- [ ] Preserve current sizing and alignment behavior as closely as possible.
- [ ] Keep the tooltip and interactive wrappers unchanged where possible.
- [ ] Ensure decorative icons stay `aria-hidden` where appropriate.

### Phase 3: Update Popup JS Icon Swapping

- [ ] Update the popup icon helper in `popup.js` so busy-state and success-state swapping no longer depends on ligature text.
- [ ] Replace text-content swapping with symbol-id or data-attribute swapping.
- [ ] Preserve the current behavior for:
- [ ] spinner replacement while busy
- [ ] `check_circle` success flash
- [ ] restore of the previous icon after success

### Phase 4: Remove Remote Icon Font Dependency

- [ ] Remove the Material icon and Material Symbols remote imports from `popup.css`.
- [ ] Remove any font-specific icon CSS that is no longer needed.
- [ ] Keep only the sprite-related icon styling required for size, color, and alignment.

### Phase 5: Switch Popup Text Fonts To Local System Fonts

- [ ] Remove the remote `Inter` and `Roboto` imports from `popup.css`.
- [ ] Keep the existing system font stack as the popup text stack.
- [ ] Do not add bundled local text font files unless the system-font result is unacceptable after review.

### Phase 6: Keep An Easy Rollback Path For Fonts

- [ ] Preserve the previous Google font import block in a clearly labeled commented section at the top of `popup.css`.
- [ ] Add a short comment that explains how to restore the old remote font behavior.
- [ ] Keep the new system-font block directly below that section so the diff stays easy to understand.
- [ ] Avoid wide CSS refactors during the font change so reverting remains a small edit.

### Phase 7: Visual Review Pass

- [ ] Reload the unpacked extension in `chrome://extensions`.
- [ ] Open the popup on a normal connection and compare layout, spacing, and icon alignment.
- [ ] Open the popup again with poor or disabled internet and confirm it still appears quickly.
- [ ] Review at least:
- [ ] title and section headers
- [ ] shortcut rows
- [ ] tooltip icons
- [ ] radio-style message selection icons
- [ ] cloud sync row icons
- [ ] spinner and success-check icon transitions

### Phase 8: Cleanup And Final Validation

- [ ] Remove any dead CSS or JS left behind by the icon-font approach.
- [ ] Update `CHANGELOG.md` with the popup asset change.
- [ ] Run JS syntax checks on changed JS files.
- [ ] Confirm popup HTML still loads cleanly.
- [ ] Confirm the sprite file is included in packaging.

## Rollback Plan

- If the icon sprite approach causes regressions:
- [ ] revert the popup icon changes and restore the icon font path
- [ ] do not ship partial mixed approaches unless they are stable
- If the system font change looks worse than expected:
- [ ] re-enable the old Google font import block in `popup.css`
- [ ] leave the icon sprite work in place because it is still the better long-term approach for reliability

## Review Criteria

- Popup opens reliably with poor internet or no internet.
- Popup visual quality remains acceptable.
- Icons still align and animate correctly.
- No major markup churn beyond what is needed.
- No large extension size increase.
- Reverting only the text font decision remains easy.

## Notes For Execution

- Keep changes as localized as possible.
- Do not install a frontend framework or dev server for this.
- Visual verification can be done by reloading the unpacked extension in Chrome and opening the popup manually.
- If browser automation is needed later, consider it separately. It is not required for the first pass.
