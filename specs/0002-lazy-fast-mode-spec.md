# Spec: Lazy Fast Mode

This file is the durable implementation reference for ChatGPT Custom Shortcuts Pro's experimental Fast Mode.

Temporary kill switches:
- `LAZY_FAST_MODE_FORCE_INERT` keeps runtime behavior inert without changing popup visibility.
- `LAZY_FAST_MODE_FULL_DISABLE` currently ships as `true`; it keeps Fast Mode inert, hides the popup toggle, and forces stored `lazyFastModeEnabled` opt-ins back to `false`.

Use it when Fast Mode breaks after ChatGPT changes and you need to understand:
- what is supposed to happen
- which files own which parts
- which runtime invariants matter
- where to probe first before changing code

This is not the live execution backlog. Keep live Fast Mode sequencing in the relevant file under `plans/`, not here.

## Purpose

Fast Mode speeds up very long ChatGPT conversations by:
- pruning the initial conversation payload before ChatGPT hydrates
- letting ChatGPT render a retained native window
- expanding that native window in place as older history is requested

The feature must keep ChatGPT itself as the renderer for older turns. Extension-owned fake older-message DOM is not the intended solution.

## Current shipping state

- Code-level full disable: `LAZY_FAST_MODE_FULL_DISABLE = true`
- While that flag is `true`:
  - Fast Mode must stay inert even if `lazyFastModeEnabled` was previously `true`
  - the popup toggle stays hidden
  - stored `lazyFastModeEnabled` should be forced back to `false`
- If the full-disable flag is later cleared:
  - Fast Mode is opt-in
  - storage key: `lazyFastModeEnabled`
  - default: `false`
  - popup placement:
    - after `moveTopBarToBottomCheckbox`
    - before `fadeSlimSidebarEnabled`
  - turning the setting on or off requires a ChatGPT tab reload to fully take effect because the bootstrap gate runs at `document_start`

## Main files

### `lazy-fast-bootstrap.js`

Owns the document-start gate.

Responsibilities:
- honor `LAZY_FAST_MODE_FORCE_INERT` / `LAZY_FAST_MODE_FULL_DISABLE` before storage-driven enablement
- read `chrome.storage.sync.lazyFastModeEnabled`
- set `globalThis.__CSP_ENABLE_LAZY_FAST_MODE`
- inject `lazy-fast-bridge.js` only when enabled

Important invariant:
- if this file does not inject the bridge, Fast Mode must stay completely inert on the page

Primary markers:
- global: `__CSP_ENABLE_LAZY_FAST_MODE`
- injected script id: `csp-lazy-fast-bridge`

### `lazy-fast-bridge.js`

Runs in page world.

Responsibilities:
- intercept the conversation fetch before ChatGPT hydrates
- prune the initial payload
- publish retained-window history metadata back to content world
- cache the full raw payload for later in-place expansion
- perform the in-place native expansion against ChatGPT's live conversation owners
- emit auto-expand intent from top-of-thread upward wheel input

Important invariant:
- this file owns the real page-world/native conversation mutation path

### `content.js`

Runs in content world.

Responsibilities:
- show the native Fast Mode banner
- manage manual and auto expansion requests
- store anchor/debug state in `sessionStorage`
- preserve scroll position during busy, reveal, and settle
- handle the fallback reload path for `Load full conversation natively`

Important invariant:
- this file does not own older-turn rendering; it only controls UI, anchors, and request orchestration

### Settings wiring

- `options-storage.js`
  - `OPTIONS_DEFAULTS.lazyFastModeEnabled = false`
- `settings-schema.js`
  - `content.visibilityDefaults.lazyFastModeEnabled = false`
- `popup.js`
  - `DEFAULT_PRESET_DATA.lazyFastModeEnabled = false`
- `popup.html`
  - opt-in switch row (hidden while `LAZY_FAST_MODE_FULL_DISABLE` is `true`)

This is what makes the setting work with:
- first-run defaults
- import/export
- cloud restore/save
- legacy installs

## Active runtime path

There are old disabled Fast Mode proof blocks in `content.js`.

The current live native controller is the block that starts with:
- comment: `Lazy Load Fast Mode native manual expansion proof`

The earlier `Lazy Load Fast Mode history surface` block is disabled and is not the live feature.

When troubleshooting, start with the active native block, not the old disabled surface block.

## Data flow overview

### 1. Initial page load

1. `lazy-fast-bootstrap.js` runs at `document_start`.
2. If `lazyFastModeEnabled` is false:
   - `__CSP_ENABLE_LAZY_FAST_MODE = false`
   - bridge is not injected
   - feature is inert
3. If enabled:
   - bootstrap injects `lazy-fast-bridge.js`
4. The bridge intercepts `/backend-api/conversation/:id`.
5. The bridge prunes the payload to the retained native window.
   - ordinary reloads reset to the default retained window (`24`)
   - a larger retained window is only honored for the immediate expansion reload when a valid pending anchor exists for that conversation
6. The bridge publishes history metadata into page DOM/state.
7. `content.js` reads that metadata and mounts the native banner.

### 2. Manual older-history expansion

1. User clicks `Load older natively`.
2. `content.js` stores the visible native anchor:
   - turn id
   - offset inside the real scroll root
3. `content.js` records the next retained count and enters busy state.
4. `content.js` posts an in-place expand request to page world.
5. `lazy-fast-bridge.js` uses the cached full raw payload to:
   - reconstruct the missing grouped turns
   - prepend the raw message chain into the live tree
   - patch the mounted turn window / selector source
6. The bridge republishes updated history metadata and sends an expand result.
7. `content.js` waits until the larger retained window is ready, then settles the viewport without losing the reading position.

### 3. Full native load

`Load full conversation natively` still uses the reload fallback path.

That is intentional.

Important reset rule:
- a full native load is one-shot
- if Fast Mode remains enabled, a later normal reload should return to the default Fast Mode retained window instead of staying fully expanded

Current target UX:
- older batch loads: in-place native expansion
- full conversation load: reload fallback is still allowed

### 4. Auto upward expansion

Auto expansion uses the same native controller as the manual older button.

The bridge emits top-of-thread intent when:
- wheel event is upward
- real scroll root is near top
- cooldown allows a new request

`content.js` receives that intent and routes it through the same request path as the button.

## Core constants and semantics

### Retained window

- default retained turn count: `24`
- older load batch size: `40`
- bridge min-turn threshold for trimming: `40`

### Scroll / reveal

- actual scroll root is ChatGPT's internal overflow container, not `window`
- content-side cooldown: `1500ms`
- bridge auto-intent cooldown: `1200ms`
- bridge top threshold: `24px`

## Session and message channels

### `sessionStorage` keys

- retained count:
  - `csp_lazy_fast_retained_turn_count:<conversationId>`
  - content-side requested count/debug state
  - not authoritative for ordinary reloads by itself
- pending anchor:
  - `csp_lazy_fast_restore_anchor:<conversationId>`
  - authoritative proof that the next reload is an expansion reload for that conversation
- debug snapshot:
  - `csp_lazy_fast_debug:<conversationId>`

### DOM ids

- bridge script:
  - `csp-lazy-fast-bridge`
- history payload node:
  - `csp-lazy-fast-history-data`
- banner root:
  - `csp-lazy-fast-native-banner`

### `window.postMessage` sources

- history payload:
  - `csp-lazy-fast-history`
- manual/native expand request:
  - `csp-lazy-fast-expand-request`
- expand result:
  - `csp-lazy-fast-expand-result`
- auto intent:
  - `csp-lazy-fast-auto-expand-intent`

These names matter. If they drift across bridge/content code, Fast Mode breaks.

## The actual in-place native owner path

This is the important part future troubleshooting should start from.

The working path was discovered by live investigation against ChatGPT's mounted React tree and conversation stores.

### What was not sufficient by itself

These paths were real but incomplete:
- router `revalidate()`
- plain loader data
- tree mutation alone
- turn-array mutation alone
- hook cache mutation alone
- compiler child-cache mutation alone

Those paths helped identify the boundary, but none of them alone reliably produced native in-place expansion.

### What the live working path became

The working in-place expansion path in `lazy-fast-bridge.js` combines:

1. full raw payload cache
2. live tree prepend
3. live mounted turn-array insertion
4. selector-source reconciliation
5. owner dispatch

More concretely:

- `performInPlaceExpansion(...)`
  - finds the mounted owner context
  - reconstructs the missing older turns from the cached full raw payload
  - prepends the missing raw message nodes into the live `Ys` tree with `tree.prependNode(...)`
  - inserts grouped turn objects into the mounted `turnArray`
  - patches the current selector tuple / hook state

- `reconcileRenderedWindowWithTurnArray(...)`
  - rebuilds the selector tuple from the updated turn array
  - overrides the selector source in compiler cache slot `1`
  - resets cache rows `13`, `15`, `26`, `27`
  - updates hook `4` tuple state and related refs
  - dispatches owner hook `18`

This selector-source override was the deterministic gate that stopped the stale `25`-item retained window from winning over the expanded turn array.

If future ChatGPT updates break Fast Mode, this is the first architectural seam to inspect.

## Scroll preservation model

### Why earlier anchor-only restores were not enough

Anchor-only restore could still feel wrong on prepends because:
- ChatGPT's real scroll root is not `window`
- prepend changes scroll range while the same content should stay in view
- late layout growth after render can shift the viewport again

### Current model

The current shipped model preserves distance-from-bottom through all phases.

#### Busy phase

When an older-load starts:
- capture:
  - `oldScrollTop`
  - `oldScrollHeight`
  - `oldClientHeight`
  - `oldMaxScrollTop`
  - `distanceFromBottom`
- start a busy-phase distance lock

This prevents temporary scroll-range shrinkage from snapping the viewport upward while the spinner is shown.

#### Reveal / settle phase

When the larger retained window is ready:
- prefer measured height-delta / distance-from-bottom compensation
- use anchor math only as fallback

#### Post-reveal phase

After reveal:
- apply the post-reveal distance lock immediately
- keep the busy state alive for one more animation frame
- only then clear busy

This prevents the one-frame handoff snap that previously appeared when busy cleared too early.

### Result that should now hold

On working threads:
- position should remain stable during busy
- remain stable when busy clears
- remain stable after late layout growth
- remain stable on repeated `24 -> 64 -> 104 ...` steps

## Feature-off expectations

When `lazyFastModeEnabled = false`, Fast Mode should be inert.

Expected page state:
- no bridge script element
- no history data node
- no native Fast Mode banner
- no Fast Mode debug key writes
- no retained count writes
- no page-world bridge installation

If any of those still appear while the toggle is off, the feature is not truly inert.

## Troubleshooting checklist

### A. Toggle is on, but there is no banner

Check in this order:

1. `chrome.storage.sync.lazyFastModeEnabled === true`
2. page reloaded after toggle change
3. `window.__CSP_ENABLE_LAZY_FAST_MODE === true`
4. `#csp-lazy-fast-bridge` exists
5. `#csp-lazy-fast-history-data` exists
6. page is a `/c/<conversationId>` route

If steps 1-3 fail, the problem is the bootstrap gate, not the expand logic.

### B. Banner exists, but initial thread is not trimmed

Check:

1. bridge installed console log
2. whether the conversation request is still being intercepted
3. whether the total turn count is above trim threshold
4. whether published history data shows `keptStartIndex > 0`

If the request is no longer interceptable, the bridge fetch hook likely broke.

### C. Older button does nothing

Check:

1. debug key:
   - `lastRequestSource`
   - `lastRequestRetainedTurnCount`
   - recent `events`
2. retained count key written to next value
3. expand result message received
4. bridge full payload cache available for this conversation
5. any `render_window_reconcile_timeout` or similar error in debug/result

If debug shows request and retained count but DOM does not grow, inspect the selector-source reconcile path first.

### D. Scroll jumps again

Check:

1. real scroll root resolution from `getScrollableContainer()`
2. busy-phase distance lock
3. post-reveal distance lock
4. whether busy clears before the first locked reveal frame

If busy or reveal logic regresses, the issue is usually in content world, not bridge world.

### E. Toggle off still leaves Fast Mode behavior behind

Check:

1. was the ChatGPT tab reloaded after turning the toggle off
2. is `lazy-fast-bootstrap.js` still injecting
3. did a stale page keep the old bridge script alive from before the setting change

Fast Mode gating is document-start driven. A live tab can keep old page-world state until reload.

## Troubleshooting probes worth keeping

These are the quickest high-signal probes:

- Popup/storage:
  - inspect `lazyFastModeEnabled`
- Page DOM:
  - `#csp-lazy-fast-bridge`
  - `#csp-lazy-fast-history-data`
  - `#csp-lazy-fast-native-banner`
- Session storage:
  - retained key
  - anchor key
  - debug key
- Page globals:
  - `__CSP_ENABLE_LAZY_FAST_MODE`
  - `__cspLazyFastBridgeInstalled`

## Known durable constraints

- Do not reintroduce extension-owned custom-rendered older-message DOM as the main solution.
- Do not add permissions for Fast Mode without explicit approval.
- Keep `Refresh Models` safe; Fast Mode must not silently interfere with model scrape/action paths.
- Manual older expansion and auto top-of-thread expansion should continue to share the same native controller.
- The feature must stay fully inert unless the opt-in setting is enabled.

## Reference validation states

These are the simplest meaningful checks after Fast Mode edits:

### Off-state check

- enable setting: `false`
- reload ChatGPT conversation
- expect:
  - no banner
  - no bridge script
  - no history node
  - no retained/debug writes

### On-state baseline check

- enable setting: `true`
- reload ChatGPT conversation
- expect:
  - banner visible
  - `latest 24 of N turns`
  - native turn count `24`

### One-step expand check

- click `Load older natively`
- expect:
  - same-document expansion
  - banner updates to `latest 64 of N turns`
  - native turn count grows
  - reading position preserved

### Repeat-step check

- wait past cooldown
- click `Load older natively` again
- expect:
  - `64 -> 104`
  - no post-busy snap
  - position preserved

## When to update this file

Update this reference when any of these change:
- the toggle key or toggle semantics
- the bootstrap/bridge/content file split
- the message channel names
- the retained-window algorithm
- the working owner/reconcile path
- the scroll preservation model
- the recommended troubleshooting order
