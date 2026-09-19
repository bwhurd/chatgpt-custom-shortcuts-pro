# Native copy click and Alt+C separation

## Goal

- [x] Let a direct click on ChatGPT's response Copy button keep its native Markdown clipboard payload; keep Alt+C's cleaned text and checkmark feedback.

## Implementation

- [x] Remove the extension's response-copy click listener in `extension/content.js`; retain Alt+C's direct formatted copy path.
- [x] Verify the focused copy fixture and that click and shortcut dispatch no longer share a clipboard write.

## Validation

- [x] Run the Alt+C fixture, JavaScript syntax check, Biome, and diff check.
