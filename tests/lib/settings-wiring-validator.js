const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const NBSP = '\u00A0';
const PROTOTYPE_KEYS = ['clickToCopyInlineCodeEnabled', 'shortcutKeyShowOverlay'];

const SUPPLEMENTAL_SETTINGS = [
  {
    key: 'rememberSidebarScrollPositionCheckbox',
    reason: 'Hidden legacy setting that still persists in sync/export data.',
    checks: {
      optionsDefault: true,
      exportedFixture: true,
    },
  },
  {
    key: 'hideArrowButtonsCheckbox',
    reason: 'Hidden popup-excluded default that should stay in sync defaults and schema exclusions.',
    checks: {
      optionsDefault: true,
      schemaExcludeDefaults: true,
    },
  },
  {
    key: 'hideCornerButtonsCheckbox',
    reason: 'Hidden popup-excluded default that should stay in sync defaults and schema exclusions.',
    checks: {
      optionsDefault: true,
      schemaExcludeDefaults: true,
    },
  },
  {
    key: 'modelPickerKeyCodes',
    reason: 'Model picker data shape is out of scope for this validator, but export/default coverage should remain visible.',
    checks: {
      optionsDefault: true,
      exportedFixture: true,
    },
  },
  {
    key: 'modelNames',
    reason: 'Model catalog data is out of scope for popup wiring checks, but export/default coverage should remain visible.',
    checks: {
      optionsDefault: true,
      exportedFixture: true,
    },
  },
  {
    key: 'shortcutKeyRegenerateMoreConcise',
    reason: 'Deprecated legacy shortcut key remains in export/default data and should stay marked deprecated in schema.',
    checks: {
      optionsDefault: true,
      exportedFixture: true,
      schemaDeprecatedShortcut: true,
    },
  },
  {
    key: 'shortcutKeyRegenerateAddDetails',
    reason: 'Deprecated legacy shortcut key remains in export/default data and should stay marked deprecated in schema.',
    checks: {
      optionsDefault: true,
      exportedFixture: true,
      schemaDeprecatedShortcut: true,
    },
  },
];

const SPECIAL_RULES = {
  clickToCopyInlineCodeEnabled: {
    requireExplicitPresetOverride: true,
    requireVisibilityDefaults: true,
  },
  shortcutKeyShowOverlay: {
    requireExplicitPresetOverride: true,
    requireSchemaDefaultCode: true,
    requireShortcutFallback: true,
    contentProofs: [
      {
        label: 'content shortcut defaults',
        pattern:
          /shortcutKeyShowOverlay:\s*getSchemaShortcutDefaultCode\(\s*['"]shortcutKeyShowOverlay['"]\s*,\s*['"]Period['"]\s*\)/,
      },
      {
        label: 'content storage hydration',
        pattern:
          /chrome\.storage\.sync\.get\(\{\s*shortcutKeyShowOverlay:\s*showOverlayDefaultCode\s*\}/,
      },
      {
        label: 'content storage change listener',
        pattern: /changes\.shortcutKeyShowOverlay/,
      },
    ],
  },
};

function runSettingsWiringValidation({ repoRoot }) {
  if (!repoRoot) throw new Error('repoRoot is required');

  const context = loadValidationContext(repoRoot);
  const failures = new Map();

  validatePopupInventory(context, failures);
  validateSupplementalSettings(context, failures);
  validateFixtureCoverage(context, failures);

  const output = renderValidationReport(context, failures);
  return {
    ok: failures.size === 0,
    output,
    failureCount: Array.from(failures.values()).reduce((sum, items) => sum + items.length, 0),
  };
}

function loadValidationContext(repoRoot) {
  const popupHtmlPath = path.join(repoRoot, 'extension', 'popup.html');
  const popupJsPath = path.join(repoRoot, 'extension', 'popup.js');
  const optionsStoragePath = path.join(repoRoot, 'extension', 'options-storage.js');
  const settingsSchemaPath = path.join(repoRoot, 'extension', 'settings-schema.js');
  const contentPath = path.join(repoRoot, 'extension', 'content.js');
  const fixturePath = path.join(repoRoot, 'tests', 'fixtures', 'settings.json');

  const popupHtmlSource = readUtf8(popupHtmlPath);
  const popupJsSource = readUtf8(popupJsPath);
  const contentSource = readUtf8(contentPath);

  const optionsDefaults = loadOptionsDefaults(optionsStoragePath);
  const settingsSchema = loadSettingsSchema(settingsSchemaPath);
  const popupExplicitOverrides = extractConstObjectLiteral(popupJsSource, 'EXPLICIT_PRESET_OVERRIDES', {
    NBSP,
    DEFAULT_MODEL_PICKER_KEY_CODES: [],
  });
  const popupShortcutFallbacks = extractConstObjectLiteral(
    popupJsSource,
    'DEFAULT_SHORTCUT_CODE_FALLBACKS',
    {},
  );
  const popupEffectiveDefaults = buildEffectivePopupDefaults(
    optionsDefaults,
    settingsSchema,
    popupExplicitOverrides,
  );
  const popupInventory = extractPopupInventory(popupHtmlSource);
  const fixtureKeys = new Set(
    Object.keys(JSON.parse(readUtf8(fixturePath)).data || {}),
  );
  const localeIndex = loadLocaleIndex(path.join(repoRoot, 'extension', '_locales'));
  const schemaIndex = indexSettingsSchema(settingsSchema);

  return {
    popupInventory,
    popupInventoryKeys: new Set(popupInventory.map((item) => item.key)),
    skippedModelPickerKeys: popupInventory.skippedModelPickerKeys || [],
    optionsDefaults,
    popupExplicitOverrides,
    popupShortcutFallbacks,
    popupEffectiveDefaults,
    fixtureKeys,
    localeIndex,
    settingsSchema,
    schemaIndex,
    contentSource,
  };
}

function validatePopupInventory(context, failures) {
  for (const item of context.popupInventory) {
    validateCorePopupSetting(item, context, failures);

    if (item.controlKind === 'shortcut') {
      validateShortcutSetting(item, context, failures);
    } else if (
      item.controlKind === 'checkbox' ||
      item.controlKind === 'radio' ||
      item.controlKind === 'range' ||
      item.controlKind === 'color'
    ) {
      validateSchemaBackedUiSetting(item, context, failures);
    }

    validateSpecialRules(item, context, failures);
  }
}

function validateCorePopupSetting(item, context, failures) {
  if (!hasOwn(context.optionsDefaults, item.key)) {
    addFailure(failures, item.key, 'missing from options-storage.js OPTIONS_DEFAULTS');
  }

  if (!hasOwn(context.popupEffectiveDefaults, item.key)) {
    addFailure(failures, item.key, 'missing from popup.js effective DEFAULT_PRESET_DATA coverage');
  }

  if (!context.fixtureKeys.has(item.key)) {
    addFailure(failures, item.key, 'missing from tests/fixtures/settings.json export coverage');
  }

  validateLocaleCoverage(item.key, item.labelI18nKey, 'popup label', context, failures);
  validateLocaleCoverage(item.key, item.tooltipI18nKey, 'popup tooltip', context, failures);

  const popupDefault = context.popupEffectiveDefaults[item.key];
  if (
    popupDefault === '__UNMAPPED_SHORTCUT_CHAR__' &&
    item.controlKind === 'shortcut'
  ) {
    addFailure(
      failures,
      item.key,
      `options-storage.js default "${context.optionsDefaults[item.key]}" could not be normalized to KeyboardEvent.code`,
    );
  }

  if (item.controlKind === 'checkbox' || item.controlKind === 'radio') {
    const expected = Boolean(popupDefault);
    if (item.htmlDefault !== expected) {
      addFailure(
        failures,
        item.key,
        `popup.html checked state (${item.htmlDefault}) disagrees with popup.js effective default (${expected})`,
      );
    }
  }

  if (item.controlKind === 'range' && item.htmlDefault != null) {
    const actual = Number(item.htmlDefault);
    const expected = Number(popupDefault);
    if (Number.isFinite(actual) && Number.isFinite(expected) && actual !== expected) {
      addFailure(
        failures,
        item.key,
        `popup.html range default (${item.htmlDefault}) disagrees with popup.js effective default (${popupDefault})`,
      );
    }
  }

  if (item.controlKind === 'color' && typeof item.htmlDefault === 'string') {
    const actual = item.htmlDefault.trim().toLowerCase();
    const expected = String(popupDefault || '').trim().toLowerCase();
    if (actual && expected && actual !== expected) {
      addFailure(
        failures,
        item.key,
        `popup.html color default (${item.htmlDefault}) disagrees with popup.js effective default (${popupDefault})`,
      );
    }
  }
}

function validateSchemaBackedUiSetting(item, context, failures) {
  const inVisibilityDefaults = context.schemaIndex.visibilityDefaults.has(item.key);
  const inVisibilityExtras = context.schemaIndex.visibilityExtraKeys.has(item.key);
  const inRadioGroups = context.schemaIndex.popupRadioKeys.has(item.key);

  if (!inVisibilityDefaults && !inVisibilityExtras && !inRadioGroups) {
    addFailure(
      failures,
      item.key,
      'missing from settings-schema.js content visibility coverage and popup radio groups',
    );
  }

  if (item.controlKind === 'radio' && !inRadioGroups) {
    addFailure(failures, item.key, 'radio input is missing from settings-schema.js popup.radioGroups');
  }
}

function validateShortcutSetting(item, context, failures) {
  const deprecated = context.schemaIndex.deprecatedShortcutKeys.has(item.key);
  const schemaLabelKey = context.schemaIndex.shortcutLabelKeys[item.key] || null;

  if (!deprecated && !schemaLabelKey) {
    addFailure(failures, item.key, 'missing from settings-schema.js shortcuts.labelI18nByKey');
  }

  if (schemaLabelKey && item.labelI18nKey && schemaLabelKey !== item.labelI18nKey) {
    addFailure(
      failures,
      item.key,
      `popup label key (${item.labelI18nKey}) disagrees with settings-schema.js label key (${schemaLabelKey})`,
    );
  }

  if (!deprecated && !context.schemaIndex.overlaySectionKeys.has(item.key)) {
    addFailure(failures, item.key, 'missing from settings-schema.js shortcuts.overlaySections');
  }

  const htmlValue = typeof item.htmlDefault === 'string' ? item.htmlDefault.trim() : '';
  if (!htmlValue) return;

  const htmlCode = normalizeShortcutDisplayValueToCode(htmlValue);
  if (!htmlCode) {
    addFailure(
      failures,
      item.key,
      `popup.html shortcut default "${item.htmlDefault}" could not be normalized to KeyboardEvent.code`,
    );
    return;
  }

  const optionsCode = normalizeStoredShortcutDefaultToCode(context.optionsDefaults[item.key]);
  if (optionsCode && optionsCode !== '__UNMAPPED_SHORTCUT_CHAR__' && optionsCode !== htmlCode) {
    addFailure(
      failures,
      item.key,
      `popup.html shortcut default (${htmlCode}) disagrees with options-storage.js default (${optionsCode})`,
    );
  }

  const popupCode = context.popupEffectiveDefaults[item.key];
  if (typeof popupCode === 'string' && popupCode !== NBSP && popupCode !== htmlCode) {
    addFailure(
      failures,
      item.key,
      `popup.html shortcut default (${htmlCode}) disagrees with popup.js effective default (${popupCode})`,
    );
  }

  const schemaCode = context.schemaIndex.shortcutDefaultCodes[item.key];
  if (typeof schemaCode === 'string' && schemaCode.trim() && schemaCode !== htmlCode) {
    addFailure(
      failures,
      item.key,
      `popup.html shortcut default (${htmlCode}) disagrees with settings-schema.js default (${schemaCode})`,
    );
  }

  const fallbackCode = context.popupShortcutFallbacks[item.key];
  if (typeof fallbackCode === 'string' && fallbackCode.trim() && fallbackCode !== htmlCode) {
    addFailure(
      failures,
      item.key,
      `popup.html shortcut default (${htmlCode}) disagrees with popup.js fallback (${fallbackCode})`,
    );
  }
}

function validateSpecialRules(item, context, failures) {
  const rule = SPECIAL_RULES[item.key];
  if (!rule) return;

  if (rule.requireExplicitPresetOverride && !hasOwn(context.popupExplicitOverrides, item.key)) {
    addFailure(failures, item.key, 'missing from popup.js EXPLICIT_PRESET_OVERRIDES');
  }

  if (rule.requireVisibilityDefaults && !context.schemaIndex.visibilityDefaults.has(item.key)) {
    addFailure(failures, item.key, 'missing from settings-schema.js content.visibilityDefaults');
  }

  if (rule.requireSchemaDefaultCode && !hasOwn(context.schemaIndex.shortcutDefaultCodes, item.key)) {
    addFailure(failures, item.key, 'missing from settings-schema.js shortcuts.defaultCodeByKey');
  }

  if (rule.requireShortcutFallback && !hasOwn(context.popupShortcutFallbacks, item.key)) {
    addFailure(failures, item.key, 'missing from popup.js DEFAULT_SHORTCUT_CODE_FALLBACKS');
  }

  if (Array.isArray(rule.contentProofs)) {
    rule.contentProofs.forEach((proof) => {
      if (!proof.pattern.test(context.contentSource)) {
        addFailure(
          failures,
          item.key,
          `missing ${proof.label} proof point in extension/content.js`,
        );
      }
    });
  }
}

function validateSupplementalSettings(context, failures) {
  for (const entry of SUPPLEMENTAL_SETTINGS) {
    if (context.popupInventoryKeys.has(entry.key)) {
      addFailure(
        failures,
        entry.key,
        'supplemental setting unexpectedly appears in popup.html inventory',
      );
    }

    if (entry.checks.optionsDefault && !hasOwn(context.optionsDefaults, entry.key)) {
      addFailure(failures, entry.key, `supplemental coverage missing OPTIONS_DEFAULTS entry (${entry.reason})`);
    }

    if (entry.checks.exportedFixture && !context.fixtureKeys.has(entry.key)) {
      addFailure(
        failures,
        entry.key,
        `supplemental coverage missing tests/fixtures/settings.json key (${entry.reason})`,
      );
    }

    if (
      entry.checks.schemaExcludeDefaults &&
      !context.schemaIndex.excludeDefaultsKeys.has(entry.key)
    ) {
      addFailure(
        failures,
        entry.key,
        `supplemental coverage missing settings-schema.js excludeDefaultsKeys entry (${entry.reason})`,
      );
    }

    if (
      entry.checks.schemaDeprecatedShortcut &&
      !context.schemaIndex.deprecatedShortcutKeys.has(entry.key)
    ) {
      addFailure(
        failures,
        entry.key,
        `supplemental coverage missing settings-schema.js deprecated shortcut entry (${entry.reason})`,
      );
    }
  }
}

function validateFixtureCoverage(context, failures) {
  const accountedKeys = new Set(context.popupInventory.map((item) => item.key));
  SUPPLEMENTAL_SETTINGS.forEach((entry) => accountedKeys.add(entry.key));

  const unexpectedFixtureKeys = Array.from(context.fixtureKeys)
    .filter((key) => !accountedKeys.has(key))
    .sort();

  if (unexpectedFixtureKeys.length) {
    addFailure(
      failures,
      '(fixture inventory)',
      `tests/fixtures/settings.json contains keys outside popup inventory/supplemental coverage: ${unexpectedFixtureKeys.join(', ')}`,
    );
  }
}

function renderValidationReport(context, failures) {
  if (!failures.size) {
    return [
      'Settings wiring validation passed.',
      `Validated ${context.popupInventory.length} popup-backed controls and ${SUPPLEMENTAL_SETTINGS.length} supplemental keys.`,
      `Prototype checks passed: ${PROTOTYPE_KEYS.join(', ')}.`,
    ].join('\n');
  }

  const lines = ['Settings wiring validation failed.'];
  Array.from(failures.keys())
    .sort()
    .forEach((key) => {
      lines.push('');
      lines.push(`[${key}]`);
      failures.get(key).forEach((message) => {
        lines.push(`- ${message}`);
      });
    });

  return lines.join('\n');
}

function loadOptionsDefaults(filePath) {
  const code = readUtf8(filePath);
  const sandbox = {
    console,
    OptionsSync: buildOptionsSyncStub(),
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox.OPTIONS_DEFAULTS || sandbox.globalThis.OPTIONS_DEFAULTS || {};
}

function loadSettingsSchema(filePath) {
  const code = readUtf8(filePath);
  const sandbox = {
    console,
    window: {},
  };
  sandbox.globalThis = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox.window.CSP_SETTINGS_SCHEMA || {};
}

function buildOptionsSyncStub() {
  function OptionsSync(config) {
    this.config = config;
    return this;
  }
  OptionsSync.migrations = {
    removeUnused(stored) {
      return stored;
    },
  };
  return OptionsSync;
}

function extractConstObjectLiteral(source, constName, sandboxValues) {
  const token = `const ${constName} =`;
  const start = source.indexOf(token);
  if (start === -1) throw new Error(`Could not find "${constName}" in popup.js`);

  const braceStart = source.indexOf('{', start + token.length);
  if (braceStart === -1) throw new Error(`Could not find object literal for "${constName}"`);

  const braceEnd = findMatchingBraceIndex(source, braceStart);
  const objectSource = source.slice(braceStart, braceEnd + 1);
  const sandbox = { ...sandboxValues };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return vm.runInContext(`(${objectSource})`, sandbox, {
    filename: `${constName}.vm.js`,
  });
}

function findMatchingBraceIndex(source, braceStart) {
  let depth = 0;
  let activeQuote = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (activeQuote) {
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === activeQuote) activeQuote = '';
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      activeQuote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  throw new Error('Unbalanced object literal in popup.js');
}

function buildEffectivePopupDefaults(optionsDefaults, settingsSchema, popupExplicitOverrides) {
  const excludedKeys = new Set([
    'modelNames',
    'hideArrowButtonsCheckbox',
    'hideCornerButtonsCheckbox',
    ...(Array.isArray(settingsSchema.excludeDefaultsKeys) ? settingsSchema.excludeDefaultsKeys : []),
  ]);

  const out = {};
  Object.entries(optionsDefaults || {}).forEach(([key, value]) => {
    if (excludedKeys.has(key)) return;
    out[key] = coercePopupDefaultValue(key, value, settingsSchema);
  });

  Object.assign(out, popupExplicitOverrides || {});
  return out;
}

function coercePopupDefaultValue(key, value, settingsSchema) {
  if (key === 'popupBottomBarOpacityValue' || key === 'popupSlimSidebarOpacityValue') {
    return typeof value === 'number' ? value : Number(value);
  }

  if (isShortcutLikeKey(key, settingsSchema)) {
    return normalizeStoredShortcutDefaultToCode(value);
  }

  return value;
}

function isShortcutLikeKey(key, settingsSchema) {
  const shortcutSchema = settingsSchema.shortcuts || {};
  const prefix =
    typeof shortcutSchema.keyPrefix === 'string' && shortcutSchema.keyPrefix
      ? shortcutSchema.keyPrefix
      : 'shortcutKey';
  const extras = Array.isArray(shortcutSchema.extraShortcutKeys)
    ? shortcutSchema.extraShortcutKeys
    : ['selectThenCopy', 'selectThenCopyAllMessages'];

  return key.startsWith(prefix) || extras.includes(key);
}

function normalizeStoredShortcutDefaultToCode(value) {
  if (value == null) return NBSP;
  const text = String(value).trim();
  if (!text) return NBSP;
  if (text.length === 1) return charToCode(text) || '__UNMAPPED_SHORTCUT_CHAR__';
  return text;
}

function normalizeShortcutDisplayValueToCode(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length === 1) return charToCode(text) || '';
  return text;
}

function charToCode(char) {
  if (!char || char.length !== 1) return '';

  if (/[a-z]/i.test(char)) return `Key${char.toUpperCase()}`;
  if (/[0-9]/.test(char)) return `Digit${char}`;

  const map = {
    '↑': 'ArrowUp',
    '↓': 'ArrowDown',
    '←': 'ArrowLeft',
    '→': 'ArrowRight',
    '/': 'Slash',
    ';': 'Semicolon',
    ',': 'Comma',
    '.': 'Period',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    '-': 'Minus',
    '=': 'Equal',
    '\'': 'Quote',
    '\\': 'Backslash',
    '`': 'Backquote',
  };

  return map[char] || '';
}

function extractPopupInventory(htmlSource) {
  const $ = cheerio.load(htmlSource);
  const inventory = [];
  const skippedModelPickerKeys = [];
  const seenKeys = new Set();

  $('[data-sync]').each((_, element) => {
    const $element = $(element);
    const key = String($element.attr('data-sync') || '').trim();
    if (!key || seenKeys.has(key)) return;

    const id = String($element.attr('id') || '').trim();
    if (
      $element.hasClass('mp-input') ||
      $element.closest('#model-picker-grid').length ||
      /^mpKeyInput-/.test(id)
    ) {
      skippedModelPickerKeys.push(key);
      return;
    }

    seenKeys.add(key);

    const row = findInventoryRow($element);

    inventory.push({
      key,
      id,
      tagName: element.tagName ? String(element.tagName).toLowerCase() : '',
      inputType: String($element.attr('type') || '').toLowerCase(),
      controlKind: classifyControlKind($element, element),
      htmlDefault: readHtmlDefault($element, element),
      labelI18nKey: findFirstLabelKey(row),
      tooltipI18nKey: findFirstTooltipMessageKey(row),
    });
  });

  inventory.skippedModelPickerKeys = skippedModelPickerKeys;
  return inventory;
}

function classifyControlKind($element, element) {
  if ($element.hasClass('key-input')) return 'shortcut';

  const tagName = element.tagName ? String(element.tagName).toLowerCase() : '';
  const inputType = String($element.attr('type') || '').toLowerCase();

  if (tagName === 'textarea') return 'textarea';
  if (inputType === 'checkbox') return 'checkbox';
  if (inputType === 'radio') return 'radio';
  if (inputType === 'range') return 'range';
  if (inputType === 'color') return 'color';
  if (tagName === 'select') return 'select';
  return 'text';
}

function readHtmlDefault($element, element) {
  const tagName = element.tagName ? String(element.tagName).toLowerCase() : '';
  const inputType = String($element.attr('type') || '').toLowerCase();

  if (inputType === 'checkbox' || inputType === 'radio') {
    return $element.is('[checked]');
  }

  if (tagName === 'textarea') {
    return $element.text();
  }

  const valueAttr = $element.attr('value');
  return valueAttr == null ? null : valueAttr;
}

function findInventoryRow($element) {
  const selectors = ['.shortcut-item', '.p-segmented-controls', '.shortcut-label'];

  for (const selector of selectors) {
    const match = $element.closest(selector).first();
    if (match.length) return match;
  }

  return $element.parent();
}

function findFirstLabelKey($row) {
  if (!$row || !$row.length) return null;
  const key = $row.find('.i18n[data-i18n]').first().attr('data-i18n');
  return key ? String(key).trim() : null;
}

function findFirstTooltipMessageKey($row) {
  if (!$row || !$row.length) return null;
  let found = null;
  $row.find('[data-tooltip]').each((_, element) => {
    if (found) return;
    const candidate = extractMessageKey(element.attribs?.['data-tooltip']);
    if (candidate) found = candidate;
  });
  return found;
}

function extractMessageKey(value) {
  const match = /^__MSG_(.+?)__$/.exec(String(value || '').trim());
  return match ? match[1] : null;
}

function loadLocaleIndex(localeRoot) {
  const locales = fs
    .readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const messagesByLocale = new Map();
  locales.forEach((locale) => {
    const filePath = path.join(localeRoot, locale, 'messages.json');
    messagesByLocale.set(locale, JSON.parse(readUtf8(filePath)));
  });

  return {
    locales,
    messagesByLocale,
  };
}

function indexSettingsSchema(settingsSchema) {
  const popupRadioKeys = new Set();
  (settingsSchema.popup?.radioGroups || []).forEach((group) => {
    (group?.keys || []).forEach((key) => {
      if (typeof key === 'string' && key) popupRadioKeys.add(key);
    });
  });

  const overlaySectionKeys = new Set();
  (settingsSchema.shortcuts?.overlaySections || []).forEach((section) => {
    (section?.keys || []).forEach((key) => {
      if (typeof key === 'string' && key) overlaySectionKeys.add(key);
    });
  });

  return {
    visibilityDefaults: new Set(Object.keys(settingsSchema.content?.visibilityDefaults || {})),
    visibilityExtraKeys: new Set(settingsSchema.content?.visibilityExtraKeys || []),
    popupRadioKeys,
    overlaySectionKeys,
    deprecatedShortcutKeys: new Set(settingsSchema.shortcuts?.deprecatedShortcutKeys || []),
    excludeDefaultsKeys: new Set(settingsSchema.excludeDefaultsKeys || []),
    shortcutLabelKeys: settingsSchema.shortcuts?.labelI18nByKey || {},
    shortcutDefaultCodes: settingsSchema.shortcuts?.defaultCodeByKey || {},
  };
}

function validateLocaleCoverage(key, localeKey, surface, context, failures) {
  if (!localeKey) return;

  const missingLocales = context.localeIndex.locales.filter((locale) => {
    const messages = context.localeIndex.messagesByLocale.get(locale) || {};
    return !hasOwn(messages, localeKey);
  });

  if (missingLocales.length) {
    addFailure(
      failures,
      key,
      `${surface} locale key "${localeKey}" is missing in: ${missingLocales.join(', ')}`,
    );
  }
}

function addFailure(failures, key, message) {
  if (!failures.has(key)) failures.set(key, []);
  const items = failures.get(key);
  if (!items.includes(message)) items.push(message);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
  runSettingsWiringValidation,
};
