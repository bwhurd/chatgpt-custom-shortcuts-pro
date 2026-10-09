import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCurrentPageValidation } from '../tests/playwright/lib/current-page-validation.mjs';
import { writeFastVisualReport } from '../tests/playwright/lib/shortcut-fast-visual-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'test-results', 'shortcuts-live');
const snapshotDirectory = path.join(root, 'test-results', 'live-snapshot');
const receiptPath = path.join(outputDirectory, 'receipt.json');
const captureRoot = path.join(root, '_temp-files', 'inspector-captures');
const captureResultPrefix = 'CGCSP_CURRENT_PAGE_RESULT_V1 ';
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
const invocationId = randomUUID();
let sourceFingerprint = null;
let runFolder = null;
let captureExitCode = null;

async function ensureLocalOutputDirectory(relativePath) {
  const realRoot = await realpath(root);
  let directory = root;
  for (const segment of relativePath.split('/')) {
    directory = path.join(directory, segment);
    let info;
    try {
      info = await lstat(directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await mkdir(directory);
      info = await lstat(directory);
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Current-page output must use repository-owned local directories.');
    const relative = path.relative(realRoot, await realpath(directory));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('Current-page output cannot leave the repository.');
  }
}

function samePath(left, right) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
}

function isDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function readCaptureReport(stdout) {
  const resultLines = stdout.split(/\r?\n/).filter((line) => line.startsWith(captureResultPrefix));
  if (resultLines.length !== 1) {
    throw new Error(
      `This invocation produced ${resultLines.length} structured capture results; expected exactly one. No earlier report was reused.`,
    );
  }

  let result;
  try {
    result = JSON.parse(resultLines[0].slice(captureResultPrefix.length));
  } catch {
    throw new Error('The structured capture result is malformed.');
  }
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    Object.keys(result).length !== 4 ||
    result.schemaVersion !== 1 ||
    result.parentInvocationId !== invocationId ||
    typeof result.runFolder !== 'string' ||
    !path.isAbsolute(result.runFolder) ||
    typeof result.reportPath !== 'string' ||
    !path.isAbsolute(result.reportPath)
  ) {
    throw new Error('The structured capture result is invalid or belongs to another invocation.');
  }

  const [rootRealPath, captureRootRealPath] = await Promise.all([
    realpath(root),
    realpath(captureRoot),
  ]);
  if (!isDescendant(rootRealPath, captureRootRealPath)) {
    throw new Error('The live capture root is outside the repository.');
  }
  const runFolderPath = path.resolve(result.runFolder);
  if (
    !isDescendant(rootRealPath, runFolderPath) ||
    !samePath(path.dirname(runFolderPath), captureRootRealPath)
  ) {
    throw new Error('The live capture folder is outside the expected local capture directory.');
  }
  const runFolderInfo = await lstat(runFolderPath);
  if (!runFolderInfo.isDirectory() || runFolderInfo.isSymbolicLink()) {
    throw new Error('The structured capture folder is not a local directory.');
  }
  const runFolderRealPath = await realpath(runFolderPath);
  if (
    !samePath(path.dirname(runFolderRealPath), captureRootRealPath) ||
    !isDescendant(captureRootRealPath, runFolderRealPath)
  ) {
    throw new Error('The live capture folder is outside the expected local capture directory.');
  }

  const expectedReportPath = path.join(runFolderRealPath, 'check-report.json');
  const reportPath = path.resolve(result.reportPath);
  if (!samePath(reportPath, expectedReportPath)) {
    throw new Error('The structured result does not name its exact capture report.');
  }
  const reportInfo = await lstat(reportPath);
  if (!reportInfo.isFile() || reportInfo.isSymbolicLink()) {
    throw new Error('The exact invocation report is not a local file.');
  }
  const reportRealPath = await realpath(reportPath);
  if (
    !samePath(reportRealPath, expectedReportPath) ||
    !isDescendant(runFolderRealPath, reportRealPath)
  ) {
    throw new Error('The exact invocation report is outside its capture folder.');
  }
  return {
    runFolder: runFolderRealPath,
    report: JSON.parse(await readFile(reportRealPath, 'utf8')),
  };
}

function presentChildOutput(linePrefix) {
  let pending = '';
  return {
    write(chunk) {
      pending += String(chunk);
      while (true) {
        const lineEnd = pending.indexOf('\n');
        if (lineEnd === -1) break;
        const line = pending.slice(0, lineEnd + 1);
        pending = pending.slice(lineEnd + 1);
        if (!line.replace(/\r?\n$/, '').startsWith(linePrefix)) process.stdout.write(line);
      }
    },
    flush() {
      if (pending && !pending.startsWith(linePrefix)) process.stdout.write(pending);
      pending = '';
    },
  };
}

async function run(command, childArgs, { suppressStdoutLinePrefix = '' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, childArgs, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const output = suppressStdoutLinePrefix ? presentChildOutput(suppressStdoutLinePrefix) : null;
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (output) output.write(chunk);
      else process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      output?.flush();
      resolve({ status: null, stdout, stderr: error.message });
    });
    child.on('close', (status) => {
      output?.flush();
      resolve({ status, stdout, stderr });
    });
  });
}

// Verify ancestors before creating, invalidating or writing any local evidence.
await ensureLocalOutputDirectory('test-results/shortcuts-live');
await ensureLocalOutputDirectory('test-results/live-snapshot');
let currentPageValidation;
try {
  for (const file of [
    ...['report.json', 'report.md', 'report.html', 'receipt.json'].map((name) =>
      path.join(outputDirectory, name),
    ),
    path.join(snapshotDirectory, 'candidate.json'),
    path.join(snapshotDirectory, 'confirmation.json'),
  ])
    await unlink(file).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  if (args.some((arg) => arg !== '--probe-shortcuts'))
    throw new Error('Use npm run check:current-page [-- --probe-shortcuts].');
  if (process.env.CI || process.platform !== 'win32')
    throw new Error(
      'Authenticated current-page validation requires the local Windows Chrome profile; it does not run in GitHub Actions.',
    );
  const { computeSourceFingerprint } = await import('./live-snapshot.mjs');
  sourceFingerprint = await computeSourceFingerprint({ root });
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
  const capture = await run(
    process.execPath,
    [
      'tests/playwright/devscrape-wide.mjs',
      '--action',
      'validate-wide',
      '--no-auto-launch',
      '--cdp-endpoint',
      cdpEndpoint,
      '--no-open-report',
      '--current-page-parent-invocation-id',
      invocationId,
      ...(args.includes('--probe-shortcuts') ? args : ['--prepare-capture-only']),
    ],
    { suppressStdoutLinePrefix: captureResultPrefix },
  );
  captureExitCode = capture.status;
  const captureEvidence = await readCaptureReport(capture.stdout);
  runFolder = captureEvidence.runFolder;
  currentPageValidation = classifyCurrentPageValidation(captureEvidence.report, {
    startedAt,
    completedAt: new Date().toISOString(),
    cdpEndpoint,
    profileDirectory,
  });
  currentPageValidation.reportPath = path.join(runFolder, 'check-report.html');
  if ((await computeSourceFingerprint({ root })) !== sourceFingerprint) {
    currentPageValidation.status = 'unverified';
    currentPageValidation.reason =
      'Validation source changed during collection. Collect fresh evidence from settled source.';
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
const completedAt = new Date().toISOString();
const written = await writeFastVisualReport(
  {
    generatedAt: new Date().toISOString(),
    invocationId,
    startedAt,
    completedAt,
    sourceFingerprint,
    scope: 'current-page',
    rows: [],
    observations: [],
    currentPageValidation,
  },
  { outputDirectory },
);
currentPageValidation = JSON.parse(await readFile(written.json, 'utf8')).currentPageValidation;
const temporaryReceipt = path.join(outputDirectory, `receipt.${invocationId}.tmp`);
await writeFile(
  temporaryReceipt,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      invocationId,
      startedAt,
      completedAt,
      sourceFingerprint,
      runFolder,
      captureExitCode,
      probeShortcuts: args.includes('--probe-shortcuts'),
      validationReport: written.json,
      currentPageValidation,
    },
    null,
    2,
  )}\n`,
  { encoding: 'utf8', flag: 'wx' },
);
await rename(temporaryReceipt, receiptPath);
console.log(
  `\nCurrent ChatGPT page: ${currentPageValidation.status.toUpperCase()} — ${currentPageValidation.reason}`,
);
console.log(`Current-page report: ${written.html}`);
console.log(`Current-page receipt: ${receiptPath}`);
process.exitCode =
  currentPageValidation.status === 'passed' ? 0 : currentPageValidation.status === 'failed' ? 1 : 2;
