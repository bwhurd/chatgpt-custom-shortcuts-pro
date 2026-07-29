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

const currentHost = {
  id: 'stage-slideover-sidebar',
  scrollLeft: 189,
  state: 'closed',
  getAttribute(name) {
    return name === 'data-state' ? this.state : null;
  },
};
const legacyHost = {
  id: 'stage-sidebar',
  scrollLeft: 0,
  getAttribute() {
    return null;
  },
};
const root = {
  currentHost,
  legacyHost,
  getElementById(id) {
    if (id === 'stage-slideover-sidebar') return this.currentHost;
    if (id === 'stage-sidebar') return this.legacyHost;
    return null;
  },
};
const helperContext = vm.createContext({
  document: root,
  window: {
    getComputedStyle(host) {
      return host === legacyHost
        ? { display: 'block', visibility: 'visible', opacity: '1' }
        : { display: 'none', visibility: 'hidden', opacity: '0' };
    },
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

assert.equal(
  helperContext.getHost(root),
  currentHost,
  'the current slideover host should win over the legacy fallback',
);
assert.equal(helperContext.isOpen(currentHost), false, 'data-state="closed" should be collapsed');
helperContext.resetScroll(currentHost);
assert.equal(currentHost.scrollLeft, 0, 'collapsed host scroll should return the rail to the edge');

currentHost.state = 'open';
currentHost.scrollLeft = 189;
helperContext.resetScroll(currentHost);
assert.equal(currentHost.scrollLeft, 189, 'expanded host scroll should not be changed');

root.currentHost = null;
assert.equal(helperContext.getHost(root), legacyHost, 'legacy stage-sidebar should remain a fallback');
assert.equal(helperContext.isOpen(legacyHost), true, 'visible legacy sidebar should count as open');

const runtimeSource = contentSource.slice(runtimeStart, runtimeEnd);
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
  /#stage-slideover-sidebar/,
  'runtime refresh should recognize the current sidebar host',
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

console.log('Fade Slim Sidebar follows the current stable sidebar host');
