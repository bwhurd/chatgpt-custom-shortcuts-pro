const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { mkdir, appendFile, unlink } = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'test-results', 'shortcuts-fast');
const npmCli = process.env.npm_execpath;
const args = process.argv.slice(2);
const ci = args.includes('--ci');
const live = args.includes('--live');
const probeShortcuts = args.includes('--probe-shortcuts');
const results = [];

function run(name, npmArgs) {
  console.log(`\n${ci ? `::group::${name}` : name}`);
  const started = performance.now();
  const result = spawnSync(process.execPath, [npmCli, ...npmArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  const status =
    result.status === 0 && !result.error
      ? 'pass'
      : npmArgs[1] === 'check:current-page' && result.status === 2 && !result.error
        ? 'unverified'
        : 'fail';
  results.push({
    name,
    status,
    seconds: ((performance.now() - started) / 1000).toFixed(1),
    ...(status === 'unverified'
      ? {
          reason:
            'Live evidence is partial or unavailable. See the separate local current-page report.',
        }
      : {}),
  });
  if (result.error) console.error(result.error.message);
  if (ci) console.log('::endgroup::');
  return status === 'pass';
}

async function main() {
  if (
    !npmCli ||
    args.some((arg) => !['--ci', '--live', '--probe-shortcuts'].includes(arg)) ||
    (ci && live) ||
    (probeShortcuts && !live)
  )
    throw new Error(
      'Use npm run checks, checks:live [-- --probe-shortcuts], or checks -- --ci. Authenticated checks are local only.',
    );
  const lockContents = readFileSync(path.join(root, 'package-lock.json'));
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  const locked = JSON.parse(lockContents).packages || {};
  const lockHash = createHash('sha256')
    .update(lockContents)
    .update(JSON.stringify(dependencies))
    .digest('hex');
  const stamp = path.join(root, 'node_modules', '.cgcsp-checks-lock');
  const dependenciesReady = Object.keys(dependencies).every((name) => {
    try {
      const installed = JSON.parse(
        readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
      );
      return installed.version === locked[`node_modules/${name}`]?.version;
    } catch {
      return false;
    }
  });
  if (!dependenciesReady || !existsSync(stamp) || readFileSync(stamp, 'utf8') !== lockHash) {
    if (!run('Install locked project dependencies', ['ci', '--no-audit', '--no-fund']))
      throw new Error('Project dependency installation failed; no shortcut checks ran.');
    writeFileSync(stamp, lockHash);
  }
  // Playwright's installer reuses existing downloads and repairs missing browser binaries.
  if (
    !run('Ensure Chromium is installed', [
      'run',
      'playwright:install',
      ...(ci ? ['--', '--with-deps'] : []),
    ])
  )
    throw new Error('Chromium installation failed; no shortcut checks ran.');
  for (const [name, script] of [
    ['Code and text', 'check'],
    ['Validator regression', 'test:validators'],
    ['Settings wiring', 'validate:keys'],
    ['Shortcut report and inventory contracts', 'test:shortcuts:contracts'],
    ['Shortcut regressions on prepared fixture pages', 'test:shortcuts:fast'],
  ])
    run(name, ['run', script]);
  if (live)
    run('Fresh authenticated current-page check (local)', [
      'run',
      'check:current-page',
      ...(probeShortcuts ? ['--', '--probe-shortcuts'] : []),
    ]);
}

(async () => {
  await mkdir(outputDirectory, { recursive: true });
  for (const file of ['report.json', 'report.md', 'report.html']) {
    const target = path.join(outputDirectory, file);
    if (existsSync(target)) await unlink(target);
  }
  try {
    await main();
    if (
      !['report.json', 'report.md', 'report.html'].every((file) =>
        existsSync(path.join(outputDirectory, file)),
      )
    )
      throw new Error('The shortcut process produced no complete report; inspect the check log.');
  } catch (error) {
    console.error(error.message);
    results.push({ name: error.message, status: 'fail', seconds: '0', reason: error.message });
    const { writeFastVisualReport } = await import(
      '../tests/playwright/lib/shortcut-fast-visual-report.mjs'
    );
    await writeFastVisualReport({
      summary: {},
      observations: [],
      rows: [],
      outcome: {
        status: 'failure',
        coverage: 'blocked-startup',
        checks: 'No checks ran',
        errors: [{ message: error.message }],
        warnings: [],
      },
    });
  }
  const { writeFastVisualReport } = await import(
    '../tests/playwright/lib/shortcut-fast-visual-report.mjs'
  );
  const report = JSON.parse(readFileSync(path.join(outputDirectory, 'report.json'), 'utf8'));
  report.checkResults = results;
  await writeFastVisualReport(report);
  const summary = [
    '| Check | Result | Seconds |',
    '| --- | --- | ---: |',
    ...results.map(
      (result) =>
        `| ${result.name.replaceAll('|', '\\|').replaceAll('\n', ' ')} | ${result.status === 'pass' ? '✅ pass' : result.status === 'unverified' ? '⚠️ unverified / partial' : '❌ fail'} | ${result.seconds} |`,
    ),
    '',
  ].join('\n');
  console.log(`\n${summary}`);
  writeFileSync(path.join(outputDirectory, 'checks.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      readFileSync(path.join(outputDirectory, 'report.md')),
    );
  }
  console.log(`Shortcut report: ${path.join(outputDirectory, 'report.html')}`);
  if (live)
    console.log(
      `Current-page report: ${path.join(root, 'test-results', 'shortcuts-live', 'report.html')}`,
    );
  process.exitCode = results.some((result) => result.status === 'fail')
    ? 1
    : results.some((result) => result.status === 'unverified')
      ? 2
      : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
