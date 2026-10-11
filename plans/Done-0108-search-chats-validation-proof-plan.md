# Search Chats validation proof

## Goal

- [x] Prove the focused Search Chats validator detects the observed defect and rejects dispatch/target/effect failures with meaningful behavioral assertions.

## Execution

- [x] Give the canonical Search case one shared checker using the real extracted listener, binding, handler and complete Search helper dependencies.
- [x] Exercise trusted Alt+K from the composer against independently observed 16px/20px sprite structures; reject wrong modifiers, wrong keys, hidden/disabled controls and unrelated controls.
- [x] Reject all six in-memory broken-source mutations at popup completion with zero page errors; shipped source remains untouched during mutation tests.
- [x] Replace the live generic-dialog-increase/substrings pass with the shared exact Search popup reader and closed-to-one-popup transition plus trusted intercepted Alt-only dispatch. Reject unrelated/preexisting/duplicate popups, untrusted dispatch and missing evidence.
- [x] Save local proof JSON/Markdown and live receipt/screenshot in `test-results/search-chats-proof/`. Add mutations to automatic contract checks and fixture fingerprints.
- [x] Focused Search, shortcut contracts, 28 affected live semantic/capture tests, project-local Biome on eight changed code/config files, text checks and diff whitespace checks pass.

## Live boundary

- [x] The original home tab remained closed on Alt+K. The user then identified their conversation tab with Search open: dismissing its popup and dispatching Alt+K twice separately produced exactly one new visible Search modal with its combobox and linked listbox. Acceptance is scoped to that specified tab, not stale tabs or every page state.
- [x] Extension-management URL policy remains blocked; do not attempt a reload workaround.
- [x] Final live receipt evaluates the exact shared popup reader: `[]` before, one Search popup after. A temporary observer records trusted `KeyK`, Alt only and `defaultPrevented: true`; it is removed afterward. The specified tab is left with Search open as initially requested.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`
