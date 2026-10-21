# Plan 0114: Slim sidebar opacity and hover recovery

## Outcome and evidence

- [x] Fade only collapsed-rail buttons/links at the configured opacity, reveal them on hover, and leave the native container/background untouched. Preserve the expanded sidebar.
- [x] Reproduced in headless Chromium using the real production fade block: configured opacity 0.35 became 0 with pointer-events none when a hidden ancestor contained a listbox with no layout.
- [x] Found popup load/enable handlers reject numeric strings, although defaults and older settings can contain them.
- [x] Keep this user-requested repair separate from the active 0113 module extraction. Scope: fade block in content.js, fade controls in popup.js, focused existing/new fixtures, owning settings spec and aggregate test wiring.
- [x] Consulted MDN opacity/pointer-events documentation and W3C pointer-event discussions before changes. Current authenticated inspection on the documented CDP endpoint was unavailable (connection refused); synthetic reproduction is not live ChatGPT proof.

## Repair and proof

- [x] Count only rendered, visible overlays, including ancestor state; inspect all matches rather than only the first.
- [x] Reconcile overlay attribute closure through the existing observer. Ignore self-authored control style changes to avoid feedback; add no polling or second broad observer.
- [x] Preserve numeric/string opacity in [0,1]; keep the existing default and storage key.
- [x] Extend the real-browser regression with a hidden-parent listbox, real hover, configured zero/nonzero levels, overlay open/close and feature disable. Keep existing host/open-state regression.
- [x] Verify the installed popup preserves a numeric-string setting on reopen. Existing popup spec plus visual checks passed 12/12; settings wiring passed 65 controls/8 supplemental keys. Both fade fixtures and changed-file Biome passed. Reuse these unchanged results rather than repeat them.
- [x] Updated the owning settings spec and aggregate contract wiring. Browser regression verifies the container's exact inline style remains unchanged and disabling restores native button transitions. The separate live gate in plan 0113 remains required; no publication occurred.
- [x] Final `npm run check:text` passed with Batch 02 closeout. Current authenticated appearance remains unverified because CDP 9333 was unavailable.
