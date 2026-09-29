import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const extractSource = (pattern, name) => {
  const source = contentSource.match(pattern)?.[0];
  assert.ok(source, `The ${name} should remain inspectable`);
  return source;
};
const extractBetween = (startMarker, endMarker, name) => {
  const start = contentSource.indexOf(startMarker);
  const end = contentSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `The ${name} markers should remain inspectable`);
  return contentSource.slice(start, end);
};

const visibleStopResolverStart = contentSource.indexOf('function getVisibleStopButton() {');
const visibleStopResolverEnd = contentSource.indexOf(
  '\n}\n\n// ======================================================',
  visibleStopResolverStart,
);
assert.ok(
  visibleStopResolverStart >= 0 && visibleStopResolverEnd > visibleStopResolverStart,
  'The visible Stop-button resolver should remain inspectable',
);
const visibleStopButtonResolver = contentSource
  .slice(visibleStopResolverStart, visibleStopResolverEnd + '\n}'.length)
  .replace('function getVisibleStopButton()', 'function resolveVisibleStopButton()');

const localSendButtonResolver = extractSource(
  /    const getCtrlShortcutSendButton = \(\) => \{[\s\S]*?\n    \};/,
  'Control shortcut send-button resolver',
);
const keyFunctionMapping = extractSource(
  /    const keyFunctionMappingCtrl = \{[\s\S]*?\n    \};/,
  'Control shortcut mapping',
);
const ignoreShortcutEvent = extractBetween(
  '    const shouldIgnoreShortcutEvent =',
  '    const getShortcutKeyIdentifier =',
  'shortcut event guard',
);
const shortcutKeyIdentifier = extractSource(
  /    const getShortcutKeyIdentifier = \(event\) =>[\s\S]*?;\n/,
  'shortcut key identifier',
);
const controlShortcutHandler = extractSource(
  /    const handleCtrlShortcutEvent = \(event, keyIdentifier\) => \{[\s\S]*?\n    \};/,
  'Control shortcut router',
);
const keydownListener = extractSource(
  /    document\.addEventListener\(\n      'keydown',[\s\S]*?\n      \{ capture: true \},\n    \);/,
  'captured keydown listener',
);
const settingsGate = extractSource(
  /    function isCtrlShortcutEnabled\(key\) \{[\s\S]*?\n    \}/,
  'Control shortcut setting gate',
);
const shortcutUsageRecorder = extractSource(
  /    function recordShortcutUsage\(_actionId\) \{\}/,
  'shortcut usage recorder',
);

assert.match(
  contentSource,
  /return window\.enableStopWithControlBackspaceCheckbox === true;/,
  'Control+Backspace must retain its setting gate',
);
assert.match(
  contentSource,
  /Only intercept if a visible Stop button exists; otherwise let native deletion happen\./,
  'Control+Backspace must preserve native deletion when no visible Stop target exists',
);

const browserHarness = `
(() => {
  const isMac = false;
  const shortcuts = {
    shortcutKeyClickSendButton: 'Enter',
    shortcutKeyClickStopButton: 'Backspace',
  };
${visibleStopButtonResolver}
  const getVisibleStopButton = () => {
    window.__stopLookupCount += 1;
    const button = resolveVisibleStopButton();
    if (window.__simulateMissingSecondLookup && window.__stopLookupCount > 1) return null;
    return button;
  };
  const isModelToggleShortcutEvent = () => false;
  const runAltShortcutAction = () => false;
  const handleAltShortcutEvent = () => false;
${shortcutUsageRecorder}
${localSendButtonResolver}
${keyFunctionMapping}
${ignoreShortcutEvent}
${shortcutKeyIdentifier}
${controlShortcutHandler}
${keydownListener}
${settingsGate}
})();
document.addEventListener('keydown', (event) => {
  if (event.key === 'Backspace') {
    window.__controlBackspaceTrace.push({
      ctrlKey: event.ctrlKey,
      defaultPrevented: event.defaultPrevented,
    });
  }
});
`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();

  const runKeyboardCase = async ({
    enabled,
    buttonMarkup = '',
    simulateMissingSecondLookup = false,
  }) => {
    await page.setContent(
      `<!doctype html><html><body><textarea id="keyboard-target">delete me</textarea>${buttonMarkup}</body></html>`,
    );
    await page.evaluate(({ gateEnabled, simulateRace }) => {
      window.enableSendWithControlEnterCheckbox = false;
      window.enableStopWithControlBackspaceCheckbox = gateEnabled;
      window.useControlForModelSwitcherRadio = false;
      window.__stopLookupCount = 0;
      window.__simulateMissingSecondLookup = simulateRace;
      window.__stopClickCount = 0;
      window.__controlBackspaceTrace = [];
      document.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          window.__stopClickCount += 1;
        });
      });
    }, { gateEnabled: enabled, simulateRace: simulateMissingSecondLookup });
    await page.addScriptTag({ content: browserHarness });
    await page.bringToFront();
    await page.locator('#keyboard-target').focus();
    await page.keyboard.press('Control+Backspace');
    return page.evaluate(() => ({
      stopClickCount: window.__stopClickCount,
      stopLookupCount: window.__stopLookupCount,
      trace: window.__controlBackspaceTrace,
    }));
  };

  const activeStop = await runKeyboardCase({
    enabled: true,
    buttonMarkup: '<button id="composer-submit-button" data-testid="stop-button">Stop</button>',
  });
  assert.equal(activeStop.stopClickCount, 1, 'Control+Backspace should click a visible Stop button once');
  assert.deepEqual(activeStop.trace, [{ ctrlKey: true, defaultPrevented: true }]);
  assert.equal(activeStop.stopLookupCount, 1, 'the captured listener should resolve the visible Stop target once');

  const disabled = await runKeyboardCase({
    enabled: false,
    buttonMarkup: '<button id="composer-submit-button" data-testid="stop-button">Stop</button>',
  });
  assert.equal(disabled.stopClickCount, 0, 'a disabled Control+Backspace setting must not stop generation');
  assert.deepEqual(disabled.trace, [{ ctrlKey: true, defaultPrevented: false }]);
  assert.equal(disabled.stopLookupCount, 0, 'the disabled setting must short-circuit before target lookup');

  const missingTarget = await runKeyboardCase({ enabled: true });
  assert.equal(missingTarget.stopClickCount, 0, 'Control+Backspace must not click without a visible Stop target');
  assert.deepEqual(missingTarget.trace, [{ ctrlKey: true, defaultPrevented: false }]);
  assert.equal(missingTarget.stopLookupCount, 1);

  const testIdFallback = await runKeyboardCase({
    enabled: true,
    buttonMarkup: '<button data-test-id="stop-button">Stop</button>',
  });
  assert.equal(testIdFallback.stopClickCount, 1, 'the supported data-test-id Stop target should work');
  assert.deepEqual(testIdFallback.trace, [{ ctrlKey: true, defaultPrevented: true }]);

  const targetDisappearsBetweenLookups = await runKeyboardCase({
    enabled: true,
    buttonMarkup: '<button data-testid="stop-button">Stop</button>',
    simulateMissingSecondLookup: true,
  });
  assert.equal(
    targetDisappearsBetweenLookups.stopClickCount,
    1,
    'dispatch should reuse the visible target verified by the guard if a second lookup would miss',
  );
  assert.deepEqual(targetDisappearsBetweenLookups.trace, [{ ctrlKey: true, defaultPrevented: true }]);
  assert.equal(targetDisappearsBetweenLookups.stopLookupCount, 1);

  console.log('Control+Backspace browser keyboard fixture passed.');
} finally {
  await browser.close();
}
