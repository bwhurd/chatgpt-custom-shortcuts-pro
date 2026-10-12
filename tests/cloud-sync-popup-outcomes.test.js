const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createContext, runInContext } = require('node:vm');
const test = require('node:test');

const popupSource = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
const englishMessages = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../extension/_locales/en/messages.json'), 'utf8'),
);
const localeMessage = (key) => englishMessages[key]?.message || '';

function extractIifeAfter(source, marker, endMarker = '') {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing source marker: ${marker}`);
  const iifeStart = source.indexOf('(() => {', markerIndex);
  assert.notEqual(iifeStart, -1, `missing IIFE after source marker: ${marker}`);
  const iifeEnd = endMarker ? source.indexOf(endMarker, iifeStart) : source.length;
  assert.notEqual(iifeEnd, -1, `missing end marker: ${endMarker}`);
  return source.slice(iifeStart, iifeEnd);
}

const syncSettingsIife = extractIifeAfter(
  popupSource,
  '// @note top of Sync Settings to Google IIFE',
  '/* Sync Settings Button js IIFE */',
);
const busyHelperIife = extractIifeAfter(popupSource, '/* Sync Settings Button js IIFE */');
const colorNormalizerStart = popupSource.indexOf('function normalizeColorSettingsPatch(');
const colorNormalizerEnd = popupSource.indexOf(
  '\n\nconst cloneModelActionGroups',
  colorNormalizerStart,
);
assert.notEqual(colorNormalizerStart, -1, 'missing color settings normalizer');
assert.notEqual(colorNormalizerEnd, -1, 'missing color settings normalizer end');
const colorNormalizerSource = popupSource.slice(colorNormalizerStart, colorNormalizerEnd);
const importFunctionStart = popupSource.indexOf('    async function importSettingsObj(');
const importFunctionEnd = popupSource.indexOf(
  '\n    function importSettingsFromFile()',
  importFunctionStart,
);
assert.notEqual(importFunctionStart, -1, 'missing actual settings import function');
assert.notEqual(importFunctionEnd, -1, 'missing actual settings import function end');
const importFunctionSource = popupSource.slice(importFunctionStart, importFunctionEnd);
const genericHydrationStart = popupSource.indexOf('const hydrateNonShortcutSettings = () => {');
const genericHydrationEnd = popupSource.indexOf(
  '\n\n          if (Object.keys(patch).length > 0) {',
  genericHydrationStart,
);
assert.notEqual(genericHydrationStart, -1, 'missing actual generic popup hydrator');
assert.notEqual(genericHydrationEnd, -1, 'missing generic popup hydrator end');
const genericHydrationSource = popupSource.slice(genericHydrationStart, genericHydrationEnd);
const specializedHydrationStart = popupSource.indexOf(
  '  // On load: sync checkbox and color pickers from storage',
);
const specializedHydrationEnd = popupSource.indexOf(
  '  // Checkbox toggles color picker visibility',
  specializedHydrationStart,
);
assert.notEqual(specializedHydrationStart, -1, 'missing actual specialized color hydrator');
assert.notEqual(specializedHydrationEnd, -1, 'missing specialized color hydrator end');
const specializedHydrationSource = popupSource.slice(
  specializedHydrationStart,
  specializedHydrationEnd,
);

const COLOR_DEFAULTS = {
  colorBoldTextLightColor: '#2037e6',
  colorBoldTextDarkColor: '#4da3ff',
};

class FakeIcon {
  constructor(className, textContent = '') {
    this.className = className;
    this.textContent = textContent;
    this.attributes = {};
    this.parentElement = null;
    this.isConnected = true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  replaceWith(replacement) {
    const parent = this.parentElement;
    const index = parent.children.indexOf(this);
    assert.notEqual(index, -1);
    parent.children[index] = replacement;
    replacement.parentElement = parent;
    this.parentElement = null;
    this.isConnected = false;
  }
}

class FakeButton {
  constructor(id) {
    this.id = id;
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.disabled = false;
    this.children = [new FakeIcon('msr', `icon-${id}`)];
    this.children[0].parentElement = this;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    if (selector.includes('.spinner')) {
      return this.children.find((child) => child.className.split(' ').includes('spinner')) || null;
    }
    if (selector.includes('.msr') || selector.includes('.material-icons-outlined')) {
      return (
        this.children.find((child) =>
          ['msr', 'material-icons-outlined', 'material-symbols-outlined'].some((name) =>
            child.className.split(' ').includes(name),
          ),
        ) || null
      );
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  click() {
    const listener = this.listeners.get('click');
    assert.equal(typeof listener, 'function', `${this.id} click handler is wired`);
    return listener({ type: 'click', currentTarget: this, target: this });
  }
}

class FakeStatus {
  constructor() {
    this.dataset = {};
    this.writes = [];
    this._textContent = '';
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = value;
    this.writes.push(value);
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeHarness({ localSettings = {} } = {}) {
  const elements = new Map();
  const buttonIds = {
    btnGoogleLogin: 'btnGoogleLogin',
    btnSyncToCloud: 'btnSyncToCloud',
    btnRestoreFromCloud: 'btnRestoreFromCloud',
    btnCloudLogout: 'btnCloudLogout',
  };
  for (const [elementId, buttonId] of Object.entries(buttonIds)) {
    elements.set(elementId, new FakeButton(buttonId));
  }
  elements.set('signinRow', { style: {} });
  elements.set('syncRow', { style: {} });
  const status = new FakeStatus();
  elements.set('syncStatus', status);

  const permission = {
    contains: true,
    request: true,
    calls: [],
    deferredContainsCallback: null,
  };
  const store = {
    calls: [],
    loadLocalSettingsDeferred: null,
    saveSyncedSettingsError: null,
    loadSyncedSettingsError: null,
    loadSyncedSettingsDeferred: null,
    remote: { sampleSetting: true },
    savedLocalSettings: [],
    appliedSnapshots: [],
    localSettings: { ...localSettings },
  };

  const cloudStorage = {
    async loadLocalSettings() {
      store.calls.push('loadLocalSettings');
      if (store.loadLocalSettingsDeferred) return store.loadLocalSettingsDeferred.promise;
      return Object.keys(store.localSettings).length
        ? { ...store.localSettings }
        : { shortcutKey1: 'KeyA' };
    },
    async saveSyncedSettings(settings) {
      store.calls.push(['saveSyncedSettings', settings]);
      if (store.saveSyncedSettingsError) throw store.saveSyncedSettingsError;
      store.remote = { ...settings };
    },
    async loadSyncedSettings() {
      store.calls.push('loadSyncedSettings');
      if (store.loadSyncedSettingsError) throw store.loadSyncedSettingsError;
      if (store.loadSyncedSettingsDeferred) return store.loadSyncedSettingsDeferred.promise;
      return { ...store.remote };
    },
    async saveLocalSettings(settings) {
      store.calls.push(['saveLocalSettings', settings]);
      store.savedLocalSettings.push({ ...settings });
      Object.assign(store.localSettings, settings);
      return { ...store.localSettings };
    },
  };

  const window = {
    CloudStorage: cloudStorage,
    CloudAuth: {
      async getSavedAuth() {
        return { profile: { email: 'person@example.test' } };
      },
    },
    __popupShortcutAssignmentsApi: {
      async persist(settings, saveLocalSettings) {
        store.calls.push('persist');
        await saveLocalSettings(settings);
        return { ...store.localSettings };
      },
      apply(snapshot) {
        store.calls.push(['apply', snapshot]);
        store.appliedSnapshots.push({ ...snapshot });
      },
    },
  };

  const sandbox = {
    window,
    document: {
      readyState: 'complete',
      getElementById: (id) => elements.get(id) || null,
      createElement: (tagName) => new FakeIcon(tagName, ''),
      addEventListener() {},
    },
    chrome: {
      permissions: {
        contains(_options, callback) {
          permission.calls.push('contains');
          if (permission.contains === 'deferred') {
            permission.deferredContainsCallback = callback;
            return;
          }
          callback(permission.contains);
        },
        request(_options, callback) {
          permission.calls.push('request');
          callback(permission.request);
        },
      },
      i18n: {
        getMessage(key) {
          return localeMessage(key);
        },
      },
      runtime: { onMessage: { addListener() {} } },
    },
    MODEL_CATALOG_SCRAPE_STATE_KEYS: [],
    console: { error() {} },
    setTimeout,
  };
  const context = createContext(sandbox);
  runInContext(colorNormalizerSource, context);
  runInContext(busyHelperIife, context);
  runInContext(syncSettingsIife, context);

  return new Promise((resolve) => {
    setImmediate(() => {
      const buttons = {
        save: elements.get('btnSyncToCloud'),
        restore: elements.get('btnRestoreFromCloud'),
      };
      resolve({
        buttons,
        cloudStorage,
        elements,
        permission,
        status,
        store,
        window,
      });
    });
  });
}

function createStartupColorHydrationHarness(settings) {
  const controls = new Map([
    ['colorBoldTextEnabled', { type: 'checkbox', checked: true }],
    ['colorBoldTextLightColor', { type: 'color', value: '#000000' }],
    ['colorBoldTextDarkColor', { type: 'color', value: '#000000' }],
  ]);
  const enabled = controls.get('colorBoldTextEnabled');
  const light = controls.get('colorBoldTextLightColor');
  const dark = controls.get('colorBoldTextDarkColor');
  const picker = { style: { display: 'flex' } };
  const context = createContext({
    allKeys: ['colorBoldTextEnabled', ...Object.keys(COLOR_DEFAULTS)],
    data: { ...settings },
    fullData: { ...settings },
    DEFAULT_PRESET_DATA: { colorBoldTextEnabled: false, ...COLOR_DEFAULTS },
    document: {
      getElementById: (id) => controls.get(id) || null,
      querySelector: () => null,
    },
    sep_storageToUI: (value) => value,
    resolve() {},
    colorBoldTextEnabled: enabled,
    colorBoldTextLightColorInput: light,
    colorBoldTextDarkColorInput: dark,
    colorBoldTextPickerContainer: picker,
    COLOR_BOLD_LIGHT_DEFAULT: COLOR_DEFAULTS.colorBoldTextLightColor,
    COLOR_BOLD_DARK_DEFAULT: COLOR_DEFAULTS.colorBoldTextDarkColor,
    toggleColorBoldTextUI(visible) {
      picker.style.display = visible ? 'flex' : 'none';
    },
    setColorBoldTextUI(lightColor, darkColor) {
      light.value = lightColor || COLOR_DEFAULTS.colorBoldTextLightColor;
      dark.value = darkColor || COLOR_DEFAULTS.colorBoldTextDarkColor;
    },
    chrome: {
      storage: {
        sync: {
          get(_keys, callback) {
            callback({ ...settings });
          },
        },
      },
    },
  });
  runInContext(colorNormalizerSource, context);
  return {
    runGeneric() {
      runInContext(`${genericHydrationSource}; hydrateNonShortcutSettings();`, context);
    },
    runSpecialized() {
      runInContext(specializedHydrationSource, context);
    },
    snapshot() {
      return {
        colorBoldTextEnabled: enabled.checked,
        colorBoldTextLightColor: light.value,
        colorBoldTextDarkColor: dark.value,
        pickerDisplay: picker.style.display,
      };
    },
  };
}

function makeImportHarness(initialSettings = {}) {
  const importedPatches = [];
  const appliedSnapshots = [];
  const toasts = [];
  const localSettings = { ...initialSettings };
  const controls = {
    colorBoldTextEnabled: {
      type: 'checkbox',
      checked: localSettings.colorBoldTextEnabled ?? null,
    },
    colorBoldTextLightColor: {
      type: 'color',
      value: localSettings.colorBoldTextLightColor ?? '',
    },
    colorBoldTextDarkColor: {
      type: 'color',
      value: localSettings.colorBoldTextDarkColor ?? '',
    },
  };
  const context = createContext({
    MODEL_CATALOG_SCRAPE_STATE_KEYS: new Set(),
    MODEL_PICKER_KEY_CODE_PROFILES_VERSION_KEY: 'modelPickerKeyCodeProfilesVersion',
    MODEL_PICKER_KEY_CODES_STORAGE_BY_PROFILE: {
      latest: 'modelPickerKeyCodesLatest',
      legacy: 'modelPickerKeyCodesLegacy',
    },
    MODEL_CATALOG_PROFILE_LATEST: 'latest',
    MODEL_CATALOG_PROFILE_LEGACY: 'legacy',
    shortcutKeys: [],
    legacyShortcutKeys: [],
    getExportKeySet: () =>
      new Set([
        'colorBoldTextEnabled',
        'colorBoldTextLightColor',
        'colorBoldTextDarkColor',
        'sampleSetting',
      ]),
    normalizeShortcutVal: (value) => value,
    persistNormalizedPopupShortcutPatch: async (patch) => {
      importedPatches.push({ ...patch });
      Object.assign(localSettings, patch);
      return { ...localSettings };
    },
    applyPopupShortcutSnapshot: (snapshot) => appliedSnapshots.push(snapshot),
    showToast: (message) => toasts.push(message),
    t: (message) => message,
    sep_storageToUI: (value) => value,
    document: { getElementById: (key) => controls[key] || null },
    window: { confirm: () => true },
    console: { error() {} },
  });
  runInContext(colorNormalizerSource, context);
  runInContext(importFunctionSource, context);
  return { appliedSnapshots, controls, context, importedPatches, localSettings, toasts };
}

function assertBusy(button, expected) {
  assert.equal(button.disabled, expected);
  assert.equal(button.getAttribute('aria-busy'), expected ? 'true' : null);
  assert.equal(Boolean(button.querySelector('.spinner')), expected);
}

function assertControlsRestored(harness) {
  assertBusy(harness.buttons.save, false);
  assertBusy(harness.buttons.restore, false);
  assert.equal(harness.buttons.save.querySelector('.msr')?.textContent, 'icon-btnSyncToCloud');
  assert.equal(
    harness.buttons.restore.querySelector('.msr')?.textContent,
    'icon-btnRestoreFromCloud',
  );
}

function assertNoLocalWrites(harness, initialLocal) {
  assert.deepEqual(harness.store.localSettings, initialLocal);
  assert.deepEqual(harness.store.savedLocalSettings, []);
  assert.deepEqual(harness.store.appliedSnapshots, []);
  assert.equal(harness.store.calls.includes('persist'), false);
  assert.equal(
    harness.store.calls.some(
      (call) => Array.isArray(call) && ['saveLocalSettings', 'apply'].includes(call[0]),
    ),
    false,
  );
}

async function flushMicrotasks() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

for (const firstOperation of ['save', 'restore']) {
  test(`${firstOperation} owns the shared popup operation until completion`, async () => {
    const harness = await makeHarness();
    const saveSnapshot = { operation: 'save-first', shortcutKey1: 'KeyA' };
    const restoreSnapshot = { operation: 'restore-first', shortcutKey1: 'KeyR' };
    const authStatus = harness.status.textContent;
    const authWrites = harness.status.writes.length;
    const operationWait = deferred();
    harness.permission.contains = 'deferred';
    if (firstOperation === 'save') {
      Object.assign(harness.store.localSettings, saveSnapshot);
      harness.store.remote = { operation: 'stale-cloud' };
      harness.store.loadLocalSettingsDeferred = operationWait;
    } else {
      harness.store.remote = restoreSnapshot;
      harness.store.loadSyncedSettingsDeferred = operationWait;
    }

    const first = harness.buttons[firstOperation].click();
    assertBusy(harness.buttons.save, true);
    assertBusy(harness.buttons.restore, true);
    assert.deepEqual(harness.permission.calls, ['contains']);
    assert.equal(harness.status.writes.length, authWrites);

    const competingOperation = firstOperation === 'save' ? 'restore' : 'save';
    await harness.buttons[competingOperation].click();
    assert.deepEqual(harness.permission.calls, ['contains']);
    assert.deepEqual(harness.store.calls, []);
    assert.equal(harness.status.textContent, authStatus);
    assert.equal(harness.status.writes.length, authWrites);

    const resolveContains = harness.permission.deferredContainsCallback;
    assert.equal(typeof resolveContains, 'function');
    harness.permission.contains = true;
    resolveContains(true);
    await flushMicrotasks();
    assert.equal(harness.status.textContent, firstOperation === 'save' ? 'Saving…' : 'Restoring…');
    const activeStatus = harness.status.textContent;
    const activeWrites = harness.status.writes.length;
    await harness.buttons[competingOperation].click();
    assert.equal(harness.status.textContent, activeStatus);
    assert.equal(harness.status.writes.length, activeWrites);
    assert.equal(
      harness.store.calls.includes(
        firstOperation === 'save' ? 'loadSyncedSettings' : 'loadLocalSettings',
      ),
      false,
    );

    operationWait.resolve(firstOperation === 'save' ? saveSnapshot : restoreSnapshot);
    await first;
    assertControlsRestored(harness);
    assert.equal(
      harness.status.textContent,
      firstOperation === 'save' ? localeMessage('status_saved') : localeMessage('status_restored'),
    );
    assert.equal(harness.status.dataset.tone, 'success');
    if (firstOperation === 'save') {
      assert.deepEqual(harness.store.localSettings, saveSnapshot);
      assert.deepEqual(harness.store.remote, saveSnapshot);
      assert.deepEqual(harness.store.savedLocalSettings, []);
      assert.deepEqual(harness.store.appliedSnapshots, []);
      assert.equal(
        harness.store.calls.filter(
          (call) => Array.isArray(call) && call[0] === 'saveSyncedSettings',
        ).length,
        1,
      );
    } else {
      assert.deepEqual(harness.store.localSettings, restoreSnapshot);
      assert.deepEqual(harness.store.remote, restoreSnapshot);
      assert.deepEqual(harness.store.savedLocalSettings, [restoreSnapshot]);
      assert.deepEqual(harness.store.appliedSnapshots, [restoreSnapshot]);
      assert.equal(
        harness.store.calls.filter(
          (call) => Array.isArray(call) && call[0] === 'saveSyncedSettings',
        ).length,
        0,
      );
    }

    await harness.buttons[competingOperation].click();
    assertControlsRestored(harness);
    assert.equal(
      harness.status.textContent,
      competingOperation === 'save'
        ? localeMessage('status_saved')
        : localeMessage('status_restored'),
    );
  });
}

test('permission denial releases both controls and allows a later restore', async () => {
  const harness = await makeHarness();
  harness.permission.contains = false;
  harness.permission.request = false;

  await harness.buttons.save.click();

  assert.equal(harness.status.textContent, 'Permission required to save to cloud.');
  assert.deepEqual(harness.permission.calls, ['contains', 'request']);
  assert.deepEqual(harness.store.calls, []);
  assertControlsRestored(harness);

  harness.permission.contains = true;
  await harness.buttons.restore.click();
  assert.equal(harness.status.textContent, localeMessage('status_restored'));
  assertControlsRestored(harness);
});

test('Save service failure leaves local data untouched and permits retry', async () => {
  const initialLocal = { localOnly: 'preserve-me' };
  const initialCloud = { remoteOnly: 'preserve-me' };
  const harness = await makeHarness({ localSettings: initialLocal });
  harness.store.remote = { ...initialCloud };
  harness.store.saveSyncedSettingsError = new Error('Drive create failed (500)');

  await harness.buttons.save.click();

  assert.equal(harness.status.textContent, 'Drive create failed (500)');
  assert.equal(harness.status.dataset.tone, 'error');
  assert.deepEqual(harness.store.calls, [
    'loadLocalSettings',
    ['saveSyncedSettings', initialLocal],
  ]);
  assertNoLocalWrites(harness, initialLocal);
  assert.deepEqual(harness.store.remote, initialCloud);
  assertControlsRestored(harness);

  harness.store.saveSyncedSettingsError = null;
  await harness.buttons.save.click();
  assert.equal(harness.status.textContent, localeMessage('status_saved'));
  assertControlsRestored(harness);
});

test('Restore service failure leaves local data untouched and permits retry', async () => {
  const initialLocal = { localOnly: 'preserve-me' };
  const restoredSnapshot = { restoredSetting: true };
  const harness = await makeHarness({ localSettings: initialLocal });
  harness.store.loadSyncedSettingsError = new Error('Drive download failed (403)');

  await harness.buttons.restore.click();

  assert.equal(harness.status.textContent, 'Drive download failed (403)');
  assert.equal(harness.status.dataset.tone, 'error');
  assertNoLocalWrites(harness, initialLocal);
  assertControlsRestored(harness);

  harness.store.loadSyncedSettingsError = null;
  harness.store.remote = restoredSnapshot;
  await harness.buttons.restore.click();
  assert.equal(harness.status.textContent, localeMessage('status_restored'));
  const expectedRestoredSettings = { ...initialLocal, ...restoredSnapshot };
  assert.deepEqual(harness.store.localSettings, expectedRestoredSettings);
  assert.deepEqual(harness.store.savedLocalSettings, [restoredSnapshot]);
  assert.deepEqual(harness.store.appliedSnapshots, [expectedRestoredSettings]);
  assertControlsRestored(harness);
});

test('an empty backup reports no backup and releases both controls for reacquisition', async () => {
  const initialLocal = { localOnly: 'preserve-me' };
  const harness = await makeHarness({ localSettings: initialLocal });
  harness.store.remote = {};

  await harness.buttons.restore.click();

  assert.equal(harness.status.textContent, localeMessage('status_no_backup'));
  assert.equal(harness.status.dataset.tone, 'error');
  assertNoLocalWrites(harness, initialLocal);
  assertControlsRestored(harness);

  await harness.buttons.save.click();
  assert.equal(harness.status.textContent, localeMessage('status_saved'));
  assert.equal(harness.status.dataset.tone, 'success');
  assertControlsRestored(harness);
});

const malformedStartupColorSettings = {
  colorBoldTextEnabled: 'false',
  colorBoldTextLightColor: 'red',
  colorBoldTextDarkColor: '#112233; } body { color: red !important; } /*',
};
const validStartupColorSettings = {
  colorBoldTextEnabled: true,
  colorBoldTextLightColor: '#112233',
  colorBoldTextDarkColor: '#aAbBcC',
};
const startupColorScenarios = [
  {
    name: 'malformed settings, generic then specialized',
    settings: malformedStartupColorSettings,
    order: ['generic', 'specialized'],
    expected: {
      colorBoldTextEnabled: false,
      colorBoldTextLightColor: COLOR_DEFAULTS.colorBoldTextLightColor,
      colorBoldTextDarkColor: COLOR_DEFAULTS.colorBoldTextDarkColor,
      pickerDisplay: 'none',
    },
  },
  {
    name: 'valid settings, specialized then generic',
    settings: validStartupColorSettings,
    order: ['specialized', 'generic'],
    expected: {
      colorBoldTextEnabled: true,
      colorBoldTextLightColor: '#112233',
      colorBoldTextDarkColor: '#aAbBcC',
      pickerDisplay: 'flex',
    },
  },
];

for (const { name, settings, order, expected } of startupColorScenarios) {
  test(`startup color hydration preserves state for ${name}`, () => {
    const harness = createStartupColorHydrationHarness(settings);
    for (const hydrator of order) {
      harness[hydrator === 'generic' ? 'runGeneric' : 'runSpecialized']();
      const snapshot = harness.snapshot();
      assert.deepEqual(
        {
          colorBoldTextEnabled: snapshot.colorBoldTextEnabled,
          colorBoldTextLightColor: snapshot.colorBoldTextLightColor,
          colorBoldTextDarkColor: snapshot.colorBoldTextDarkColor,
        },
        {
          colorBoldTextEnabled: expected.colorBoldTextEnabled,
          colorBoldTextLightColor: expected.colorBoldTextLightColor,
          colorBoldTextDarkColor: expected.colorBoldTextDarkColor,
        },
        `${hydrator} must independently normalize its controls`,
      );
      if (hydrator === 'specialized') {
        assert.equal(snapshot.pickerDisplay, expected.pickerDisplay);
      }
    }
    assert.deepEqual(harness.snapshot(), expected);
  });
}

test('actual settings import drops malformed color fields and preserves valid color values', async () => {
  const harness = makeImportHarness({
    colorBoldTextEnabled: true,
    colorBoldTextLightColor: '#112233',
    colorBoldTextDarkColor: '#445566',
  });

  assert.equal(
    await harness.context.importSettingsObj(
      {
        colorBoldTextEnabled: 'false',
        colorBoldTextLightColor: 'blue',
        colorBoldTextDarkColor: '#A1b2C3',
        sampleSetting: true,
      },
      { skipBrowserConfirm: true },
    ),
    true,
  );
  assert.deepEqual(harness.importedPatches[0], {
    colorBoldTextDarkColor: '#A1b2C3',
    sampleSetting: true,
  });
  assert.deepEqual(harness.localSettings, {
    colorBoldTextEnabled: true,
    colorBoldTextLightColor: '#112233',
    colorBoldTextDarkColor: '#A1b2C3',
    sampleSetting: true,
  });
  assert.equal(harness.controls.colorBoldTextEnabled.checked, true);
  assert.equal(harness.controls.colorBoldTextLightColor.value, '#112233');
  assert.equal(harness.controls.colorBoldTextDarkColor.value, '#A1b2C3');

  assert.equal(
    await harness.context.importSettingsObj(
      {
        colorBoldTextEnabled: false,
        colorBoldTextLightColor: '#123abc',
        colorBoldTextDarkColor: '#abcdef',
      },
      { skipBrowserConfirm: true },
    ),
    true,
  );
  assert.deepEqual(harness.importedPatches[1], {
    colorBoldTextEnabled: false,
    colorBoldTextLightColor: '#123abc',
    colorBoldTextDarkColor: '#abcdef',
  });
  assert.deepEqual(harness.localSettings, {
    colorBoldTextEnabled: false,
    colorBoldTextLightColor: '#123abc',
    colorBoldTextDarkColor: '#abcdef',
    sampleSetting: true,
  });
  assert.equal(harness.controls.colorBoldTextEnabled.checked, false);
  assert.equal(harness.controls.colorBoldTextLightColor.value, '#123abc');
  assert.equal(harness.controls.colorBoldTextDarkColor.value, '#abcdef');
});

test('actual cloud restore omits malformed color fields and persists valid values', async () => {
  const harness = await makeHarness({
    localSettings: {
      colorBoldTextEnabled: true,
      colorBoldTextLightColor: '#112233',
      colorBoldTextDarkColor: '#445566',
    },
  });
  harness.store.remote = {
    colorBoldTextEnabled: 'true',
    colorBoldTextLightColor: 7,
    colorBoldTextDarkColor: '#B2c3D4',
    sampleSetting: true,
  };

  await harness.buttons.restore.click();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.store.savedLocalSettings)), [
    { colorBoldTextDarkColor: '#B2c3D4', sampleSetting: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.store.localSettings)), {
    colorBoldTextEnabled: true,
    colorBoldTextLightColor: '#112233',
    colorBoldTextDarkColor: '#B2c3D4',
    sampleSetting: true,
  });
  assert.equal(harness.status.textContent, localeMessage('status_restored'));
  assertControlsRestored(harness);
});
