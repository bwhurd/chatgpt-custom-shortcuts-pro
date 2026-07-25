# Bottom Bar Native Row and Chat/Work Preservation Plan

## Goal

- [ ] Mount the extension's static sidebar/new-chat controls in the same native utility row as ChatGPT's project controls whenever that row exists.
- [ ] Leave the blank-chat Chat/Work selector and its native header visibility completely under ChatGPT's control when `Move Top Bar to Bottom` is enabled.

## Investigation findings

- [x] Live Chrome inspection found the static controls at `y=470.4` while the native `Choose project` button was at `y=488.5`.
- [x] The native utility row is no longer the form's immediate next sibling; several status, suggestion, and upload nodes now sit between the composer form and the structurally valid two-menu-button utility row.
- [x] The extension's ready-state CSS shrinks the entire native page header to `1px × 1px`, leaving the Chat/Work radio group in the DOM but visually clipped.
- [x] The existing controller suppresses observer work while it moves nodes. A first-message Work transition can add `#conversation-header-actions` during that bounded window, so the relevant mutation is discarded and no later mutation triggers a repair until reload.
- [x] A direct blank Work → first-message reproduction found the remaining failure: blank chat already renders an empty `#conversation-header-actions` placeholder, and moving that React-owned placeholder out of the native header prevents ChatGPT from materializing its populated conversation controls during the route transition.
- [x] Cold blank-Work reload inspection found the native utility row first appears with one menu button; the two-button detector rejects that hydrating row, reveals the standalone fallback, and reparents it only after later page work.

## Scope

- [ ] Keep the bottom bar in composer document flow; prefer the native utility row when structurally available and retain the existing post-form fallback.
- [ ] Resolve the native row from sibling structure and menu-button semantics, not localized project/plugin text or unstable class names.
- [ ] Do not hide, resize, move, clone, or otherwise style the native page header or Chat/Work selector.
- [ ] Do not change Chrome permissions or the setting's storage contract.

## Likely owning files

- [ ] `extension/content.js` owns native utility-row discovery, bottom-bar mounting, and ready-state CSS.
- [ ] `tests/` owns a focused DOM fixture covering intervening composer siblings, row alignment, and native-header preservation.
- [ ] `PROJECT_SPEC.md` owns the durable normal-flow/native-row fallback convention.

## Implementation plan

- [x] Replace the immediate-sibling assumption with a bounded forward sibling scan that skips the extension root and accepts only a visible row containing multiple buttons plus native menu triggers.
- [x] Remove the ready-state rule that hides the entire sticky/page header; continue moving only the specific model and conversation-action nodes already owned by the bottom-bar controller.
- [x] When a relevant external mutation arrives during the controller's own-mutation suppression window, queue one post-suppression reconcile instead of dropping it; do not add a permanent interval, polling loop, or second broad observer.
- [x] Leave the empty blank-chat conversation-actions placeholder in its native header and treat it as movable only after it contains a structural interactive control; let the existing child-list observer trigger the one bounded reconcile when controls materialize.
- [x] Prefer a fully populated native utility row, but accept a one-button/one-menu hydrating row when no complete candidate exists so the first visible blank-Work frame is already aligned.
- [x] Keep the transitional-row fix inside the existing bounded sibling scan and controller lifecycle; do not add polling, a permanent observer, or a delay-only workaround.
- [x] Add focused regression coverage for:
  - intervening non-utility siblings between the composer form and native row;
  - mounting the extension root as the native row's first child;
  - equal vertical alignment between static controls and a native project-style button;
  - absence of any ready-state CSS that hides or sizes the native header.
  - first-message header actions added during suppression being reconciled after the suppression window.
  - the empty blank-chat actions placeholder remaining native while a populated actions container is eligible for the bottom-right slot.
  - a hydrating one-menu-button utility row being selected, while a later fully populated candidate still wins when both are present.
- [ ] Reload the unpacked extension and verify the repaired geometry and Chat/Work visibility on the claimed blank ChatGPT tab.

## Validation

- [x] Run focused bottom-bar tests and Biome on changed files.
- [x] Run `npm run validate:keys` to ensure adjacent shortcut/settings wiring remains intact.
- [ ] Run the runtime scrape-selector check if the loaded Chrome profile remains available.
- [ ] Cold-reload a blank Work conversation and verify that no visible sample uses `data-layout="standalone"` before the static controls align with the native project row.

## Done when

- [ ] Static sidebar/new-chat controls and ChatGPT's project controls share one visual row.
- [ ] The native Chat/Work selector has normal header geometry on blank conversations and disappears only when ChatGPT removes it.
- [ ] Work conversation header actions move into the bottom-right slot immediately after the first blank-chat message without requiring reload.
- [ ] A blank Work reload never paints the static sidebar/new-chat controls as a separate row.

## Related specs

- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
