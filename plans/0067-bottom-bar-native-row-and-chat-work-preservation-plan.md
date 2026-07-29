# Bottom Bar Native Row and Chat/Work Live Validation Plan

## Investigation findings

- [x] Reproduced blank Chat → first message in the installed extension: `#bottomBarRight` stays connected but has zero buttons until reload.
- [x] Confirmed reload masks the transition bug: the same conversation reloads with `share-chat-button` and `conversation-options-button` inside `#bottomBarRight > #conversation-header-actions`.
- [x] Traced the missed transition to the main observer: a ChatGPT child mutation inside the moved native actions container is both relevant and inside `#bottomBarContainer`, but the all-internal guard discards it before reconciliation.
- [x] Confirmed blank Chat already hydrates `#conversation-header-actions` with a temporary-chat control; moving that pre-conversation React container causes it to disappear during the first-send route transition.

## Implementation

- [ ] Keep blank/pre-conversation header controls in the native header and relocate only stable post-conversation Share or conversation-options controls.
- [ ] Let tracked native header-action mutations take precedence over the internal-bottom-bar fast path while continuing to ignore purely extension-owned slot mutations.
- [ ] Keep first-message repair bounded: coalesce relevant mutations during the existing suppression window into one post-suppression reconcile, with no polling or second broad observer.
- [ ] Extend `tests/topbar-to-bottom-native-row-fixture.mjs` with behavioral coverage for moved header-action hydration during and after suppression plus a pure-internal control case.

## Remaining work

- [ ] Reload the unpacked extension and cold-load a blank Work conversation with Move Top Bar To Bottom enabled; confirm no standalone extension row paints before the native utility row is available.
- [ ] Confirm the native Chat/Work selector keeps its normal header geometry and remains controlled only by ChatGPT.
- [ ] Send the first Work message and verify the conversation actions move into the bottom-right slot without a page reload.
- [ ] Switch to Chat and confirm the bottom-bar layout remains native and correctly aligned there.
- [ ] After reloading the extension, verify blank Chat → Work and Work → Chat keep temporary/private-chat controls in the native header until a conversation exists.

## Constraints

- [ ] Keep the bottom bar in composer document flow and preserve the event-driven, bounded reconciliation design.
- [ ] Do not add polling, a permanent timer, a second broad observer, or localized selectors.

## Done when

- [ ] Blank Work never flashes the static controls in a separate row.
- [ ] Work and Chat both retain native-looking bottom-bar alignment across the blank-to-active transition.
- [ ] Blank Chat → first message moves Share and conversation options into the bottom-right slot without a page reload.
