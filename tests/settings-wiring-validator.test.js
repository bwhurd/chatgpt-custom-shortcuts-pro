const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runSettingsWiringValidation } = require('./lib/settings-wiring-validator');

function fixture(t) {
  const tempParent = fs.realpathSync(os.tmpdir());
  const repoRoot = fs.mkdtempSync(path.join(tempParent, 'cgcsp-wiring-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(repoRoot)), tempParent);
    fs.rmSync(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  const defaults = {
    featureEnabled: true,
    shortcutKeyExample: 'KeyA',
    shortcutKeyStudy: '',
    rememberSidebarScrollPositionCheckbox: false,
    hideArrowButtonsCheckbox: false,
    hideCornerButtonsCheckbox: false,
    modelPickerKeyCodes: [],
    modelPickerKeyCodesLatest: [],
    modelPickerKeyCodesLegacy: [],
    modelPickerKeyCodeProfilesVersion: 1,
    modelNames: {},
  };
  const schema = {
    excludeDefaultsKeys: ['hideArrowButtonsCheckbox', 'hideCornerButtonsCheckbox'],
    content: { visibilityDefaults: { featureEnabled: true } },
    shortcuts: {
      defaultCodeByKey: { shortcutKeyExample: 'KeyA' },
      labelI18nByKey: {
        shortcutKeyExample: 'shortcutLabel',
        shortcutKeyStudy: 'shortcutStudy',
      },
      overlaySections: [{ keys: ['shortcutKeyExample', 'shortcutKeyStudy'] }],
      deprecatedShortcutKeys: [],
    },
  };
  const html = `<div class="shortcut-item">
    <span class="i18n" data-i18n="featureLabel"></span>
    <input id="featureEnabled" type="checkbox" data-sync="featureEnabled" checked>
  </div><div class="shortcut-item">
    <span class="i18n" data-i18n="shortcutLabel"></span>
    <input id="shortcutKeyExample" class="key-input" data-sync="shortcutKeyExample" value="a">
  </div><div class="shortcut-item">
    <span class="i18n" data-i18n="shortcutStudy"></span>
    <input id="shortcutKeyStudy" class="key-input" data-sync="shortcutKeyStudy" value="">
  </div>`;
  const files = {
    'extension/manifest.json': JSON.stringify({ default_locale: 'en' }),
    'extension/popup.html': html,
    'extension/popup.js':
      'const EXPLICIT_PRESET_OVERRIDES = {}; const DEFAULT_SHORTCUT_CODE_FALLBACKS = { shortcutKeyExample: "KeyA" };',
    'extension/options-storage.js': `globalThis.OPTIONS_DEFAULTS = ${JSON.stringify(defaults)};`,
    'extension/settings-schema.js': `window.CSP_SETTINGS_SCHEMA = ${JSON.stringify(schema)};`,
    'extension/content.js': '',
    'tests/fixtures/settings.json': JSON.stringify({ data: defaults }),
    'extension/_locales/en/messages.json': JSON.stringify({
      featureLabel: { message: 'Feature' },
      shortcutLabel: { message: 'Shortcut' },
      shortcutStudy: { message: 'Study' },
    }),
    'extension/_locales/fr/messages.json': JSON.stringify({
      featureLabel: { message: 'Fonction' },
      shortcutLabel: { message: 'Raccourci' },
      shortcutStudy: { message: 'Étude' },
    }),
  };
  const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  const write = (relative, text) => {
    const target = path.join(repoRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const change = (relative, edit) => write(relative, edit(read(relative)));
  const json = (relative, edit) =>
    change(relative, (text) => {
      const value = JSON.parse(text);
      edit(value);
      return JSON.stringify(value);
    });
  for (const [relative, text] of Object.entries(files)) write(relative, text);
  return { repoRoot, files, html, read, write, change, json };
}

test('a small consistent project passes without mutating its files or claiming absent prototype checks', (t) => {
  const repo = fixture(t);
  const result = runSettingsWiringValidation(repo);
  assert.equal(result.ok, true, result.output);
  assert.equal(result.failureCount, 0);
  assert.doesNotMatch(result.output, /Prototype checks passed/);
  for (const [relative, text] of Object.entries(repo.files))
    assert.equal(repo.read(relative), text);
});

test('accepts a UTF-8 BOM in the manifest without changing its bytes', (t) => {
  const repo = fixture(t);
  repo.change('extension/manifest.json', (text) => `\uFEFF${text}`);
  assert.equal(runSettingsWiringValidation(repo).ok, true);
  assert.equal(repo.read('extension/manifest.json').charCodeAt(0), 0xfeff);
});

const defects = [
  [
    'missing stored default',
    (r) => r.change('extension/options-storage.js', (s) => s.replace('"featureEnabled":true,', '')),
    /featureEnabled[\s\S]*missing from options-storage/,
  ],
  [
    'checkbox default mismatch',
    (r) => r.change('extension/popup.html', (s) => s.replace(' checked', '')),
    /featureEnabled[\s\S]*checked state \(false\)/,
  ],
  [
    'shortcut default mismatch',
    (r) => r.change('extension/popup.html', (s) => s.replace('value="a"', 'value="z"')),
    /shortcutKeyExample[\s\S]*KeyZ[\s\S]*KeyA/,
  ],
  [
    'missing exported setting',
    (r) =>
      r.json('tests/fixtures/settings.json', (v) => {
        delete v.data.featureEnabled;
      }),
    /featureEnabled[\s\S]*export coverage/,
  ],
  [
    'missing translated label',
    (r) =>
      r.json('extension/_locales/fr/messages.json', (v) => {
        delete v.featureLabel;
      }),
    /featureEnabled[\s\S]*featureLabel[\s\S]*fr/,
  ],
  [
    'empty ordinary inventory',
    (r) =>
      r.write(
        'extension/popup.html',
        '<div id="model-picker-grid"><input class="mp-input" data-sync="modelPickerKeyCodes"></div>',
      ),
    /no ordinary data-sync controls/,
  ],
  [
    'blank binding',
    (r) =>
      r.change('extension/popup.html', (s) =>
        s.replace('data-sync="featureEnabled"', 'data-sync=" "'),
      ),
    /blank data-sync key on control featureEnabled/,
  ],
  [
    'duplicate binding',
    (r) =>
      r.change(
        'extension/popup.html',
        (s) => `${s}<input id="alias" data-sync="featureEnabled" type="checkbox">`,
      ),
    /duplicate data-sync key "featureEnabled"/,
  ],
  [
    'missing control id',
    (r) => r.change('extension/popup.html', (s) => s.replace('id="featureEnabled"', '')),
    /featureEnabled[\s\S]*no control id/,
  ],
  [
    'duplicate control id',
    (r) =>
      r.change('extension/popup.html', (s) =>
        s.replace('id="shortcutKeyExample"', 'id="featureEnabled"'),
      ),
    /duplicate control id "featureEnabled"/,
  ],
  [
    'missing schema membership',
    (r) => r.change('extension/settings-schema.js', (s) => s.replace('"featureEnabled":true', '')),
    /featureEnabled[\s\S]*visibility coverage/,
  ],
];
for (const [name, corrupt, expected] of defects) {
  test(`rejects ${name} for the intended reason`, (t) => {
    const repo = fixture(t);
    corrupt(repo);
    const result = runSettingsWiringValidation(repo);
    assert.equal(result.ok, false);
    assert.ok(result.failureCount > 0);
    assert.match(result.output, expected);
  });
}

test('dynamic model picker controls remain excluded before blank/duplicate binding checks', (t) => {
  const repo = fixture(t);
  repo.change(
    'extension/popup.html',
    (s) =>
      `${s}<div id="model-picker-grid"><input data-sync="featureEnabled"><input data-sync=""></div><input class="mp-input" data-sync="featureEnabled"><input id="mpKeyInput-0" data-sync="featureEnabled">`,
  );
  const result = runSettingsWiringValidation(repo);
  assert.equal(result.ok, true, result.output);
});

for (const [name, corrupt, expected] of [
  [
    'missing default locale',
    (r) =>
      r.json('extension/manifest.json', (v) => {
        v.default_locale = 'de';
      }),
    /Default locale "de" is missing/,
  ],
  [
    'empty locale collection',
    (r) => {
      fs.renameSync(
        path.join(r.repoRoot, 'extension/_locales'),
        path.join(r.repoRoot, 'saved-locales'),
      );
      fs.mkdirSync(path.join(r.repoRoot, 'extension/_locales'));
    },
    /Default locale "en" is missing/,
  ],
  [
    'undeclared default locale',
    (r) => r.write('extension/manifest.json', '{}'),
    /manifest.json must declare a default_locale/,
  ],
  [
    'missing authoritative defaults',
    (r) => r.write('extension/options-storage.js', '// no defaults'),
    /options-storage.js must define a nonempty OPTIONS_DEFAULTS/,
  ],
  [
    'missing authoritative schema',
    (r) => r.write('extension/settings-schema.js', 'window.CSP_SETTINGS_SCHEMA = {};'),
    /settings-schema.js must define a nonempty CSP_SETTINGS_SCHEMA/,
  ],
  [
    'malformed locale JSON',
    (r) => r.write('extension/_locales/en/messages.json', '{'),
    /Invalid JSON in .*en[\\/]messages.json/,
  ],
]) {
  test(`fails clearly on ${name}`, (t) => {
    const repo = fixture(t);
    corrupt(repo);
    assert.throws(() => runSettingsWiringValidation(repo), expected);
  });
}

test('the real CLI exits correctly for success, wiring failure, malformed JSON, and malformed source', (t) => {
  const repo = fixture(t);
  const run = () =>
    spawnSync(
      process.execPath,
      [path.join(__dirname, 'validate-keys.js'), '--repo-root', repo.repoRoot],
      { encoding: 'utf8' },
    );
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /validation passed/);
  repo.write('extension/popup.html', repo.html.replace(' checked', ''));
  const broken = run();
  assert.equal(broken.status, 1);
  assert.match(broken.stdout, /featureEnabled[\s\S]*checked state/);
  repo.write('extension/_locales/en/messages.json', '{');
  const jsonFailure = run();
  assert.equal(jsonFailure.status, 1);
  assert.match(jsonFailure.stderr, /Invalid JSON in .*messages.json/);
  repo.write('extension/options-storage.js', 'const = ;');
  const sourceFailure = run();
  assert.equal(sourceFailure.status, 1);
  assert.match(sourceFailure.stderr, /options-storage.js[\s\S]*SyntaxError/);
});
