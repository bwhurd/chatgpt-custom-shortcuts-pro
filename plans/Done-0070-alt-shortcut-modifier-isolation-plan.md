# Alt Shortcut Modifier Isolation Completed Plan

## Goal

- [x] Keep ordinary Alt shortcuts from consuming `Ctrl+Alt` / `Command+Option` text-entry chords such as German-layout `Ctrl+Alt+Q` (`@`).
- [x] Preserve the intentional primary-Control-plus-Alt Previous/Next preview shortcuts on Windows/Linux and macOS.

## Investigation findings

- [x] `extension/content.js` recognizes AltGraph when Chromium reports it, but the shared Alt handler still falls through from unmatched `Ctrl+Alt` events to every ordinary Alt action.
- [x] The model-picker digit and thinking-effort paths also run before modifier ownership is narrowed, so the repair should gate the shared dispatcher rather than special-case Search Web.

## Implementation plan

- [x] Route primary-Control-plus-Alt events exclusively to Previous/Next preview handling, then return without trying ordinary Alt actions.
- [x] Reject Shift and the platform's secondary control modifier from the Alt shortcut domain so Alt actions require the advertised chord.
- [x] Add a platform-independent Node fixture covering German-layout `@`, ordinary Alt behavior, both preview keys, model digits, dynamic actions, Shift, and macOS primary/secondary control semantics.
- [x] Record the exact modifier contract in `specs/0004-model-picker-and-shortcuts-spec.md`.

## Validation

- [x] Run the targeted modifier-routing fixture.
- [x] Run `biome check` on changed JavaScript files and the repo text-format check.

## Done when

- [x] `Ctrl+Alt+Q` and equivalent extra-modifier chords reach ChatGPT without being prevented or triggering Search Web.
- [x] Alt-only shortcuts and the two documented primary-Control-plus-Alt preview shortcuts retain their behavior on Mac and non-Mac platforms.

Related spec: `specs/0004-model-picker-and-shortcuts-spec.md`
