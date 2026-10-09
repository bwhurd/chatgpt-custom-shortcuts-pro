import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import {
  evaluateLiveProbeSemantic,
  findRenderedThreadScrollRoot,
  readLiveProbeScrollMetrics,
  resolveLiveProbeScrollContainer,
  setLiveProbeMessageScrollStart,
  setLiveProbeScrollPosition,
} from './playwright/lib/devscrape-wide-core.mjs';

class FakeElement {
  constructor({
    rect = { width: 1200, height: 900 },
    scrollTop = 0,
    scrollHeight = 1000,
    clientHeight = 1000,
  } = {}) {
    this.rect = rect;
    this.scrollTop = scrollTop;
    this.scrollHeight = scrollHeight;
    this.clientHeight = clientHeight;
    this.isConnected = true;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeHTMLElement extends FakeElement {
  constructor(options = {}) {
    super(options);
    this.computedStyle = {
      display: 'block',
      visibility: 'visible',
      pointerEvents: 'auto',
      ...options.computedStyle,
    };
  }
}

function runResolver({ nativeContainers = [], documentRoot, helper = 'absent' }) {
  const windowObject = {
    HTMLElement: FakeHTMLElement,
    getComputedStyle: (element) => element.computedStyle,
  };
  if (helper !== 'absent') {
    windowObject.getScrollableContainer = () => helper;
  }
  const documentObject = {
    defaultView: windowObject,
    querySelectorAll: (selector) =>
      selector === '.thread-scroll-container' ? nativeContainers : [],
    scrollingElement: documentRoot,
    documentElement: documentRoot,
  };

  return runInNewContext(
    `
    const findRenderedThreadScrollRoot = ${findRenderedThreadScrollRoot.toString()};
    (${resolveLiveProbeScrollContainer.toString()})()
  `,
    {
      window: windowObject,
      document: documentObject,
      getComputedStyle: windowObject.getComputedStyle,
      Element: FakeElement,
      HTMLElement: FakeHTMLElement,
    },
  );
}

test('prefers the visible native thread root over a zero-range document root', () => {
  const documentRoot = new FakeElement({ scrollHeight: 1079, clientHeight: 1079 });
  const hiddenThreadRoot = new FakeHTMLElement({
    computedStyle: { visibility: 'hidden' },
    scrollHeight: 1700,
    clientHeight: 1079,
  });
  const visibleThreadRoot = new FakeHTMLElement({
    scrollTop: 120,
    scrollHeight: 1593,
    clientHeight: 1079,
  });
  const actual = runResolver({
    nativeContainers: [hiddenThreadRoot, visibleThreadRoot],
    documentRoot,
  });

  assert.equal(documentRoot.scrollHeight - documentRoot.clientHeight, 0);
  assert.equal(visibleThreadRoot.scrollHeight - visibleThreadRoot.clientHeight, 514);
  assert.equal(actual, visibleThreadRoot);
});

test('falls back to the visible native thread root when the page-world helper returns null', () => {
  const documentRoot = new FakeElement({ scrollHeight: 1079, clientHeight: 1079 });
  const visibleThreadRoot = new FakeHTMLElement({
    scrollHeight: 1593,
    clientHeight: 1079,
  });

  assert.equal(
    runResolver({ nativeContainers: [visibleThreadRoot], documentRoot, helper: null }),
    visibleThreadRoot,
  );
});

test('preserves a valid container returned by the extension helper', () => {
  const documentRoot = new FakeElement();
  const nativeThreadRoot = new FakeHTMLElement();
  const helperContainer = new FakeHTMLElement({ scrollHeight: 2000, clientHeight: 1000 });

  assert.equal(
    runResolver({
      nativeContainers: [nativeThreadRoot],
      documentRoot,
      helper: helperContainer,
    }),
    helperContainer,
  );
});

test('keeps the document root as the legacy fallback when no native root is rendered', () => {
  const documentRoot = new FakeElement();
  const hiddenThreadRoot = new FakeHTMLElement({
    rect: { width: 0, height: 0 },
  });

  assert.equal(runResolver({ nativeContainers: [hiddenThreadRoot], documentRoot }), documentRoot);
});

function scrollContext(container, reverse = false, windowRoot = false) {
  const root = new FakeHTMLElement({ scrollHeight: 1800, clientHeight: 1000 });
  const windowObject = {
    innerHeight: 1000,
    scrollY: 0,
    getComputedStyle: () => ({ flexDirection: reverse ? 'column-reverse' : 'column' }),
    scrollTo: (_x, y) => {
      windowObject.scrollY = y;
    },
  };
  return {
    window: windowObject,
    getComputedStyle: windowObject.getComputedStyle,
    document: {
      scrollingElement: root,
      documentElement: root,
      querySelectorAll: () => [container],
    },
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    container: windowRoot ? windowObject : container,
  };
}

for (const kind of ['normal', 'reverse', 'window']) {
  test(`${kind} setup uses logical top, middle and bottom coordinates`, async () => {
    const node = new FakeHTMLElement({ scrollHeight: 1800, clientHeight: 1000 });
    const context = scrollContext(node, kind === 'reverse', kind === 'window');
    context.window.getScrollableContainer = () => context.container;
    const fakePage = {
      evaluate: (callback, argument) =>
        runInNewContext(`(${callback.toString()})(argument)`, { ...context, argument }),
      waitForTimeout: async () => {},
    };
    for (const [position, expected] of [
      ['top', 0],
      ['middle', 400],
      ['bottom', 800],
    ]) {
      await setLiveProbeScrollPosition(fakePage, position);
      const metrics = runInNewContext(
        `(${readLiveProbeScrollMetrics.toString()})(container)`,
        context,
      );
      assert.equal(metrics.top, expected);
      assert.equal(metrics.max, 800);
      assert.equal(metrics.rawTop, kind === 'reverse' ? expected - 800 : expected);
      assert.equal(metrics.reverse, kind === 'reverse');
    }
  });
}

for (const reverse of [false, true]) {
  test(`${reverse ? 'reverse' : 'normal'} message setup leaves room in the action direction`, async () => {
    const node = new FakeHTMLElement({ scrollHeight: 1800, clientHeight: 1000 });
    const context = scrollContext(node, reverse);
    context.window.getScrollableContainer = () => context.container;
    const fakePage = {
      evaluate: (callback, argument) =>
        runInNewContext(`(${callback.toString()})(argument)`, { ...context, argument }),
      waitForTimeout: async () => {},
    };
    for (const [setup, start] of [
      ['message-scroll-from-bottom', 800],
      ['message-scroll-from-top', 0],
    ]) {
      await setLiveProbeMessageScrollStart(fakePage, setup);
      assert.equal(context.window.__CGCSP_SCROLL_PROBE_START__.top, start);
      assert.equal(context.window.__CGCSP_SCROLL_PROBE_START__.max, 800);
      assert.equal(node.scrollTop, reverse ? start - 800 : start);
    }
    await assert.rejects(
      setLiveProbeMessageScrollStart(fakePage, 'message-scroll-from-middle'),
      /Unsupported message-scroll setup/,
    );
  });

  test(`${reverse ? 'reverse' : 'normal'} movement proof preserves directions and thresholds`, () => {
    const node = new FakeHTMLElement({ scrollHeight: 1800, clientHeight: 1000 });
    const context = scrollContext(node, reverse);
    const at = (logical) => {
      node.scrollTop = reverse ? logical - 800 : logical;
      const metrics = runInNewContext(
        `(${readLiveProbeScrollMetrics.toString()})(container)`,
        context,
      );
      return { scrollTop: metrics.top, scrollMax: metrics.max };
    };
    for (const [targetId, destination] of [
      ['message-scroll-up-delta', 277],
      ['message-scroll-down-delta', 523],
    ]) {
      const shortcut = { activationProbeMode: 'dom-state' };
      assert.equal(
        evaluateLiveProbeSemantic(shortcut, { targetId }, at(400), at(destination)).status,
        'pass',
      );
      assert.equal(
        evaluateLiveProbeSemantic(shortcut, { targetId }, at(400), at(800 - destination)).status,
        'fail',
      );
      assert.equal(
        evaluateLiveProbeSemantic(shortcut, { targetId }, at(400), at(400)).status,
        'fail',
      );
    }
    for (const [targetId, destination] of [
      ['page-header', 0],
      ['thread-bottom', 800],
    ]) {
      const shortcut = { activationProbeMode: 'viewport-target' };
      assert.equal(
        evaluateLiveProbeSemantic(shortcut, { targetId }, at(400), at(destination)).status,
        'pass',
      );
      assert.equal(
        evaluateLiveProbeSemantic(shortcut, { targetId }, at(destination), at(destination)).status,
        'fail',
      );
    }
  });
}
