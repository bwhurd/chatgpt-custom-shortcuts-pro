# Plan 0088: Repair Ctrl+Enter send and Ctrl+Backspace stop

## Goal

- [ ] Restore the default Ctrl+Enter send and Ctrl+Backspace stop shortcuts against ChatGPT's current composer controls. Ctrl+Enter's reported scope error has a source fix; the user still reports Ctrl+Backspace fails in the real UI, so the actual Stop target remains unresolved.
- [x] Keep the existing enable/disable gates, platform modifier routing, and native keyboard behavior intact when no matching control is available.

## Scope and ownership

- [ ] `extension/content.js`: update only the Enter mapping and the Backspace mapping/dispatch guard as evidence requires.
- [ ] Add focused isolated fixtures for the send and stop paths; do not run live message-send or generation-stop probes.
- [ ] Leave unrelated dirty work, audit artifacts, permissions, and user settings unchanged.
- [ ] Related contract: `specs/0004-model-picker-and-shortcuts-spec.md`; current manual target notes: `specs/chatgpt-shortcut-target-catalog-2026-09-27.md`.

## Implementation and evidence

- [x] Ctrl+Enter resolves the current send control through a local scoped helper and safely no-ops when none is present.
- [x] Ctrl+Backspace resolves the visible Stop control once and passes that exact target to its click handler; when unavailable, Backspace remains native.
- [x] Focused fixtures prove supported target selection, gate behavior, and no-target pass-through. A fresh headed disposable profile also loaded the actual extension on `chatgpt.com`; `Control+Backspace` clicked one synthetic visible Stop target and preserved the focused draft. This still does not verify ChatGPT's real Stop markup during generation.
- [x] Ran `node --check` on source and fixtures, both Playwright keyboard fixtures, `npm exec -- biome check extension/content.js`, and `git diff --check`.
- [x] Preserved the audit's Batch 01 fingerprint map and recorded the authorized FP-005 delta plus the other 41 unchanged fingerprints in `plans/audit-0087/evidence/batch-03-post-repair-fingerprint.md`.

## Done when

- [ ] Both requested shortcuts pass focused evidence against ChatGPT's actual current controls; no live message-send/generation-stop probe is performed.
- [x] Record selector limitations honestly; no live ChatGPT send/stop action was performed.
- [ ] Rename this plan to `Done-0088-control-chord-send-stop-repairs-plan.md` only after the actual Stop-target failure is resolved.

## Current unresolved reproduction

- Latest repair: the updated live inspector dump shows the Stop control has a square SVG path and `aria-label="Stop"`, with no id or test-id. The resolver now tries the observed SVG path first (language-independent), then test IDs, then the accessible label as fallback. The previous resolver missed the control because it had none of its required identifiers.
- Per the user's instruction, stop immediately after editing: no validation or testing of this revision. Earlier passes and the recorded FP-005 digest predate these edits and do not validate this revision. Keep the repair open and the Ctrl+Backspace changelog claim withheld.

- The real extension route works in the isolated profile when a visible synthetic Stop target is present. The supplied current-UI dump shows one actual Stop button with a square SVG path and `aria-label="Stop"`; the resolver uses the icon path first and filters disabled, hidden, zero-size, and `aria-hidden` targets.
- The user reports failure in the real ChatGPT UI. The unauthenticated disposable profile has no active generation, so it cannot expose the real Stop control. The target catalog still marks this control manual-only.
- The current icon-path selector is grounded in the user's captured markup and is independent of UI language; it may need adjustment if ChatGPT changes the Stop icon markup.
