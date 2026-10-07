import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { loadFastCatalogue } from './playwright/lib/shortcut-fast-cases.mjs';
import { runUnassignedModelCase } from './playwright/lib/shortcut-model-unassigned-fixture.mjs';
import { settleTabPool } from './playwright/lib/shortcut-tab-pool.mjs';

const started = performance.now();
const { content, inventory, report } = await loadFastCatalogue();
assert.deepEqual(report.issues, []);
const unassigned = inventory.modelPickerSlotRows.filter((row) => !row.assigned);
const empty = inventory.modelPickerProfiles.legacy.rows.filter(
  (row) => row.availability === 'empty',
);
const cases = unassigned
  .filter((row) => row.availability === 'unavailable')
  .map((row, index) => ({ ...row, fixtureCode: `F${index + 1}` }));
assert.ok(cases.length > 0, 'Unavailable unassigned slots must have negative keyboard coverage');
const dependencies = [
  '../extension/content.js',
  '../extension/shared/model-picker-labels.js',
  '../extension/shared/model-picker-selectors.js',
  '../extension/settings-schema.js',
  './playwright/lib/shortcut-model-controls-fixture.mjs',
  './playwright/lib/shortcut-model-slots-fixture.mjs',
  './playwright/lib/shortcut-model-unassigned-fixture.mjs',
  './shortcut-model-unassigned-proof.mjs',
];
const fingerprints = Object.fromEntries(
  await Promise.all(
    dependencies.map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(new URL(path, import.meta.url)))
        .digest('hex'),
    ]),
  ),
);
const browser = await chromium.launch({ headless: true });
let observations;
try {
  const context = await browser.newContext();
  await context.route('**/*', (route) => route.abort());
  const settled = await settleTabPool(cases, (item) =>
    runUnassignedModelCase(context, content, item, started),
  );
  observations = settled.map((result, index) =>
    result.status === 'fulfilled'
      ? result.value
      : { rowId: cases[index].rowId, status: 'fail', reason: String(result.reason) },
  );
} finally {
  await browser.close();
}
const artifact = {
  generatedAt: new Date().toISOString(),
  tabLimit: 10,
  fingerprints,
  observations,
  notApplicable: [],
  slotDiagnostics: empty.map((row) => ({
    rowId: row.rowId,
    status: 'empty-position-omitted',
    reason: 'No configured key, presented action, or canonical action exists for this slot.',
  })),
  durationMs: performance.now() - started,
};
await writeFile(
  new URL('../_temp-files/shortcut-model-unassigned-proof.json', import.meta.url),
  `${JSON.stringify(artifact, null, 2)}\n`,
);
assert.ok(
  observations.every((row) => row.status === 'pass'),
  JSON.stringify(observations),
);
console.log(
  `${observations.length} unavailable temporary-binding checks passed; ${empty.length} empty slots omitted from actionable inventory (${Math.round(artifact.durationMs)} ms).`,
);
