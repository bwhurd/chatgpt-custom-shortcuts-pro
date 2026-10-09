import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
const retiredKeys = ['shortcutKeyPreviousThread', 'shortcutKeyNextThread'];

for (const reason of ['install', 'update']) {
  for (const values of [
    ['Alt+ArrowUp', 'Alt+ArrowDown'],
    ['Ctrl+K', 'Ctrl+J'],
  ]) {
    const stored = {
      [retiredKeys[0]]: values[0],
      [retiredKeys[1]]: values[1],
      shortcutKeyNewChat: 'Ctrl+Shift+O',
      enabled: true,
    };
    const listeners = {};
    const event = (name) => ({
      addListener(listener) {
        assert.equal(listeners[name], undefined, `${name} registered more than once`);
        listeners[name] = listener;
      },
    });
    const removals = [];
    const context = vm.createContext({
      chrome: {
        storage: {
          session: {},
          sync: {
            async remove(keys) {
              removals.push(Array.from(keys));
              for (const key of keys) delete stored[key];
            },
          },
        },
        runtime: {
          getURL: (path) => `chrome-extension://fixture/${path}`,
          onInstalled: event('installed'),
          onMessage: event('message'),
        },
        windows: { onRemoved: event('windowRemoved') },
        action: { onClicked: event('actionClicked') },
      },
    });
    vm.runInContext(source, context);
    vm.runInContext(source, context);
    assert.deepEqual(Object.keys(listeners).sort(), [
      'actionClicked',
      'installed',
      'message',
      'windowRemoved',
    ]);
    await listeners.installed({ reason: 'chrome_update' });
    assert.equal(removals.length, 0);
    await listeners.installed({ reason });
    assert.deepEqual(stored, { shortcutKeyNewChat: 'Ctrl+Shift+O', enabled: true });
    assert.deepEqual(removals, [retiredKeys]);
    await listeners.installed({ reason });
    assert.deepEqual(stored, { shortcutKeyNewChat: 'Ctrl+Shift+O', enabled: true });
    assert.equal(
      listeners.message({ type: 'unrelated' }, {}, () => {}),
      undefined,
    );
    listeners.windowRemoved(999);
  }
}

console.log('Retired thread shortcuts background cleanup passed.');
