# Plan 0083: Repair live shortcut targets

## Goal

- [x] Reconcile the reported shortcut and bottom-bar targets with the current ChatGPT DOM, then hand off for the user’s manual browser review. Catalog covers all 64 registered target descriptors; states not exposed in the captured page remain explicitly marked “not observed.”

## Current evidence

- [x] Captured current app-shell header, composer, message-action buttons, and the open assistant More actions menu in the logged-in Chrome tab.
- [x] Found the registered inventory contains 64 targets across 51 shortcut-action entries.
- [x] Confirmed stale target identifiers for Copy, Read Aloud, Branch, regenerate actions, and header Share; confirmed Edit currently resolves by localized label and emits multiple synthetic click events.
- [x] Confirmed bottom-bar action selection finds the current React-owned header obstacle, but its anchor-positioned box still renders at the header.

## Execution

- [x] Repair Copy using the live message-action target; hand off as ready for manual review without validation.
- [x] Repair Edit using the live structural/icon target and a single activation per attempt; hand off as ready for manual review without validation.
- [x] Repair Read Aloud using the current direct message action; hand off as ready for manual review without validation.
- [x] Repair Branch using the current scoped More-menu trigger and open-menu item; hand off as ready for manual review without validation.
- [x] Repair the Share shortcut target using the observed header-obstacle scope and Share glyph; hand off as ready for manual review without validation.
- [x] Repair current regenerate trigger, Try again, and feedback targets; keep the absent different-model action explicitly unavailable.
- [x] Repair bottom-bar Share/More CSS anchor alignment without moving the React-owned wrapper; hand off unverified for manual review.
- [x] Repair Code-block Copy to use its native Copy button and bypass extension clipboard processing; catalog the live target and hand off for manual review.
- [x] Repair each identified reported action independently; code edits were coordinated one at a time because they share extension/content.js.
- [x] Update the target catalog after each repair to “repaired; ready for user manual review.” Do not call it tested or verified.
- [x] Preserve React ownership of the app-shell header obstacle and avoid new polling/observers.
- [x] Keep selectors language-agnostic; no localized aria-labels as the sole target.
- [x] Ask the user to reload the extension using their exact three-line cue after all local edits.

## Validation boundary

- [x] User explicitly requested no validation or code review. No tests, lint, diff review, browser shortcut activation, or extension reload were run; edited code is handed off for manual browser review.

## Related spec

- [x] specs/0004-model-picker-and-shortcuts-spec.md
- [x] specs/chatgpt-shortcut-target-catalog-2026-09-27.md
