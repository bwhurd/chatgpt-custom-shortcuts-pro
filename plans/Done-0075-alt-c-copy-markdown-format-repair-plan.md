# Alt+C Copy Markdown Format Repair Plan

## Goal

- [x] Restore Alt+C copy cleanup so copied Markdown uses dash bullets, preserves four-space indentation for nested bullets, and keeps the requested header boundary spacing.

## Current posture

- [x] `extension/content.js` runs `stripMarkdownOutsideCodeblocks` after the lowest native copy button writes to the clipboard.
- [x] ChatGPT's rendered list DOM exposes list items without textual markers, so the custom copy path now serializes list structure instead of relying on `innerText`.
- [x] The existing line transforms used broad `\s` matching for headings and did not encode the required blank-line-before/header/no-blank-line-after contract.
- [x] A focused regression fixture now covers the three-level list and header cases.

## Scope

- [x] Touch only the Alt+C Markdown transformer, rendered-copy serializer, and focused fixture unless validation exposes a direct wiring dependency.
- [x] Preserve fenced and inline code verbatim, existing optional-toggle behavior, ordered-list formatting, and rapid-copy coordination.
- [x] Do not change shortcut assignments, copy-button targeting, clipboard permissions, or the native copy UI.

## Implementation plan

- [x] Make heading, blockquote, and list matching line-local so preceding newlines and nested-list whitespace cannot be consumed.
- [x] Normalize unordered markers, including rendered bullet glyphs, to `- ` while retaining list hierarchy and using four spaces per nested level.
- [x] Normalize header boundaries to one blank line before a header when content precedes it, with no blank line between the header and its following content; keep leading/trailing copy behavior safe.
- [x] Add a focused fixture that extracts the formatter from `content.js` and asserts plain text, protected code, nested bullets, and header spacing.
- [x] Serialize rendered `ul`/`ol` trees as compact text with dash bullets and four spaces per nested level so the custom native-copy click handler cannot drop list markers.

## Validation

- [x] Run the focused formatter fixture and `node --check extension/content.js`.
- [x] Run Biome on changed JavaScript files, `npm run validate:keys`, `npm run check:text`, and the standard popup visual suite.
- [x] Use the signed-in ChatGPT session to create a temporary three-level nested-bullet conversation and compare native Copy response with Alt+C. The response rendered correctly, but the live tab continued returning the previously loaded raw payload after a page refresh; Chrome's internal extension manager could not be claimed by CUA, so the browser-backed source fixture is the authoritative post-fix regression check.

## Done when

- [x] The requested three-level example is covered with `- ` markers and exact four-space nesting.
- [x] Headers have the required preceding blank line and no textless blank line immediately after the header.
- [x] Code fences/inline code and unrelated copy behavior remain unchanged in the focused regression coverage.
- [x] Focused validation passes and the live-session limitation is recorded.

## Related specs

- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
