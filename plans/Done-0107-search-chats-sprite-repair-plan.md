# Search Chats sprite repair

## Goal

- [x] Restore the Search Chats source route for the observed October 10 native SVG sprite control, including configurable Alt+K assignments.

## Execution

- [x] Replace the fast fixture's legacy-only target with the observed named sprite without a test ID; the focused run failed before the runtime fix and passed afterward.
- [x] Align runtime, metadata and both collector opener lists with the observed language-independent sprite.
- [x] Focused keyboard and selector-contract checks, project-local Biome on six changed code files, and text checks pass. The global Biome reports unrelated nursery-rule failures; the repository's locked Biome passes.

## Evidence

- [x] Brian Chrome's ChatGPT home overlay assigns Search Chats to K; a trusted Alt+K leaves it closed.
- [x] Native Search has `use` fragments `#magnifying-glass-lg-light-16` and `#magnifying-glass-lg-light-20`, without `data-testid` or `data-sidebar-item`.
- [x] Fast Search coverage creates a legacy test-ID button, so it cannot detect this live markup change. The installed overlay includes retired thread shortcuts, indicating older installed source.

## Related specs

- [x] `specs/0004-model-picker-and-shortcuts-spec.md`
- [x] `specs/0006-runtime-scrape-selector-validator-spec.md`

## Installed acceptance

- [x] Both new selectors match one visible enabled Search button on the live Brian Chrome home tab.
- [x] Browser URL policy blocks `chrome://extensions`; installed-extension reload and subsequent Alt+K acceptance require the user. No installed runtime or storage was changed.
