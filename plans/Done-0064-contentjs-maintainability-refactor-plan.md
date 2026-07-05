# Content.js Maintainability Refactor Plan

## Goal

- [x] Keep `extension/content.js` IIFE-based and `window`-bridged, but reduce repetition enough that future edits stay organized, reusable, and easy to review.
- [x] Prefer systematic helper consolidation over cosmetic reshuffling. A pass should remove repeated logic, make behavior easier to trace, or clearly lower future bug risk.

## Stopping criteria

- [x] Stop adding implementation passes when the remaining work is mostly local naming, comment cleanup, formatting, or file-length reduction without a clear behavior-maintenance payoff.
- [x] Treat the refactor as complete when the main shortcut registry is a readable storage-key-to-function map, the known duplicated helper families are canonicalized or intentionally documented as behavior-specific, and any remaining large IIFE is either already organized around a clear controller/module boundary or would require a separate feature-spec rewrite.
- [x] Cap the closeout at five ambitious implementation passes after the model-picker name-cache pass; stop earlier if the next candidate does not meet the same impact bar as copy/export, edit/send-edit, thread navigation, shortcut action launchers, or model-name cache.
- [x] Do not create new refactor work for isolated helper renames, line-count reduction, moving already-cohesive IIFEs, or cosmetic section shuffling.

## Ambitious closeout pass division

- [x] Pass 1: model-picker hint/label controller cleanup.
  - Scope: shortcut hint style injection, label add/remove helpers, primary/listbox/model-version/configure-row hint application, retry scheduling, click-triggered rescheduling, menu/listbox observer.
  - Goal: one named `ModelPickerHints` controller surface instead of scattered `apply*Hints`, `scheduleHints`, listener, and observer code.
  - Do not change hint text, timing constants, menu selectors, active-config persistence, shortcut execution, or animations.
- [x] Pass 2: model-picker action runner cleanup.
  - Scope: `openMenuForAction`, `executeModelAction`, direct target activation, configure-open/configure-option/configure-frontend-row dispatch, and integrated-effort fallback delegation.
  - Goal: a named action-runner boundary that separates action dispatch decisions from low-level menu/select/listbox helpers.
  - Do not change model selection behavior, fallback order, analytics, model catalog scrape, or prepared Configure Models sessions.
- [x] Pass 3: model-picker configure/catalog scrape cleanup.
  - Scope: integrated catalog scrape, Configure Models scrape, prepared session hide/release helpers, frontend action signature collection, and model-name range persistence.
  - Goal: clarify scrape-only workflow versus user-visible model switching workflow.
  - Do not change scrape order, hidden UI behavior, storage keys, catalog shape, or popup message contracts.
- [x] Pass 4: top-bar-to-bottom controller cleanup.
  - Scope: bottom-bar shell creation, static sidebar/new-chat button SVGs, style injection, slot syncing, observer relevance helpers, and non-critical helper startup.
  - Goal: keep the controller readable by extracting static assets/styles and separating shell/slot mechanics from observer/repair policy.
  - Do not change bottom-bar layout, opacity, hover fade, injected controls, header hiding, disclaimer hiding, or route exclusions.
- [x] Pass 5: final high-impact audit and closeout.
  - Scope: only remaining clusters that are still clearly tangled or repeated after passes 1-4.
  - Goal: either do one final meaningful cleanup or archive/close the plan with validation and manual smoke-test notes.
  - Do not perform cosmetic-only cleanup to use the pass.

## Current posture

- [x] Completed pass detail through the fourth implementation pass is archived in `plans/Done-0064-contentjs-maintainability-refactor-completed-passes.md`.
- [ ] The previous remaining "bridge closeout" is useful final polish, but it does not meet the high-impact refactor bar by itself.
- [x] The fifth implementation pass consolidated the copy/export helper family before returning to bridge/export cleanup.
- [x] The sixth implementation pass consolidated duplicated previous/next thread navigation behavior.
- [x] A fresh audit found a cleaner high-impact boundary before final bridge/export closeout: the standalone bottom gated-feature bundle at the end of `content.js`.
- [x] The thread-navigation `Thought for` exclusion was tightened to catch direct button text like `Thought for 9s`, not only child spans.
- [x] The final bridge/export closeout pass documented the remaining intentional `window.*` bridge clusters.
- [x] A fresh high-impact audit rejected "extract the model-picker IIFE into another file" as mostly packaging; the larger maintainability issue is the main IIFE shortcut dispatcher, where a huge action object is keyed by initial shortcut values instead of stable storage-key action names.
- [x] Similar helpers stayed separate when they encode different behavior, especially animation cues, visual selection feedback, menu opening, visibility predicates, and scroll anchoring.

## Investigation findings

- [ ] `extension/content.js` is about 15k lines with several very large IIFE sections; the largest are model switching, main runtime setup, top-bar relocation, sidebar/thread navigation, shortcuts overlay, and click-to-copy.
- [ ] The `selectThenCopy` and `selectThenCopyAllMessages` shortcut sections contain adjacent duplicated clipboard/export helpers:
  - `writeClipboardHTMLAndText_*`
  - `replaceNewlinesWithBr_UserPreWrap`
  - `normalizeCodeBlocksInClone`
  - `demotePTagsAndStripDataAttrs`
  - `splitListsAroundCodeBlocks_Word`
  - `buildPlainTextWithFences`
  - selection-range and text-walker helpers
- [ ] These copy/export sections have real behavior differences that must be preserved: single-message copy has no labels and uses the inline list guard, while entire-conversation copy owns role filters, labels, spacers, and all-message selection.
- [ ] The previous/next thread navigation blocks are the next strongest duplication candidate after copy/export: they repeat scroll anchoring, centered-button checks, hover relaunch, candidate collection, composer-overlap checks, target selection, and recentering with directional differences.
- [ ] A broad model-picker file split may reduce `content.js` size substantially, but it is a separate architectural pass because it touches shipped file ordering and would require manifest/build-zip coordination.
- [ ] The main shortcut dispatcher is a higher-value cleanup target than another file split:
  - action handlers are currently stored under computed shortcut-value keys, which makes the owning setting hard to see while reading the action
  - normal Alt shortcut matching loops the initial action object keys, while storage-change handling rebuilds a separate effective-code lookup for analytics
  - model-toggle and thread-preview special cases should read from the same effective shortcut helper as the rest of the dispatcher
  - the keydown listener mixes input guards, model-toggle handling, model-digit handling, preview handling, dynamic effort shortcuts, generic Alt dispatch, and Ctrl dispatch in one dense block
- [x] After the shortcut registry cleanup, the largest remaining maintainability issue inside the registry is copy selection/export:
  - `selectThenCopy` and `selectThenCopyAllMessages` still define separate turn selectors and separate role/content discovery helpers
  - the native copy-button hook, single-message shortcut, and all-message shortcut should agree on canonical turn/content discovery
  - the registry should point to named copy actions instead of embedding hundreds of lines of copy feature code inline
- [x] After copy extraction, the next largest registry problem is the edit/send-edit feature cluster:
  - `shortcutKeyEdit` still embeds edit-button discovery, synthetic click dispatch, scroll centering, opened-editor detection, text selection, retry timing, and card stabilization in one action body
  - `shortcutKeySendEdit` repeats edit-context discovery concerns for focused edit fields, active edit cards, candidate send buttons, composer exclusion, visibility checks, and bottom-most fallback selection
  - both actions should be named feature functions so `altShortcutActions` remains a registry, while shared edit-context helpers stay near the feature code rather than thousands of lines away
- [x] A broader post-extraction review found `shortcutKeyMoreDotsReadAloud` is the largest remaining inline registry body, but the higher-impact next step is finishing the edit/send-edit extraction: `runEditMessageShortcut` still recreates a 561-line helper cluster on every shortcut invocation.
- [x] After the edit/send-edit helper clusters were stabilized, `shortcutKeyMoreDotsReadAloud` was extracted as part of the broader shortcut action-launcher cleanup rather than moved alone.
- [x] A fresh high-impact review compared the remaining main registry clutter against the top-bar and model-picker IIFEs:
  - the model-picker IIFE is still the largest eventual cleanup target, but its scraping, hinting, and menu-routing paths are tightly coupled and should not be touched opportunistically
  - the top-bar relocation IIFE is large but already controller-oriented and less obviously repetitive
  - the main shortcut registry still has adjacent inline menu/icon/dictation action bodies that obscure the now-clean storage-key registry and duplicate icon action launch patterns
- [x] A follow-up high-impact review found the best next model-picker boundary is the model-name/cache cluster, not the full 3k-line IIFE:
  - the cluster uses old `__csp*` names that look like globals even though they are local runtime helpers
  - DOM label extraction, canonical label mapping, storage merge throttling, popup live-name response, and range writes are interleaved
  - this can be modularized in place without touching model action routing, scraping order, hint timing, menu opening, or shipped file boundaries

## Completed implementation pass - copy/export pipeline consolidation

- [x] Scoped the pass to the adjacent copy/export shortcut region in `extension/content.js`, roughly the single-message copy block and the entire-conversation copy block.
- [x] Extracted one shared helper cluster above both shortcuts for behavior that is actually canonical:
  - clipboard HTML/text write with async ClipboardItem first and copy-event fallback
  - visual selection range creation for one or more content elements
  - pre-wrap newline conversion
  - code-block clone normalization and fenced plain-text conversion
  - Word-oriented paragraph/list cleanup where semantics match
  - text-walker utilities
- [x] Kept feature-specific wrapper names simple and explicit:
  - `buildSingleMessageClipboardPayload(...)`
  - `buildConversationClipboardPayload(...)`
  - `copyClipboardPayload(...)`
  - `selectElementsForCopyFeedback(...)`
- [x] Preserved behavior-specific differences as named options or wrapper-only code, not as hidden conditionals:
  - single-message payload: no labels, no role filter, keep inline auto-list guard
  - entire-conversation payload: keep assistant/user filters, labels, spacers, and empty-copy guard
  - preserve selection feedback and copy-button click behavior
- [x] Removed the duplicated `_Single` / `_EntireConv` helper families after call sites used the shared helper and the important differences stayed explicit.
- [x] Avoided changing shortcut bindings, storage setting names, selector behavior, toast behavior, animation timing, or visual selection cues in this pass.

## Manual confirmation targets

- [ ] `selectThenCopy`: confirm the keyboard shortcut still visually selects the intended visible turn and copies unless "disable copy after select" is enabled.
- [ ] ChatGPT native turn copy button: confirm the click hook still selects the copied turn and writes processed HTML/text instead of code-box copy content.
- [ ] `selectThenCopyAllMessages`: confirm the keyboard shortcut still selects the full copied span and respects assistant-only, user-only, both, labels on/off, code blocks, and lists.
- [ ] Copy turn discovery: confirm assistant and user turns are still selected from the same visible conversation region and turns below the composer are not targeted.
- [ ] Copy code-block exclusion: confirm code-box copy buttons are still ignored by the native turn-copy interception.
- [ ] `shortcutKeyEdit` default `Alt + E`: confirm the lowest eligible edit button scrolls into position, flashes, opens edit mode, selects the edit text, and keeps the edit card above the composer.
- [ ] `shortcutKeyEdit`: confirm retry still handles the case where the first click does not immediately open the edit field.
- [ ] `shortcutKeySendEdit` default `Alt + D`: confirm the focused edit card send button is preferred and composer send buttons are never targeted.
- [ ] `shortcutKeySendEdit`: confirm fallback still finds the visible bottom-most edit send button when focus is not inside the edit field.
- [ ] `shortcutKeyPreviousThread` default `Alt + J`: confirm previous response navigation scrolls, flashes, hover-relaunches, clicks, and recenters as before.
- [ ] `shortcutKeyPreviousThread` preview path default `Alt + Ctrl + J`: confirm preview-only still scrolls/flashes without clicking and still wraps to the last candidate when appropriate.
- [ ] `shortcutKeyNextThread` default `Alt + ;`: confirm next response navigation scrolls, flashes, hover-relaunches, clicks, and recenters as before.
- [ ] `shortcutKeyNextThread` preview path default `Alt + Ctrl + ;`: confirm preview-only still scrolls/flashes without clicking and does not add previous-thread wrap behavior.
- [ ] Previous and next thread navigation: confirm "Thought for" buttons are skipped as targets in both directions.
- [ ] Previous and next thread navigation: confirm direct-text chevrons like `Thought for 9s` are never targeted or clicked.
- [ ] `clickToCopyInlineCodeEnabled`: confirm inline code still copies on click when enabled and no click listener/style remains when disabled.
- [ ] `colorBoldTextEnabled`: confirm bold text color styling still appears with custom light/dark colors and is removed when disabled.
- [ ] `hidePastedLibraryFilesEnabled`: confirm the Library toggle still injects near the filter controls, hides matching pasted-file rows, restores rows when disabled, and survives route changes.
- [ ] Shortcut dispatcher smoke path: confirm a normal Alt shortcut still runs, for example `shortcutKeyScrollUpOneMessage` default `Alt + A`.
- [ ] `shortcutKeyToggleModelSelector`: confirm the model picker opens with the configured modifier, including Alt mode and Ctrl/Command mode if toggled in settings.
- [ ] Model picker digit shortcuts: confirm assigned model slots still trigger only when the model picker is configured for Alt digits.
- [ ] Thinking effort shortcuts: confirm thinking/pro effort shortcuts still use the model-picker bridge first and fall back to the older menu path when needed.
- [ ] Ctrl/Command shortcuts: confirm Ctrl/Command + Enter still sends only when enabled, and Ctrl/Command + Backspace still stops only when a visible Stop button exists.
- [ ] `shortcutKeyRegenerateTryAgain`: confirm the configured shortcut still opens the lowest eligible regenerate menu and clicks Regenerate.
- [ ] `shortcutKeyRegenerateWithDifferentModel`: confirm the legacy key still targets the "Don't Search the Web" submenu token when assigned.
- [ ] `shortcutKeyRegenerateAskToChangeResponse`: confirm the configured shortcut still opens the regenerate menu and focuses the contextual retry input with the caret at the end.
- [ ] `shortcutKeyMoreDotsReadAloud`: confirm the configured shortcut still stops existing playback first, otherwise clicks exposed Read Aloud in an open menu, otherwise opens the lowest eligible more-dots menu outside the bottom bar.
- [ ] `shortcutKeyMoreDotsBranchInNewChat`: confirm the configured shortcut still opens the lowest eligible more-dots menu outside the bottom bar and clicks Branch in new chat.
- [ ] `shortcutKeySearchWeb`, `shortcutKeyCreateImage`, `shortcutKeyToggleCanvas`, and `shortcutKeyAddPhotosFiles`: confirm each configured shortcut still triggers its composer/tool icon path.
- [ ] `shortcutKeyTemporaryChat`: confirm the configured shortcut still toggles temporary chat on and off from the conversation header actions.
- [ ] `shortcutKeyToggleDictate`: confirm the configured shortcut still submits active dictation first, otherwise starts dictation, otherwise falls back to the normal send button path.
- [ ] `shortcutKeyCancelDictation`: confirm the configured shortcut only clicks Stop dictation when that control is visible.
- [ ] `shortcutKeyNewGptConversation`: confirm the configured shortcut still opens the GPT header menu and clicks New chat with the text fallback.
- [ ] Model picker live names: confirm opening the model menu still refreshes model names shown in the popup/overlay without shortcut hint text leaking into names.
- [ ] Model picker catalog scrape: confirm popup/dev scrape requests still return model catalog data and close/release prepared Configure Models sessions.
- [ ] Model picker trigger action: confirm popup-triggered model actions still run, including normal model slot actions and Configure Models actions.
- [ ] Shortcuts overlay model section: confirm model labels and assigned key labels still render correctly after the model menu has been opened.
- [ ] Model picker hint labels: confirm primary model-menu hints, Configure Models listbox hints, thinking-effort menu/listbox hints, and model-version submenu hints appear after each menu opens.
- [ ] Model picker active persistence: confirm direct model clicks, Configure Models option clicks, and model-version submenu clicks still persist the selected active model.
- [ ] Model picker action routing: confirm digit shortcuts, popup-triggered model actions, Configure Models open/options, direct visible menu target activation, and integrated-effort fallback still complete with the expected visible flashes.
- [ ] Model picker catalog scrape sessions: confirm `CSP_SCRAPE_MODEL_CATALOG` still supports hidden scrape mode, `keepPreparedSession`, prepared-session release, integrated model menu scrape, Configure Models scrape, and dynamic model-name slot assignment from slot 8.
- [ ] Top-bar-to-bottom relocation: confirm `moveTopBarToBottomCheckbox` still relocates the model picker/header actions to the bottom bar, preserves hover opacity/fade and grayscale behavior, keeps static sidebar/new-chat buttons working, hides the original top header/disclaimer, and stays disabled on excluded routes.

## Completed implementation pass - thread navigation dedupe

- [x] Consolidated previous/next thread navigation after the copy/export pass was complete and validated.
- [x] Created a shared directional helper for scroll anchoring, centered checks, composer overlap, candidate collection, target choice, hover relaunch, and recentering.
- [x] Preserved directional selector differences, icon token differences, preview wrap behavior, post-click timing, and fallback behavior as explicit config.
- [x] Intentionally filtered "Thought for" buttons out of both previous and next navigation candidate sets.

## Completed implementation pass - bottom gated-feature module extraction

- [x] Extracted the standalone bottom gated-feature IIFEs from the end of `extension/content.js` into `extension/content-gated-ui-features.js`:
  - click-to-copy inline code
  - bold-text color styling
  - hide pasted files in the Library
- [x] Loaded the new content script after `content.js` in `extension/manifest.json` so current page/runtime initialization order is preserved.
- [x] Added the new shipped file to `scripts/build-zip.js` `includeItems`.
- [x] Kept behavior unchanged: storage gates, style injection, clipboard fallback, Library toggle insertion, mutation observers, route refresh hooks, and `chrome.storage.onChanged` handling remain identical.
- [x] Did not change Chrome permissions, host access, shortcut bindings, or copy/export behavior from the previous pass.

## Completed hotfix - thread navigation Thought for exclusion

- [x] Updated `isThoughtForThreadNavigationButton` to inspect the button's normalized `textContent`, `aria-label`, and `title`.
- [x] Preserved the existing previous/next navigation config, including `excludeThoughtFor: true` in both directions.
- [x] Covered the provided inspector shape where `Thought for 9s` is a direct text node inside the button.

## Completed final closeout pass - bridge cleanup

- [x] Grouped or clearly documented remaining `window.*` bridge exports by feature without moving references away from their owning IIFEs.
- [x] Confirmed no stale paste markers or authoring seams remain in `extension/content.js` runtime files.
- [x] Reran syntax and Biome checks.
- [x] Recorded manual smoke-test paths that still need the extension loaded in Chrome.
- [ ] Rename this active plan to `Done-0064-contentjs-maintainability-refactor-plan.md` only when no required work remains.

## Completed implementation pass - shortcut dispatcher registry cleanup

- [x] Scoped this pass to the main IIFE shortcut dispatcher in `extension/content.js`.
- [x] Replaced the computed shortcut-value action map with a stable storage-key action registry so each handler is traceable by its setting name.
- [x] Preserved duplicate-key behavior by matching Alt action keys in reverse registry order, matching the old object-literal overwrite behavior.
- [x] Routed model-toggle, previous/next preview, model-digit dispatch, normal Alt handling, and Ctrl/Command handling through small named helpers that read current effective settings.
- [x] Kept existing shortcut bindings, analytics action IDs, visual cue timing, animation behavior, model-picker delegation, copy/export helpers, thread-navigation config, and Ctrl+Backspace native fallback unchanged.
- [x] Did not touch model-picker internals, manifest ordering, build packaging, Chrome permissions, or bottom gated-feature modules in this pass.

## Completed implementation pass - copy turn discovery and action extraction

- [x] Scoped this pass to the copy shortcut feature code inside the main IIFE in `extension/content.js`.
- [x] Created one canonical conversation-turn selector for copy/export paths.
- [x] Created shared role-container, preferred-role, visible-turn, and copy-content-element helpers used by:
  - native turn copy-button interception
  - `selectThenCopy`
  - `selectThenCopyAllMessages`
- [x] Extracted the single-message copy action and all-message copy action into named functions so `altShortcutActions` becomes a readable registry entrypoint again.
- [x] Preserved the important behavior differences:
  - single-message copy keeps no labels, role preference, visual selection feedback, and the inline list guard
  - all-message copy keeps assistant/user filters, label omission settings, role labels, selection spanning all copied turns, and empty-copy guard
  - native copy-button interception still ignores code-block copy controls
- [x] Did not change shortcut defaults, clipboard formatting, Word HTML normalization, visual selection timing, animation cues, thread navigation, model-picker behavior, manifest ordering, or Chrome permissions.

## Completed implementation pass - edit shortcut feature extraction

- [x] Scoped this pass to `shortcutKeyEdit` and `shortcutKeySendEdit` inside the main IIFE in `extension/content.js`.
- [x] Extracted `shortcutKeyEdit` into a named `runEditMessageShortcut` function with named local helpers for:
  - edit button discovery and target picking
  - synthetic user-like edit-button activation
  - scroll-container metrics and scroll-to-center behavior
  - opened edit-field detection, select-all behavior, retry handling, and edit-card stabilization
- [x] Extracted `shortcutKeySendEdit` into a named `runSendEditShortcut` function with named local helpers for:
  - focused edit-field detection
  - edit-card scoped send-button selection
  - fallback edit-row scanning
  - composer exclusion and visible/bottom-most candidate filtering
- [x] Kept `altShortcutActions.shortcutKeyEdit` and `altShortcutActions.shortcutKeySendEdit` as one-line registry entries.
- [x] Preserved all timings, selectors, retry behavior, visual `flashBorder` cues, `safeClick` behavior, GSAP scroll/fallback behavior, and composer exclusion.
- [x] Did not touch copy/export behavior, thread navigation, model-picker internals, bottom gated-feature modules, manifest ordering, or Chrome permissions.

## Completed implementation pass - edit helper module stabilization

- [x] Scoped this pass to the extracted edit/send-edit feature cluster in `extension/content.js`.
- [x] Converted the edit helper cluster into a private `EditMessageShortcut` IIFE module initialized once, with `runEditMessageShortcut()` reduced to a small bridge.
- [x] Converted the send-edit helper cluster into a private `SendEditShortcut` IIFE module initialized once, with `runSendEditShortcut()` reduced to a small bridge.
- [x] Kept helper definitions close to the feature; did not move them to distant global utility sections.
- [x] Preserved all current selectors, timings, retry behavior, visual cues, GSAP/fallback scroll behavior, focused send-button priority, fallback send-button selection, and composer exclusion.
- [x] Did not touch read-aloud menu behavior, copy/export behavior, thread navigation, model-picker internals, bottom gated-feature modules, manifest ordering, or Chrome permissions.

## Completed implementation pass - shortcut action launcher cleanup

- [x] Scoped this pass to the main IIFE action-launcher cluster in `extension/content.js`, especially `altShortcutActions` entries for regenerate, more-dots read-aloud/branch, composer tool icons, thinking fallbacks, temporary chat, dictation, cancel dictation, and new GPT conversation.
- [x] Kept the registry as a storage-key-to-function table with one-line entries for all multi-step actions.
- [x] Added nearby named helpers for canonical action types instead of hiding behavior behind generic "duplicate" labels:
  - `runReadAloudShortcut()` must preserve the current stop-playback-first path, exposed open-menu read-aloud path, flash cue, Enter/click activation sequence, and lowest-more-dots fallback.
  - more-dots and regenerate shortcuts should share named icon token constants and small action functions while preserving their distinct submenu tokens and excluded bottom-bar ancestor rules.
  - composer tool shortcuts should share a simple icon-action runner while preserving async `runActionByIcon(...)` behavior.
  - thinking/pro shortcuts should reuse one legacy thinking fallback helper while preserving the model-picker bridge-first behavior.
  - dictation toggle/cancel should become a private local module with shared composer-root, sprite-button lookup, visible-click, debounce, and cancel-only wait behavior.
- [x] Removed the obsolete shadowed `safeClick` helper scaffold that sat above the canonical shortcut helpers.
- [x] Preserved shortcut defaults, storage key names, model-picker internals, copy/export helpers, thread navigation, top-bar relocation, bottom gated features, animation timing, visual flash cues, and Chrome permissions.

## Completed implementation pass - model-picker name cache cleanup

- [x] Scoped this pass to the model-picker name/cache cluster inside `extension/content.js`.
- [x] Replaced ad hoc `__csp*` local helper names with clear local names:
  - `getModelTextWithoutHints(...)`
  - `ModelPickerNameCache.collectOpenMenuNames()`
  - `ModelPickerNameCache.persistFromOpenMenus(...)`
  - `ModelPickerNameCache.maybePersistFromOpenMenus()`
  - `ModelPickerNameCache.persistRange(...)`
- [x] Kept active-config inference as a nearby named helper, using the same text-without-hints behavior and `ModelLabels.inferActiveConfigFromMenuState` fallback.
- [x] Preserved the exact cache semantics:
  - remove shortcut hint spans before reading visible model labels
  - prefer DOM labels, then stable test-id labels, then index defaults for primary menu labels
  - keep the submenu trigger sentinel label
  - keep partial-menu merge behavior and complete-menu clearing behavior
  - keep the one-second duplicate-write throttle
  - keep range writes clearing the target range before applying normalized incoming names
- [x] Kept popup/runtime message behavior intact, especially `CSP_GET_MODEL_NAMES`, `CSP_SCRAPE_MODEL_CATALOG`, `CSP_RELEASE_MODEL_CONFIG_SESSION`, and `CSP_TRIGGER_MODEL_ACTION`.
- [x] Did not touch model-picker shortcut key handling, menu opening, scraping order, thinking-effort routing, visual hint timing, animation constants, manifest ordering, build packaging, or Chrome permissions.

## Completed implementation pass - model-picker hint controller cleanup

- [x] Scoped this pass to model-picker shortcut hint style injection, hint label add/remove, menu/listbox hint application, retry scheduling, click-triggered refresh, and mutation-observer refresh.
- [x] Replaced scattered hint functions and the loose observer/listener block with one named `ModelPickerHints` controller:
  - `ModelPickerHints.ensureStyle()`
  - `ModelPickerHints.applyOpenSelectListboxHints()`
  - `ModelPickerHints.apply()`
  - `ModelPickerHints.schedule(...)`
  - `ModelPickerHints.installInteractionListeners()`
- [x] Kept helper behavior local and traceable instead of creating generic "duplicate" abstractions:
  - primary model-menu hints still use slot actions from `getPrimaryMenuActionPairs(...)`
  - Configure Models listbox hints still use `getConfigureActionForOption(...)`
  - thinking-effort hints still use the distinct listbox/menu item ID readers
  - model-version submenu hints still use `getModelNameActionForMenuItem(...)`
  - Configure Models frontend row hints still use frontend row matching
- [x] Preserved timing and visual behavior by keeping existing delay constants, `requestAnimationFrame` scheduling, mutation-observer refresh conditions, `alt-hint` styling, and hint fade animation.
- [x] Preserved active-model persistence paths for direct menu clicks, Configure Models option clicks, and model-version submenu clicks.
- [x] Did not change shortcut key matching, model action execution, menu/select selectors, scrape order, popup message contracts, animation constants, manifest ordering, build packaging, or Chrome permissions.
- [x] Validated with `node --check extension/content.js`, `npx biome check extension/content.js`, focused model-picker fixture tests, `node tests/validate-keys.js`, and `git diff --check`.

## Completed implementation pass - model-picker scrape/session cleanup

- [x] Scoped this pass to the model-picker scrape/session cluster inside `extension/content.js`: hidden scrape UI state, prepared Configure Models sessions, integrated catalog scrape, Configure Models scrape, catalog persistence, and duplicated dynamic slot allocation.
- [x] Introduced a local `ModelPickerScrapeSession` boundary so scrape-only visibility and prepared-session lifecycle helpers are named together instead of scattered:
  - live scrape hide/restore
  - prepared dialog hide/restore
  - temporary hide-state wrapper
  - prepared Configure Models session get/set/release
- [x] Replaced the duplicated integrated/Configure dynamic slot allocation code with one canonical helper that preserves:
  - static catalog slots when valid and unused
  - non-catalog dynamic actions starting at slot 8
  - reserved catalog slots
  - duplicate-slot rejection
  - `MAX_SLOTS` bounds
- [x] Added a small catalog persistence helper shared by integrated and Configure scrape paths while preserving the integrated-only `activeModelConfigId` write.
- [x] Did not change scrape order, hidden UI behavior, storage keys, catalog schema, thinking-effort collection, frontend row collection, popup message contracts, shortcut execution, hint timing, animation constants, manifest ordering, build packaging, or Chrome permissions.
- [x] Validated with `node --check extension/content.js`, `npx biome check extension/content.js`, focused model-picker fixture tests, `node tests/validate-keys.js`, and `git diff --check`.

## Completed implementation pass - top-bar-to-bottom controller cleanup

- [x] Scoped this pass to the `TopBarToBottom Feature` IIFE inside `extension/content.js`.
- [x] Kept the IIFE and controller behavior, but separated static configuration from controller policy:
  - bottom-bar CSS payload
  - root/lane/row/left/center/right shell styles
  - static button IDs, labels, classes, styles, SVG assets, and insertion order
  - mutation/repair constants such as kept static button IDs and excluded route prefixes
- [x] Replaced fragile label-derived static button identity with explicit `STATIC_BUTTON_IDS`, shared classes/styles, and `ensureStaticButton` / `mountStaticButtons` helpers.
- [x] Kept shell creation and slot syncing readable by using named `ROOT_STYLE` and `SHELL_SLOT_STYLES` maps instead of large inline literals.
- [x] Centralized route exclusion checks in `EXCLUDED_ROUTE_RULES` without changing the excluded hosts or path prefixes.
- [x] Did not change bottom-bar layout, opacity, hover fade timing, injected controls, header hiding, disclaimer hiding, text ellipsis behavior, observer relevance, route exclusions, login-page gating, storage setting names, animation constants, manifest ordering, build packaging, or Chrome permissions.
- [x] Validated with `node --check extension/content.js`, `npx biome check extension/content.js`, `node tests/validate-keys.js`, and `git diff --check`.

## Completed implementation pass - final audit and closeout

- [x] Audited the remaining `content.js` surface after the four ambitious closeout passes against the stop rule.
- [x] Found no remaining behavior-safe, high-impact refactor candidate in the current plan scope:
  - main shortcut registry is now storage-key oriented
  - copy/export, edit/send-edit, thread navigation, shortcut action launchers, model picker, and top-bar relocation have named helper/controller boundaries
  - remaining large sections are either already cohesive IIFEs/controllers or would need a separate feature-spec rewrite
- [x] Cleaned up stale unused scaffolding left by earlier passes instead of creating more architecture work:
  - removed the unused id-prefix submenu helper chain
  - removed the unused model-picker test-id click compatibility helper
  - removed unused model-picker menu-order and Configure Models label-capture placeholders
  - removed the unused local active-model mirror while preserving `window.__activeModelConfigId` and persisted active-config tracking
- [x] Did not change shortcut bindings, selectors, action routing, storage keys, popup contracts, model catalog behavior, animation/visual cue timing, manifest ordering, build packaging, or Chrome permissions.
- [x] Validated with `node --check extension/content.js`, `npx biome check extension/content.js`, `node tests/validate-keys.js`, focused model-picker fixture tests, and `git diff --check`.

## Completed implementation pass - model-picker action runner cleanup

- [x] Scoped this pass to the model-picker action runner cluster inside `extension/content.js`, especially the old `openMenuForAction`/`executeModelAction` path, popup `CSP_TRIGGER_MODEL_ACTION`, and `runModelPickerShortcutSlot`.
- [x] Introduced one local `ModelPickerActionRunner` boundary that owns:
  - waiting for a target action in the visible model menu
  - completion callback de-duplication
  - prepared Configure Models session dispatch
  - integrated-effort fallback dispatch
  - configure-option/configure-open/configure-frontend-row dispatch
  - direct visible menu-item activation and post-click active-config persistence
- [x] Kept lower-level helpers behavior-specific and nearby; did not rename or merge Configure Models helpers, integrated model-name helpers, thinking-effort helpers, menu selectors, scrape helpers, or hint helpers in this pass.
- [x] Preserved exact behavior boundaries:
  - popup `CSP_TRIGGER_MODEL_ACTION` still returns `{ ok: true }` immediately after dispatch
  - digit shortcut usage analytics still run before action dispatch unless explicitly skipped
  - prepared Configure Models sessions are still preferred only for `configure-option` actions when requested
  - integrated-effort fallback still switches to latest, waits, clears menus, and replays the source slot
  - visible menu activation still flashes the target and bottom bar with existing delays
  - direct configure-frontend-row targets still prefer the visible menu item before opening Configure Models
- [x] Did not change shortcut key matching, action IDs, storage keys, fallback order, hint timing, animation constants, scrape order, popup contracts, manifest ordering, build packaging, or Chrome permissions.
- [x] Validated with `node --check extension/content.js`, `npx biome check extension/content.js`, focused model-picker fixture tests, `node tests/validate-keys.js`, and `git diff --check`.

## Validation

- [x] Run `node --check extension/content.js`.
- [x] Run `npx biome check extension/content.js`.
- [x] Run `node --check extension/content-gated-ui-features.js`.
- [x] Run `npx biome check extension/content-gated-ui-features.js`.
- [x] Run `node --check scripts/build-zip.js`.
- [x] Validate `extension/manifest.json` content-script order with `content-gated-ui-features.js` after `content.js`.
- [x] Sweep runtime files for stale paste markers and authoring seams.
- [x] Run `node tests/validate-keys.js`.
- [x] Run `node tests/model-picker-slot-uniqueness.mjs`.
- [x] Run `node tests/model-picker-thinking-effort-menu-fixture.mjs`.
- [ ] If copy/export behavior is refactored, manually smoke-test single-message select/copy and all-message select/copy with assistant-only, user-only, both, labels on/off, code blocks, and lists.
- [ ] If thread navigation behavior is refactored, manually smoke-test previous/next normal and preview-only shortcuts, including "Thought for" exclusion.
- [ ] If bottom gated features are extracted, manually smoke-test inline-code click copy, bold-text coloring, and Library pasted-file hiding with their settings enabled and disabled.
- [ ] Run focused model-picker tests only if a later pass touches model-picker bridge exports.

## Related specs

- [ ] `specs/0004-model-picker-and-shortcuts-spec.md`
