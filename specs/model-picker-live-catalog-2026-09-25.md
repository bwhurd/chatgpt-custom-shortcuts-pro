# Live model-picker catalog — 2026-09-25

Observed on the authenticated `https://chatgpt.com/` blank composer in Chrome profile Brian, tab `1353716837`. Inspected rendered DOM through the connected Chrome extension. Scanned Chat first, then Work; selected each model and walked its finite slider range using native arrow-key input. No messages sent, popup refresh invoked, or extension code changed. These are this account's current options, not hardcoded universal inventories. The installed Custom Shortcuts Pro build identity is not yet verified.

## Common menu cascade and language-independent targets

```html
<div role="group">                       <!-- visible blank-composer mode group -->
  <button aria-pressed="true">Chat</button> <!-- first direct button -->
  <button aria-pressed="false">Work</button><!-- second direct button -->
</div>
<button data-codex-intelligence-trigger="true"
        data-composer-navigation-target="reasoning"
        data-selected-reasoning-effort="high"
        aria-haspopup="menu" aria-expanded="true" id="radix-…" />
<div role="menu" data-radix-menu-content data-state="open"
     aria-labelledby="radix-…">           <!-- associated with that pill -->
  <div data-model-picker-view="simple|advanced">
    <div data-active="true|false" aria-hidden="false|true" inert?>
      <!-- Simple panel -->
      <div role="menuitem" data-model-picker-view-toggle="true"
           data-interactive="true">      <!-- click once to expose Advanced -->
        <span data-effort-only="true|false" data-accent="…"
              data-maximum="…">effort label</span>
      </div>
      <div role="menuitem" data-reasoning-slider="true"
           aria-keyshortcuts="ArrowLeft ArrowRight" aria-describedby="…">
        <div data-model-picker-power-slider>
          <span role="slider" aria-valuemin="0" aria-valuemax="…"
                aria-valuenow="…" aria-hidden="true" />
        </div>
      </div>
      <span role="status" aria-live="polite">High, 3 of 3.</span>
    </div>
    <div data-active="true|false" aria-hidden="false|true" inert?>
      <!-- Advanced panel: ordered direct model rows, no nested Model submenu -->
      <div role="menuitemradio" aria-checked="true|false" data-model-selected?>
        <div data-menu-row-content="true">
          <span class="… truncate">model title</span>
          <!-- alternatively a div containing title span then description span -->
        </div>
      </div>
    </div>
  </div>
</div>
```

- Identify the mode group by visible blank-composer location, exactly two direct `button[aria-pressed]` children, and reciprocal state; exclude sidebar groups. It is no longer a header radio group. Button order selects Chat/Work without matching localized labels.
- Open the pill, assert `data-model-picker-view="simple"`, click `[data-model-picker-view-toggle="true"]`, then assert `advanced` and its active, non-inert panel before reading rows. Both panels remain mounted; global radio queries include inactive rows.
- Selecting an Advanced model row leaves this picker open and returns it to Simple. The view-toggle has **no `aria-expanded` attribute** now.
- Read the model title from the row-content primary span (direct span, or first span of its direct title/description wrapper). Exclude descriptions, icons, and extension hints. Never read the central toggle's combined model/effort text as a model inventory.
- The slider thumb is `aria-hidden`; the operable keyboard target is `[data-reasoning-slider="true"]`, not that thumb. Read min/max/current index and the linked status after each native arrow step. Display effort text is separately available on the toggle's `span[data-effort-only]`; the pill exposes its semantic effort token.

## Chat inventory

| Native model order | Slider indexes | Effort labels in index order |
| --- | --- | --- |
| GPT-5.6 Sol | 0–2 | Instant, Medium, High |
| GPT-5.5 | 0–2 | Instant, Medium, High |

GPT-5.5 has a separate `Leaving on October 14` description. Its central toggle includes a `5.5` badge before the effort label; neither belongs in effort identity. No Default, speed, or reset controls were observed in Chat during this scan.

## Work inventory

| Native model order | Slider indexes | Effort labels in index order |
| --- | --- | --- |
| Default (not an explicit model) | 0–4 | See recommended-pair table below |
| GPT-6 Astra | 0–4 | Light, Medium, High, Extra High, Max |
| GPT-6 Sol | 0–4 | Light, Medium, High, Extra High, Max |
| GPT-6 Luna | 0–4 | Light, Medium, High, Extra High, Max |
| GPT-5.6 Sol | 0–4 | Light, Medium, High, Extra High, Max |
| GPT-5.6 Terra | 0–4 | Light, Medium, High, Extra High, Max |
| GPT-5.6 Luna | 0–4 | Light, Medium, High, Extra High, Max |
| GPT-5.5 | 0–3 | Light, Medium, High, Extra High |

Explicit Work effort tokens observed: `low`, `medium`, `high`, `xhigh`, `max`. GPT-5.5 has no Max. Its leaving-date description is not part of its title.

Default has a `Recommended set of models` description and a distinct native radio identity. Its slider moves through recommended **model/effort pairs**, not one model's effort range:

| Index | Selected pair |
| --- | --- |
| 0 | GPT-6 Luna / High |
| 1 | GPT-6 Sol / Light |
| 2 | GPT-6 Sol / Medium |
| 3 | GPT-6 Astra / Light |
| 4 | GPT-6 Astra / Medium |

Keep this recommendation mapping separate. Do not deduplicate it by effort label or replace the seven explicit model rows with the currently displayed recommended model.

## Work utilities and extension entry point

- Speed: `[role="menuitemcheckbox"][data-fast-mode-enabled]`, with `aria-checked` and `data-fast-mode-enabled`; observed in the active Simple panel. Record availability separately from models/efforts.
- Reset: Simple-panel `role="menuitem"` with class token `ResetToDefault-niy99b`; no dedicated reset data marker observed. The old `[class*="_ResetToDefault"]` does not match it. If needed, a `ResetToDefault-` class-prefix fallback must be explicitly tested, not selected by its localized aria-label. Observed while explicit selection was active; recommendation-mode availability must be read live rather than assumed.
- Extension refresh control: dynamically created `#mp-refresh-models-button` in `extension/popup.js`; profile buttons use `[data-model-catalog-profile="legacy|latest"]` in `extension/popup.html`. Refresh sends `CSP_REFRESH_CHAT_WORK_MODEL_CATALOGS`.
- Chat persists into `modelCatalogLegacy` / `modelNamesLegacy`; Work into `modelCatalogLatest` / `modelNamesLatest`. Shortcut assignment arrays are separate and must not be rewritten by a scrape.

## Confirmed source drift, not a guessed timing fix

- Live match counts were zero for `button.__composer-pill`, `[data-model-selection-view="true"]`, `[data-testid="composer-model-picker-slider-advanced-view"]`, `[data-model-reasoning-effort-slider]`, and `button[role="radio"][aria-checked]`.
- `extension/shared/model-picker-selectors.js` still requires the old pill class and header radio/checked structure. Its view-trigger predicate requires the removed wrapper and, for an interactive row, `aria-expanded`.
- `extension/content.js::isIntegratedComposerMenu` requires the removed wrapper or old intelligence test-id. Thus the current shell is not recognized even if the outer Radix menu is found.
- `refreshChatWorkModelCatalogsOnce` waits for those old radios before its Chat/Work loop. These are independent discovery blockers before effort scanning is considered.
- `extension/popup.js::triggerManualCatalogRefresh` shows `Open a ChatGPT tab to pick models.` for a generic failed outcome, not only for a missing tab. Do not use that toast as proof that tab routing failed. A live popup failure trace remains an implementation-phase check.

External troubleshooting context: [Radix menu documentation](https://www.radix-ui.com/primitives/docs/components/dropdown-menu) describes managed focus and menu layering; [upstream trigger discussion](https://github.com/radix-ui/primitives/issues/3012) discusses pointer-down activation. Neither establishes ChatGPT's current DOM or a site-specific fix; this catalog is the selector evidence.
