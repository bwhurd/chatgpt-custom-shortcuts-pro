import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const modelPickerSelectors = require('../extension/shared/model-picker-selectors.js');
const shortcutMetadata = require('../extension/shared/shortcut-action-metadata.js');
const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(attributes = {}, children = [], { visible = true } = {}) {
    this.attributes = new Map(Object.entries(attributes));
    this.children = children;
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
        child.getAttribute('role') === 'radio' &&
        child.hasAttribute('aria-checked'),
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
  'header [role="radiogroup"] button[role="radio"][aria-checked]',
  'header [role="group"] button[role="radio"][aria-checked]',
]);
assert.deepEqual(modelPickerSelectors.getChatWorkSurfaceToggleMatchGroups(), [
  ['role="radiogroup"', 'role="radio"', 'aria-checked='],
  ['role="group"', 'role="radio"', 'aria-checked='],
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
assert.ok(
  toggleTarget.searchNeedles.includes(
    'header [role="radiogroup"] button[role="radio"][aria-checked]',
  ),
  'runtime validation should recognize the current radiogroup wrapper',
);
assert.ok(
  toggleTarget.searchNeedles.includes(
    'header [role="group"] button[role="radio"][aria-checked]',
  ),
  'runtime validation should retain the legacy group wrapper',
);

console.log('Chat/Work surface selection accepts current and legacy structural wrappers');
