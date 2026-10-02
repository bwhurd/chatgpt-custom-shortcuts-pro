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

const outerSendButtonResolver = extractSource(
  / {2}const getSendButton = \(\) =>[\s\S]*?;\n/,
  'outer-IIFE send-button resolver',
);
const localSendButtonResolver = extractSource(
  / {4}const getCtrlShortcutSendButton = \(\) => \{[\s\S]*?\n {4}\};/,
  'Control shortcut send-button resolver',
);
const keyFunctionMapping = extractSource(
  / {4}const keyFunctionMappingCtrl = \{[\s\S]*?\n {4}\};/,
  'Control shortcut mapping',
);
const ignoreShortcutEvent = extractBetween(
  '    const shouldIgnoreShortcutEvent =',
  '    const getShortcutKeyIdentifier =',
  'shortcut event guard',
);
const shortcutKeyIdentifier = extractSource(
  / {4}const getShortcutKeyIdentifier = \(event\) =>[\s\S]*?;\n/,
  'shortcut key identifier',
);
const controlShortcutHandler = extractSource(
  / {4}const handleCtrlShortcutEvent = \(event, keyIdentifier\) => \{[\s\S]*?\n {4}\};/,
  'Control shortcut router',
);
const keydownListener = extractSource(
  / {4}document\.addEventListener\(\n {6}'keydown',[\s\S]*?\n {6}\{ capture: true \},\n {4}\);/,
  'captured keydown listener',
);
const settingsGate = extractSource(
  / {4}function isCtrlShortcutEnabled\(key\) \{[\s\S]*?\n {4}\}/,
  'Control shortcut setting gate',
);
const shortcutUsageRecorder = extractSource(
  / {4}function recordShortcutUsage\(_actionId\) \{\}/,
  'shortcut usage recorder',
);

assert.match(
  contentSource,
  /return window\.enableSendWithControlEnterCheckbox === true;/,
  'Control+Enter must retain its setting gate',
);

// Keep the earlier send resolver in its own IIFE, as in content.js. The
// shortcut listener below must use its own in-scope resolver.
const browserHarness = `
(() => {
${outerSendButtonResolver}
})();
(() => {
  const isMac = false;
  const shortcuts = {
    shortcutKeyClickSendButton: 'Enter',
    shortcutKeyClickStopButton: 'Backspace',
  };
  const getVisibleStopButton = () => null;
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
  if (event.key === 'Enter') {
    window.__controlEnterTrace.push({
      ctrlKey: event.ctrlKey,
      defaultPrevented: event.defaultPrevented,
    });
  }
});
`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();

  const runKeyboardCase = async ({ enabled, buttonMarkup = '' }) => {
    await page.setContent(
      `<!doctype html><html><body><textarea id="keyboard-target"></textarea>${buttonMarkup}</body></html>`,
    );
    await page.evaluate((gateEnabled) => {
      window.enableSendWithControlEnterCheckbox = gateEnabled;
      window.enableStopWithControlBackspaceCheckbox = false;
      window.useControlForModelSwitcherRadio = false;
      window.__sendClickCount = 0;
      window.__controlEnterTrace = [];
      document.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => {
          window.__sendClickCount += 1;
        });
      });
    }, enabled);
    await page.addScriptTag({ content: browserHarness });
    await page.bringToFront();
    await page.locator('#keyboard-target').focus();
    await page.keyboard.press('Control+Enter');
    return page.evaluate(() => ({
      sendClickCount: window.__sendClickCount,
      trace: window.__controlEnterTrace,
    }));
  };

  for (const [buttonMarkup, label] of [
    ['<button id="composer-submit-button">Send</button>', 'current composer ID'],
    ['<button data-testid="send-button">Send</button>', 'legacy test ID'],
    ['<button aria-label="Send prompt">Send</button>', 'accessible-label fallback'],
  ]) {
    const result = await runKeyboardCase({ enabled: true, buttonMarkup });
    assert.equal(result.sendClickCount, 1, `Control+Enter should click the ${label} exactly once`);
    assert.deepEqual(result.trace, [{ ctrlKey: true, defaultPrevented: true }]);
  }

  const disabled = await runKeyboardCase({
    enabled: false,
    buttonMarkup: '<button id="composer-submit-button">Send</button>',
  });
  assert.equal(disabled.sendClickCount, 0, 'A disabled Control+Enter setting must not send');
  assert.deepEqual(disabled.trace, [{ ctrlKey: true, defaultPrevented: false }]);

  const missingTarget = await runKeyboardCase({ enabled: true });
  assert.equal(missingTarget.sendClickCount, 0, 'Control+Enter must not send without a target');
  assert.deepEqual(missingTarget.trace, [{ ctrlKey: true, defaultPrevented: false }]);

  for (const stopMarker of ['data-testid', 'data-test-id']) {
    const stopStateTarget = await runKeyboardCase({
      enabled: true,
      buttonMarkup: `<button id="composer-submit-button" ${stopMarker}="stop-button">Stop</button>`,
    });
    assert.equal(
      stopStateTarget.sendClickCount,
      0,
      `Control+Enter must not click a Stop-state composer control marked with ${stopMarker}`,
    );
    assert.deepEqual(stopStateTarget.trace, [{ ctrlKey: true, defaultPrevented: false }]);
  }

  console.log('Control+Enter browser keyboard fixture passed.');
} finally {
  await browser.close();
}
