import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const helperStart = contentSource.indexOf('function getSlimSidebarHost');
const runtimeStart = contentSource.indexOf('(() => {', helperStart);
const runtimeEnd = contentSource.indexOf(
  '// @note Show Assigned Shortcuts Overlay',
  runtimeStart,
);

assert.ok(
  helperStart >= 0 && runtimeStart > helperStart && runtimeEnd > runtimeStart,
  'Slim-sidebar host helpers and runtime should remain discoverable',
);

const runtimeSource = contentSource.slice(runtimeStart, runtimeEnd);
assert.match(
  contentSource.slice(helperStart, runtimeStart),
  /getElementById\('app-shell-sidebar'\)/,
  'the current app-shell sidebar should be preferred over retired stage hosts',
);
assert.match(
  runtimeSource,
  /hoverTarget\.addEventListener\('mouseenter', onEnter, true\)/,
  'hover should bind to the stable sidebar host',
);
assert.match(
  runtimeSource,
  /attributeFilter: \['class', 'style', 'data-state'\]/,
  'the current host state should drive open and close handling',
);
assert.match(
  runtimeSource,
  /if \(hover\) {\s*setOpacity\('1'\)/,
  'a steady host hover should actively preserve the revealed state',
);
assert.match(
  runtimeSource,
  /#app-shell-sidebar/,
  'runtime refresh should recognize the current sidebar host',
);
assert.match(
  runtimeSource,
  /#stage-slideover-sidebar/,
  'runtime refresh should retain the stage host fallback',
);
assert.doesNotMatch(
  runtimeSource,
  /bar\.addEventListener\(\s*'click'/,
  'rail clicks should not maintain a second competing fade state',
);
assert.ok(
  !runtimeSource.includes("          '[data-state=\"open\"]',"),
  'ordinary open-state widgets should not be treated as page overlays',
);
assert.ok(
  !runtimeSource.includes('[data-radix-popper-content-wrapper]'),
  'sidebar icon tooltips should not be treated as blocking overlays or refresh triggers',
);

class TestNode {}
class TestElement extends TestNode {
  constructor(id) {
    super();
    this.id = id;
    this.listeners = new Map();
    this.attributes = new Map();
    this.scrollLeft = 71;
    this.isConnected = true;
    this.hovered = false;
    this.styleValues = new Map();
    this.style = {
      pointerEvents: '',
      setProperty: (name, value) => this.styleValues.set(name, String(value)),
      removeProperty: (name) => this.styleValues.delete(name),
    };
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  matches(selector) {
    return selector === ':hover' && this.hovered;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  get offsetWidth() {
    return 1;
  }
}
class TestHTMLElement extends TestElement {}
class TestDocumentFragment extends TestNode {}

let now = 0;
let nextTimerId = 0;
const timers = new Map();
const observers = [];
const runTimersTo = (target) => {
  while (true) {
    const next = [...timers.entries()]
      .filter(([, timer]) => timer.at <= target)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    const [id, timer] = next;
    timers.delete(id);
    now = timer.at;
    timer.callback();
  }
  now = target;
};
const currentHost = new TestHTMLElement('app-shell-sidebar');
currentHost.setAttribute('data-state', 'closed');
const stageHost = new TestHTMLElement('stage-slideover-sidebar');
stageHost.setAttribute('data-state', 'open');
const legacyHost = new TestHTMLElement('stage-sidebar');
const bar = new TestHTMLElement('stage-sidebar-tiny-bar');
const helperElements = new Map([
  [currentHost.id, currentHost],
  [stageHost.id, stageHost],
  [legacyHost.id, legacyHost],
]);
const helperContext = vm.createContext({
  document: { getElementById: (id) => helperElements.get(id) ?? null },
  window: {
    getComputedStyle: (host) =>
      host === legacyHost
        ? { display: 'block', visibility: 'visible', opacity: '1' }
        : { display: 'none', visibility: 'hidden', opacity: '0' },
  },
});
vm.runInContext(
  `${contentSource.slice(helperStart, runtimeStart)}
globalThis.getHost = getSlimSidebarHost;
globalThis.isOpen = isSlimSidebarHostOpen;
globalThis.resetScroll = resetCollapsedSlimSidebarScroll;`,
  helperContext,
  { filename: 'fade-slim-sidebar-host-helpers.js' },
);
assert.equal(helperContext.getHost(), currentHost, 'the current app-shell host should win');
assert.equal(helperContext.isOpen(currentHost), false, 'data-state="closed" should be collapsed');
helperContext.resetScroll(currentHost);
assert.equal(currentHost.scrollLeft, 0, 'collapsed host scroll should return to the rail edge');
currentHost.setAttribute('data-state', 'open');
currentHost.scrollLeft = 189;
helperContext.resetScroll(currentHost);
assert.equal(currentHost.scrollLeft, 189, 'expanded host scroll should not be changed');
helperElements.delete('app-shell-sidebar');
assert.equal(helperContext.getHost(), stageHost, 'stage-slideover should remain a fallback');
helperElements.delete('stage-slideover-sidebar');
assert.equal(helperContext.getHost(), legacyHost, 'legacy stage-sidebar should remain a fallback');
assert.equal(helperContext.isOpen(legacyHost), true, 'visible legacy sidebar should count as open');
currentHost.setAttribute('data-state', 'closed');
currentHost.scrollLeft = 71;

const elements = new Map([
  [currentHost.id, currentHost],
  [stageHost.id, stageHost],
  [legacyHost.id, legacyHost],
  [bar.id, bar],
]);
const document = {
  readyState: 'complete',
  body: new TestNode(),
  getElementById: (id) => elements.get(id) ?? null,
  querySelector: () => null,
  addEventListener() {},
  removeEventListener() {},
};
class TestMutationObserver {
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe() {}
  disconnect() {}
}
const chrome = {
  storage: {
    sync: {
      get(defaults, callback) {
        if ('fadeSlimSidebarEnabled' in defaults) {
          callback({ fadeSlimSidebarEnabled: true });
        } else {
          callback({ popupSlimSidebarOpacityValue: 0.3 });
        }
      },
    },
    onChanged: { addListener() {} },
  },
};
const window = {
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  addEventListener() {},
  removeEventListener() {},
};
const fakeDate = class extends Date {
  static now() {
    return now;
  }
};
const runtimeContext = vm.createContext({
  chrome,
  document,
  window,
  Date: fakeDate,
  Element: TestElement,
  HTMLElement: TestHTMLElement,
  DocumentFragment: TestDocumentFragment,
  Node: TestNode,
  MutationObserver: TestMutationObserver,
  coerceNumberFromStorage(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  },
  setTimeout(callback, delay = 0) {
    const id = ++nextTimerId;
    timers.set(id, { callback, at: now + delay });
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
});
runtimeContext.window._fadeSlimSidebarEnabled = false;
runtimeContext.window._slimBarIdleOpacity = 0.3;

vm.runInContext(
  `${contentSource.slice(helperStart, runtimeStart)}\n${runtimeSource}`,
  runtimeContext,
  { filename: 'fade-slim-sidebar-runtime.js' },
);
await Promise.resolve();
await Promise.resolve();

assert.equal(observers.length, 2, 'the runtime should watch page additions and host attributes');
assert.equal(
  currentHost.listeners.has('mouseenter'),
  true,
  'hover handling should attach to the current app-shell sidebar host',
);
assert.equal(currentHost.scrollLeft, 0, 'attach should reset current collapsed host scroll');
assert.equal(
  stageHost.listeners.has('mouseenter'),
  false,
  'retired stage hosts should not receive current-host hover handlers',
);
runTimersTo(3700);
assert.equal(bar.styleValues.get('opacity'), '0.3', 'idle should use the configured opacity');

currentHost.hovered = true;
currentHost.listeners.get('mouseenter')();
assert.equal(bar.styleValues.get('opacity'), '1', 'entering the collapsed host should reveal the bar');
runTimersTo(now + 5000);
assert.equal(bar.styleValues.get('opacity'), '1', 'a steady hover should prevent the idle fade');

currentHost.hovered = false;
currentHost.listeners.get('mouseleave')();
runTimersTo(now + 2500);
assert.equal(bar.styleValues.get('opacity'), '0.3', 'leaving the host should fade to idle');

currentHost.setAttribute('data-state', 'open');
observers.at(-1).callback([]);
assert.equal(bar.styleValues.get('opacity'), '0', 'opening the current sidebar should hide the slim bar');
currentHost.setAttribute('data-state', 'closed');
observers.at(-1).callback([]);
runTimersTo(now);
assert.equal(bar.styleValues.get('opacity'), '1', 'closing the sidebar should restore the collapsed bar');
runTimersTo(now + 2500);
assert.equal(bar.styleValues.get('opacity'), '0.3', 'the restored bar should return to idle opacity');

console.log('Fade Slim Sidebar tracks current app-shell host and idle behavior');
