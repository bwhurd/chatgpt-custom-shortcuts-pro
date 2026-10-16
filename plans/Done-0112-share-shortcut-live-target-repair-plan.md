# Plan 0112: Repair and verify the Share shortcut target

## Goal

- [x] Align the Share shortcut and audit target with the current ChatGPT header control, verify all currently probeable shortcuts on the authenticated profile, and remove only audit-created chats through the attached browser UI.

## Current evidence

- [x] The fresh header capture contains the Share button with the `arrow-up-open` 20 icon; current runtime and audit metadata recognize only the 16 icon and the older path fallback.
- [x] The current required Share target failed. Model effort submenu captures were deferred because `dedicatedEffortControls` was unavailable.
- [x] After the repair and extension reload, the focused authenticated Share activation probe passed with no failures, skips, or environment failures.
- [x] The activation-enabled full run passed all 39 required live targets and Share activation, but exposed action-proof failures and a temporary-key collision: a test key for Regenerate overlapped the assigned Read Aloud key, and the Deep Research dispatch overlapped Send Edit.
- [x] Exact live DOM evidence confirmed current assistant code blocks use `data-markdown-text-style="assistant-message"` without a `data-message-author-role` ancestor; the runtime copy helper ignored them.
- [x] Study was assigned `Backquote`, which the runtime code-style matcher did not recognize. Scroll probes had no measurable scroll range at the profile's tall viewport. Microphone permission is now granted, but the full run's clipboard-only override masked it as denied; a reversible check reproduced the state change and restoration.
- [x] Focused Chat-mode activation probes now pass for Study and Deep Research. The probe explicitly reads the observed composer-mode control's `aria-pressed` state before opening Plus; Deep Research is not offered in Work mode.
- [x] Collect fresh source-matched target evidence after the harness and runtime repairs. The capture-only run covered all 47 target rows (39 in-scope passed; 8 out of scope) and captured all 13 prepared states without dispatching shortcut activations.
- [x] Preserve the 32 unaffected activation passes from the latest audit and rerun only the two dictation actions and the failed Scroll Up One Message action; all three focused probes passed.
- [x] Restore the temporary `codeboxWrapEnabled` test value from the failed capture-only run's checkpoint after its page closed; compare-before-restore matched the audit write and final storage verification was clean.

## Implementation

- [x] Add the observed 20 icon variant to the scoped runtime selector and target metadata while retaining the 16 and legacy path alternatives.
- [x] Update the controlled Share fixture to exercise the 20 icon inside the header target and keep the 16 icon as an out-of-scope distractor.
- [x] Update the runtime scrape spec with the observed Share icon variants.
- [x] Make temporary activation assignments unique against active user bindings and earlier temporary assignments.
- [x] Recognize `Backquote` as a `KeyboardEvent.code` and copy code blocks owned by the verified current assistant markdown marker.
- [x] Give scroll probes a short reversible viewport and restore the original viewport after each probe.
- [x] Prove Read Aloud, Branch, and Regenerate by trusted shortcut routing to the expected target while blocking the native side effect.
- [x] Skip dictation activation as environment-unverified when microphone permission is not already granted; do not grant it during the audit.
- [x] Preserve an already-granted microphone permission across temporary clipboard permission overrides and verify it is restored after cleanup.
- [x] Validate Deep Research selection using the observed app-link mention and its icon, with Chat mode explicitly selected before menu inspection.
- [x] Start the model-menu activation probe from a captured header state with the menu closed.
- [x] Update `specs/0004-model-picker-and-shortcuts-spec.md` with the verified assistant code-block ownership marker and `specs/0006-runtime-scrape-selector-validator-spec.md` with activation-probe safety boundaries.

## Validation

- [x] Run `npm run check` and the focused Share shortcut regression.
- [x] Reload the unpacked extension in the same `CodexCleanProfile` and prove the Share action live.
- [x] Run focused fast regressions for repaired Study and Deep Research actions and focused capture tests.
- [x] Reload the unpacked extension in the same `CodexCleanProfile` and prove Study and Deep Research live in Chat mode.
- [x] Rerun only the two dictation probes and the failed Scroll Up One Message probe; preserve the 32 unaffected live-probe passes from the latest audit.
- [x] Export the fresh receipt; the sanitized 30-state candidate passed the exporter's complete-coverage gate.
- [x] Update the Share fixture to cover the observed 20px icon plus the 16px and legacy fallbacks; the focused fixture and Biome check pass.
- [x] Publish the fixture correction on top of the reviewed source and snapshot (`1aad3d76edc7139bcbe3ff6b55798af4fb5fb4ea`); Fast validation run `38835108037` and Pages run `38835107700` succeeded.
- [x] Delete each of the 26 original and four later audit-created browser chats individually through the attached UI; the final deletion returned ChatGPT to home.

## Done when

- [x] The Share target and activation pass live, other shortcut outcomes and scope limits are reported, eligible evidence is published and monitored, and only audit-created chats are removed individually.
