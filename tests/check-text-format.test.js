const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const checker = path.resolve(__dirname, '../scripts/check-text-format.js');
function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'cgcsp-text-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('-c', 'init.defaultBranch=main', 'init', '--quiet');
  const write = (relative, text) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  };
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const run = (...args) =>
    spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: 'utf8' });
  return { root, git, write, read, run };
}

test('accepts clean tracked and untracked files, empty modules, and Unicode paths/content', (t) => {
  const r = fixture(t);
  r.write('tracked.md', 'A note.\n');
  r.git('add', 'tracked.md');
  r.write('empty.js', '');
  r.write('new file é.md', 'Bonjour — 日本語\n');
  const result = r.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(r.read('empty.js'), '');
  assert.equal(r.read('new file é.md'), 'Bonjour — 日本語\n');
});

for (const tracked of [true, false]) {
  test(`detects ${tracked ? 'tracked' : 'untracked'} defects without writing, and repairs idempotently`, (t) => {
    const r = fixture(t);
    const bad = 'first  \r\nsecond\t\rthird\n\n';
    r.write('draft.md', bad);
    if (tracked) r.git('add', 'draft.md');
    const check = r.run();
    assert.equal(check.status, 1);
    assert.match(check.stderr, /draft.md/);
    assert.equal(r.read('draft.md'), bad, 'read-only checks must preserve the bytes');
    assert.equal(r.run('--write').status, 0);
    assert.equal(r.read('draft.md'), 'first\nsecond\nthird\n');
    assert.equal(r.run().status, 0);
    const again = r.run('--write');
    assert.equal(again.status, 0);
    assert.equal(again.stderr, '', 'a second repair must make no changes');
  });
}

test('checks final newlines and dotfile text while leaving internal spaces intact', (t) => {
  const r = fixture(t);
  r.write('.gitignore', 'ignored/  ');
  r.write('code.js', 'const text = "two  spaces";');
  const result = r.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\.gitignore/);
  assert.match(result.stderr, /code.js/);
  assert.equal(r.run('--write').status, 0);
  assert.equal(r.read('.gitignore'), 'ignored/\n');
  assert.equal(r.read('code.js'), 'const text = "two  spaces";\n');
});

test('skips ignored, generated, vendor, minified, and non-text files even if exclusions are tracked', (t) => {
  const r = fixture(t);
  r.write('.gitignore', 'ignored/\n');
  const excluded = [
    'ignored/scratch.md',
    '_temp-files/scratch.md',
    'extension/vendor/library.js',
    'extension/lib/library.min.js',
    'tests/tampermonkey-dev-scrape/chatgpt-devscrape-wide.user.js',
    '.vscode/settings.json',
    'netlify/functions/handler.js',
    'test-results/report.md',
    'playwright-report/report.html',
    'image.png',
  ];
  for (const relative of excluded) r.write(relative, 'deliberately bad  \r\n');
  r.git(
    'add',
    '-f',
    'extension/vendor/library.js',
    'extension/lib/library.min.js',
    'tests/tampermonkey-dev-scrape/chatgpt-devscrape-wide.user.js',
  );
  assert.equal(r.run().status, 0);
  assert.equal(r.run('--write').status, 0);
  for (const relative of excluded) assert.equal(r.read(relative), 'deliberately bad  \r\n');
});

test('tolerates a deleted tracked file and reports an added replacement', (t) => {
  const r = fixture(t);
  r.write('old.md', 'old\n');
  r.git('add', 'old.md');
  fs.unlinkSync(path.join(r.root, 'old.md'));
  r.write('new.md', 'new');
  const result = r.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new.md/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
