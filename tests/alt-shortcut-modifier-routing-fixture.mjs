import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const sliceStart = contentSource.indexOf('    const hasUnexpectedAltShortcutModifier');
const sliceEnd = contentSource.indexOf('    const handleCtrlShortcutEvent', sliceStart);

assert.notEqual(sliceStart, -1, 'Alt modifier helper start marker is missing');
assert.notEqual(sliceEnd, -1, 'Alt shortcut handler end marker is missing');

const handlerSource = contentSource.slice(sliceStart, sliceEnd).replace(/^    /gm, '');

function runCase({
  event,
  isMac,
  isPrimaryControlPressed,
  keyIdentifier = 'q',
  previewCodes = {
    shortcutKeyNextThread: 'Semicolon',
    shortcutKeyPreviousThread: 'KeyJ',
  },
}) {
  const calls = [];
  const context = vm.createContext({
    isMac,
    isModelToggleShortcutEvent: () => event.route === 'model-toggle',
    runAltShortcutAction: (storageKey) => {
      calls.push(storageKey);
      return true;
    },
    runDynamicProThinkingEffortShortcut: () => {
      if (event.route !== 'pro-effort') return false;
      calls.push('pro-effort');
      return true;
    },
    runDynamicThinkingEffortShortcut: () => {
      if (event.route !== 'thinking-effort') return false;
      calls.push('thinking-effort');
      return true;
    },
    runMatchedAltShortcut: () => {
      calls.push('ordinary-alt');
      return true;
    },
    runModelPickerDigitShortcut: () => {
      if (event.route !== 'model-digit') return false;
      calls.push('model-digit');
      return true;
    },
    runPreviewThreadShortcut: (storageKey) => {
      calls.push(`preview-check:${storageKey}`);
      return event.code === previewCodes[storageKey];
    },
  });

  vm.runInContext(
    `${handlerSource}\nglobalThis.testHandleAltShortcutEvent = handleAltShortcutEvent;`,
    context,
    { filename: 'extension/content.js#alt-shortcut-handler' },
  );

  const result = context.testHandleAltShortcutEvent(
    {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...event,
    },
    keyIdentifier,
    isPrimaryControlPressed,
  );

  return { calls, result };
}

const ordinaryAlt = runCase({
  event: {},
  isMac: false,
  isPrimaryControlPressed: false,
});
assert.equal(ordinaryAlt.result, true);
assert.deepEqual(ordinaryAlt.calls, ['ordinary-alt']);

const ctrlAltPassThroughCases = [
  { code: 'KeyQ', key: '@' },
  { code: 'Slash', key: '/', route: 'model-toggle' },
  { code: 'Digit1', key: '1', route: 'model-digit' },
  { code: 'KeyH', key: 'h', route: 'thinking-effort' },
  { code: 'KeyP', key: 'p', route: 'pro-effort' },
  { code: 'Enter', key: 'Enter' },
];

for (const event of ctrlAltPassThroughCases) {
  const compoundChord = runCase({
    event: { ctrlKey: true, ...event },
    isMac: false,
    isPrimaryControlPressed: true,
  });
  assert.equal(compoundChord.result, false, `Ctrl+Alt+${event.code} must pass through`);
  assert.deepEqual(compoundChord.calls, [
    'preview-check:shortcutKeyPreviousThread',
    'preview-check:shortcutKeyNextThread',
  ]);
}

const reassignedPreviewCodes = {
  shortcutKeyPreviousThread: 'KeyU',
  shortcutKeyNextThread: 'KeyI',
};

for (const [previewStorageKey, code] of Object.entries(reassignedPreviewCodes)) {
  const preview = runCase({
    event: { ctrlKey: true, code },
    isMac: false,
    isPrimaryControlPressed: true,
    previewCodes: reassignedPreviewCodes,
  });
  assert.equal(preview.result, true);
  assert.equal(preview.calls.at(-1), `preview-check:${previewStorageKey}`);
  assert.ok(!preview.calls.includes('ordinary-alt'));
}

const formerPreviewKey = runCase({
  event: { ctrlKey: true, code: 'KeyJ', key: 'j' },
  isMac: false,
  isPrimaryControlPressed: true,
  previewCodes: reassignedPreviewCodes,
});
assert.equal(formerPreviewKey.result, false);
assert.deepEqual(formerPreviewKey.calls, [
  'preview-check:shortcutKeyPreviousThread',
  'preview-check:shortcutKeyNextThread',
]);

for (const event of [{ shiftKey: true }, { metaKey: true }]) {
  const extraModifier = runCase({
    event,
    isMac: false,
    isPrimaryControlPressed: false,
  });
  assert.equal(extraModifier.result, false);
  assert.deepEqual(extraModifier.calls, []);
}

const macPreview = runCase({
  event: { metaKey: true, code: 'KeyJ' },
  isMac: true,
  isPrimaryControlPressed: true,
});
assert.equal(macPreview.result, true);
assert.ok(!macPreview.calls.includes('ordinary-alt'));

const macRawControlChord = runCase({
  event: { ctrlKey: true, key: '@', code: 'KeyQ' },
  isMac: true,
  isPrimaryControlPressed: false,
});
assert.equal(macRawControlChord.result, false);
assert.deepEqual(macRawControlChord.calls, []);

const macCommandOptionTextChord = runCase({
  event: { metaKey: true, key: 'q', code: 'KeyQ' },
  isMac: true,
  isPrimaryControlPressed: true,
});
assert.equal(macCommandOptionTextChord.result, false);
assert.ok(!macCommandOptionTextChord.calls.includes('ordinary-alt'));

console.log('Alt shortcut modifier routing preserves text entry and preview-only chords');
