# Plan 0084: Repair Edit and code-block Copy shortcuts

## Goal

- [x] Update the Edit and Copy runtime paths and hand them off for manual browser review; live success is not claimed.

## Current posture

- [x] User reported both controls still failed after reloading the extension.
- [x] The prior Edit repair changed the glyph target and reduced activation to `.click()`, but the shortcut still did not enter edit mode.
- [x] The prior Code Copy repair added `button[data-testid="copy-code-button"]` to the candidate list, but the user still saw the upper-right code-block Copy control ignored.
- [x] The attached view shows a JavaScript code block with a separate native Copy control in its upper-right corner.

## Execution

- [x] Repair Edit activation and target resolution as one isolated code change; remove the premature second click and re-resolve replaced user turns.
- [x] Repair code-block Copy candidate selection so the native code control is actually chosen and clicked, with no extension clipboard transformation on that path.
- [x] Prioritize recognized visible code-block Copy controls over message-level Copy; preserve the native clipboard handler.
- [x] Update the live target catalog after each handoff; mark work ready for the user's manual browser review, never validated.

## Validation boundary

- [x] No shortcut activation, clipboard testing, diff review, or reload was performed. User will manually review after reloading.

## Related spec

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/chatgpt-shortcut-target-catalog-2026-09-27.md`
