# Extension Load Path And Bottom Bar Startup

## Mission-Critical Findings

- Non-popup reload menu thrash root cause was the reload-time auto-restore block in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L7720). That should stay removed.
- `moveTopBarToBottomCheckbox` startup is currently delayed by stacked waits in [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5265):
  - `gateIfLoginButtonPresent()` can wait up to about 5s (`25 * 200ms`) before doing anything.
  - after that there is an extra `setTimeout(..., 500)` at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5313).
  - then another `setTimeout(..., 500)` at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5370) before `runMoveTopBarLogic()`.
  - then `waitForElement()` polls every `200ms` up to `12s` for header/composer pieces at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5315).
- The late-appearance symptom after opening the popup is plausibly explained by the body-wide reinject observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5375). Popup open causes DOM mutations, which can trigger `runMoveTopBarLogic()` and finally inject the bar.
- The enabled bottom-bar path also adds several broad observers/scans that should be audited for load impact:
  - duplicate-button observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5928)
  - disclaimer observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L5965)
  - composer-label stripping observer at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L6016)
- There is also a broad `chrome.storage.sync.get(null)` on page load at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L1259) just to rehydrate arrow-button-related visibility state. This is a candidate to narrow.

## Likely Root Causes

- The bottom-bar feature is not late because the popup “fixes” it; it is late because its own startup path is overly serialized and mutation-driven.
- The current implementation mixes:
  - slow polling gates
  - extra fixed delays
  - whole-body mutation reinjection
- That combination makes initial inject timing nondeterministic and can make unrelated UI activity appear to “unstick” the feature.

## Implementation Checklist

- Remove the stacked fixed delays from the enabled bottom-bar startup path.
- Replace the login-button polling gate with a cheap immediate check plus a short bounded retry/observer only if needed.
- Replace `waitForElement(..., 12000, 200)` polling for header/composer with a targeted observer/RAF gate that exits as soon as the required nodes exist.
- Make initial bottom-bar injection happen from one deterministic startup path, not from “wait and hope a later body mutation wakes it up.”
- Keep reinjection only for true invalidation cases:
  - header/composer node replaced
  - injected bar removed
  - route changes that still support the feature
- Narrow or gate broad observers/scans under `moveTopBarToBottomCheckbox` so they do not all wake during initial page load.
- Narrow `chrome.storage.sync.get(null)` at [content.js](C:/Users/bwhurd/Dropbox/CGCSP-Github/content.js#L1259) to only the keys actually needed there.

## Focused Next Investigation

- Measure whether the 5s login gate is hit on normal authenticated ChatGPT reloads, or whether it usually exits early but still leaves the extra `500ms + 500ms + poll` chain.
- Verify whether the popup open mutation is what triggers the late reinject observer in practice.
- Check whether `#page-header` and `form[data-type='unified-composer']` are already present well before the current delayed startup even tries to inject.
- If so, refactor to:
  - fast path: inject immediately when nodes already exist
  - slow path: short-lived observer until nodes appear
  - no long polling loops and no unconditional half-second delays
