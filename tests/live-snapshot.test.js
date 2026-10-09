import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  assertTargetEvaluatorParity,
  checkSnapshot,
  computeSourceFingerprint,
  exportCandidate,
  MAX_CAPTURE_FILE_BYTES,
  MAX_INVOCATION_AGE_MS,
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_STATES,
  MAX_TOKENS_PER_STATE,
  projectCaptureEvidence,
  replaySnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  SOURCE_FINGERPRINT_PATHS,
} from '../scripts/live-snapshot.mjs';
import { unknownCapabilities } from './playwright/lib/shortcut-capabilities.mjs';
import { evaluateTargetPresence } from './playwright/lib/shortcut-target-presence.mjs';

const SOURCE_FINGERPRINT = 'a'.repeat(64);
const CAPTURED_AT = '2026-10-07T12:00:00.000Z';
const FIXED_NOW = Date.parse('2026-10-07T12:05:00.000Z');
const AUDITED_SOURCE_FINGERPRINT_PATHS = Object.freeze([
  'extension/composer-layout-bootstrap.js',
  'extension/composer-layout.css',
  'tests/playwright/lib/shortcut-audit-artifacts.mjs',
]);

function oneStateInventory({
  filename = 'one.txt',
  matchGroups = [['data-testid="safe-target"']],
  validationMode = 'scrape-targets',
} = {}) {
  const registry = [{ stateId: 'state-one', filename }];
  const inventory = {
    targets: [
      {
        targetId: 'target-one',
        expectedFiles: matchGroups.length ? [filename] : [],
        matchGroups,
        usedByActionIds: ['shortcut-one'],
        unknownUiStateRefs: [],
        missingMatchGroups: false,
        notes: '',
      },
    ],
    shortcuts: [{ actionId: 'shortcut-one', validationMode }],
  };
  return { registry, inventory };
}

async function checkDocument(document, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-test-'));
  try {
    const filename = path.join(directory, 'snapshot.json');
    await writeFile(
      filename,
      typeof document === 'string' ? document : JSON.stringify(document),
      'utf8',
    );
    return await checkSnapshot({
      snapshotPath: filename,
      contract: options.contract || oneStateInventory(),
      sourceFingerprint: options.sourceFingerprint || SOURCE_FINGERPRINT,
      now: options.now === undefined ? FIXED_NOW : options.now,
      maxAgeMs: options.maxAgeMs,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function makeSnapshot({
  registry,
  inventory,
  files,
  captureStatuses,
  capturedAt = CAPTURED_AT,
  sourceFingerprint = SOURCE_FINGERPRINT,
  capabilities = unknownCapabilities(),
}) {
  return projectCaptureEvidence({
    registry,
    inventory,
    files,
    captureStatuses,
    capturedAt,
    sourceFingerprint,
    capabilities,
  });
}

async function createSymlinkOrSkip(context, target, link, type = 'file') {
  try {
    await symlink(target, link, type);
    return true;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) {
      context.skip('This host does not allow test symlink creation.');
      return false;
    }
    throw error;
  }
}

const MIRROR_SUPPORT_PATHS = ['tests/playwright/lib/shortcut-audit-artifacts.mjs'];
async function createSnapshotTestRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-export-repo-'));
  try {
    for (const relativePath of [...SOURCE_FINGERPRINT_PATHS, ...MIRROR_SUPPORT_PATHS]) {
      const source = path.resolve(process.cwd(), ...relativePath.split('/'));
      const destination = path.join(root, ...relativePath.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    const importMirror = (relativePath) =>
      import(pathToFileURL(path.join(root, ...relativePath.split('/'))).href);
    const [snapshot, core, validation, visualReport] = await Promise.all([
      importMirror('scripts/live-snapshot.mjs'),
      importMirror('tests/playwright/lib/devscrape-wide-core.mjs'),
      importMirror('tests/playwright/lib/current-page-validation.mjs'),
      importMirror('tests/playwright/lib/shortcut-fast-visual-report.mjs'),
    ]);
    return { root, modules: { snapshot, core, validation, visualReport } };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

function allInventoryNeedles(inventory) {
  return [
    ...new Set(
      inventory.targets.flatMap((target) =>
        (target.matchGroups || []).flatMap((group) => (Array.isArray(group) ? group : [group])),
      ),
    ),
  ];
}

async function createExportEvidence({ root, modules, probeFailure = false } = {}) {
  const { registry, inventory } = await modules.snapshot.loadCurrentContract();
  const { exports } = await modules.core.loadDevScrapeWideContract();
  const rawDump = allInventoryNeedles(inventory).join('\n');
  const artifacts = registry.map((entry) => {
    const status =
      entry.status === 'deferred' || entry.probeOnly === true
        ? 'deferred'
        : entry.aliasOf
          ? 'alias'
          : 'captured';
    return {
      filename: entry.filename,
      stateId: entry.stateId,
      label: entry.label,
      status,
      error: null,
      aliasOf: entry.aliasOf || null,
      captureBytes: ['captured', 'alias'].includes(status) ? rawDump.length : 0,
      clickPath: Array.isArray(entry.steps) ? entry.steps.map((step) => step.label) : [],
    };
  });
  const normalizedArtifacts = artifacts
    .filter((artifact) => ['captured', 'alias'].includes(artifact.status))
    .map((artifact) => ({ filename: artifact.filename, normalizedHtml: rawDump }));
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const runCompletedAt = new Date(Date.now() - 2_000).toISOString();
  const capabilities = unknownCapabilities();
  const scrapeResult = {
    runKind: 'devscrapewide',
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    fixtureOwnership: null,
    pageInfo: {
      url: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      fixtureOk: true,
      title: 'Synthetic local evidence fixture.',
    },
    capabilities,
    startedAt: new Date(Date.parse(startedAt) + 1_000).toISOString(),
    completedAt: runCompletedAt,
    capturedCount: artifacts.filter((artifact) => ['captured', 'alias'].includes(artifact.status))
      .length,
    failedCount: 0,
    deferredCount: artifacts.filter((artifact) => artifact.status === 'deferred').length,
    artifacts,
  };
  const run = await modules.core.writeScrapeRun({ scrapeResult, normalizedArtifacts });

  let probeAction = null;
  if (probeFailure) {
    probeAction = inventory.shortcuts.find(
      (shortcut) =>
        shortcut.activationProbeSafe === true && shortcut.activationProbeMode !== 'not-live-probed',
    );
    assert.ok(probeAction, 'the contract has an approved activation probe');
    await modules.core.writeLiveProbeReport(run.folderPath, {
      schemaVersion: 1,
      generatedAt: runCompletedAt,
      fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      capabilities,
      runStatus: 'completed',
      rows: [
        {
          actionId: probeAction.actionId,
          probeMode: probeAction.activationProbeMode,
          status: 'fail',
          reason: 'Synthetic activation failure for the export gate test.',
        },
      ],
      summary: {
        runStatus: 'completed',
        total: 1,
        executable: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        environmentFailed: 0,
        manual: 0,
        notApplicable: 0,
        notLiveProbed: 0,
        coverageGaps: 0,
        fixedTotal: 0,
        fixedPassed: 0,
        fixedCoverageGaps: 0,
      },
    });
  }

  const checkReport = await modules.core.buildCheckReport({ folderName: run.folderName });
  const checkReportFiles = await modules.core.writeCheckReportFiles(checkReport);
  const completedAt = new Date(Date.now() + 1_000).toISOString();
  const currentPageValidation = modules.validation.classifyCurrentPageValidation(checkReport, {
    startedAt,
    completedAt,
    cdpEndpoint: 'http://127.0.0.1:9333',
    profileDirectory: path.join(root, 'synthetic-profile'),
  });
  currentPageValidation.reportPath = checkReportFiles.htmlPath;
  const sourceFingerprint = await modules.snapshot.computeSourceFingerprint({ root });
  const aggregate = await modules.visualReport.writeFastVisualReport(
    {
      generatedAt: completedAt,
      invocationId: randomUUID(),
      startedAt,
      completedAt,
      sourceFingerprint,
      scope: 'current-page',
      rows: [],
      observations: [],
      currentPageValidation,
    },
    { outputDirectory: path.join(root, 'test-results', 'shortcuts-live') },
  );
  const aggregateReport = JSON.parse(await readFile(aggregate.json, 'utf8'));
  const receiptPath = path.join(root, 'test-results', 'shortcuts-live', 'receipt.json');
  await writeFile(
    receiptPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        invocationId: aggregateReport.invocationId,
        startedAt,
        completedAt,
        sourceFingerprint,
        runFolder: run.folderPath,
        captureExitCode: 0,
        probeShortcuts: probeFailure,
        validationReport: aggregate.json,
        currentPageValidation: aggregateReport.currentPageValidation,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return {
    root,
    receiptPath,
    registry,
    inventory,
    capabilities,
    checkReport,
    currentPageValidation,
    probeAction,
  };
}

async function seedReceiptRoot(context, root, symlinkAt) {
  for (const relativePath of SOURCE_FINGERPRINT_PATHS) {
    const filename = path.join(root, ...relativePath.split('/'));
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, 'fingerprint source\n', 'utf8');
  }
  const reportDirectory = path.join(root, 'test-results', 'shortcuts-live');
  const captureDirectory = path.join(root, '_temp-files', 'inspector-captures', 'capture-one');
  const candidateDirectory = path.join(root, 'test-results', 'live-snapshot');
  await mkdir(reportDirectory, { recursive: true });
  await mkdir(captureDirectory, { recursive: true });
  await mkdir(candidateDirectory, { recursive: true });
  const startedAt = '2026-10-07T12:00:00.000Z';
  const completedAt = '2026-10-07T12:01:00.000Z';
  const invocationId = '123e4567-e89b-42d3-a456-426614174000';
  const sourceFingerprint = await computeSourceFingerprint({ root });
  const currentPageValidation = {
    cdpEndpoint: 'http://127.0.0.1:9333',
    profileDirectory: 'PROFILE_PRIVATE_CANARY_7f2',
    pageUrl: 'https://chatgpt.com/c/private-conversation-canary',
    status: 'passed',
    reason: 'PRIVATE_REASON_CANARY_31a',
    reportPath: path.join(captureDirectory, 'check-report.html'),
  };
  const receipt = {
    schemaVersion: 1,
    invocationId,
    startedAt,
    completedAt,
    sourceFingerprint,
    runFolder: captureDirectory,
    captureExitCode: 0,
    probeShortcuts: false,
    validationReport: path.join(reportDirectory, 'report.json'),
    currentPageValidation,
  };
  const aggregate = {
    visualReportVersion: 1,
    invocationId,
    startedAt,
    completedAt,
    sourceFingerprint,
    currentPageValidation,
  };
  const manifest = {
    schemaVersion: 1,
    runKind: 'devscrapewide',
    folderName: 'capture-one',
    fixtureUrl: 'https://chatgpt.com/c/private-conversation-canary',
    pageInfo: {
      fixtureOk: true,
      fixtureUrl: 'https://chatgpt.com/c/private-conversation-canary',
      url: 'https://chatgpt.com/c/private-conversation-canary',
    },
    startedAt,
    completedAt,
    artifacts: [],
    writtenFiles: [],
  };
  const ownedPaths = {
    receipt: path.join(reportDirectory, 'receipt.json'),
    aggregate: path.join(reportDirectory, 'report.json'),
    manifest: path.join(captureDirectory, 'run-manifest.json'),
    checkReport: path.join(captureDirectory, 'check-report.json'),
  };
  const outside = path.join(root, 'outside-private.json');
  await writeFile(outside, `OUTSIDE_CANARY_${symlinkAt}`, 'utf8');
  await writeFile(path.join(candidateDirectory, 'candidate.json'), '{"oldCandidate":true}', 'utf8');

  if (symlinkAt !== 'receipt') {
    await writeFile(ownedPaths.receipt, JSON.stringify(receipt), 'utf8');
  }
  if (symlinkAt !== 'aggregate') {
    await writeFile(ownedPaths.aggregate, JSON.stringify(aggregate), 'utf8');
  }
  if (symlinkAt !== 'manifest') {
    await writeFile(ownedPaths.manifest, JSON.stringify(manifest), 'utf8');
  }
  if (symlinkAt === 'checkReport') {
    await writeFile(
      path.join(captureDirectory, 'run-manifest.json'),
      JSON.stringify(manifest),
      'utf8',
    );
  }
  if (!(await createSymlinkOrSkip(context, outside, ownedPaths[symlinkAt]))) return null;
  return { outside, candidateDirectory, ownedPaths };
}

test('projects only observed code-owned tokens from private capture text', () => {
  const contract = oneStateInventory();
  const raw = [
    '<button data-testid="safe-target" value="FORM_CANARY_9x2">',
    'MESSAGE_CANARY_R4q9',
    'https://chatgpt.com/c/account-private-canary',
    'data-arbitrary="ATTRIBUTE_CANARY_p1"',
  ].join(' ');
  const snapshot = makeSnapshot({
    ...contract,
    files: { 'one.txt': raw },
  });
  const serialized = JSON.stringify(snapshot);
  assert.deepEqual(snapshot.states[0].tokens, ['data-testid="safe-target"']);
  assert.equal(snapshot.coverageStatus, 'complete');
  for (const canary of [
    'FORM_CANARY_9x2',
    'MESSAGE_CANARY_R4q9',
    'account-private-canary',
    'ATTRIBUTE_CANARY_p1',
  ]) {
    assert.equal(serialized.includes(canary), false);
  }
});

test('projects an exact schema-v2 capability marker and rejects malformed capability evidence', async () => {
  const contract = oneStateInventory();
  const snapshot = makeSnapshot({ ...contract, files: { 'one.txt': 'data-testid="safe-target"' } });
  assert.equal(snapshot.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
  assert.deepEqual(snapshot.capabilities, unknownCapabilities());
  assert.deepEqual(Object.keys(snapshot.capabilities).sort(), [
    'configureRoute',
    'dedicatedEffortControls',
    'proEffort',
    'schemaVersion',
    'source',
  ]);

  assert.throws(
    () =>
      makeSnapshot({
        ...contract,
        files: { 'one.txt': 'data-testid="safe-target"' },
        capabilities: { ...unknownCapabilities(), proEffort: 'maybe' },
      }),
    /capability evidence is missing or invalid/i,
  );

  const malformedSnapshot = structuredClone(snapshot);
  malformedSnapshot.capabilities.privateField = 'discard';
  const invalid = await checkDocument(malformedSnapshot, { contract });
  assert.equal(invalid.exitCode, 1);
  assert.match(invalid.message, /supported safe schema/i);
  assert.equal(invalid.message.includes('discard'), false);

  const missingMarker = structuredClone(snapshot);
  delete missingMarker.capabilities;
  assert.equal((await checkDocument(missingMarker, { contract })).exitCode, 1);
});

test('snapshot capability serialization preserves v1 proof and leaves its new capability unknown', () => {
  const registry = [{ stateId: 'dedicated-effort-state', filename: 'dedicated.txt' }];
  const inventory = {
    targets: [
      {
        targetId: 'dedicated-effort-controls',
        requiredCapabilities: ['dedicatedEffortControls'],
        expectedFiles: ['dedicated.txt'],
        matchGroups: [['role="menuitemradio"', 'Standard']],
        usedByActionIds: ['shortcutKeyThinkingLight'],
        unknownUiStateRefs: [],
        missingMatchGroups: false,
      },
    ],
    shortcuts: [{ actionId: 'shortcutKeyThinkingLight', validationMode: 'scrape-targets' }],
  };
  const legacyCapabilities = {
    schemaVersion: 1,
    source: 'fresh-model-picker-v1',
    proEffort: 'unknown',
    configureRoute: 'unknown',
  };
  const projectAndReplay = (capabilities) => {
    const projected = makeSnapshot({
      registry,
      inventory,
      files: {},
      captureStatuses: { 'dedicated.txt': 'deferred' },
      capabilities,
    });
    const snapshot = JSON.parse(JSON.stringify(projected));
    const result = replaySnapshot(snapshot, {
      registry,
      inventory,
      sourceFingerprint: SOURCE_FINGERPRINT,
      now: FIXED_NOW,
    });
    return { snapshot, result };
  };

  const current = projectAndReplay({
    ...unknownCapabilities(),
    dedicatedEffortControls: 'unavailable',
  });
  assert.equal(current.snapshot.coverageStatus, 'complete');
  assert.equal(current.result.status, 'verified');
  assert.equal(current.result.targetResults[0].status, 'not-applicable');

  const legacy = projectAndReplay(legacyCapabilities);
  assert.deepEqual(legacy.snapshot.capabilities, legacyCapabilities);
  assert.equal(legacy.snapshot.coverageStatus, 'incomplete');
  assert.equal(legacy.result.status, 'unverified');
  assert.equal(legacy.result.targetResults[0].status, 'fail');
  assert.deepEqual(legacy.result.driftTargets, [
    { targetId: 'dedicated-effort-controls', kind: 'missing-evidence' },
  ]);
});

test('capability target replay matches projected N/A and keeps unknown or available strict', () => {
  const registry = [{ stateId: 'pro-effort-state', filename: 'pro-menu.txt', status: 'deferred' }];
  const inventory = {
    targets: [
      {
        targetId: 'pro-effort-standard',
        requiredCapabilities: ['proEffort'],
        expectedFiles: ['pro-menu.txt'],
        matchGroups: [['role="menuitemradio"', 'Standard']],
        usedByActionIds: ['shortcutKeyProStandard'],
        unknownUiStateRefs: [],
        missingMatchGroups: false,
      },
    ],
    shortcuts: [{ actionId: 'shortcutKeyProStandard', validationMode: 'scrape-targets' }],
  };
  const replay = (capabilities) => {
    const snapshot = makeSnapshot({
      registry,
      inventory,
      files: {},
      captureStatuses: { 'pro-menu.txt': 'deferred' },
      capabilities,
    });
    const result = replaySnapshot(snapshot, {
      registry,
      inventory,
      sourceFingerprint: SOURCE_FINGERPRINT,
      now: FIXED_NOW,
    });
    return { snapshot, result };
  };

  const unavailable = replay({ ...unknownCapabilities(), proEffort: 'unavailable' });
  assert.equal(unavailable.snapshot.coverageStatus, 'complete');
  assert.equal(unavailable.result.status, 'verified');
  assert.deepEqual(unavailable.result.driftTargets, []);
  assert.equal(unavailable.result.targetResults[0].status, 'not-applicable');
  const rawUnavailablePresence = evaluateTargetPresence(
    inventory.targets[0],
    {},
    {
      capabilities: unavailable.snapshot.capabilities,
    },
  );
  assert.deepEqual(rawUnavailablePresence.missingExpectedFiles, ['pro-menu.txt']);
  const { missingExpectedFiles: _rawMissingExpectedFiles, ...normalizedUnavailablePresence } =
    rawUnavailablePresence;
  assert.deepEqual(unavailable.result.targetResults[0], {
    targetId: 'pro-effort-standard',
    ...normalizedUnavailablePresence,
    missingExpectedFiles: [],
  });

  for (const capabilities of [
    unknownCapabilities(),
    { ...unknownCapabilities(), proEffort: 'available' },
  ]) {
    const strict = replay(capabilities);
    assert.equal(strict.snapshot.coverageStatus, 'incomplete');
    assert.equal(strict.result.status, 'unverified');
    assert.deepEqual(strict.result.driftTargets, [
      { targetId: 'pro-effort-standard', kind: 'missing-evidence' },
    ]);
    assert.equal(strict.result.targetResults[0].status, 'fail');
  }
});

test('schema-v1 snapshots remain readable but always unverified', async () => {
  const contract = oneStateInventory();
  const current = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-testid="safe-target"></div>' },
  });
  const legacy = structuredClone(current);
  legacy.schemaVersion = 1;
  delete legacy.capabilities;

  const result = await checkDocument(legacy, { contract });
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'unverified');
  assert.deepEqual(result.warnings, ['snapshot-schema-outdated']);
  assert.deepEqual(result.driftTargets, []);
  assert.equal(result.replayed, false);

  const malformedLegacy = { ...legacy, unexpected: true };
  assert.equal((await checkDocument(malformedLegacy, { contract })).exitCode, 1);
});

test('projects code-owned needles for registered files and excludes unregistered files', () => {
  const registry = [
    { stateId: 'state-one', filename: 'one.txt' },
    { stateId: 'state-two', filename: 'two.txt' },
  ];
  const inventory = {
    targets: [
      {
        targetId: 'target-one',
        expectedFiles: ['one.txt'],
        matchGroups: [['data-testid="one-only"']],
        usedByActionIds: ['shortcut-one'],
        unknownUiStateRefs: [],
        missingMatchGroups: false,
      },
    ],
    shortcuts: [{ actionId: 'shortcut-one', validationMode: 'scrape-targets' }],
  };
  const snapshot = makeSnapshot({
    registry,
    inventory,
    files: {
      'one.txt': '<div data-testid="one-only"></div>',
      'two.txt': '<div data-testid="one-only"></div>',
      'unregistered.txt': '<div data-testid="one-only"></div>',
    },
  });
  assert.deepEqual(snapshot.states[0].tokens, ['data-testid="one-only"']);
  assert.deepEqual(snapshot.states[1].tokens, ['data-testid="one-only"']);
  assert.deepEqual(
    snapshot.states.map(({ filename }) => filename),
    ['one.txt', 'two.txt'],
  );
  assert.equal(Object.hasOwn(snapshot.states[1], 'rawText'), false);
});

test('preserves alias file identities and requires equal alias evidence', () => {
  const registry = [
    { stateId: 'canonical-state', filename: 'canonical.txt' },
    { stateId: 'legacy-alias-state', filename: 'legacy alias.txt', aliasOf: 'canonical.txt' },
  ];
  const inventory = {
    targets: [
      {
        targetId: 'target-one',
        expectedFiles: ['canonical.txt', 'legacy alias.txt'],
        matchGroups: [['data-testid="alias-target"']],
        usedByActionIds: ['shortcut-one'],
        unknownUiStateRefs: [],
        missingMatchGroups: false,
      },
    ],
    shortcuts: [{ actionId: 'shortcut-one', validationMode: 'scrape-targets' }],
  };
  const snapshot = makeSnapshot({
    registry,
    inventory,
    files: {
      'canonical.txt': '<button data-testid="alias-target"></button>',
      'legacy alias.txt': '<button data-testid="alias-target"></button>',
    },
  });
  assert.deepEqual(snapshot.states[0].tokens, snapshot.states[1].tokens);
  assert.equal(snapshot.states[1].filename, 'legacy alias.txt');
  assert.throws(
    () =>
      makeSnapshot({
        registry,
        inventory,
        files: {
          'canonical.txt': '<button data-testid="alias-target"></button>',
          'legacy alias.txt': '<button data-testid="different-target"></button>',
        },
      }),
    /matching evidence/,
  );
  assert.throws(
    () =>
      makeSnapshot({
        registry,
        inventory,
        files: { 'canonical.txt': '<button data-testid="alias-target"></button>' },
      }),
    /matching evidence/,
  );
  assert.throws(() => makeSnapshot({ registry, inventory, files: {} }), /matching evidence/);
});

test('matches AND within groups and OR between groups with text/token parity', () => {
  const contract = oneStateInventory({
    matchGroups: [['data-one', 'data-two'], ['data-three']],
  });
  assert.equal(assertTargetEvaluatorParity(), true);
  const andMiss = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-one="x"></div>' },
  });
  const andReplay = replaySnapshot(andMiss, {
    ...contract,
    sourceFingerprint: SOURCE_FINGERPRINT,
    now: FIXED_NOW,
  });
  assert.deepEqual(andReplay.driftTargets, [{ targetId: 'target-one', kind: 'target-not-found' }]);
  assert.equal(andReplay.coverageStatus, 'complete');

  const orHit = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-three="x"></div>' },
  });
  const orReplay = replaySnapshot(orHit, {
    ...contract,
    sourceFingerprint: SOURCE_FINGERPRINT,
    now: FIXED_NOW,
  });
  assert.deepEqual(orReplay.driftTargets, []);
  assert.deepEqual(orReplay.targetResults[0].matchedExpectedFiles, ['one.txt']);
  assert.deepEqual(orReplay.targetResults[0].missingExpectedFiles, []);
});

test('preserves allMatchedFiles for safe matches outside expected files', () => {
  const target = {
    targetId: 'target-one',
    expectedFiles: ['primary.txt'],
    matchGroups: [['data-testid="shared-target"']],
    usedByActionIds: ['shortcut-one'],
    unknownUiStateRefs: [],
    missingMatchGroups: false,
  };
  const registry = [
    { stateId: 'primary-state', filename: 'primary.txt' },
    { stateId: 'secondary-state', filename: 'secondary.txt' },
  ];
  const inventory = {
    targets: [target],
    shortcuts: [{ actionId: 'shortcut-one', validationMode: 'scrape-targets' }],
  };
  const files = {
    'primary.txt': '<button data-testid="shared-target"></button>',
    'secondary.txt': '<button data-testid="shared-target"></button>',
  };
  const snapshot = makeSnapshot({ registry, inventory, files });
  const replay = replaySnapshot(snapshot, {
    registry,
    inventory,
    sourceFingerprint: SOURCE_FINGERPRINT,
    now: FIXED_NOW,
  });
  const { targetId, ...actual } = replay.targetResults[0];
  assert.equal(targetId, target.targetId);
  assert.deepEqual(actual, evaluateTargetPresence(target, files));
  assert.deepEqual(actual.allMatchedFiles, ['primary.txt', 'secondary.txt']);
});

test('marks an optional no-coverage state out of scope only for manual actions', () => {
  const registry = [{ stateId: 'deferred-state', filename: 'deferred.txt', status: 'deferred' }];
  const makeInventory = (validationMode) => ({
    targets: [
      {
        targetId: 'optional-target',
        expectedFiles: [],
        matchGroups: [],
        usedByActionIds: [],
        unknownUiStateRefs: [],
        missingMatchGroups: false,
      },
    ],
    shortcuts: [{ actionId: 'shortcut-one', targetIds: ['optional-target'], validationMode }],
  });
  const optional = makeSnapshot({
    registry,
    inventory: makeInventory('manual-only'),
    files: {},
  });
  assert.equal(optional.coverageStatus, 'complete');
  const mixedInventory = makeInventory('manual-only');
  mixedInventory.shortcuts.push({
    actionId: 'live-action',
    targetIds: ['optional-target'],
    validationMode: 'scrape-targets',
  });
  const mixed = makeSnapshot({
    registry,
    inventory: mixedInventory,
    files: {},
  });
  assert.equal(mixed.coverageStatus, 'incomplete');
  const required = makeSnapshot({
    registry,
    inventory: makeInventory('scrape-targets'),
    files: {},
  });
  assert.equal(required.coverageStatus, 'incomplete');
});

test('derives coverage for a newly registered target and fails when its required capture is missing', () => {
  const base = oneStateInventory();
  const addedState = { stateId: 'state-added', filename: 'added.txt' };
  const addedTarget = {
    targetId: 'target-added',
    expectedFiles: [addedState.filename],
    matchGroups: [['data-testid="added-target"']],
    usedByActionIds: ['shortcut-added'],
    unknownUiStateRefs: [],
    missingMatchGroups: false,
    notes: '',
  };
  const registry = [...base.registry, addedState];
  const inventory = {
    ...base.inventory,
    targets: [...base.inventory.targets, addedTarget],
    shortcuts: [
      ...base.inventory.shortcuts,
      { actionId: 'shortcut-added', validationMode: 'scrape-targets' },
    ],
  };
  const files = {
    'one.txt': '<button data-testid="safe-target"></button>',
    [addedState.filename]: '<button data-testid="added-target"></button>',
  };

  const complete = makeSnapshot({ registry, inventory, files });
  assert.equal(complete.coverageStatus, 'complete');
  assert.deepEqual(
    complete.states.map(({ stateId }) => stateId).sort(),
    registry.map(({ stateId }) => stateId).sort(),
  );
  const completeReplay = replaySnapshot(complete, {
    registry,
    inventory,
    sourceFingerprint: SOURCE_FINGERPRINT,
    now: FIXED_NOW,
  });
  assert.equal(completeReplay.status, 'verified');
  assert.equal(
    completeReplay.targetResults.find(({ targetId }) => targetId === addedTarget.targetId)?.status,
    'pass',
  );

  const missing = makeSnapshot({
    registry,
    inventory,
    files: { 'one.txt': files['one.txt'] },
    captureStatuses: { [addedState.filename]: 'missing' },
  });
  assert.equal(missing.coverageStatus, 'incomplete');
  const missingReplay = replaySnapshot(missing, {
    registry,
    inventory,
    sourceFingerprint: SOURCE_FINGERPRINT,
    now: FIXED_NOW,
  });
  assert.deepEqual(missingReplay.driftTargets, [
    { targetId: addedTarget.targetId, kind: 'missing-evidence' },
  ]);
  assert.equal(
    missingReplay.targetResults.find(({ targetId }) => targetId === addedTarget.targetId)
      ?.missingExpectedFiles[0],
    addedState.filename,
  );
});

test('reports stale and source-mismatched evidence as unverified without failing', async () => {
  const contract = oneStateInventory();
  const snapshot = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-testid="safe-target"></div>' },
  });
  const stale = await checkDocument(snapshot, {
    now: Date.parse('2026-10-20T12:00:00.000Z'),
  });
  assert.equal(stale.exitCode, 0);
  assert.equal(stale.status, 'unverified');
  assert.ok(stale.warnings.includes('capture-stale'));

  const mismatch = await checkDocument(snapshot, {
    sourceFingerprint: 'b'.repeat(64),
    now: FIXED_NOW,
  });
  assert.equal(mismatch.exitCode, 0);
  assert.equal(mismatch.status, 'unverified');
  assert.ok(mismatch.warnings.includes('source-fingerprint-mismatch'));
  assert.equal(mismatch.replayed, false);
});

test('missing snapshots warn and exit zero', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-missing-'));
  try {
    const result = await checkSnapshot({
      snapshotPath: path.join(directory, 'missing.json'),
      sourceFingerprint: SOURCE_FINGERPRINT,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, 'unverified');
    assert.deepEqual(result.warnings, ['snapshot-missing']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('replays missing required files as warnings and drift evidence', async () => {
  const contract = oneStateInventory();
  const snapshot = makeSnapshot({
    ...contract,
    files: {},
    captureStatuses: { 'one.txt': 'missing' },
  });
  assert.equal(snapshot.coverageStatus, 'incomplete');
  const result = await checkDocument(snapshot, { contract });
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'unverified');
  assert.deepEqual(result.driftTargets, [{ targetId: 'target-one', kind: 'missing-evidence' }]);
});

test('rejects extra fields and forbidden tokens without echoing their contents', async () => {
  const contract = oneStateInventory();
  const valid = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-testid="safe-target"></div>' },
  });
  const canary = 'PRIVATE_CANARY_m7P3';
  const extraField = await checkDocument({ ...valid, privateData: canary }, { contract });
  assert.equal(extraField.exitCode, 1);
  assert.equal(extraField.message.includes(canary), false);

  const forbidden = structuredClone(valid);
  forbidden.states[0].tokens = ['owner@example.com'];
  const forbiddenResult = await checkDocument(forbidden, { contract });
  assert.equal(forbiddenResult.exitCode, 1);
  assert.equal(forbiddenResult.message.includes('owner@example.com'), false);
});

test('sanitizes unexpected validator exceptions instead of echoing private errors', async () => {
  const contract = oneStateInventory();
  const snapshot = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-testid="safe-target"></div>' },
  });
  const canary = 'PRIVATE_EXCEPTION_CANARY_52a';
  const hostileContract = new Proxy(
    {},
    {
      get() {
        throw new Error(canary);
      },
    },
  );
  const result = await checkDocument(snapshot, { contract: hostileContract });
  assert.equal(result.exitCode, 1);
  assert.equal(result.message.includes(canary), false);
  assert.equal(result.message, 'The live snapshot could not be validated.');
});

test('rejects over-cap state and token inventories without truncating', async () => {
  const contract = oneStateInventory();
  const valid = makeSnapshot({
    ...contract,
    files: { 'one.txt': '<div data-testid="safe-target"></div>' },
  });
  const tooManyTokens = structuredClone(valid);
  tooManyTokens.states[0].tokens = Array.from(
    { length: MAX_TOKENS_PER_STATE + 1 },
    (_, index) => `token-${String(index).padStart(4, '0')}`,
  );
  assert.equal((await checkDocument(tooManyTokens, { contract })).exitCode, 1);

  const tooManyStates = structuredClone(valid);
  tooManyStates.states = Array.from({ length: MAX_SNAPSHOT_STATES + 1 }, (_, index) => ({
    stateId: `state-${String(index).padStart(3, '0')}`,
    filename: `state-${String(index).padStart(3, '0')}.txt`,
    status: 'captured',
    tokens: [],
  }));
  assert.equal((await checkDocument(tooManyStates, { contract })).exitCode, 1);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-oversize-'));
  try {
    const filename = path.join(directory, 'oversized.json');
    await writeFile(filename, ' '.repeat(MAX_SNAPSHOT_BYTES + 1), 'utf8');
    const result = await checkSnapshot({ snapshotPath: filename });
    assert.equal(result.exitCode, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects projected snapshots that exceed byte caps instead of truncating', () => {
  const tokens = Array.from({ length: 520 }, (_, index) => {
    return `data-owned-${String(index).padStart(4, '0')}-${'x'.repeat(490)}`;
  });
  const contract = oneStateInventory({ matchGroups: [tokens] });
  const raw = tokens.join(' ');
  assert.throws(
    () => makeSnapshot({ ...contract, files: { 'one.txt': raw } }),
    /exceeds the size limit/,
  );
});

test('rejects requested activation failures before the target-inventory coverage gate', async () => {
  const repo = await createSnapshotTestRepo();
  try {
    const evidence = await createExportEvidence({
      root: repo.root,
      modules: repo.modules,
      probeFailure: true,
    });
    assert.deepEqual(
      evidence.checkReport.targetRows.map((target) => target.targetId).sort(),
      evidence.inventory.targets.map((target) => target.targetId).sort(),
    );
    assert.deepEqual(evidence.checkReport.inventoryIssues, []);
    assert.equal(evidence.currentPageValidation.targetSummary.status, 'partial');
    assert.equal(evidence.currentPageValidation.probeSummary.status, 'failed');
    assert.equal(evidence.currentPageValidation.status, 'failed');

    const result = await repo.modules.snapshot.exportCandidate({
      root: repo.root,
      receiptPath: evidence.receiptPath,
      now: Date.now() + 5_000,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, 'failed');
    assert.equal(
      result.message,
      'The current-page evidence contains an observed validation failure.',
    );
    await assert.rejects(
      readFile(path.join(repo.root, 'test-results', 'live-snapshot', 'candidate.json')),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(repo.root, { recursive: true, force: true });
  }
});

test('keeps the complete target-inventory requirement for a target-only receipt', async () => {
  const repo = await createSnapshotTestRepo();
  try {
    const evidence = await createExportEvidence({ root: repo.root, modules: repo.modules });
    const inventoryTargetIds = evidence.inventory.targets.map((target) => target.targetId).sort();
    assert.deepEqual(
      evidence.checkReport.targetRows.map((target) => target.targetId).sort(),
      inventoryTargetIds,
    );
    assert.equal(evidence.currentPageValidation.targetSummary.total, inventoryTargetIds.length);
    const missingTargets = evidence.checkReport.targetRows.filter(
      (target) =>
        target.status === 'no-scrape-coverage' ||
        (target.status === 'fail' && target.missingExpectedFiles.length > 0),
    );
    assert.ok(missingTargets.length > 0, 'the fixture has required target evidence gaps');
    assert.ok(
      missingTargets.every(
        (target) =>
          target.status === 'no-scrape-coverage' || target.missingExpectedFiles.length > 0,
      ),
      'each reported coverage gap names absent required file evidence',
    );

    const scrapeActionIds = new Set(
      evidence.inventory.shortcuts
        .filter((shortcut) => shortcut.validationMode === 'scrape-targets')
        .map((shortcut) => shortcut.actionId),
    );
    const targetsById = new Map(
      evidence.inventory.targets.map((target) => [target.targetId, target]),
    );
    const missingActiveTargets = missingTargets.filter((target) =>
      targetsById
        .get(target.targetId)
        .usedByActionIds.some((actionId) => scrapeActionIds.has(actionId)),
    );
    assert.ok(
      missingActiveTargets.some(
        (target) => target.status === 'fail' && target.missingExpectedFiles.length > 0,
      ),
      'an active shortcut target with missing capture evidence blocks export',
    );
    assert.equal(evidence.currentPageValidation.targetSummary.partial, missingTargets.length);
    assert.equal(
      evidence.currentPageValidation.targetSummary.passed,
      inventoryTargetIds.length - missingTargets.length,
    );
    assert.equal(evidence.currentPageValidation.probeSummary.status, 'unverified');
    assert.equal(evidence.currentPageValidation.targetSummary.status, 'partial');

    const result = await repo.modules.snapshot.exportCandidate({
      root: repo.root,
      receiptPath: evidence.receiptPath,
      now: Date.now() + 5_000,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.message, 'Required current-page evidence is incomplete.');
    await assert.rejects(
      readFile(path.join(repo.root, 'test-results', 'live-snapshot', 'candidate.json')),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(repo.root, { recursive: true, force: true });
  }
});

test('rejects unknown text files in an otherwise registered capture folder', async () => {
  const repo = await createSnapshotTestRepo();
  try {
    const evidence = await createExportEvidence({ root: repo.root, modules: repo.modules });
    const receipt = JSON.parse(await readFile(evidence.receiptPath, 'utf8'));
    await writeFile(
      path.join(receipt.runFolder, 'unregistered.txt'),
      'unknown local capture',
      'utf8',
    );

    const result = await repo.modules.snapshot.exportCandidate({
      root: repo.root,
      receiptPath: evidence.receiptPath,
      now: Date.now() + 5_000,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.message, 'The exact current-page evidence is unavailable or inconsistent.');
    await assert.rejects(
      readFile(path.join(repo.root, 'test-results', 'live-snapshot', 'candidate.json'), 'utf8'),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(repo.root, { recursive: true, force: true });
  }
});

test('accepts local receipts through the exact 24-hour boundary and rejects future or older receipts', async () => {
  const repo = await createSnapshotTestRepo();
  try {
    const evidence = await createExportEvidence({ root: repo.root, modules: repo.modules });
    const receipt = JSON.parse(await readFile(evidence.receiptPath, 'utf8'));
    const completedAt = Date.parse(receipt.completedAt);
    assert.equal(MAX_INVOCATION_AGE_MS, 24 * 60 * 60 * 1000);

    const future = await repo.modules.snapshot.exportCandidate({
      root: repo.root,
      receiptPath: evidence.receiptPath,
      now: completedAt - 1,
    });
    assert.equal(future.exitCode, 2);
    assert.equal(future.message, 'The exact current-page evidence is stale.');

    const boundary = await repo.modules.snapshot.exportCandidate({
      root: repo.root,
      receiptPath: evidence.receiptPath,
      now: completedAt + MAX_INVOCATION_AGE_MS,
    });
    assert.equal(boundary.exitCode, 2);
    assert.equal(boundary.message, 'Required current-page evidence is incomplete.');

    const expired = await repo.modules.snapshot.exportCandidate({
      root: repo.root,
      receiptPath: evidence.receiptPath,
      now: completedAt + MAX_INVOCATION_AGE_MS + 1,
    });
    assert.equal(expired.exitCode, 2);
    assert.equal(expired.message, 'The exact current-page evidence is stale.');
  } finally {
    await rm(repo.root, { recursive: true, force: true });
  }
});

test('rejects non-finite local invocation clocks', async () => {
  const repo = await createSnapshotTestRepo();
  try {
    const evidence = await createExportEvidence({ root: repo.root, modules: repo.modules });

    for (const now of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await repo.modules.snapshot.exportCandidate({
        root: repo.root,
        receiptPath: evidence.receiptPath,
        now,
      });
      assert.equal(result.exitCode, 2);
      assert.equal(result.status, 'unavailable');
      assert.equal(result.message, 'The exact current-page evidence is stale.');
    }
  } finally {
    await rm(repo.root, { recursive: true, force: true });
  }
});

test('invalidates only the owned ignored candidate when export evidence is unavailable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-export-'));
  try {
    const liveDirectory = path.join(root, 'test-results', 'live-snapshot');
    const reportDirectory = path.join(root, 'test-results', 'shortcuts-live');
    await mkdir(liveDirectory, { recursive: true });
    await mkdir(reportDirectory, { recursive: true });
    const candidate = path.join(liveDirectory, 'candidate.json');
    const latest = path.join(root, 'tests', 'playwright', 'live-snapshot', 'latest.json');
    await mkdir(path.dirname(latest), { recursive: true });
    await writeFile(candidate, '{"oldCandidate":true}', 'utf8');
    await writeFile(latest, '{"trackedLatest":true}', 'utf8');
    const result = await exportCandidate({
      root,
      receiptPath: path.join(reportDirectory, 'receipt.json'),
      outputPath: candidate,
      now: FIXED_NOW,
    });
    assert.equal(result.exitCode, 2);
    await assert.rejects(readFile(candidate, 'utf8'), { code: 'ENOENT' });
    assert.equal(await readFile(latest, 'utf8'), '{"trackedLatest":true}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects latest.json and outside candidate destinations without touching them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-output-path-'));
  try {
    const liveDirectory = path.join(root, 'test-results', 'live-snapshot');
    const latest = path.join(root, 'tests', 'playwright', 'live-snapshot', 'latest.json');
    await mkdir(liveDirectory, { recursive: true });
    await mkdir(path.dirname(latest), { recursive: true });
    await writeFile(latest, '{"trackedLatest":true}', 'utf8');

    for (const outputPath of [latest, path.join(root, 'outside-candidate.json')]) {
      const result = await exportCandidate({
        root,
        receiptPath: path.join(root, 'test-results', 'shortcuts-live', 'receipt.json'),
        outputPath,
        now: FIXED_NOW,
      });
      assert.equal(result.exitCode, 2);
      assert.equal(result.message, 'The candidate path is not the owned ignored candidate path.');
    }

    assert.equal(await readFile(latest, 'utf8'), '{"trackedLatest":true}');
    await assert.rejects(readFile(path.join(liveDirectory, 'candidate.json'), 'utf8'), {
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects oversized local receipt JSON and invalidates its candidate without exposing content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-large-receipt-'));
  try {
    const reportDirectory = path.join(root, 'test-results', 'shortcuts-live');
    const candidateDirectory = path.join(root, 'test-results', 'live-snapshot');
    await mkdir(reportDirectory, { recursive: true });
    await mkdir(candidateDirectory, { recursive: true });
    const receiptPath = path.join(reportDirectory, 'receipt.json');
    const candidate = path.join(candidateDirectory, 'candidate.json');
    const privateCanary = 'PRIVATE_OVERSIZED_RECEIPT_728';
    await writeFile(receiptPath, `${' '.repeat(MAX_CAPTURE_FILE_BYTES)}${privateCanary}`, 'utf8');
    await writeFile(candidate, '{"oldCandidate":true}', 'utf8');
    const result = await exportCandidate({ root, receiptPath, now: FIXED_NOW });
    assert.equal(result.exitCode, 2);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.message, 'The current-page evidence exceeds a supported size limit.');
    assert.ok(!JSON.stringify(result).includes(privateCanary));
    assert.ok(!JSON.stringify(result).includes(root));
    await assert.rejects(readFile(candidate, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects symlinked snapshot inputs without reading or echoing the target', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-input-link-'));
  try {
    const outside = path.join(root, 'outside.json');
    const linked = path.join(root, 'snapshot.json');
    const canary = 'PRIVATE_INPUT_LINK_CANARY_18d';
    await writeFile(outside, JSON.stringify({ canary }), 'utf8');
    if (!(await createSymlinkOrSkip(context, outside, linked))) return;
    const result = await checkSnapshot({
      snapshotPath: linked,
      sourceFingerprint: SOURCE_FINGERPRINT,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(JSON.stringify(result).includes(canary), false);
    assert.equal(await readFile(outside, 'utf8'), JSON.stringify({ canary }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects symlinked receipts, aggregate reports, manifests, and check reports', async (context) => {
  for (const symlinkAt of ['receipt', 'aggregate', 'manifest', 'checkReport']) {
    await context.test(symlinkAt, async (subtest) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-evidence-link-'));
      try {
        const seeded = await seedReceiptRoot(subtest, root, symlinkAt);
        if (!seeded) return;
        const result = await exportCandidate({
          root,
          receiptPath: seeded.ownedPaths.receipt,
          outputPath: path.join(seeded.candidateDirectory, 'candidate.json'),
          now: FIXED_NOW,
        });
        assert.equal(result.exitCode, 2);
        assert.equal(JSON.stringify(result).includes(`OUTSIDE_CANARY_${symlinkAt}`), false);
        assert.equal(await readFile(seeded.outside, 'utf8'), `OUTSIDE_CANARY_${symlinkAt}`);
        await assert.rejects(
          readFile(path.join(seeded.candidateDirectory, 'candidate.json'), 'utf8'),
          { code: 'ENOENT' },
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});

test('rejects output-directory symlinks before creating candidate files', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-output-link-'));
  try {
    const outside = path.join(root, 'outside-output');
    const testResults = path.join(root, 'test-results');
    await mkdir(outside);
    await writeFile(path.join(outside, 'sentinel.txt'), 'OUTSIDE_OUTPUT_CANARY', 'utf8');
    const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';
    if (!(await createSymlinkOrSkip(context, outside, testResults, directoryLinkType))) return;
    const result = await exportCandidate({
      root,
      receiptPath: path.join(root, 'test-results', 'shortcuts-live', 'receipt.json'),
      outputPath: path.join(root, 'test-results', 'live-snapshot', 'candidate.json'),
      now: FIXED_NOW,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(JSON.stringify(result).includes('OUTSIDE_OUTPUT_CANARY'), false);
    assert.equal(
      await readFile(path.join(outside, 'sentinel.txt'), 'utf8'),
      'OUTSIDE_OUTPUT_CANARY',
    );
    await assert.rejects(readFile(path.join(outside, 'live-snapshot', 'candidate.json'), 'utf8'), {
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses unique exclusive temporary output and leaves a stale fixed-name symlink untouched', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-temp-link-'));
  try {
    const liveDirectory = path.join(root, 'test-results', 'live-snapshot');
    const reportDirectory = path.join(root, 'test-results', 'shortcuts-live');
    await mkdir(liveDirectory, { recursive: true });
    await mkdir(reportDirectory, { recursive: true });
    const outside = path.join(root, 'outside-temp.txt');
    const staleTemporary = path.join(liveDirectory, 'candidate.json.tmp');
    await writeFile(outside, 'OUTSIDE_TEMP_CANARY', 'utf8');
    if (!(await createSymlinkOrSkip(context, outside, staleTemporary))) return;
    const result = await exportCandidate({
      root,
      receiptPath: path.join(reportDirectory, 'receipt.json'),
      outputPath: path.join(liveDirectory, 'candidate.json'),
      now: FIXED_NOW,
    });
    assert.equal(result.exitCode, 2);
    assert.equal(JSON.stringify(result).includes('OUTSIDE_TEMP_CANARY'), false);
    assert.equal(await readFile(outside, 'utf8'), 'OUTSIDE_TEMP_CANARY');
    assert.equal((await lstat(staleTemporary)).isSymbolicLink(), true);
    await assert.rejects(readFile(path.join(liveDirectory, 'candidate.json'), 'utf8'), {
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fingerprints explicit LF-normalized source dependencies', async () => {
  assert.ok(SOURCE_FINGERPRINT_PATHS.includes('tests/playwright/lib/shortcut-capabilities.mjs'));
  assert.ok(SOURCE_FINGERPRINT_PATHS.includes('extension/manifest.json'));
  for (const relativePath of AUDITED_SOURCE_FINGERPRINT_PATHS) {
    assert.ok(SOURCE_FINGERPRINT_PATHS.includes(relativePath));
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-fingerprint-'));
  try {
    for (const relativePath of SOURCE_FINGERPRINT_PATHS) {
      const filename = path.join(root, ...relativePath.split('/'));
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, 'source line one\r\nsource line two\r\n', 'utf8');
    }
    const first = await computeSourceFingerprint({ root });
    for (const relativePath of SOURCE_FINGERPRINT_PATHS) {
      await writeFile(
        path.join(root, ...relativePath.split('/')),
        'source line one\nsource line two\n',
        'utf8',
      );
    }
    const normalized = await computeSourceFingerprint({ root });
    assert.equal(first, normalized);

    for (const relativePath of AUDITED_SOURCE_FINGERPRINT_PATHS) {
      const changedPath = path.join(root, ...relativePath.split('/'));
      await writeFile(changedPath, 'changed audited source\n', 'utf8');
      assert.notEqual(await computeSourceFingerprint({ root }), first, relativePath);
      await writeFile(changedPath, 'source line one\nsource line two\n', 'utf8');
      assert.equal(await computeSourceFingerprint({ root }), first, relativePath);
    }

    const changedPath = path.join(root, 'extension', 'manifest.json');
    await writeFile(changedPath, '{"manifest_version":3,"content_scripts":[]}\n', 'utf8');
    assert.notEqual(await computeSourceFingerprint({ root }), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('audited live-evidence source changes invalidate a fresh local receipt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-provenance-'));
  try {
    for (const relativePath of SOURCE_FINGERPRINT_PATHS) {
      const filename = path.join(root, ...relativePath.split('/'));
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, 'source baseline\n', 'utf8');
    }

    const outputDirectory = path.join(root, 'test-results', 'shortcuts-live');
    const candidateDirectory = path.join(root, 'test-results', 'live-snapshot');
    const runFolder = path.join(root, '_temp-files', 'inspector-captures', 'capture-one');
    await mkdir(outputDirectory, { recursive: true });
    await mkdir(candidateDirectory, { recursive: true });
    const receiptPath = path.join(outputDirectory, 'receipt.json');
    const candidatePath = path.join(candidateDirectory, 'candidate.json');
    const sourceFingerprint = await computeSourceFingerprint({ root });
    await writeFile(
      receiptPath,
      JSON.stringify({
        schemaVersion: 1,
        invocationId: '123e4567-e89b-42d3-a456-426614174000',
        startedAt: '2026-10-07T12:00:00.000Z',
        completedAt: '2026-10-07T12:01:00.000Z',
        sourceFingerprint,
        runFolder,
        captureExitCode: 0,
        probeShortcuts: false,
        validationReport: path.join(outputDirectory, 'report.json'),
        currentPageValidation: {
          reportPath: path.join(runFolder, 'check-report.html'),
        },
      }),
      'utf8',
    );
    for (const relativePath of AUDITED_SOURCE_FINGERPRINT_PATHS) {
      await writeFile(candidatePath, '{"oldCandidate":true}\n', 'utf8');
      await writeFile(
        path.join(root, ...relativePath.split('/')),
        `changed source: ${relativePath}\n`,
        'utf8',
      );

      const result = await exportCandidate({
        root,
        receiptPath,
        now: FIXED_NOW,
      });
      assert.equal(result.exitCode, 2, relativePath);
      assert.equal(result.status, 'unavailable', relativePath);
      assert.equal(result.message, 'Source changed after the current-page capture.', relativePath);
      await assert.rejects(readFile(candidatePath), { code: 'ENOENT' });
      await writeFile(path.join(root, ...relativePath.split('/')), 'source baseline\n', 'utf8');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
