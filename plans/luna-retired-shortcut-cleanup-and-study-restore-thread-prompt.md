# Completed retired-shortcut cleanup and Study restoration record

All three batches and all twelve acceptance rows completed. See [Done-0098](Done-0098-retired-shortcut-cleanup-and-study-restore-plan.md) for the implementation, validation and provenance. Nine obsolete shortcuts were removed, Study was restored as a configurable blank-default action, the sidebar lifecycle was correctly classified, and the empty model slot stopped appearing as an actionable shortcut without changing profile indices or arrays.

The controlled fast fixture proved Study activation, toggle-off, draft preservation and a missing-menu no-op. A separate current-source live check activated the current Study pill, toggled it off while preserving an unsent draft, and left the menu closed. No message was sent; the test draft was cleared. The user confirmed the temporary Study binding was cleared through the supported popup. This is action-specific live proof, not a claim that every shortcut works live.

For future shortcut regression checks, use `npm run test:shortcuts:fast` and [spec 0006](../specs/0006-runtime-scrape-selector-validator-spec.md#canonical-fast-shortcut-check) for current command scope. This prompt is archival; do not restart its cleanup or live proof sequence.
