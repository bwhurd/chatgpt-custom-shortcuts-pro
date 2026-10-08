import { spawn } from 'node:child_process';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCurrentPageValidation } from '../tests/playwright/lib/current-page-validation.mjs';
import { writeFastVisualReport } from '../tests/playwright/lib/shortcut-fast-visual-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'test-results', 'shortcuts-live');
const captureRoot = path.join(root, '_temp-files', 'inspector-captures');
const cdpEndpoint = 'http://127.0.0.1:9333';
const profileDirectory = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Google',
  'Chrome',
  'User Data',
  'CodexCleanProfile',
);
const args = process.argv.slice(2);
const startedAt = new Date().toISOString();

async function run(command, childArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, childArgs, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', (error) => resolve({ status: null, stdout, stderr: error.message }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

let currentPageValidation;
try {
  await mkdir(outputDirectory, { recursive: true });
  for (const file of ['report.json', 'report.md', 'report.html'])
    await unlink(path.join(outputDirectory, file)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  if (args.some((arg) => arg !== '--probe-shortcuts'))
    throw new Error('Use npm run check:current-page [-- --probe-shortcuts].');
  if (process.env.CI || process.platform !== 'win32')
    throw new Error(
      'Authenticated current-page validation requires the local Windows Chrome profile; it does not run in GitHub Actions.',
    );
  const preflight = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-File',
    path.join(root, 'scripts', 'check-live-chrome-profile.ps1'),
    '-ProfileDirectory',
    profileDirectory,
  ]);
  if (preflight.status !== 0)
    throw new Error(
      preflight.stdout.trim() || preflight.stderr.trim() || 'Chrome profile preflight failed.',
    );
  const capture = await run(process.execPath, [
    'tests/playwright/devscrape-wide.mjs',
    '--action',
    'validate-wide',
    '--no-auto-launch',
    '--cdp-endpoint',
    cdpEndpoint,
    '--no-open-report',
    ...args,
  ]);
  const folders = [...capture.stdout.matchAll(/^Run folder: (.+)$/gm)].map((match) =>
    path.resolve(match[1].trim()),
  );
  if (folders.length !== 1)
    throw new Error(
      'This invocation produced no unique live capture folder. No earlier report was reused.',
    );
  const folder = folders[0];
  if (path.dirname(folder) !== captureRoot)
    throw new Error('Live capture folder is outside the expected local capture directory.');
  const report = JSON.parse(await readFile(path.join(folder, 'check-report.json'), 'utf8'));
  currentPageValidation = classifyCurrentPageValidation(report, {
    startedAt,
    completedAt: new Date().toISOString(),
    cdpEndpoint,
    profileDirectory,
  });
  currentPageValidation.reportPath = path.join(folder, 'check-report.html');
  if (capture.status !== 0 && currentPageValidation.status === 'passed') {
    currentPageValidation.status = 'partial';
    currentPageValidation.reason =
      'The live process failed after capture; its report cannot establish complete success.';
  }
} catch (error) {
  currentPageValidation = {
    status: 'unverified',
    reason: error.message,
    checkedAt: new Date().toISOString(),
    cdpEndpoint,
    profileDirectory,
    failures: [],
    scopeLimitations: [],
  };
}

const written = await writeFastVisualReport(
  {
    generatedAt: new Date().toISOString(),
    scope: 'current-page',
    rows: [],
    observations: [],
    currentPageValidation,
  },
  { outputDirectory },
);
currentPageValidation = JSON.parse(await readFile(written.json, 'utf8')).currentPageValidation;
console.log(
  `\nCurrent ChatGPT page: ${currentPageValidation.status.toUpperCase()} — ${currentPageValidation.reason}`,
);
console.log(`Current-page report: ${written.html}`);
process.exitCode =
  currentPageValidation.status === 'passed' ? 0 : currentPageValidation.status === 'failed' ? 1 : 2;
