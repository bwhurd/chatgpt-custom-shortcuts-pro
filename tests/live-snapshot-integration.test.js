import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { SOURCE_FINGERPRINT_PATHS } from '../scripts/live-snapshot.mjs';
import { unknownCapabilities } from './playwright/lib/shortcut-capabilities.mjs';

const SUPPLEMENTAL_MIRROR_PATHS = ['tests/playwright/lib/shortcut-audit-artifacts.mjs'];
const PRIVATE_CANARIES = [
  'PRIVATE_CAPTURE_CANARY_5e71',
  'https://chatgpt.com/c/private-conversation-canary-5e71',
  'private.capture@example.invalid',
  'C:\\Users\\private\\capture-canary.txt',
];
const NARROW_FIXTURE_ACTION_ID = 'shortcutKeyToggleModelSelector';
const NARROW_FIXTURE_TARGET_ID = 'model-switcher-menu';
const REMOVED_OPTIONAL_TOPBAR_STATE = Object.freeze({
  filename: '1c_TopbarToBottomEnabled_ThreadBottom.txt',
  stateId: 'topbar-bottom-enabled-thread-bottom',
});
async function createMirror({ narrowInventory = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'live-snapshot-integration-'));
  for (const relativePath of [...SOURCE_FINGERPRINT_PATHS, ...SUPPLEMENTAL_MIRROR_PATHS]) {
    const source = path.resolve(process.cwd(), ...relativePath.split('/'));
    const destination = path.join(root, ...relativePath.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  if (narrowInventory) await installNarrowFixtureInventory(root);
  return root;
}

async function installNarrowFixtureInventory(root) {
  const filename = path.join(root, 'extension', 'shared', 'shortcut-action-metadata.js');
  const source = await readFile(filename, 'utf8');
  const originalReturn = '  return Object.freeze({\n    VALIDATION_MODES,';
  assert.equal(source.split(originalReturn).length - 1, 1);
  const withFixture = source.replace(
    originalReturn,
    `  const fixtureTargets = Object.freeze(
    TARGET_DESCRIPTORS.filter((target) => target.targetId === '${NARROW_FIXTURE_TARGET_ID}'),
  );
  const fixtureActions = Object.freeze(
    SHORTCUT_ACTIONS.map((shortcut) => {
      if (shortcut.actionId === '${NARROW_FIXTURE_ACTION_ID}') {
        return Object.freeze({
          ...shortcut,
          targetRefs: Object.freeze(['${NARROW_FIXTURE_TARGET_ID}']),
          uiStateRefs: Object.freeze(['${NARROW_FIXTURE_TARGET_ID}']),
        });
      }
      return Object.freeze({
        ...shortcut,
        validationMode: 'manual-only',
        targetRefs: Object.freeze([]),
        uiStateRefs: Object.freeze([]),
        activationProbe: freezeActivationProbe({
          mode: 'manual-only',
          notes: 'Temporary integration fixture scope.',
        }),
      });
    }),
  );

  return Object.freeze({\n    VALIDATION_MODES,`,
  );
  const withNarrowExports = withFixture.replace(
    '    TARGET_DESCRIPTORS,\n    SHORTCUT_ACTIONS,',
    '    TARGET_DESCRIPTORS: fixtureTargets,\n    SHORTCUT_ACTIONS: fixtureActions,',
  );
  assert.notEqual(withNarrowExports, source);
  await writeFile(filename, withNarrowExports, 'utf8');
}

async function loadMirrorModules(root) {
  const importMirror = (relativePath) =>
    import(pathToFileURL(path.join(root, ...relativePath.split('/'))).href);
  const [snapshot, core, validation, visualReport] = await Promise.all([
    importMirror('scripts/live-snapshot.mjs'),
    importMirror('tests/playwright/lib/devscrape-wide-core.mjs'),
    importMirror('tests/playwright/lib/current-page-validation.mjs'),
    importMirror('tests/playwright/lib/shortcut-fast-visual-report.mjs'),
  ]);
  return { snapshot, core, validation, visualReport };
}

function currentInventoryGaps(inventory) {
  const shortcutsById = new Map(
    inventory.shortcuts.map((shortcut) => [shortcut.actionId, shortcut]),
  );
  const uncoveredTargets = inventory.targets.filter(
    (target) =>
      target.expectedFiles.length === 0 &&
      target.usedByActionIds.some(
        (actionId) => shortcutsById.get(actionId)?.validationMode === 'scrape-targets',
      ),
  );
  const orphanTargets = inventory.targets.filter(
    (target) => target.expectedFiles.length === 0 && target.usedByActionIds.length === 0,
  );
  return { shortcutsById, uncoveredTargets, orphanTargets };
}

function assertProbeOnlyStateProjection(
  registry,
  inventory,
  artifacts,
  snapshotStates = null,
  { allowUnreferenced = false } = {},
) {
  const probeOnlyEntries = registry.filter((entry) => entry.probeOnly === true);
  const probeOnlyStateIds = new Set(probeOnlyEntries.map((entry) => entry.stateId));
  const targetsById = new Map(inventory.targets.map((target) => [target.targetId, target]));
  const shortcutsById = new Map(
    inventory.shortcuts.map((shortcut) => [shortcut.actionId, shortcut]),
  );

  assert.ok(probeOnlyEntries.length > 0, 'the contract exercises probe-only state projection');
  for (const entry of probeOnlyEntries) {
    assert.equal(entry.capture?.type, 'probe-target', `${entry.stateId} names its capture target`);
    const relatedTargets = inventory.targets.filter((target) =>
      (target.expectedUiStateRefs || []).includes(entry.stateId),
    );
    if (relatedTargets.length === 0 && allowUnreferenced) {
      const artifact = artifacts.find((candidate) => candidate.stateId === entry.stateId);
      assert.ok(artifact, `probe-only state ${entry.stateId} is projected into the manifest`);
      assert.equal(artifact.filename, entry.filename);
      assert.equal(artifact.status, 'deferred');
      if (snapshotStates) {
        const state = snapshotStates.find((candidate) => candidate.stateId === entry.stateId);
        assert.ok(state, `probe-only state ${entry.stateId} is projected into the snapshot`);
        assert.equal(state.filename, entry.filename);
        assert.equal(state.status, 'deferred');
      }
      continue;
    }
    assert.ok(relatedTargets.length > 0, `${entry.stateId} is required by a target`);
    const captureTarget = targetsById.get(entry.capture.targetRef);
    assert.ok(captureTarget, `${entry.stateId} capture points to a known target`);
    assert.ok(
      relatedTargets.some((target) => target.targetId === captureTarget.targetId),
      `${entry.stateId} capture target consumes its state`,
    );

    for (const target of relatedTargets) {
      assert.ok(
        target.expectedFiles.includes(entry.filename),
        `${target.targetId} requires ${entry.filename}`,
      );
      for (const actionId of target.usedByActionIds) {
        const shortcut = shortcutsById.get(actionId);
        assert.ok(shortcut, `${actionId} remains registered for ${target.targetId}`);
        assert.ok(shortcut.targetRefs.includes(target.targetId));
        assert.ok(shortcut.requiredUiStateRefs.includes(entry.stateId));
      }
    }

    const artifact = artifacts.find((candidate) => candidate.stateId === entry.stateId);
    assert.ok(artifact, `probe-only state ${entry.stateId} is projected into the manifest`);
    assert.equal(artifact.filename, entry.filename);
    assert.equal(artifact.status, 'deferred');
    if (snapshotStates) {
      const state = snapshotStates.find((candidate) => candidate.stateId === entry.stateId);
      assert.ok(state, `probe-only state ${entry.stateId} is projected into the snapshot`);
      assert.equal(state.filename, entry.filename);
      assert.equal(state.status, 'deferred');
    }
  }

  for (const target of inventory.targets.filter((candidate) => candidate.probeOnly === true)) {
    assert.ok(
      (target.expectedUiStateRefs || []).some((stateId) => probeOnlyStateIds.has(stateId)),
      `${target.targetId} maps to a registered probe-only state`,
    );
  }
}

function assertRemovedOptionalTopbarStateAbsent(
  registry,
  inventory,
  artifacts,
  snapshotStates = null,
) {
  assert.equal(
    registry.some(
      (entry) =>
        entry.filename === REMOVED_OPTIONAL_TOPBAR_STATE.filename ||
        entry.stateId === REMOVED_OPTIONAL_TOPBAR_STATE.stateId,
    ),
    false,
    'the optional top-bar-enabled state is absent from the current registry',
  );
  assert.equal(
    inventory.targets.some((target) =>
      target.expectedFiles.includes(REMOVED_OPTIONAL_TOPBAR_STATE.filename),
    ),
    false,
    'no current target requires the removed optional state',
  );
  assert.equal(
    artifacts.some(
      (artifact) =>
        artifact.filename === REMOVED_OPTIONAL_TOPBAR_STATE.filename ||
        artifact.stateId === REMOVED_OPTIONAL_TOPBAR_STATE.stateId,
    ),
    false,
    'the current run manifest omits the removed optional state',
  );
  if (snapshotStates) {
    assert.equal(
      snapshotStates.some(
        (state) =>
          state.filename === REMOVED_OPTIONAL_TOPBAR_STATE.filename ||
          state.stateId === REMOVED_OPTIONAL_TOPBAR_STATE.stateId,
      ),
      false,
      'the exported snapshot omits the removed optional state',
    );
  }
}

function allMatchNeedles(inventory) {
  return [
    ...new Set(
      inventory.targets.flatMap((target) =>
        (target.matchGroups || []).flatMap((group) => (Array.isArray(group) ? group : [group])),
      ),
    ),
  ];
}

async function makeFreshRun({
  root,
  modules,
  mode = 'complete',
  captureExitCode = 0,
  probeShortcuts = false,
  ageMs = 0,
} = {}) {
  const { registry, inventory } = await modules.snapshot.loadCurrentContract();
  const { exports } = await modules.core.loadDevScrapeWideContract();
  const tokens = allMatchNeedles(inventory);
  const failingTarget =
    mode === 'observed-failure'
      ? inventory.targets.find((target) => target.targetId === NARROW_FIXTURE_TARGET_ID)
      : null;
  const withheld = new Set(
    (failingTarget?.matchGroups || []).flatMap((group) => (Array.isArray(group) ? group : [group])),
  );
  const rawDump = [...tokens.filter((token) => !withheld.has(token)), ...PRIVATE_CANARIES].join(
    '\n',
  );
  const missingTarget =
    mode === 'missing'
      ? inventory.targets.find((target) => target.targetId === NARROW_FIXTURE_TARGET_ID)
      : null;
  const missingFilename = missingTarget?.expectedFiles[0];
  const manifestArtifacts = registry.map((entry) => {
    const status =
      entry.status === 'deferred' || entry.probeOnly === true
        ? 'deferred'
        : entry.filename === missingFilename
          ? 'failed'
          : entry.aliasOf
            ? 'alias'
            : 'captured';
    return {
      filename: entry.filename,
      stateId: entry.stateId,
      label: entry.label,
      status,
      error: status === 'failed' ? 'Synthetic missing capture.' : null,
      aliasOf: entry.aliasOf || null,
      captureBytes: status === 'captured' || status === 'alias' ? rawDump.length : 0,
      clickPath: Array.isArray(entry.steps) ? entry.steps.map((step) => step.label) : [],
    };
  });
  const normalizedArtifacts = manifestArtifacts
    .filter((artifact) => artifact.status === 'captured' || artifact.status === 'alias')
    .map((artifact) => ({ filename: artifact.filename, normalizedHtml: rawDump }));
  const invocationTime = Date.now() - ageMs;
  const startedAt = new Date(invocationTime - 60_000).toISOString();
  const runCompletedAt = new Date(invocationTime - 1_000).toISOString();
  const capabilities = unknownCapabilities();
  const scrapeResult = {
    runKind: 'devscrapewide',
    fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    fixtureOwnership: null,
    pageInfo: {
      url: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      fixtureOk: true,
      title: 'Synthetic local fixture; no browser data was captured.',
    },
    capabilities,
    startedAt: new Date(Date.parse(startedAt) + 1_000).toISOString(),
    completedAt: runCompletedAt,
    capturedCount: manifestArtifacts.filter((artifact) =>
      ['captured', 'alias'].includes(artifact.status),
    ).length,
    failedCount: manifestArtifacts.filter((artifact) => artifact.status === 'failed').length,
    deferredCount: manifestArtifacts.filter((artifact) => artifact.status === 'deferred').length,
    artifacts: manifestArtifacts,
  };
  const run = await modules.core.writeScrapeRun({ scrapeResult, normalizedArtifacts });
  if (probeShortcuts) {
    const probeShortcutsInScope = inventory.shortcuts.filter(
      (shortcut) =>
        !['manual-only', 'not-applicable'].includes(shortcut.validationMode) &&
        shortcut.activationProbeSafe === true &&
        shortcut.activationProbeMode !== 'not-live-probed',
    );
    const probeRows = probeShortcutsInScope.map((shortcut) => ({
      actionId: shortcut.actionId,
      probeMode: shortcut.activationProbeMode,
      status: 'pass',
    }));
    await modules.core.writeLiveProbeReport(run.folderPath, {
      schemaVersion: 1,
      generatedAt: runCompletedAt,
      fixtureUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
      capabilities,
      runStatus: 'completed',
      rows: probeRows,
      summary: {
        runStatus: 'completed',
        total: probeRows.length,
        executable: probeRows.length,
        passed: probeRows.length,
        failed: 0,
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
  // Keep synthetic evidence inside its declared invocation, including aged fixtures.
  checkReport.generatedAt = runCompletedAt;
  const checkReportFiles = await modules.core.writeCheckReportFiles(checkReport);
  const completedAt = new Date(invocationTime).toISOString();
  const cdpEndpoint = 'http://127.0.0.1:9333';
  const profileDirectory = path.join(root, 'synthetic-profile');
  const currentPageValidation = modules.validation.classifyCurrentPageValidation(checkReport, {
    startedAt,
    completedAt,
    cdpEndpoint,
    profileDirectory,
  });
  currentPageValidation.reportPath = checkReportFiles.htmlPath;
  assert.equal(currentPageValidation.reportPath, path.join(run.folderPath, 'check-report.html'));
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
  const receipt = {
    schemaVersion: 1,
    invocationId: aggregateReport.invocationId,
    startedAt,
    completedAt,
    sourceFingerprint,
    runFolder: run.folderPath,
    captureExitCode,
    probeShortcuts,
    validationReport: aggregate.json,
    currentPageValidation: aggregateReport.currentPageValidation,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return {
    registry,
    inventory,
    capabilities,
    run,
    checkReport,
    currentPageValidation: aggregateReport.currentPageValidation,
    receiptPath,
    rawDump,
  };
}

function runCli(root, args) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'live-snapshot.mjs'), ...args],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  return result;
}

async function fileExists(filename) {
  try {
    await readFile(filename, 'utf8');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

test('temp-repo CLI refuses the current incomplete contract and exercises a labeled narrow fixture', async () => {
  const currentRoot = await createMirror();
  const syntheticRoot = await createMirror({ narrowInventory: true });
  try {
    const current = await loadMirrorModules(currentRoot);
    const currentFingerprint = await current.snapshot.computeSourceFingerprint({
      root: currentRoot,
    });
    assert.equal(currentFingerprint.length, 64);
    assert.deepEqual(current.snapshot.SOURCE_FINGERPRINT_PATHS, SOURCE_FINGERPRINT_PATHS);
    const currentEvidence = await makeFreshRun({ root: currentRoot, modules: current });
    const { shortcutsById, uncoveredTargets, orphanTargets } = currentInventoryGaps(
      currentEvidence.inventory,
    );
    assert.deepEqual(uncoveredTargets, [], 'all canonical targets have registered file coverage');
    const probeOnlyFiles = new Set(
      currentEvidence.registry.filter((entry) => entry.probeOnly).map((entry) => entry.filename),
    );
    const uncapturedProbeTargets = currentEvidence.inventory.targets.filter((target) =>
      target.expectedFiles.some((filename) => probeOnlyFiles.has(filename)),
    );
    assert.ok(
      uncapturedProbeTargets.length > 0,
      'probe-only registry entries leave some required targets uncaptured',
    );
    const uncoveredActionIds = [
      ...new Set(uncapturedProbeTargets.flatMap((target) => target.usedByActionIds)),
    ].sort();
    assert.ok(uncoveredActionIds.length > 0, 'uncaptured targets belong to shortcut actions');
    for (const actionId of uncoveredActionIds) {
      const mode = shortcutsById.get(actionId)?.validationMode;
      if (actionId === 'shortcutKeyToggleChatWork') {
        assert.equal(mode, 'scrape-targets');
        assert.equal(shortcutsById.get(actionId)?.activationProbe?.mode, 'not-live-probed');
        assert.equal(shortcutsById.get(actionId)?.activationProbe?.safe, false);
      } else if (actionId === 'shortcutKeyStopAndTranscribeDictation') {
        assert.equal(mode, 'manual-only');
      } else {
        assert.equal(mode, 'scrape-targets', `${actionId} remains a scrape-target action`);
      }
    }
    assert.deepEqual(orphanTargets, [], 'every target is linked to an action or registered file');
    const stopDictation = currentEvidence.inventory.targets.find(
      (target) => target.targetId === 'stop-dictation-button',
    );
    assert.deepEqual(stopDictation.usedByActionIds, ['shortcutKeyStopAndTranscribeDictation']);
    assert.equal(
      shortcutsById.get('shortcutKeyStopAndTranscribeDictation')?.validationMode,
      'manual-only',
    );
    assert.deepEqual(
      currentEvidence.checkReport.targetRows.map((target) => target.targetId).sort(),
      currentEvidence.inventory.targets.map((target) => target.targetId).sort(),
      'the check report covers the full required target inventory',
    );
    for (const targetId of ['previous-response-button', 'next-response-button']) {
      assert.equal(
        currentEvidence.checkReport.targetRows.some((target) => target.targetId === targetId),
        false,
      );
    }
    for (const actionId of ['shortcutKeyPreviousThread', 'shortcutKeyNextThread']) {
      assert.equal(shortcutsById.has(actionId), false);
    }
    assert.equal(
      currentEvidence.currentPageValidation.targetSummary.total,
      currentEvidence.inventory.targets.length,
    );
    assert.equal(
      currentEvidence.currentPageValidation.targetSummary.partial,
      uncapturedProbeTargets.length,
    );
    assert.equal(
      currentEvidence.currentPageValidation.targetSummary.passed,
      currentEvidence.inventory.targets.length - uncapturedProbeTargets.length,
    );
    assert.equal(currentEvidence.currentPageValidation.targetSummary.outOfScope, 0);
    assert.equal(
      currentEvidence.checkReport.summary.shortcuts.total,
      currentEvidence.inventory.shortcuts.length,
    );
    assert.equal(currentEvidence.currentPageValidation.status, 'partial');
    assert.equal(currentEvidence.currentPageValidation.targetSummary.status, 'partial');
    const currentManifest = JSON.parse(
      await readFile(path.join(currentEvidence.run.folderPath, 'run-manifest.json'), 'utf8'),
    );
    assertRemovedOptionalTopbarStateAbsent(
      currentEvidence.registry,
      currentEvidence.inventory,
      currentManifest.artifacts,
    );
    assertProbeOnlyStateProjection(
      currentEvidence.registry,
      currentEvidence.inventory,
      currentManifest.artifacts,
    );

    const currentCandidate = path.join(
      currentRoot,
      'test-results',
      'live-snapshot',
      'candidate.json',
    );
    const currentLatest = path.join(
      currentRoot,
      'tests',
      'playwright',
      'live-snapshot',
      'latest.json',
    );
    await mkdir(path.dirname(currentLatest), { recursive: true });
    await mkdir(path.dirname(currentCandidate), { recursive: true });
    await writeFile(currentCandidate, '{"staleCandidate":true}\n', 'utf8');
    await writeFile(currentLatest, '{"trackedLatest":true}\n', 'utf8');
    const currentExport = runCli(currentRoot, ['export', '--receipt', currentEvidence.receiptPath]);
    assert.equal(currentExport.status, 2, currentExport.stderr);
    assert.match(currentExport.stderr, /incomplete/i);
    assert.equal(await fileExists(currentCandidate), false);
    assert.equal(await readFile(currentLatest, 'utf8'), '{"trackedLatest":true}\n');
    for (const canary of PRIVATE_CANARIES) {
      assert.equal(`${currentExport.stdout}${currentExport.stderr}`.includes(canary), false);
    }
    const currentMissingCheck = runCli(currentRoot, ['check', '--snapshot', currentCandidate]);
    assert.equal(currentMissingCheck.status, 0, currentMissingCheck.stderr);
    assert.match(currentMissingCheck.stdout, /UNVERIFIED — snapshot-missing/);
    assert.equal(await readFile(currentLatest, 'utf8'), '{"trackedLatest":true}\n');

    const synthetic = await loadMirrorModules(syntheticRoot);
    const syntheticEvidence = await makeFreshRun({ root: syntheticRoot, modules: synthetic });
    assert.deepEqual(syntheticEvidence.capabilities, unknownCapabilities());
    assert.deepEqual(syntheticEvidence.run.manifest.capabilities, syntheticEvidence.capabilities);
    assert.deepEqual(syntheticEvidence.checkReport.capabilities, syntheticEvidence.capabilities);
    const persistedSyntheticReport = JSON.parse(
      await readFile(path.join(syntheticEvidence.run.folderPath, 'check-report.json'), 'utf8'),
    );
    assert.deepEqual(persistedSyntheticReport.capabilities, syntheticEvidence.capabilities);
    assert.equal(
      syntheticEvidence.currentPageValidation.status,
      'partial',
      JSON.stringify({
        reason: syntheticEvidence.currentPageValidation.reason,
        targetSummary: syntheticEvidence.currentPageValidation.targetSummary,
        probeSummary: syntheticEvidence.currentPageValidation.probeSummary,
        failures: syntheticEvidence.currentPageValidation.failures,
        scopeLimitations: syntheticEvidence.currentPageValidation.scopeLimitations,
      }),
    );
    assert.equal(syntheticEvidence.currentPageValidation.targetSummary.status, 'passed');
    assert.equal(syntheticEvidence.currentPageValidation.probeSummary.status, 'unverified');
    assert.equal(
      syntheticEvidence.checkReport.summary.liveProbes.runStatus,
      'not-run',
      'the target-only fixture omits optional activation-probe evidence',
    );
    assert.equal(
      syntheticEvidence.checkReport.summary.shortcuts.total,
      syntheticEvidence.inventory.shortcuts.length,
    );
    assert.equal(syntheticEvidence.checkReport.targetRows.length, 1);
    assert.equal(syntheticEvidence.checkReport.targetRows[0].targetId, NARROW_FIXTURE_TARGET_ID);
    assert.equal(
      syntheticEvidence.currentPageValidation.reportPath,
      path.join(syntheticEvidence.run.folderPath, 'check-report.html'),
    );
    const aliases = syntheticEvidence.registry.filter((entry) => entry.aliasOf);
    assert.ok(aliases.length > 0, 'the fixture includes the real alias registry entries');
    for (const alias of aliases) {
      const aliasText = await readFile(
        path.join(syntheticEvidence.run.folderPath, alias.filename),
        'utf8',
      );
      const sourceText = await readFile(
        path.join(syntheticEvidence.run.folderPath, alias.aliasOf),
        'utf8',
      );
      assert.equal(aliasText, sourceText);
    }
    const syntheticDeferred = syntheticEvidence.registry.find((entry) => entry.probeOnly);
    assert.ok(syntheticDeferred, 'the narrow fixture retains probe-only deferred states');
    const syntheticManifest = JSON.parse(
      await readFile(path.join(syntheticEvidence.run.folderPath, 'run-manifest.json'), 'utf8'),
    );
    assertRemovedOptionalTopbarStateAbsent(
      syntheticEvidence.registry,
      syntheticEvidence.inventory,
      syntheticManifest.artifacts,
    );
    assertProbeOnlyStateProjection(
      syntheticEvidence.registry,
      syntheticEvidence.inventory,
      syntheticManifest.artifacts,
      null,
      { allowUnreferenced: true },
    );
    assert.deepEqual(syntheticManifest.capabilities, syntheticEvidence.capabilities);
    assert.equal(
      syntheticManifest.artifacts.find((artifact) => artifact.stateId === syntheticDeferred.stateId)
        ?.status,
      'deferred',
    );

    const syntheticCandidate = path.join(
      syntheticRoot,
      'test-results',
      'live-snapshot',
      'candidate.json',
    );
    const syntheticLatest = path.join(
      syntheticRoot,
      'tests',
      'playwright',
      'live-snapshot',
      'latest.json',
    );
    await mkdir(path.dirname(syntheticLatest), { recursive: true });
    await writeFile(syntheticLatest, '{"trackedLatest":true}\n', 'utf8');
    const success = runCli(syntheticRoot, ['export', '--receipt', syntheticEvidence.receiptPath]);
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /candidate exported.*complete coverage/i);
    const snapshotText = await readFile(syntheticCandidate, 'utf8');
    for (const canary of PRIVATE_CANARIES) assert.equal(snapshotText.includes(canary), false);
    const goodSnapshot = JSON.parse(snapshotText);
    assert.equal(goodSnapshot.coverageStatus, 'complete');
    assert.equal(goodSnapshot.states.length, syntheticEvidence.registry.length);
    assertRemovedOptionalTopbarStateAbsent(
      syntheticEvidence.registry,
      syntheticEvidence.inventory,
      syntheticManifest.artifacts,
      goodSnapshot.states,
    );
    assertProbeOnlyStateProjection(
      syntheticEvidence.registry,
      syntheticEvidence.inventory,
      syntheticManifest.artifacts,
      goodSnapshot.states,
      { allowUnreferenced: true },
    );
    assert.equal(
      goodSnapshot.states.find((state) => state.stateId === syntheticDeferred.stateId)?.status,
      'deferred',
    );
    const successCheck = runCli(syntheticRoot, ['check', '--snapshot', syntheticCandidate]);
    assert.equal(successCheck.status, 0, successCheck.stderr);
    assert.match(successCheck.stdout, /Live snapshot: VERIFIED/);
    for (const canary of PRIVATE_CANARIES) {
      assert.equal(
        `${success.stdout}${success.stderr}${successCheck.stdout}${successCheck.stderr}`.includes(
          canary,
        ),
        false,
      );
    }

    const passingEvidence = await makeFreshRun({
      root: syntheticRoot,
      modules: synthetic,
      captureExitCode: 37,
      probeShortcuts: true,
      ageMs: 3.5 * 60 * 60 * 1000,
    });
    assert.equal(passingEvidence.currentPageValidation.status, 'passed');
    assert.match(passingEvidence.currentPageValidation.reason, /live activation checks passed/i);
    assert.ok(
      passingEvidence.currentPageValidation.scopeLimitations.some((limitation) =>
        /optional scrape artifact.*deferred evidence.*not required by any current target/i.test(
          limitation.reason,
        ),
      ),
      'optional deferred artifacts remain diagnostic when required targets and probes pass',
    );
    assert.equal(passingEvidence.currentPageValidation.targetSummary.status, 'passed');
    assert.equal(passingEvidence.currentPageValidation.probeSummary.status, 'passed');
    const passingReceipt = JSON.parse(await readFile(passingEvidence.receiptPath, 'utf8'));
    const passingAgeMs = Date.now() - Date.parse(passingReceipt.completedAt);
    assert.ok(passingAgeMs > 30 * 60 * 1000);
    assert.ok(passingAgeMs < 24 * 60 * 60 * 1000);
    const passingExport = runCli(syntheticRoot, [
      'export',
      '--receipt',
      passingEvidence.receiptPath,
    ]);
    assert.equal(passingExport.status, 0, passingExport.stderr);
    assert.match(passingExport.stdout, /candidate exported.*complete coverage/i);
    assert.equal(JSON.parse(await readFile(syntheticCandidate, 'utf8')).coverageStatus, 'complete');

    const captureB = await makeFreshRun({ root: syntheticRoot, modules: synthetic });
    assert.notEqual(captureB.run.folderPath, syntheticEvidence.run.folderPath);
    const mixedReceipt = JSON.parse(await readFile(captureB.receiptPath, 'utf8'));
    const mixedAggregate = JSON.parse(await readFile(mixedReceipt.validationReport, 'utf8'));
    mixedReceipt.currentPageValidation = syntheticEvidence.currentPageValidation;
    mixedAggregate.currentPageValidation = syntheticEvidence.currentPageValidation;
    assert.equal(
      mixedAggregate.currentPageValidation.reportPath,
      path.join(syntheticEvidence.run.folderPath, 'check-report.html'),
    );
    assert.notEqual(
      mixedReceipt.currentPageValidation.reportPath,
      path.join(mixedReceipt.runFolder, 'check-report.html'),
      'receipt and aggregate agree, but both name capture A while the valid receipt names capture B',
    );
    await writeFile(
      mixedReceipt.validationReport,
      `${JSON.stringify(mixedAggregate, null, 2)}\n`,
      'utf8',
    );
    await writeFile(captureB.receiptPath, `${JSON.stringify(mixedReceipt, null, 2)}\n`, 'utf8');
    const mixedReportExport = runCli(syntheticRoot, ['export', '--receipt', captureB.receiptPath]);
    assert.equal(mixedReportExport.status, 2, mixedReportExport.stderr);
    assert.match(
      mixedReportExport.stderr,
      /exact current-page evidence is unavailable or inconsistent/i,
    );
    assert.equal(await fileExists(syntheticCandidate), false);
    for (const canary of PRIVATE_CANARIES) {
      assert.equal(
        `${mixedReportExport.stdout}${mixedReportExport.stderr}`.includes(canary),
        false,
      );
    }

    const privacyCanary = 'PRIVATE_SNAPSHOT_CANARY_5e71';
    const privacySnapshot = structuredClone(goodSnapshot);
    const privacyState = privacySnapshot.states.find((state) => state.status === 'captured');
    privacyState.tokens = [...privacyState.tokens, privacyCanary].sort();
    const privacyPath = path.join(syntheticRoot, 'privacy-canary-snapshot.json');
    await writeFile(privacyPath, `${JSON.stringify(privacySnapshot, null, 2)}\n`, 'utf8');
    const privacyCheck = runCli(syntheticRoot, ['check', '--snapshot', privacyPath]);
    assert.equal(privacyCheck.status, 1);
    assert.match(privacyCheck.stderr, /INVALID/);
    assert.equal(`${privacyCheck.stdout}${privacyCheck.stderr}`.includes(privacyCanary), false);

    const observedFailure = await makeFreshRun({
      root: syntheticRoot,
      modules: synthetic,
      mode: 'observed-failure',
    });
    assert.equal(observedFailure.currentPageValidation.status, 'failed');
    await writeFile(syntheticCandidate, '{"staleCandidate":true}\n', 'utf8');
    const failedExport = runCli(syntheticRoot, [
      'export',
      '--receipt',
      observedFailure.receiptPath,
    ]);
    assert.equal(failedExport.status, 1, failedExport.stderr);
    assert.match(failedExport.stderr, /observed validation failure/i);
    assert.equal(await fileExists(syntheticCandidate), false);

    const missingCapture = await makeFreshRun({
      root: syntheticRoot,
      modules: synthetic,
      mode: 'missing',
    });
    assert.equal(missingCapture.currentPageValidation.status, 'partial');
    await writeFile(syntheticCandidate, '{"staleCandidate":true}\n', 'utf8');
    const missingExport = runCli(syntheticRoot, [
      'export',
      '--receipt',
      missingCapture.receiptPath,
    ]);
    assert.equal(missingExport.status, 2, missingExport.stderr);
    assert.match(missingExport.stderr, /incomplete/i);
    assert.equal(await fileExists(syntheticCandidate), false);
    assert.equal(await readFile(syntheticLatest, 'utf8'), '{"trackedLatest":true}\n');
    const noFallback = runCli(syntheticRoot, ['check', '--snapshot', syntheticCandidate]);
    assert.equal(noFallback.status, 0, noFallback.stderr);
    assert.match(noFallback.stdout, /UNVERIFIED — snapshot-missing/);
    assert.equal(await readFile(syntheticLatest, 'utf8'), '{"trackedLatest":true}\n');
    for (const canary of PRIVATE_CANARIES) {
      assert.equal(
        `${failedExport.stdout}${failedExport.stderr}${missingExport.stdout}${missingExport.stderr}`.includes(
          canary,
        ),
        false,
      );
    }
  } finally {
    await rm(currentRoot, { recursive: true, force: true });
    await rm(syntheticRoot, { recursive: true, force: true });
  }
});
