# Bottom Bar Native Row and Chat/Work Live Validation Plan

## Remaining work

- [ ] Reload the unpacked extension and cold-load a blank Work conversation with Move Top Bar To Bottom enabled; confirm no standalone extension row paints before the native utility row is available.
- [ ] Confirm the native Chat/Work selector keeps its normal header geometry and remains controlled only by ChatGPT.
- [ ] Send the first Work message and verify the conversation actions move into the bottom-right slot without a page reload.
- [ ] Switch to Chat and confirm the bottom-bar layout remains native and correctly aligned there.

## Constraints

- [ ] Keep the bottom bar in composer document flow and preserve the event-driven, bounded reconciliation design.
- [ ] Do not add polling, a permanent timer, a second broad observer, or localized selectors.

## Done when

- [ ] Blank Work never flashes the static controls in a separate row.
- [ ] Work and Chat both retain native-looking bottom-bar alignment across the blank-to-active transition.
