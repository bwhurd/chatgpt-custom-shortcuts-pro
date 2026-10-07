import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CATALOGUE_RESULT_PATH,
  FAST_CASES,
  loadFastCatalogue,
  RESULT_PATH,
} from './playwright/lib/shortcut-fast-cases.mjs';

async function readOptionalArtifact(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// This checker is opt-in historical evidence review; ordinary report and fast
// fixture runs do not depend on ignored local result files.
const [catalogue, result] = await Promise.all([
  readOptionalArtifact(CATALOGUE_RESULT_PATH),
  readOptionalArtifact(RESULT_PATH),
]);
if (!catalogue && !result) {
  console.log('Saved fast acceptance skipped: no optional local evidence artifacts were found.');
} else {
  const { report: current } = await loadFastCatalogue();
  for (const artifact of [catalogue, result].filter(Boolean)) {
    for (const key of [
      'sourceFingerprint',
      'catalogueFingerprint',
      'caseFingerprint',
      'fixtureFingerprint',
    ])
      assert.equal(
        artifact[key],
        current[key],
        `Stale ${key}: rerun only the invalidated artifact`,
      );
    assert.deepEqual(artifact.issues, []);
    assert.deepEqual(
      artifact.rows.map((row) => row.rowId).sort(),
      current.rows.map((row) => row.rowId).sort(),
    );
    assert.equal(
      artifact.summary.catalogue,
      artifact.summary.admitted +
        artifact.summary.deferred +
        artifact.summary.notApplicable +
        artifact.summary.external,
    );
    for (const row of artifact.rows.filter((item) => item.status === 'deferred'))
      assert.ok(
        row.owner &&
          row.deferCategory &&
          row.reason &&
          row.unblock &&
          row.proposedLane &&
          row.proofBoundary &&
          row.expectedBlocker &&
          row.nextStep,
        `Unexplained omission: ${row.rowId}`,
      );
  }

  if (catalogue) {
    assert.equal(
      catalogue.observations.length,
      0,
      'Catalogue contains no keyboard execution claim',
    );
    assert.ok(
      catalogue.rows.filter((row) => row.admitted).every((row) => row.status === 'not-run'),
    );
  }

  if (result) {
    assert.deepEqual(
      result.observations.map((row) => row.actionId).sort(),
      FAST_CASES.map((row) => row.actionId).sort(),
      'Saved full acceptance requires every admitted executable case exactly once',
    );
    assert.ok(
      result.observations.every(
        (row) =>
          row.attempted &&
          row.proofScope === 'fixture-keyboard' &&
          row.status === 'pass' &&
          (row.targetStatus === 'present' ||
            (row.targetStatus === 'unavailable' && row.effectStatus === 'inert')) &&
          row.dispatchStatus === 'pass' &&
          (row.effectStatus === 'pass' ||
            (row.targetStatus === 'unavailable' && row.effectStatus === 'inert')) &&
          row.pageErrors.length === 0,
      ),
    );
    assert.ok(
      result.rows.filter((row) => row.admitted).every((row) => row.status === 'pass'),
      'All admitted action and derived contract rows require explicit proof',
    );
    assert.equal(result.summary.notRun, 0);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.environmentFailed, 0);
    assert.equal(result.scheduling.serialBarrierPassed, true);
    assert.equal(result.scheduling.tabLimit, 10);
    assert.ok(
      result.scheduling.observedParallelTabs > 1 && result.scheduling.observedParallelTabs <= 10,
      'Independent cases overlap within the ten-tab default',
    );
  }

  console.log(
    JSON.stringify(
      {
        acceptance: 'pass',
        evidence: [catalogue && 'catalogue', result && 'fixture'].filter(Boolean),
        summary: result?.summary || catalogue.summary,
        catalogueMs: catalogue?.timings?.executionMs,
        fixtureMs: result?.evidenceRuns ? undefined : result?.timings?.executionMs,
        concurrentTabs: result?.scheduling?.observedParallelTabs,
        serialBarrierPassed: result?.scheduling?.serialBarrierPassed,
      },
      null,
      2,
    ),
  );
}
