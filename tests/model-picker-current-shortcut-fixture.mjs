import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const content = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const start = content.indexOf('const runCurrentModelPickerAction = async (action) => {');
const end = content.indexOf('\n      const ensureIntegratedSimplePicker = async', start);
assert.ok(start >= 0 && end > start, 'current picker runtime action should be present');
const source = content
  .slice(start, end)
  .replace(/^const runCurrentModelPickerAction = /, '')
  .replace(/;\s*$/, '');
const runnerStart = content.indexOf('const ModelPickerActionRunner = (() => {');
const runnerEnd = content.indexOf(
  'const executeModelAction = (action, options = {}) =>',
  runnerStart,
);
const runnerSource = content.slice(runnerStart, runnerEnd);
const currentDispatch = runnerSource.indexOf('runCurrentModelPickerAction(action)');
const legacyDispatch = runnerSource.indexOf(
  'if (dispatchIntegratedEffortAction(action, options, complete))',
  currentDispatch,
);
assert.ok(
  currentDispatch >= 0 && legacyDispatch > currentDispatch,
  'current picker dispatch should run before legacy surface routes',
);

class FakeElement {
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.active = true;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  querySelector(selector) {
    if (selector === '[data-model-picker-view]') return this.view || null;
    if (selector === '[data-model-picker-view-toggle="true"]') return this.toggle || null;
    if (selector === '[data-reasoning-slider="true"]') return this.control || null;
    if (selector.startsWith('[role="slider"]')) return this.slider || null;
    if (selector === '[data-menu-row-content="true"]') return this.titleElement || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '[role="menuitemradio"]') return this.rows || [];
    return [];
  }
  closest(selector) {
    if (selector === '[inert], [data-active="false"]') return this.active ? null : this;
    return null;
  }
}

const run = async ({ catalog, action, initialView, initialModel, initialEffort }) => {
  const view = new FakeElement({ 'data-model-picker-view': initialView });
  const menu = new FakeElement();
  menu.view = view;
  const rows = catalog.configureOptions.map((option) => {
    const row = new FakeElement({
      role: 'menuitemradio',
      'aria-checked': option.id === initialModel ? 'true' : 'false',
    });
    row.label = option.label;
    row.titleElement = { textContent: option.label };
    return row;
  });
  const defaultRow = new FakeElement({
    role: 'menuitemradio',
    'aria-checked': initialModel === 'default' ? 'true' : 'false',
  });
  defaultRow.label = 'Default';
  defaultRow.titleElement = { textContent: 'Default' };
  view.rows = [...rows, ...(catalog.surfaceMode === 'work' ? [defaultRow] : [])];
  view.toggle = new FakeElement();
  const slider = new FakeElement({
    'aria-valuemin': String(initialEffort.min),
    'aria-valuemax': String(initialEffort.max),
    'aria-valuenow': String(initialEffort.value),
  });
  const control = new FakeElement();
  control.slider = slider;
  view.control = control;
  const button = new FakeElement({ 'aria-expanded': 'true' });
  let opened = true;
  const persisted = [];
  const clicked = [];
  const ctx = {
    Element: FakeElement,
    INTEGRATED_EFFORT_ACTION_IDS: ['instant', 'thinking', 'pro', 'effort-extra-high', 'effort-max'],
    ModelPickerSelectors: {
      getModelPickerRowTitleElement: (row) => row?.titleElement || null,
      getActiveModelPickerRows: (picker) => picker.rows.filter((row) => row.active),
    },
    window: { __modelCatalog: catalog, __activeModelConfigId: catalog.configureOptions[0]?.id },
    getOrOpenModelPickerState: async () => {
      if (!opened) view.setAttribute('data-model-picker-view', 'simple');
      opened = true;
      button.setAttribute('aria-expanded', 'true');
      return { main: menu };
    },
    getVisibleModelMenuState: () => ({ main: opened ? menu : null }),
    getModelMenuButton: () => button,
    getModelTextWithoutHints: (el) => el?.textContent || '',
    isUnavailableModelMenuItem: () => false,
    smartClickSafe: (el) => {
      clicked.push(el);
      if (el === button) {
        opened = false;
        button.setAttribute('aria-expanded', 'false');
        view.setAttribute('data-model-picker-view', 'simple');
      } else if (el === view.toggle) {
        view.setAttribute('data-model-picker-view', 'advanced');
      } else if (rows.includes(el)) {
        rows.forEach((row) => {
          row.setAttribute('aria-checked', row === el ? 'true' : 'false');
        });
        view.setAttribute('data-model-picker-view', 'simple');
      }
      return true;
    },
    waitForAsync: async (predicate) => predicate(),
    persistActiveModelConfigId: (id) => persisted.push(id),
    flashBottomBar: () => {},
    pressElementKey: (_control, key) => {
      const value = Number(slider.getAttribute('aria-valuenow')) + (key === 'ArrowRight' ? 1 : -1);
      slider.setAttribute('aria-valuenow', String(value));
    },
  };
  const execute = vm.runInNewContext(`(${source})`, ctx);
  const result = await execute(action);
  return { result, rows, slider, view, persisted, clicked };
};

const profiles = [
  {
    name: 'Chat',
    catalog: {
      surfaceMode: 'chat',
      configureOptions: [
        { id: 'configure-56', label: 'GPT-5.6 Sol' },
        { id: 'configure-55', label: 'GPT-5.5' },
      ],
      frontendByConfig: { 'configure-56': [{ id: 'thinking', available: true, sliderValue: 1 }] },
    },
    model: { id: 'configure-56', actionKind: 'configure-option' },
    effort: { id: 'thinking' },
    max: 2,
  },
  {
    name: 'Work',
    catalog: {
      surfaceMode: 'work',
      configureOptions: [
        { id: 'configure-astra', label: 'GPT-6 Astra' },
        { id: 'configure-55', label: 'GPT-5.5' },
      ],
      frontendByConfig: { 'configure-astra': [{ id: 'pro', available: true, sliderValue: 2 }] },
    },
    model: { id: 'configure-astra', actionKind: 'configure-option' },
    effort: { id: 'pro' },
    max: 4,
  },
];

for (const profile of profiles) {
  const switched = await run({
    catalog: profile.catalog,
    action: profile.model,
    initialView: profile.name === 'Work' ? 'advanced' : 'simple',
    initialModel: profile.catalog.configureOptions.at(-1).id,
    initialEffort: { min: 0, max: profile.max, value: 0 },
  });
  assert.equal(switched.result, true, `${profile.name} model shortcut should commit`);
  assert.equal(
    switched.rows.find((row) => row.getAttribute('aria-checked') === 'true').label,
    profile.catalog.configureOptions[0].label,
  );
  assert.deepEqual(switched.persisted, [profile.model.id]);
  assert.equal(
    switched.clicked.length,
    profile.name === 'Work' ? 1 : 2,
    `${profile.name} should activate only the current Advanced row`,
  );

  const effort = await run({
    catalog: profile.catalog,
    action: profile.effort,
    initialView: 'simple',
    initialModel: profile.catalog.configureOptions[0].id,
    initialEffort: { min: 0, max: profile.max, value: 0 },
  });
  const expected =
    profile.catalog.frontendByConfig[profile.catalog.configureOptions[0].id][0].sliderValue;
  assert.equal(effort.result, true, `${profile.name} effort shortcut should commit`);
  assert.equal(Number(effort.slider.getAttribute('aria-valuenow')), expected);
}

const defaultWorkEffort = await run({
  catalog: profiles[1].catalog,
  action: { id: 'effort-max' },
  initialView: 'simple',
  initialModel: 'default',
  initialEffort: { min: 0, max: 4, value: 0 },
});
assert.equal(defaultWorkEffort.result, true, 'Work Default should use the semantic slider offset');
assert.equal(Number(defaultWorkEffort.slider.getAttribute('aria-valuenow')), 4);

const unavailableEffort = await run({
  catalog: {
    ...profiles[0].catalog,
    frontendByConfig: { 'configure-56': [{ id: 'thinking', available: false, sliderValue: 1 }] },
  },
  action: { id: 'thinking' },
  initialView: 'simple',
  initialModel: 'configure-56',
  initialEffort: { min: 0, max: 2, value: 0 },
});
assert.equal(unavailableEffort.result, false, 'unavailable model effort should fail closed');
assert.equal(Number(unavailableEffort.slider.getAttribute('aria-valuenow')), 0);

const missingModel = await run({
  catalog: profiles[0].catalog,
  action: { id: 'configure-missing', actionKind: 'configure-option' },
  initialView: 'simple',
  initialModel: 'configure-55',
  initialEffort: { min: 0, max: 2, value: 0 },
});
assert.equal(missingModel.result, false, 'unknown catalog model should fail closed');
assert.equal(missingModel.clicked.length, 0, 'unknown model should not activate another row');

console.log('Current Chat and Work model/effort shortcut fixture passed.');
