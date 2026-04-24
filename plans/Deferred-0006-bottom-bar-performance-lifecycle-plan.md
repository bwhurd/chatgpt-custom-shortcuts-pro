# Bottom Bar Performance And Lifecycle Optimization

## Goal

Make `moveTopBarToBottomCheckbox` start faster, do less work during slow page loads, and stay robust across ChatGPT remounts without visible double-load behavior.

## Current Findings

- The startup path is improved, but it still uses several independent timing and observer layers in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5610):
  - `scheduleStartupVerificationPasses`
  - `scheduleRunMoveTopBarLogic`
  - `schedulePromoteToSteadyBottomBarObserver`
  - root-level startup and steady-state mutation observers
- `waitForMoveTopBarTargets` in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5504) still watches `document.documentElement` with `subtree: true` and `attributes: true`. That is bounded, but it is still one of the heaviest startup watchers in the feature.
- `injectBottomBar` in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5859) still performs repeated layout work:
  - `getComputedStyle(composerContainer).width`
  - `clientWidth`
  - `scrollWidth`
  - transform scaling
  - repeated `requestAnimationFrame` scale passes
- The feature still installs multiple follow-up observers after startup:
  - startup bottom-bar observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5765)
  - steady bottom-bar observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5803)
  - duplicate-button observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6348)
  - disclaimer observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6418)
  - composer-label observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6471)
- A new `ResizeObserver` and `window.resize` listener are attached from [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5946), but there is no explicit cleanup when the composer container is replaced.
- The no-bottom-bar path still has its own broad disclaimer observer in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6528), so disclaimer logic is duplicated and inconsistent between enabled and disabled states.
- `placeModelSwitcherInCenter` in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5675) still searches the full document across multiple selectors on each placement attempt.

## Inspector-Validated Structure Findings

- The large inspector dump confirms that the relevant mount roots are more specific than the current startup path assumes:
  - `#page-header` is present as a sticky sibling near the top of the scroll-root in [_temp-files/inspector-captures/header_thread_composer_HTML_from_inspector_big_file.txt](C:/Users/bwhurd/Dropbox/CGCSP-Github/_temp-files/inspector-captures/header_thread_composer_HTML_from_inspector_big_file.txt)
  - `#thread-bottom-container` is a sticky bottom container that already wraps the composer and disclaimer
  - `#thread-bottom` sits directly inside `#thread-bottom-container`
  - `form[data-type="unified-composer"]` is inside `#thread-bottom`
- The inspector dump also shows the disclaimer lives as a direct descendant under the same `#thread-bottom-container` region, after the composer block, not arbitrarily anywhere in the document.
- The model switcher button is present directly under `#page-header` with:
  - `aria-label="Model selector"`
  - `data-testid="model-switcher-dropdown-button"`
- The current composer surface already exposes `data-composer-surface="true"` in the inspector HTML, which is likely a better sizing/styling anchor than generic descendant class lookups.
- `#conversation-header-actions` exists as a stable id inside the header, which means several current full-document queries can likely be scoped to `#page-header` first.
- The inspector dump shows the composer structure is shallow and stable enough that observation can likely attach to:
  - `#thread-bottom-container`
  - `#thread-bottom`
  - `form[data-type="unified-composer"]`
  instead of broader document roots.

## Likely Remaining Cost Centers

- Whole-document mutation watching during startup and during invalidation recovery.
- Layout thrash from width measurement and transform scaling during initial attach.
- Orphaned or duplicate observers/listeners after composer/header replacement across a long SPA session.
- Redundant post-startup helper observers that could be consolidated or replaced with CSS/static selectors.

## Optimization Plan

### 1. Build A Single Bottom-Bar Controller

- Replace the current loose collection of startup flags, timers, and observers with one controller object local to the feature.
- Give it explicit phases:
  - `idle`
  - `booting`
  - `mounted`
  - `recovering`
- Centralize cleanup for:
  - mutation observers
  - resize observers
  - `window.resize` listener
  - delayed timers
- Justification:
  The current feature works through several separate closures and timers. A single controller makes it much easier to guarantee that only one active startup path exists at a time.

### 2. Narrow Target Discovery To Real Mount Parents

- Replace the `document.documentElement` attribute observer in `waitForMoveTopBarTargets` with a shorter-lived strategy:
  - fast path: immediate synchronous query
  - startup path: observe only the nearest stable parents that can actually receive `#page-header` and the unified composer
  - fallback: a short bounded `requestAnimationFrame` retry window only while the target parent exists but descendants are still settling
- Justification:
  The current root observer is bounded but still broad. Narrowing the observation root is the clearest remaining startup optimization.

### 2A. Use Inspector-Backed Stable Anchors

- Rework target lookup to prefer this path:
  - `#page-header`
  - `#thread-bottom-container`
  - `#thread-bottom`
  - `form[data-type="unified-composer"]`
- Replace generic composer-container fallback logic with explicit inspector-backed anchors:
  - prefer `[data-composer-surface="true"]`
  - fallback to the form only if the surface node is absent
- Scope disclaimer logic to `#thread-bottom-container` and its immediate descendants, since the inspector dump shows that is where the warning lives in the active layout.
- Scope header action lookups to `#page-header` and `#conversation-header-actions` before any document-wide fallback.
- Justification:
  The inspector HTML shows we can be more specific than the current implementation. Tighter selectors reduce both query cost and accidental wakeups from unrelated DOM churn.

### 3. Remove Transform-Scale Startup Work If CSS Can Own Layout

- Audit whether the bottom bar can use normal flex sizing, truncation, and `width: 100%` without the current transform scaling loop.
- If full removal is not safe, reduce scaling work to:
  - one initial pass after mount
  - one pass on `ResizeObserver`
  - no recursive RAF loop
- Justification:
  Repeated width and scroll measurements are likely the biggest remaining layout cost in the feature.

### 4. Stop Re-Querying The Whole Document For Model Switcher Placement

- Cache the active model-switcher button/group once it is found.
- Re-scope later queries to:
  - `#page-header`
  - `#bottomBarContainer`
- Prefer `#page-header [data-testid="model-switcher-dropdown-button"]` and `#page-header [aria-label^="Model selector" i]` before any broad fallback.
- Only fall back to document-wide search if both scoped lookups fail.
- Justification:
  `placeModelSwitcherInCenter` currently pays for several full-document queries when a much smaller search surface is available.

### 5. Consolidate Post-Startup Helper Observers

- Review whether the duplicate-button observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6348) is still needed now that strong CSS hiding rules already exist in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6249).
- If JS is still needed, fold duplicate-button, disclaimer, and composer-label upkeep into a single container-scoped observer/controller instead of three separate ones.
- Use the actual structure from the inspector dump to scope that controller to:
  - `#thread-bottom-container` for disclaimer upkeep
  - `form[data-type="unified-composer"]` for composer-label upkeep
  - `#bottomBarContainer` for duplicate-button cleanup
- Justification:
  These helpers are smaller than the startup path, but together they keep the enabled feature “warm” longer than necessary.

### 6. Add Explicit Teardown On Route/Target Replacement

- When the composer container or header source nodes are replaced, explicitly:
  - disconnect old observers
  - unobserve old resize targets
  - remove old `window.resize` handlers tied to dead nodes
  - reinitialize from a clean controller state
- Justification:
  Without explicit teardown, long-lived ChatGPT SPA sessions can accumulate invisible work even if startup itself is fast.

### 7. Unify Disclaimer Handling Across Enabled And Disabled Modes

- Move disclaimer detection/hiding into one shared helper used by both:
  - the enabled bottom-bar path
  - the disabled path
- Replace both broad body-level disclaimer observers with the same narrowly filtered implementation rooted at `#thread-bottom-container` when present, with a bounded document fallback only when that container is absent.
- Justification:
  This reduces duplicate logic and lowers the chance of regressions where one path works and the other does not.

### 7A. Prefer Structural Ids Over Text/Styling Heuristics

- Replace any remaining descendant or style-driven anchoring in this feature with structural selectors validated by the inspector dump:
  - `#page-header`
  - `#conversation-header-actions`
  - `#thread-bottom-container`
  - `#thread-bottom`
  - `form[data-type="unified-composer"]`
  - `[data-composer-surface="true"]`
- Keep text-based disclaimer matching only for the warning content itself, not for placement.
- Justification:
  Structural ids and data attributes are both cheaper and less fragile than style/class heuristics for this feature.

### 8. Add Lightweight Dev-Only Timing Markers

- Add a temporary dev flag that records:
  - first target discovery time
  - first bottom-bar mount time
  - recovery count
  - observer promotion time
- Keep it off by default and easy to remove after the refactor.
- Justification:
  This feature is already in the “close enough that small regressions matter” stage. A short measurement pass will keep the next optimization round grounded.

## Suggested Execution Order

1. Build the single controller and teardown model.
2. Narrow target discovery roots using the inspector-backed anchors.
3. Replace generic composer-container selection with `[data-composer-surface="true"]` plus explicit fallbacks.
4. Remove or simplify transform-scaling startup work.
5. Consolidate helper observers.
6. Unify disclaimer logic.
7. Add temporary timing markers and do a reload/recovery verification pass.

## Acceptance Criteria

- The feature mounts with one visually stable handoff on normal reloads.
- Slow page loads do not trigger repeated visible rebuilds.
- After stable mount, no broad startup observer remains attached.
- Composer/header replacement tears down old observers before new ones are attached.
- The enabled feature path uses fewer active observers/listeners than the current implementation.
- The feature still recovers when the header/composer is genuinely remounted or the injected bar is removed.
