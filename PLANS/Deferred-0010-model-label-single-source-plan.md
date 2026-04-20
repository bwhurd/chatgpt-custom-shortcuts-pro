# Model Label Single Source Of Truth Plan

## Verdict
- The more robust source is the canonical action id, not the visible scraped label.
- For slot `5`, the config combo option value `5.0` tied to action id `configure-5-0-thinking-mini` is more stable than the frontend row text `Thinking mini`.
- The current bug happened because one path stored the frontend row label and another path implicitly expected the canonical display label.

## Current mismatch
- `content.js` manual catalog scrape collects frontend row labels via `collectConfigureFrontendRows(...)`.
- Those labels are later flattened by `deriveFlatModelNamesFromCatalog(...)`.
- `shared/model-picker-labels.js` currently normalizes labels late with `normalizeStoredActionName(slot, value)`.
- That means we still have multiple sources feeding the final stored name:
  - config combo option label
  - frontend row label
  - late slot-based normalization

## Single source of truth goal
- Every model action should have one canonical popup-facing display label in `shared/model-picker-labels.js`.
- Scrape paths should persist:
  - stable action id
  - raw observed label only as optional metadata
- Final displayed/stored actionable label should come from one shared resolver based on action id, not from whichever scrape path ran.

## Recommended approach
1. Add one shared canonical label resolver in `shared/model-picker-labels.js`.
   - Input: action id plus optional raw observed label.
   - Output: final canonical display label.
   - Example:
     - `configure-5-0-thinking-mini` => `5.0 Thinking Mini`
     - `configure-latest` => `Latest`
     - `configure-5-2` => `5.2`
     - `configure-o3` => `o3`
     - `instant` => `Instant`
     - `thinking` => `Thinking`

2. Stop using slot-based name normalization as the main contract.
   - `normalizeStoredActionName(slot, value)` is a patch layer.
   - Replace or wrap it with action-id-based normalization.

3. Change manual scrape row collection to normalize at collection time.
   - In `collectConfigureFrontendRows(...)`, after `actionId` is known, resolve the canonical label immediately from shared logic.
   - Store raw observed text separately only if useful for debugging/future DOM drift.

4. Change catalog flattening to trust action ids first.
   - In `deriveFlatModelNamesFromCatalog(...)`, use action id -> canonical label.
   - Do not let frontend row text overwrite a canonical action label for known actions.

5. Keep raw observed labels only as secondary metadata.
   - Useful for future diagnostics if ChatGPT changes wording.
   - Not the source of truth for popup-facing model names.

## Implementation checklist
- Add shared `getCanonicalActionLabel(actionId, observedLabel?)` helper in `shared/model-picker-labels.js`.
- Update `resolveActionableNames(...)` to use canonical action labels for known action slots.
- Update `collectConfigureFrontendRows(...)` in `content.js` to persist canonical labels by action id.
- Update `deriveFlatModelNamesFromCatalog(...)` in `content.js` to derive names from action ids, not from whichever raw text arrived.
- Keep popup rendering unchanged except that it now consumes stable canonical labels from the same shared resolver.

## Expected outcome
- Manual refresh and normal click-through extraction produce the same final label for slot `5`.
- Future label drift is easier to manage because there is one canonical resolver in one file.
- Fixes like `Thinking mini` vs `5.0 Thinking Mini` will not require patching multiple places.
