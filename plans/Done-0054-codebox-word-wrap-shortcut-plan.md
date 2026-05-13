# Codebox Word Wrap Shortcut Plan

## Goal

- [x] Add an unassigned-by-default Alt shortcut setting labeled `Toggle Word Wrap in Codeboxes` that controls the existing codebox word-wrap toggle.

## Scope

- [x] Wire the shortcut through the normal popup-backed shortcut surfaces from `specs/0001-adding-new-settings-spec.md`, `specs/0004-model-picker-and-shortcuts-spec.md`, and `specs/0005-popup-settings-validator-spec.md`.
- [x] Keep runtime behavior limited to the current CSS-only codebox wrap toggle and scroll-preservation behavior.
- [x] Do not add a separate toggle checkbox, new permissions, or popup/settings sync work beyond the shortcut setting itself.

## Implementation

- [x] Add `shortcutKeyToggleCodeboxWrap` with an empty/NBSP default across storage, popup defaults, schema shortcut metadata, fixture coverage, and locales.
- [x] Insert the popup row as the last item in the `UI Tweaks` section with `Alt +` shortcut input styling.
- [x] Move activation from the hardcoded `Alt+H` listener into the normal content shortcut map so user assignment controls the shortcut.
- [x] Add explicit shortcut action metadata as an internal/not-applicable extension action with no ChatGPT DOM target.

## Validation

- [x] Run `node tests/validate-keys.js`.
- [x] Run `npx biome check` on changed source files.
- [x] Confirm the default is unassigned and no `Alt+H` special case remains.

## Done When

- [x] The popup shows `Toggle Word Wrap in Codeboxes` at the end of `UI Tweaks` with an empty shortcut input.
- [x] Assigning a key in the popup can drive the content-side codebox wrap toggle through the normal Alt shortcut handler.
- [x] Static wiring validation passes.
