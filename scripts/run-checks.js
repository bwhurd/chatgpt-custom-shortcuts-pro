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
const results = [];

function run(name, npmArgs) {
  console.log(`\n${ci ? `::group::${name}` : name}`);
  const started = performance.now();
  const result = spawnSync(process.execPath, [npmCli, ...npmArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  const status = result.status === 0 && !result.error ? 'pass' : 'fail';
  results.push({ name, status, seconds: ((performance.now() - started) / 1000).toFixed(1) });
  if (result.error) console.error(result.error.message);
  if (ci) console.log('::endgroup::');
  return status === 'pass';
}

async function main() {
  if (!npmCli || args.some((arg) => arg !== '--ci'))
    throw new Error('Run npm run checks, or npm run checks -- --ci on a Linux CI worker.');
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
    ['Controlled shortcut keyboard and target checks', 'test:shortcuts:fast'],
  ])
    run(name, ['run', script]);
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
    results.push({ name: error.message, status: 'fail', seconds: '0' });
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
        `| ${result.name.replaceAll('|', '\\|').replaceAll('\n', ' ')} | ${result.status === 'pass' ? '✅ pass' : '❌ fail'} | ${result.seconds} |`,
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
  process.exitCode = results.some((result) => result.status === 'fail') ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
