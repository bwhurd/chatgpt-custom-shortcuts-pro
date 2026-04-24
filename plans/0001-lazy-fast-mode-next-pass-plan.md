# Lazy Fast Mode Next Pass

## Goal

Stabilize the shipped manual Fast Mode native-expansion path so it grows the retained window on the same document, preserves the real ChatGPT scroll root, and does not interfere with core model-picker or model-scrape behavior.

## Current posture

- Same-document older-turn insertion is already proven.
- The remaining work is hardening the manual controller and its guardrails, not re-proving that an in-place path can exist.
- `specs/0002-lazy-fast-mode-spec.md` owns the durable architecture and troubleshooting model. This plan owns only the remaining execution sequence.

## Scope for the next implementation pass

- Touch only `lazy-fast-bootstrap.js`, `lazy-fast-bridge.js`, `content.js`, and this plan unless new evidence forces expansion.
- Do not work on benchmark polish, auto upward-scroll mode, TanStack helpers, or unrelated popup cleanup while the manual proof is still being stabilized.
- Keep edits isolated to one failure class and one validation gate per batch.

## Success gate

- Start from a verified `24`-turn baseline.
- Expand the mounted native retained window on the same document.
- Preserve the real internal scroll-root reading position during and after expansion.
- Keep ChatGPT-owned styling, actions, and tool UIs native.
- Avoid blank-state failures and avoid breaking model-name scraping or model actions on the same route.

## Next batches

- [ ] Rebuild the manual native expansion controller around ChatGPT's real internal scroll root instead of `window`.
- [ ] Unify retained-window state semantics between `content.js` and the page bridge so stale retained counts cannot jump the window unexpectedly.
- [ ] Make manual `Load older natively` deterministic and inspectable with a small debug surface for requested retained count, anchor id, anchor offset, and pending reload or in-place state.
- [ ] Add a timeout or backout path for blank expanded states so failed expansion attempts recover cleanly to a known-good retained window.
- [ ] Protect the model-label scrape and model-action pipeline from Fast Mode runtime interference.
- [ ] Add a temporary popup kill switch only if the runtime guards are not enough for A/B validation against core features.
- [ ] Re-validate the slow reference conversation after the controller and guard fixes before revisiting any auto-expansion work.

## Deferred until the manual path is stable

- [ ] Keep TanStack and other virtual-list helpers out of the active path.
- [ ] Benchmark the revised architecture only after manual behavior is stable.
- [ ] Add lightweight button-status polish only if manual testing shows it is needed.
- [ ] Revisit automatic native expansion later only if the stabilized manual path still leaves a real UX gap.

## Stop rules

- [ ] Do not broaden the scope if the current run has not first met the clean `24`-turn baseline gate.
- [ ] Do not treat reload-based expansion as the target end behavior; keep it only as a fallback or reference path.
- [ ] Do not take on recovery mode, full-load mode, or auto mode until the manual same-document path is deterministic on the real scroll root.
