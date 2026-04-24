# ChatGPT Load Follow-Up Plan

- Latest controlled benchmark file:
  - `test-results/playwright/chatgpt-scenario-results.json`

- Current measurement setup:
  - uses live logged-in Chrome Dev CDP browsers
  - compares:
    - `extension_not_loaded`
    - `extension_loaded_moveTopBarToBottomCheckbox_false`
    - `extension_loaded_moveTopBarToBottomCheckbox_true`
  - clears browser cache and disables cache for each measured reload
  - uses a fresh visible browser window for each measured conversation run
  - inserts idle gaps before and after runs to reduce local CPU/RAM churn confounds
  - keeps cookies/session/login intact

- Current useful signals:
  - `largestContentfulPaint`
  - `visualSettleMs`
  - `extensionDetected`
  - `bottomBarReady`

- Known confounds still present:
  - ChatGPT is a SPA, so `loadEventEnd` / `domComplete` are not useful here
  - LCP is noisy across runs and can shift based on what element becomes largest
  - mutation-quiet settle is better than nav timing, but still not a perfect “conversation fully usable” marker
  - sidebar/project/chat list rendering can vary between runs
  - same live browser session may still preserve non-cache in-memory app state

- Current comparison takeaway:
  - `moveTopBarToBottomCheckbox=false` looks slightly slower than plain on this sample
  - `moveTopBarToBottomCheckbox=true` does not look catastrophically slower, but it appears to extend visual settle time materially
  - use repeated passes + medians before treating that as a confirmed regression

- Mission-critical next test changes if deeper load analysis is needed:
  - run 3 repeated passes per scenario and compare medians, not single runs
  - capture a simple DOM-ready marker for the target conversation body instead of relying on navigation timing
  - capture bottom-bar attach time separately from first meaningful conversation render time
  - keep the same target conversations:
    - `ShortConversationTest`
    - `MediumConversationTest`
    - `LongConversationTest`

- Code investigation priorities if extension slowdown is confirmed:
  - profile the earliest `content.js` startup work before bottom-bar initialization
  - measure when `csp-hide-disclaimer-style` appears versus when bottom-bar code starts
  - isolate bottom-bar observer/reinjection work from unrelated startup features
  - compare `moveTopBarToBottomCheckbox=false` against a build with bottom-bar code short-circuited entirely
