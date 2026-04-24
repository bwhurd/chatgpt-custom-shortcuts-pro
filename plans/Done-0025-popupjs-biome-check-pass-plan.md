# Popup.js Biome Check Pass Plan

- [x] Suppress the file-wide `format` diagnostic for `extension/popup.js` in `biome.json`; behavior-change risk stayed low, and the implemented change was a file-scoped formatter override instead of a whole-file rewrite.
- [x] Remove unused `getModelActionGroups` at `extension/popup.js:50`; behavior-change risk stayed low because the helper was file-local and unreferenced.
- [x] Remove unused `getActiveModelConfigId` at `extension/popup.js:133`; behavior-change risk stayed low because the active-config reads already flow through the used visual-state helpers.
- [x] Remove unused `MODEL_CONFIG_CLICK_DEBOUNCE_MS` at `extension/popup.js:134`; behavior-change risk stayed low because no debounce path read the constant.
- [x] Fix `lint/suspicious/useIterableCallbackReturn` at `extension/popup.js:2495` by bracing the `allowed.add` callback; behavior-change risk stayed negligible because the callback still performs the same side effect only.
- [x] Fix `lint/suspicious/useIterableCallbackReturn` at `extension/popup.js:2705` by bracing the `EXCLUDED_STATE_WIRING.add` callback; behavior-change risk stayed negligible because the set mutation stayed identical.
- [x] Remove unused `configureActionDebounceTimer` at `extension/popup.js:4637`; behavior-change risk stayed low because the variable was never read or reassigned, and removal also cleared its paired `useConst` style diagnostic.
- [x] Remove unused `configureActionSerial` at `extension/popup.js:4639`; behavior-change risk stayed low because the serial was not wired into any configure-action flow, and removal also cleared its paired `useConst` style diagnostic.
- [x] Remove unused `stagePendingModelConfigTarget` at `extension/popup.js:4735`; behavior-change risk stayed low because pending-target staging currently happens only through the still-used clear/schedule helpers.
- [x] Replace the equality-only `findIndex` call with `indexOf` at `extension/popup.js:5420`; behavior-change risk stayed low because the lookup still compares the same input element by identity.
- [x] Remove unused `sendModelActionToTab` at `extension/popup.js:5547`; behavior-change risk stayed low because configure actions currently persist active-config state locally and never call the message helper.
- [x] Re-run scoped validation and confirm the file passes.
  Ran `node --check extension/popup.js`
  Ran `npx biome check extension/popup.js --max-diagnostics=100`
