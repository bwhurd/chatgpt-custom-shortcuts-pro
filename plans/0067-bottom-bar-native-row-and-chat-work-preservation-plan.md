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

## Current app-shell repair (2026-09-27)

- [x] Inspect the live DOM: the app-shell titlebar, `form[data-chatgpt-composer]`, and `[data-thread-scroll-footer]` replace the previous IDs; the hidden disclaimer still reserves 32px and native bottom padding is 24px.
- [x] Apply spacing in a manifest stylesheet before first paint: remove the disclaimer's reserved row and leave 20px below the composer when disabled or below the bar when enabled, following the user's clarified spacing request.
- [x] Adapt the existing relocation controller to the observed semantic attributes and keep native composer controls in their own form. Preserve legacy selectors and reuse the existing observer.
- [x] Update native sidebar/New Chat forwarding and reserve the enabled bar's flow footprint with one early settings read; add no polling or layout observer.
- [x] Update the owning layout contract. The user explicitly requested no validation or testing, so no checks or extension reload were performed for this repair. Earlier plan work remains separately outstanding.

## Done when

### App-shell crash repair (2026-09-27)

- [x] Replace app-shell header-slot reparenting with CSS anchor positioning at the bottom row; native controls retain their React parent and event handlers.
- [x] Exempt these native-parent actions from the moved-slot repair check and clear positioning when conversation controls disappear. Reuse the existing controller; no extra observer or polling.
- [x] Lower the enabled bar by another 20px through native footer padding; keep the disabled composer's 20px gap.
- [x] Update the current layout contract. No tests, validation, or extension reload performed, following the user's instruction.

- [ ] Blank Work never flashes the static controls in a separate row.
- [ ] Work and Chat both retain native-looking bottom-bar alignment across the blank-to-active transition.
- [ ] Blank Chat → first message moves Share and conversation options into the bottom-right slot without a page reload.
