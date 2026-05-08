import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import modelPickerSelectors from '../extension/shared/model-picker-selectors.js';

globalThis.window = globalThis;
await import('../extension/shared/model-picker-labels.js');
const modelPickerLabels = globalThis.ModelLabels;

const mainMenuHtml = `
  <div role="menu" data-state="open" data-radix-menu-content="">
    <div data-model-picker-thinking-effort-row="true">
      <div role="menuitemradio" data-model-picker-thinking-effort-menu-item="true" data-testid="model-switcher-gpt-5-5-thinking">
        <span>Thinking <span data-model-picker-thinking-effort-label-extra="true">• Extended</span></span>
      </div>
      <button
        data-model-picker-thinking-effort-action="true"
        data-testid="model-switcher-gpt-5-5-thinking-thinking-effort"
        role="menuitem"
        aria-haspopup="menu"
        aria-controls="thinking-menu"
      ></button>
    </div>
  </div>
`;

const submenuHtml = `
  <div id="thinking-menu" role="menu" data-state="open" data-radix-menu-content="">
    <div role="group">
      <div role="menuitemradio" aria-checked="false"><div class="truncate">Standard</div></div>
      <div role="menuitemradio" aria-checked="true"><div class="truncate">Extended</div></div>
    </div>
  </div>
`;

const $ = cheerio.load(`${mainMenuHtml}${submenuHtml}`);

assert.equal($(modelPickerSelectors.MODEL_THINKING_EFFORT_ROW_SELECTOR).length, 1);
assert.equal($(modelPickerSelectors.MODEL_THINKING_EFFORT_MENU_ITEM_SELECTOR).length, 1);
assert.equal($(modelPickerSelectors.MODEL_THINKING_EFFORT_ACTION_SELECTOR).length, 1);

const optionLabels = $(modelPickerSelectors.MODEL_THINKING_EFFORT_OPTION_SELECTOR)
  .map((_index, element) => $(element).text().replace(/\s+/g, ' ').trim())
  .get();

assert.deepEqual(optionLabels, ['Standard', 'Extended']);

const proSubmenuHtml = `
  <div id="pro-thinking-menu" role="menu" data-state="open" data-radix-menu-content="">
    <div role="group">
      <div role="menuitemradio" aria-checked="false"><div class="truncate">Standard</div></div>
      <div role="menuitemradio" aria-checked="false"><div class="truncate">Extended</div></div>
      <div role="menuitemradio" aria-checked="false"><div class="truncate">Light</div></div>
      <div role="menuitemradio" aria-checked="true"><div class="truncate">Heavy</div></div>
    </div>
  </div>
`;
const $pro = cheerio.load(proSubmenuHtml);
const proIds = $pro(modelPickerSelectors.MODEL_THINKING_EFFORT_OPTION_SELECTOR)
  .map((_index, element) => modelPickerLabels.mapThinkingEffortLabelToId($pro(element).text()))
  .get()
  .filter(Boolean);

assert.deepEqual(modelPickerLabels.sortThinkingEffortIds(proIds), [
  'thinking-standard',
  'thinking-extended',
  'thinking-light',
  'thinking-heavy',
]);
console.log('model picker thinking effort submenu selectors match fixture');
