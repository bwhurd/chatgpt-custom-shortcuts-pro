import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildShortcutRerunCommand,
  evaluateShortcutAuditExit,
  writeShortcutAuditArtifacts,
} from './playwright/lib/shortcut-audit-artifacts.mjs';

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'csp-shortcut-audit-fixture-'));
try {
  const report = {
    schemaVersion: 1,
    generatedAt: '2026-09-08T00:00:00.000Z',
    runFolderName: 'fixture-run',
    inventoryIssues: [],
    rows: [
      {
        rowId: 'global:shortcut|with-pipe',
        kind: 'global',
        phase: 'global',
        actionId: 'shortcut|with-pipe',
        contractId: '',
        profile: '',
        slot: null,
        code: 'KeyA',
        modifiers: 'Alt, Shift',
        expected: 'Expected "target"\nwith a second line',
        observed: 'Observed, | text',
        status: 'product-fail',
        proofMethod: 'playwright-live',
        reason: 'Failure | needs targeted rerun',
        evidencePath: '',
        rerunCommand: 'npm run playwright:chatgpt:audit-shortcuts -- --phase global --shortcut-action-id shortcut|with-pipe',
        owner: 'extension/content.js',
      },
    ],
    summary: { total: 1, byStatus: { 'product-fail': 1 } },
  };
  const recovery = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    status: 'clean',
    reason: '',
    conflictCount: 0,
    failedCount: 0,
    entries: [],
  };
  const result = await writeShortcutAuditArtifacts(tempRoot, report, recovery);
  const audit = JSON.parse(await readFile(result.paths.jsonPath, 'utf8'));
  const index = JSON.parse(await readFile(result.paths.failuresIndexPath, 'utf8'));
  const csv = await readFile(result.paths.csvPath, 'utf8');
  const backlog = await readFile(result.paths.backlogPath, 'utf8');

  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].evidencePath, 'failures/global_shortcut_with-pipe.json');
  assert.equal(index.count, 1);
  assert.match(csv, /"Expected ""target""\nwith a second line"/);
  assert.match(csv, /"Observed, \| text"/);
  assert.match(backlog, /Failure \\| needs targeted rerun/);
  assert.match(backlog, /Status: `product-fail`/i);
  assert.deepEqual(
    evaluateShortcutAuditExit(audit, recovery),
    {
      ok: false,
      exitCode: 1,
      reasons: ['1 product failure(s)'],
    },
    'live audit exit policy should fail on confirmed product failures',
  );
  assert.deepEqual(
    evaluateShortcutAuditExit(
      {
        inventoryIssues: [],
        rows: [{ status: 'not-run' }],
      },
      { status: 'not-run' },
      { inventoryOnly: true },
    ),
    { ok: true, exitCode: 0, reasons: [] },
    'inventory-only coverage should remain a green schema dry run',
  );
  assert.deepEqual(
    evaluateShortcutAuditExit(
      {
        inventoryIssues: [],
        rows: [{ status: 'environment-fail' }, { status: 'manual-pending' }, { status: 'not-run' }],
      },
      { status: 'not-run' },
    ),
    {
      ok: false,
      exitCode: 1,
      reasons: ['1 environment failure(s)', '1 manual-pending row(s)', '1 not-run row(s)'],
    },
    'live audit exit policy should expose environment, manual, and not-run gaps',
  );
  assert.equal(
    buildShortcutRerunCommand({
      kind: 'model-slot',
      phase: 'model',
      profile: 'latest',
      slot: 14,
      actionId: 'model-action',
    }),
    'npm run playwright:chatgpt:audit-shortcuts -- --phase model --model-profile latest --model-slot 14 --model-action-id model-action',
  );
  console.log('shortcut audit CSV, Markdown, evidence, and rerun rendering are stable');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
