# Hard Stop Before Model Scrape

## Mission-Critical Notes
- Problem: the popup was still relying on timing guesses (`setTimeout` + nested `requestAnimationFrame`) to *probably* show the blur before the popup-open scrape starts.
- In a Chrome extension popup, that is still race-prone because the blur node can exist in the DOM before the browser has actually finished transitioning it into the painted state.
- Chosen fix: make the loading overlay itself the hard gate.
  - Mount the overlay first.
  - Force layout so the browser acknowledges the starting state.
  - Add a visible class on the next frame.
  - Do not send `CSP_SCRAPE_MODEL_CATALOG` until the overlay's `opacity` transition finishes.
- Keep a timeout fallback because `transitionend` will not fire if the transition is canceled or removed.
- Keep the implementation local to `popup.js` + `popup.css`; do not add more background/content-script flags.

## Research Notes
- MDN `requestAnimationFrame()`:
  - It runs a callback before the next repaint, which is the right place to arm the visibility class change after the overlay exists.
  - Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN `transitionend`:
  - It fires when the CSS transition completes; this is the clean browser event to use as the hard stop before starting scrape work.
  - It will not fire if the transition is removed/canceled, so a timeout fallback is required.
  - Source: https://developer.mozilla.org/en-US/docs/Web/API/Element/transitionend_event
- Stack Overflow discussions on transitions for newly inserted elements consistently recommend:
  - append element
  - force layout / reflow
  - then change the class/style in a later frame/task so the transition actually runs instead of racing layout
  - Representative discussion: https://stackoverflow.com/questions/12088819/css-transitions-on-new-elements

## Implementation Checklist
- Add a real opacity/transform transition to `.mp-grid-loading-overlay`.
- Keep the overlay hidden by default until the gate arms it.
- Replace the old "double rAF + fixed sleep" gate with:
  - wait for grid
  - wait for overlay node
  - force layout
  - add visible class on next frame
  - await `transitionend` on `opacity`
  - fallback to a short timeout if needed
- Leave the rest of the scrape flow unchanged.
