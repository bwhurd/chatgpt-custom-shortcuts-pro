import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveAuditOwnedFixtureFromCheckpoint } from './playwright/lib/devscrape-wide-core.mjs';
import {
  buildShortcutAuditReport,
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
        rerunCommand:
          'npm run playwright:chatgpt:audit-shortcuts -- --phase global --shortcut-action-id shortcut|with-pipe',
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
  assert.deepEqual(
    evaluateShortcutAuditExit(
      {
        inventoryIssues: [],
        rows: [],
        checkpoint: {
          status: 'completed',
          fixtureRestored: true,
          clipboardRecoveryStatus: 'partial',
        },
      },
      { status: 'clean' },
    ),
    {
      ok: false,
      exitCode: 1,
      reasons: ['clipboard recovery partial'],
    },
    'live audit exit policy must block when the original clipboard state was not fully restored',
  );
  const semanticAudit = buildShortcutAuditReport({
    inventory: {
      shortcuts: [
        'source-only',
        'click-only',
        'intercepted-only',
        'native-success',
        'single-failure',
        'confirmed-failure',
      ].map((actionId) => ({
        actionId,
        label: actionId,
        defaultCode: 'KeyA',
        handlerRef: 'content.js:handler',
        validationMode: 'scrape-targets',
        activationProbeMode: 'click-target',
        activationProbeExpectedTargetRef: 'button-target',
      })),
      fixedKeyboardContracts: [
        { contractId: 'source-only-contract', classification: 'fixed-gate', status: 'present' },
        { contractId: 'live-contract', classification: 'fixed-listener', status: 'present' },
      ],
      modelPickerSlotRows: [],
      inventoryIssues: [],
    },
    liveProbeReport: {
      rows: [
        {
          actionId: 'click-only',
          status: 'pass',
          routingProof: { status: 'observed', proofMethod: 'captured-click' },
        },
        {
          actionId: 'intercepted-only',
          status: 'fail',
          routingProof: {
            status: 'intercepted',
            proofMethod: 'trusted-keydown-default-prevention',
            keydownDefaultPrevented: true,
          },
          semantic: { status: 'fail', proofMethod: 'native-ui-observer' },
        },
        {
          actionId: 'native-success',
          status: 'pass',
          routingProof: { status: 'observed', proofMethod: 'captured-click' },
          semantic: { status: 'pass', proofMethod: 'native-ui-observer' },
        },
        {
          actionId: 'single-failure',
          status: 'fail',
          semantic: { status: 'fail', proofMethod: 'native-ui-observer' },
        },
        {
          actionId: 'confirmed-failure',
          status: 'fail',
          semantic: { status: 'fail', proofMethod: 'native-ui-observer' },
          confirmation: { status: 'fail', attempts: [{ status: 'fail' }, { status: 'fail' }] },
        },
      ],
      fixedRows: [
        {
          contractId: 'live-contract',
          status: 'pass',
          semantic: { status: 'pass', proofMethod: 'native-ui-observer' },
        },
      ],
    },
    phase: 'global',
    runMode: 'live',
  });
  const semanticRows = Object.fromEntries(semanticAudit.rows.map((row) => [row.rowId, row]));
  assert.equal(semanticRows['global:source-only'].status, 'not-run');
  assert.equal(semanticRows['global:source-only'].sourceStatus, 'present');
  assert.equal(semanticRows['fixed:source-only-contract'].status, 'not-run');
  assert.equal(semanticRows['global:click-only'].status, 'coverage-gap');
  assert.equal(semanticRows['global:click-only'].routingStatus, 'observed');
  assert.equal(semanticRows['global:click-only'].semanticStatus, 'not-run');
  assert.equal(semanticRows['global:intercepted-only'].status, 'coverage-gap');
  assert.equal(semanticRows['global:intercepted-only'].routingStatus, 'intercepted');
  assert.equal(semanticRows['global:intercepted-only'].semanticStatus, 'fail');
  assert.equal(semanticRows['global:native-success'].status, 'pass');
  assert.equal(semanticRows['fixed:live-contract'].status, 'pass');
  assert.equal(semanticRows['global:single-failure'].status, 'coverage-gap');
  assert.equal(semanticRows['global:confirmed-failure'].status, 'product-fail');
  assert.equal(semanticRows['global:confirmed-failure'].confirmationCount, 2);
  const fixedOnlyAudit = buildShortcutAuditReport({
    inventory: {
      shortcuts: [{ actionId: 'unrelated-global-action', label: 'Unrelated global action' }],
      fixedKeyboardContracts: [
        { contractId: 'live-contract', classification: 'fixed-listener', status: 'present' },
      ],
      modelPickerSlotRows: [],
      inventoryIssues: [],
    },
    liveProbeReport: {
      fixedRows: [
        {
          contractId: 'live-contract',
          status: 'pass',
          semantic: { status: 'pass', proofMethod: 'native-ui-observer' },
        },
      ],
    },
    fixedContractIds: ['live-contract'],
    phase: 'global',
    runMode: 'live',
  });
  assert.deepEqual(
    fixedOnlyAudit.rows.map((row) => row.rowId),
    ['fixed:live-contract'],
    'a fixed-contract-only rerun must not carry unrelated global not-run rows',
  );
  assert.equal(fixedOnlyAudit.rows[0].status, 'pass');
  assert.ok(
    evaluateShortcutAuditExit(semanticAudit, { status: 'clean' }).reasons.includes(
      '3 coverage/selector gap(s)',
    ),
    'live audit exit policy must fail while semantic proof is missing',
  );
  assert.deepEqual(
    evaluateShortcutAuditExit(
      { inventoryIssues: [], rows: [{ status: 'coverage-gap' }] },
      { status: 'not-run' },
      { inventoryOnly: true },
    ),
    { ok: true, exitCode: 0, reasons: [] },
    'inventory-only runs describe missing live proof without failing the schema check',
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
  const auditFixtureUrl = 'https://chatgpt.com/c/audit-owned-123';
  const auditFixtureCheckpoint = {
    status: 'completed',
    fixtureUrl: auditFixtureUrl,
    auditFixtureUrl,
    auditFixtureOwned: true,
    auditOwnedConversationIds: ['audit-owned-123'],
    finalBrowserState: { fixtureRestored: true },
  };
  assert.deepEqual(
    resolveAuditOwnedFixtureFromCheckpoint(auditFixtureCheckpoint, {
      protectedFixtureUrls: ['https://chatgpt.com/c/fixed-fixture'],
    }),
    { kind: 'audit-owned', fixtureUrl: auditFixtureUrl, conversationId: 'audit-owned-123' },
  );
  assert.throws(
    () =>
      resolveAuditOwnedFixtureFromCheckpoint(
        {
          ...auditFixtureCheckpoint,
          fixtureUrl: 'https://chatgpt.com/c/fixed-fixture',
          auditFixtureUrl: 'https://chatgpt.com/c/fixed-fixture',
        },
        { protectedFixtureUrls: ['https://chatgpt.com/c/fixed-fixture'] },
      ),
    /not a verified audit-owned conversation/,
  );
  assert.throws(
    () =>
      resolveAuditOwnedFixtureFromCheckpoint({
        ...auditFixtureCheckpoint,
        finalBrowserState: { fixtureRestored: false },
      }),
    /completed, recovered audit-owned fixture/,
  );
  console.log('shortcut audit CSV, Markdown, evidence, and rerun rendering are stable');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
