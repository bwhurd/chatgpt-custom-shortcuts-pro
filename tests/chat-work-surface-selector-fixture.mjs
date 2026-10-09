import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const modelPickerSelectors = require('../extension/shared/model-picker-selectors.js');
const shortcutMetadata = require('../extension/shared/shortcut-action-metadata.js');
const { targetMatchesText } = await import('./playwright/lib/shortcut-target-presence.mjs');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(attributes = {}, children = [], { visible = true } = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.children = children;
    for (const child of children) child.parentElement = this;
    this.isConnected = true;
    this.visible = visible;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  getClientRects() {
    return this.visible ? [{ width: 10, height: 10 }] : [];
  }

  querySelectorAll(selector) {
    if (selector !== modelPickerSelectors.CHAT_WORK_SURFACE_RADIO_SELECTOR) return [];
    return this.children.filter(
      (child) =>
        (child.getAttribute('role') === 'radio' && child.hasAttribute('aria-checked')) ||
        child.hasAttribute('aria-pressed'),
    );
  }
}

const windowObj = {
  Element: FakeElement,
  getComputedStyle: (element) => ({
    display: element.visible ? 'block' : 'none',
    visibility: element.visible ? 'visible' : 'hidden',
  }),
};

const radio = (checked, options) =>
  new FakeElement({ role: 'radio', 'aria-checked': checked }, [], options);
const group = (role, radios, options) => new FakeElement({ role }, radios, options);
const documentWith = (...groups) => ({
  querySelectorAll(selector) {
    return groups.filter((candidate) =>
      selector.includes(`[role="${candidate.getAttribute('role')}"]`),
    );
  },
});

for (const role of ['radiogroup', 'group']) {
  const expected = [radio('true'), radio('false')];
  assert.deepEqual(
    modelPickerSelectors.getNativeChatWorkSurfaceRadios(
      documentWith(group(role, expected)),
      windowObj,
    ),
    expected,
    `${role} should resolve when it has two visible reciprocal radios`,
  );
}

const validCurrentGroup = group('radiogroup', [radio('false'), radio('true')]);
const malformedGroups = [
  group('radiogroup', [radio('true')]),
  group('radiogroup', [radio('true'), radio('false'), radio('false')]),
  group('radiogroup', [radio('false'), radio('false')]),
  group('radiogroup', [radio('true'), radio('true')]),
  group('radiogroup', [radio('true'), radio('false')], { visible: false }),
  group('radiogroup', [radio('true'), radio('false', { visible: false })]),
];

for (const malformed of malformedGroups) {
  assert.deepEqual(
    modelPickerSelectors.getNativeChatWorkSurfaceRadios(documentWith(malformed), windowObj),
    [],
    'malformed or hidden surface groups should be rejected',
  );
}

assert.deepEqual(
  modelPickerSelectors.getNativeChatWorkSurfaceRadios(
    documentWith(...malformedGroups, validCurrentGroup),
    windowObj,
  ),
  validCurrentGroup.children,
  'the resolver should skip malformed candidates and return the first valid group',
);

assert.deepEqual(modelPickerSelectors.getChatWorkSurfaceToggleSelectors(), [
  'header [role="radiogroup"] button[role="radio"][aria-checked], button[aria-pressed]',
  'header [role="group"] button[role="radio"][aria-checked], button[aria-pressed]',
  'main [role="group"]:has(> button[aria-pressed]) button[role="radio"][aria-checked], button[aria-pressed]',
]);
assert.deepEqual(modelPickerSelectors.getChatWorkSurfaceToggleMatchGroups(), [
  ['role="radiogroup"', 'role="radio"', 'aria-checked='],
  ['role="group"', 'role="radio"', 'aria-checked='],
  ['role="group"', '<button', 'aria-pressed="true"', 'aria-pressed="false"'],
]);

assert.match(
  contentSource,
  /window\.CSPModelPickerSelectors\?\.getNativeChatWorkSurfaceRadios/,
  'runtime Chat/Work selection should use the executable shared resolver',
);

const toggleTarget = shortcutMetadata.TARGET_DESCRIPTORS.find(
  (descriptor) => descriptor.targetId === 'chat-work-surface-toggle',
);
assert.ok(toggleTarget, 'Chat/Work should retain a runtime-selector validation target');
assert.deepEqual(
  toggleTarget.searchNeedles,
  modelPickerSelectors.getChatWorkSurfaceToggleSelectors(),
  'runtime validation should use every supported executable surface selector',
);
const pressedPairMarkup =
  '<main><div role="group"><button aria-pressed="true"></button><button aria-pressed="false"></button></div></main>';
assert.equal(
  targetMatchesText(toggleTarget, pressedPairMarkup),
  true,
  'the target metadata should match the current main-surface reciprocal pressed-button markup',
);
assert.equal(
  targetMatchesText(
    toggleTarget,
    '<main><div role="group"><button aria-pressed="true"></button></div></main>',
  ),
  false,
  'the target metadata should reject a surface group with only one pressed state',
);
assert.equal(
  targetMatchesText(
    toggleTarget,
    '<main><div><button aria-pressed="true"></button><button aria-pressed="false"></button></div></main>',
  ),
  false,
  'the target metadata should reject pressed buttons outside the supported group scope',
);

const pressed = [
  new FakeElement({ 'aria-pressed': 'true' }),
  new FakeElement({ 'aria-pressed': 'false' }),
];
const pressedGroup = group('group', pressed);
assert.deepEqual(
  modelPickerSelectors.getNativeChatWorkSurfaceRadios(documentWith(pressedGroup), windowObj),
  pressed,
);
pressed[1].attributes.set('aria-pressed', 'true');
assert.deepEqual(
  modelPickerSelectors.getNativeChatWorkSurfaceRadios(documentWith(pressedGroup), windowObj),
  [],
  'pressed controls must have reciprocal state',
);
pressed[1].attributes.set('aria-pressed', 'false');
pressed[1].parentElement = new FakeElement();
assert.deepEqual(
  modelPickerSelectors.getNativeChatWorkSurfaceRadios(documentWith(pressedGroup), windowObj),
  [],
  'nested unrelated pressed buttons must not become surface controls',
);

const waitStart = contentSource.indexOf('async function waitForNativeChatWorkSurfaceRadios(');
const waitEnd = contentSource.indexOf('function getNativeChatWorkSurfaceMode(', waitStart);
assert.ok(waitStart >= 0 && waitEnd > waitStart);
const loadingButtons = [{ disabled: true }, { disabled: true }];
let readinessPolls = 0;
const waitContext = {
  getNativeChatWorkSurfaceRadios: () => loadingButtons,
  isDirectActionVisible: (button) => !button.disabled,
  setTimeout: (callback) => {
    readinessPolls++;
    loadingButtons.forEach((button) => {
      button.disabled = false;
    });
    callback();
  },
};
vm.createContext(waitContext);
vm.runInContext(
  `${contentSource.slice(waitStart, waitEnd)}\nthis.waitForRadios = waitForNativeChatWorkSurfaceRadios;`,
  waitContext,
);
assert.equal((await waitContext.waitForRadios()).length, 2);
assert.equal(readinessPolls, 1, 'visible disabled mode buttons must wait for hydration');
loadingButtons.forEach((button) => {
  button.disabled = true;
});
assert.equal(
  (await waitContext.waitForRadios(0)).length,
  0,
  'disabled controls must remain unavailable on timeout',
);

console.log('Chat/Work surface selection accepts current and legacy structural wrappers');
