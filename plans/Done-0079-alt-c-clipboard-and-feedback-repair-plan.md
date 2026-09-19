# Alt+C Clipboard And Feedback Repair Plan

## Goal

- [x] Make Alt+C reliably copy the lowest visible message, format the requested text, and show the copy-button checkmark.

## Scope

- [x] Keep the existing shortcut assignment and lowest-visible target selection.
- [x] Route Alt+C through one formatted clipboard write while leaving manual Copy-button handling intact.
- [x] Preserve fenced and inline code during text cleanup.

## Implementation

- [x] Write the Alt+C payload directly from the keydown task to avoid competing native and extension clipboard writes.
- [x] Replace prose em dashes in plain text and rich HTML; keep one `# ` on heading lines and trim trailing line spaces.
- [x] Show ChatGPT's current checkmark icon after a successful write, then restore the copy icon.
- [x] Clean up the fallback copy listener if the browser rejects the copy command.

## Validation

- [x] Run the focused Alt+C formatting and icon-feedback fixture.
- [x] Run syntax, Biome, diff, and shortcut-wiring checks.

## Handoff

- [x] Leave live confirmation to the user after reloading the unpacked extension; browser control blocks `chrome://extensions`.
