import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const SHORTCUT_AUDIT_SCHEMA_VERSION = 1;
export const STORAGE_RECOVERY_SCHEMA_VERSION = 1;
export const AUDIT_ARTIFACT_FILENAMES = Object.freeze({
  json: 'shortcut-audit.json',
  csv: 'shortcut-audit.csv',
  backlog: 'shortcut-repair-backlog.md',
  recovery: 'storage-recovery.json',
  failuresIndex: 'failures/index.json',
});

const FAILURE_STATUSES = new Set(['product-fail', 'environment-fail', 'manual-pending']);
const MODEL_PHASE_ACTION_IDS = new Set([
  'shortcutKeyToggleModelSelector',
  'shortcutKeyToggleChatWork',
  'shortcutKeyThinkingExtended',
  'shortcutKeyThinkingStandard',
  'shortcutKeyThinkingLight',
  'shortcutKeyThinkingHeavy',
  'shortcutKeyProStandard',
  'shortcutKeyProExtended',
]);

function isModelPhaseAction(shortcut) {
  return (
    MODEL_PHASE_ACTION_IDS.has(shortcut?.actionId) ||
    (shortcut?.targetIds || []).some((targetId) => String(targetId).startsWith('model-'))
  );
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function valueOrNull(present, value) {
  return present ? value : null;
}

function cloneValue(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function createStorageMutationLedger(originalStorage = {}, auditValues = {}) {
  return Object.keys(auditValues).map((key) => {
    const originalPresent = hasOwn(originalStorage, key);
    return {
      key,
      originalPresent,
      originalValue: cloneValue(valueOrNull(originalPresent, originalStorage[key])),
      auditPresent: true,
      auditValue: cloneValue(auditValues[key]),
      observedBeforeRestorePresent: null,
      observedBeforeRestoreValue: null,
      compareBeforeRestore: 'not-observed',
      restoreAction: 'pending',
      finalPresent: null,
      finalValue: null,
      status: 'pending',
    };
  });
}

export function buildStorageRecoveryPlan(ledger = [], observedStorage = {}) {
  const entries = ledger.map((entry) => {
    const observedPresent = hasOwn(observedStorage, entry.key);
    const observedValue = valueOrNull(observedPresent, observedStorage[entry.key]);
    const unchanged =
      observedPresent === entry.auditPresent &&
      valuesEqual(observedValue, entry.auditValue);
    const restoreAction = unchanged
      ? entry.originalPresent
        ? 'set-original'
        : 'remove-originally-absent'
      : 'preserve-concurrent-edit';
    return {
      ...entry,
      observedBeforeRestorePresent: observedPresent,
      observedBeforeRestoreValue: cloneValue(observedValue),
      compareBeforeRestore: unchanged ? 'audit-value-match' : 'conflict',
      restoreAction,
      status: unchanged ? 'restore-planned' : 'conflict',
    };
  });
  return {
    entries,
    setValues: Object.fromEntries(
      entries
        .filter((entry) => entry.restoreAction === 'set-original')
        .map((entry) => [entry.key, entry.originalValue]),
    ),
    removeKeys: entries
      .filter((entry) => entry.restoreAction === 'remove-originally-absent')
      .map((entry) => entry.key),
    conflictKeys: entries
      .filter((entry) => entry.restoreAction === 'preserve-concurrent-edit')
      .map((entry) => entry.key),
  };
}

export function finalizeStorageRecoveryPlan(plan, finalStorage = {}) {
  const entries = (plan?.entries || []).map((entry) => {
    const finalPresent = hasOwn(finalStorage, entry.key);
    const finalValue = valueOrNull(finalPresent, finalStorage[entry.key]);
    const expectedPresent =
      entry.restoreAction === 'set-original'
        ? entry.originalPresent
        : entry.restoreAction === 'remove-originally-absent'
          ? false
          : entry.observedBeforeRestorePresent;
    const expectedValue =
      entry.restoreAction === 'set-original'
        ? entry.originalValue
        : entry.restoreAction === 'remove-originally-absent'
          ? null
          : entry.observedBeforeRestoreValue;
    const finalMatchesExpected =
      finalPresent === expectedPresent && valuesEqual(finalValue, expectedValue);
    return {
      ...entry,
      finalPresent,
      finalValue: cloneValue(finalValue),
      status:
        entry.compareBeforeRestore === 'conflict'
          ? 'conflict-preserved'
          : finalMatchesExpected
            ? 'restored'
            : 'restore-failed',
    };
  });
  const conflictCount = entries.filter((entry) => entry.compareBeforeRestore === 'conflict').length;
  const failedCount = entries.filter((entry) => entry.status === 'restore-failed').length;
  return {
    ...(plan || {}),
    entries,
    status: failedCount ? 'failed' : conflictCount ? 'conflict' : 'clean',
    conflictCount,
    failedCount,
  };
}

export function buildStorageRecoveryReport({
  status = 'not-run',
  reason = '',
  plan = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: STORAGE_RECOVERY_SCHEMA_VERSION,
    generatedAt,
    status,
    reason,
    conflictCount: Number(plan?.conflictCount || 0),
    failedCount: Number(plan?.failedCount || 0),
    entries: Array.isArray(plan?.entries) ? plan.entries : [],
  };
}

function shellArg(value) {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:=+-]+$/.test(text) ? text : `"${text.replaceAll('"', '\\"')}"`;
}

export function buildShortcutRerunCommand(row, script = 'npm run playwright:chatgpt:audit-shortcuts') {
  const args = ['--'];
  if (row?.phase) args.push('--phase', row.phase);
  if (row?.kind === 'global' && row.actionId) {
    args.push('--shortcut-action-id', row.actionId);
  } else if (row?.kind === 'fixed-contract' && row.contractId) {
    args.push('--fixed-contract-id', row.contractId);
  } else if (row?.kind === 'model-slot') {
    if (row.profile) args.push('--model-profile', row.profile);
    if (Number.isInteger(row.slot)) args.push('--model-slot', String(row.slot));
    if (row.actionId) args.push('--model-action-id', row.actionId);
  }
  return [script, ...args.map(shellArg)].join(' ');
}

function mapLiveStatus(status) {
  if (status === 'pass') return 'pass';
  if (status === 'fail') return 'product-fail';
  if (status === 'environment-fail') return 'environment-fail';
  if (status === 'manual') return 'manual-pending';
  if (status === 'not-applicable') return 'not-applicable';
  return 'not-run';
}

function summarizeStatuses(rows) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row.status))]
      .sort()
      .map((status) => [status, rows.filter((row) => row.status === status).length]),
  );
}

function buildGlobalAuditRow(shortcut, liveRow, options) {
  const status = liveRow
    ? mapLiveStatus(liveRow.status)
    : options.runMode === 'environment-fail'
      ? 'environment-fail'
      : 'not-run';
  const expectedTarget = shortcut.activationProbeExpectedTargetRef || '';
  const expectedBehavior = expectedTarget
    ? `Activate ${expectedTarget} using ${shortcut.activationProbeMode || 'the declared shortcut probe'}.`
    : shortcut.notes || 'Shortcut behavior requires the declared metadata classification.';
  const observedBehavior = liveRow
    ? liveRow.observedSelector || liveRow.observedTextSnippet || liveRow.reason || ''
    : 'No live observation was collected in this phase.';
  const row = {
    rowId: `global:${shortcut.actionId}`,
    kind: 'global',
    phase: options.phase,
    actionId: shortcut.actionId,
    label: shortcut.label,
    profile: '',
    slot: null,
    code: liveRow?.dispatchCode || shortcut.defaultCode || '',
    modifiers: 'Alt or declared control gate',
    expected: expectedBehavior,
    observed: observedBehavior,
    status,
    proofMethod: liveRow
      ? 'playwright-live'
      : options.runMode === 'environment-fail'
        ? 'environment-failure'
        : 'inventory-only',
    reason:
      liveRow?.reason ||
      (options.runMode === 'environment-fail'
        ? 'Browser audit could not start.'
        : 'Live activation was not run in this phase.'),
    evidencePath:
      liveRow?.evidencePath ||
      (options.runMode === 'inventory-only' ? 'shortcut-audit.json' : 'live-probes.json'),
    rerunCommand: '',
    owner: shortcut.handlerRef || 'extension/content.js shortcut runtime',
    validationMode: shortcut.validationMode,
    probeMode: shortcut.activationProbeMode,
    expectedTargetRef: expectedTarget,
  };
  row.rerunCommand = buildShortcutRerunCommand(row);
  return row;
}

function buildFixedAuditRow(contract, options) {
  const row = {
    rowId: `fixed:${contract.contractId}`,
    kind: 'fixed-contract',
    phase: options.phase,
    actionId: '',
    contractId: contract.contractId,
    label: contract.classification,
    profile: '',
    slot: null,
    code: '',
    modifiers: 'source contract',
    expected: `Source contract ${contract.classification} is present and classified.`,
    observed:
      contract.sourceExcerpt ||
      contract.observed?.sourceExcerpt ||
      'No source excerpt was available.',
    status: contract.status === 'present' ? 'pass' : 'product-fail',
    proofMethod: 'source-inventory',
    reason:
      contract.status === 'present'
        ? 'Current source contains the expected fixed/gated contract.'
        : contract.message || 'Expected fixed/gated contract is missing.',
    evidencePath: 'shortcut-audit.json',
    rerunCommand: '',
    owner: 'extension/content.js',
    validationMode: 'fixed-contract',
    probeMode: '',
    expectedTargetRef: '',
  };
  row.rerunCommand = buildShortcutRerunCommand(row);
  return row;
}

function buildModelSlotAuditRow(slotRow, options) {
  const actionText = slotRow.actionIds?.length
    ? slotRow.actionIds.join(', ')
    : slotRow.availability;
  const row = {
    rowId: slotRow.rowId,
    kind: 'model-slot',
    phase: options.phase,
    actionId: slotRow.actionId || '',
    label: slotRow.labels?.join(' / ') || `Slot ${slotRow.slot + 1}`,
    profile: slotRow.profile,
    slot: slotRow.slot,
    code: slotRow.code || '',
    modifiers: options.modelModifier || 'Alt and Control model modes',
    expected: `Profile ${slotRow.profile}, slot ${slotRow.slot}: ${actionText}.`,
    observed: 'No live model-slot observation was collected in this phase.',
    status: options.runMode === 'environment-fail' ? 'environment-fail' : 'not-run',
    proofMethod: options.runMode === 'environment-fail' ? 'environment-failure' : 'inventory-only',
    reason:
      options.runMode === 'environment-fail'
        ? 'Browser audit could not start before model-slot activation.'
        : `Model profile slot is ${slotRow.availability}; live model activation is not run in this phase.`,
    evidencePath: 'shortcut-audit.json',
    rerunCommand: '',
    owner: 'extension/content.js model-picker runtime',
    validationMode: 'model-slot',
    probeMode: '',
    expectedTargetRef: slotRow.canonicalActionId || '',
    assigned: slotRow.assigned,
    availability: slotRow.availability,
    actionIds: slotRow.actionIds || [],
    actionKinds: slotRow.actionKinds || [],
  };
  row.rerunCommand = buildShortcutRerunCommand(row);
  return row;
}

export function buildShortcutAuditReport({
  inventory,
  liveProbeReport = null,
  phase = 'all',
  onlyActionIds = [],
  fixedContractIds = [],
  modelProfile = '',
  modelSlot = null,
  modelActionId = '',
  runFolderName = '',
  runFolderPath = '',
  runMode = 'inventory-only',
  generatedAt = new Date().toISOString(),
  recoveryStatus = 'not-run',
} = {}) {
  const normalizedPhase = ['global', 'model', 'all'].includes(phase) ? phase : 'all';
  const liveRowsByActionId = Object.fromEntries(
    (liveProbeReport?.rows || []).map((row) => [row.actionId, row]),
  );
  const actionFilter = new Set(onlyActionIds || []);
  const fixedFilter = new Set(fixedContractIds || []);
  const rows = [];
  for (const shortcut of inventory?.shortcuts || []) {
    if (actionFilter.size && !actionFilter.has(shortcut.actionId)) continue;
    const modelAction = isModelPhaseAction(shortcut);
    if (normalizedPhase === 'global' && modelAction) continue;
    if (normalizedPhase === 'model' && !modelAction) continue;
    rows.push(
      buildGlobalAuditRow(shortcut, liveRowsByActionId[shortcut.actionId], {
        phase: normalizedPhase,
        runMode,
      }),
    );
  }
  if (normalizedPhase !== 'model') {
    for (const contract of inventory?.fixedKeyboardContracts || []) {
      if (fixedFilter.size && !fixedFilter.has(contract.contractId)) continue;
      rows.push(buildFixedAuditRow(contract, { phase: normalizedPhase }));
    }
  }
  if (normalizedPhase !== 'global') {
    for (const slotRow of inventory?.modelPickerSlotRows || []) {
      if (modelProfile && slotRow.profile !== modelProfile) continue;
      if (Number.isInteger(modelSlot) && slotRow.slot !== modelSlot) continue;
      if (modelActionId && !slotRow.actionIds?.includes(modelActionId)) continue;
      rows.push(buildModelSlotAuditRow(slotRow, { phase: normalizedPhase, runMode }));
    }
  }
  return {
    schemaVersion: SHORTCUT_AUDIT_SCHEMA_VERSION,
    artifact: 'shortcut-audit',
    generatedAt,
    runMode,
    phase: normalizedPhase,
    runFolderName,
    runFolderPath,
    inventoryIssues: inventory?.inventoryIssues || [],
    inventorySummary: {
      runtimeActions: inventory?.allRuntimeActionIds?.length || 0,
      handlerActions: inventory?.handlerActionIds?.length || 0,
      targetDescriptors: inventory?.targets?.length || 0,
      fixedKeyboardContracts: inventory?.fixedKeyboardContracts?.length || 0,
      modelPickerSlotRows: inventory?.modelPickerSlotRows?.length || 0,
    },
    liveProbeSummary: liveProbeReport?.summary || {
      runStatus: 'not-run',
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      environmentFailed: 0,
      manual: 0,
      notApplicable: 0,
      notLiveProbed: 0,
    },
    recoveryStatus,
    requiredArtifacts: Object.values(AUDIT_ARTIFACT_FILENAMES),
    rows,
    summary: {
      total: rows.length,
      byKind: {
        global: rows.filter((row) => row.kind === 'global').length,
        fixedContract: rows.filter((row) => row.kind === 'fixed-contract').length,
        modelSlot: rows.filter((row) => row.kind === 'model-slot').length,
      },
      byStatus: summarizeStatuses(rows),
      attempted: rows.filter((row) => row.proofMethod === 'playwright-live').length,
    },
  };
}

function csvCell(value) {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderShortcutAuditCsv(report) {
  const columns = [
    'rowId',
    'kind',
    'phase',
    'actionId',
    'contractId',
    'profile',
    'slot',
    'code',
    'modifiers',
    'expected',
    'observed',
    'status',
    'proofMethod',
    'reason',
    'evidencePath',
    'rerunCommand',
    'owner',
  ];
  return [
    columns.join(','),
    ...(report?.rows || []).map((row) => columns.map((column) => csvCell(row[column])).join(',')),
    '',
  ].join('\n');
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

export function renderShortcutRepairBacklog(report) {
  const rows = report?.rows || [];
  const productFailures = rows.filter((row) => row.status === 'product-fail');
  const environmentRows = rows.filter((row) => row.status === 'environment-fail');
  const manualRows = rows.filter((row) => row.status === 'manual-pending');
  const lines = [
    '# Shortcut repair backlog',
    '',
    `Generated from audit schema v${report?.schemaVersion || SHORTCUT_AUDIT_SCHEMA_VERSION}; run ${report?.runFolderName || '(inventory-only)'}.`,
    '',
    'This file is intentionally repair-oriented. Inventory-only and environment rows are not product defects.',
    '',
    '## Confirmed product failures',
    '',
  ];
  if (!productFailures.length) {
    lines.push('No confirmed product failures were recorded. A live probe failure must be reproduced once more with valid preconditions before it is promoted here.');
  } else {
    for (const row of productFailures) {
      lines.push(`### ${row.rowId} — ${row.label || row.actionId || row.contractId}`);
      lines.push('');
      lines.push(`- Stable id: \`${row.rowId}\``);
      lines.push(`- Action/profile/slot: \`${row.actionId || '(fixed contract)'}\` / \`${row.profile || '-'}\` / \`${row.slot ?? '-'}\``);
      lines.push(`- Chord/modifiers: \`${row.code || '(none)'}\` / ${markdownCell(row.modifiers)}`);
      lines.push(`- Status: \`${row.status}\``);
      lines.push(`- Expected: ${markdownCell(row.expected)}`);
      lines.push(`- Observed: ${markdownCell(row.observed)}`);
      lines.push(`- Reason: ${markdownCell(row.reason)}`);
      lines.push(`- Reproduction evidence: ${row.evidencePath ? `\`${row.evidencePath}\`` : 'pending targeted confirmation'}`);
      lines.push(`- Exact rerun: \`${row.rerunCommand}\``);
      lines.push(`- Likely owner: \`${row.owner}\``);
      lines.push('- Suggested repair boundary: inspect the owning runtime handler and its canonical target metadata; do not change the fixed fixture or audit harness to hide the failure.');
      lines.push('- Acceptance proof: targeted rerun passes twice, expected observable state is present, and storage recovery is clean.');
      lines.push('');
    }
  }
  lines.push('## Environment or account gaps', '');
  if (!environmentRows.length) {
    lines.push('None recorded.');
  } else {
    for (const row of environmentRows) {
      lines.push(`- \`${row.rowId}\`: ${markdownCell(row.reason)} (rerun: \`${row.rerunCommand}\`)`);
    }
  }
  lines.push('', '## Supervised or manual-pending rows', '');
  if (!manualRows.length) {
    lines.push('None recorded.');
  } else {
    for (const row of manualRows) {
      lines.push(`- \`${row.rowId}\`: ${markdownCell(row.reason)} (rerun: \`${row.rerunCommand}\`)`);
    }
  }
  lines.push('', '## Inventory and run context', '');
  lines.push(`- Inventory issues: ${report?.inventoryIssues?.length || 0}`);
  lines.push(`- Rows: ${report?.summary?.total || rows.length}`);
  lines.push(`- Recovery status: ${report?.recoveryStatus || 'not-run'}`);
  lines.push(`- Audit JSON: \`${AUDIT_ARTIFACT_FILENAMES.json}\``);
  lines.push(`- Audit CSV: \`${AUDIT_ARTIFACT_FILENAMES.csv}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function safeEvidenceName(rowId) {
  return String(rowId || 'unknown-row').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 140);
}

export async function writeShortcutAuditArtifacts(folderPath, report, recoveryReport) {
  const failuresPath = path.join(folderPath, 'failures');
  await mkdir(failuresPath, { recursive: true });
  const rows = (report?.rows || []).map((row) => ({ ...row }));
  const failureRows = rows.filter((row) => FAILURE_STATUSES.has(row.status));
  const evidenceEntries = [];
  for (const row of failureRows) {
    const filename = `${safeEvidenceName(row.rowId)}.json`;
    const relativePath = path.join('failures', filename).replaceAll('\\', '/');
    const evidence = {
      schemaVersion: SHORTCUT_AUDIT_SCHEMA_VERSION,
      generatedAt: report.generatedAt,
      rowId: row.rowId,
      status: row.status,
      actionId: row.actionId || '',
      profile: row.profile || '',
      slot: row.slot,
      expected: row.expected,
      observed: row.observed,
      reason: row.reason,
      proofMethod: row.proofMethod,
      rerunCommand: row.rerunCommand,
    };
    await writeFile(path.join(folderPath, relativePath), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    row.evidencePath = relativePath;
    evidenceEntries.push({ rowId: row.rowId, status: row.status, path: relativePath });
  }
  const finalReport = {
    ...report,
    rows,
    summary: {
      ...(report.summary || {}),
      byStatus: summarizeStatuses(rows),
    },
  };
  const failuresIndex = {
    schemaVersion: SHORTCUT_AUDIT_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    count: evidenceEntries.length,
    entries: evidenceEntries,
  };
  await writeFile(
    path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.json),
    `${JSON.stringify(finalReport, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.csv),
    renderShortcutAuditCsv(finalReport),
    'utf8',
  );
  await writeFile(
    path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.backlog),
    renderShortcutRepairBacklog(finalReport),
    'utf8',
  );
  await writeFile(
    path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.recovery),
    `${JSON.stringify(recoveryReport || buildStorageRecoveryReport(), null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.failuresIndex),
    `${JSON.stringify(failuresIndex, null, 2)}\n`,
    'utf8',
  );
  return {
    report: finalReport,
    paths: {
      jsonPath: path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.json),
      csvPath: path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.csv),
      backlogPath: path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.backlog),
      recoveryPath: path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.recovery),
      failuresIndexPath: path.join(folderPath, AUDIT_ARTIFACT_FILENAMES.failuresIndex),
      failuresPath,
    },
  };
}

export function evaluateShortcutAuditExit(report, recoveryReport, { inventoryOnly = false } = {}) {
  const reasons = [];
  if ((report?.inventoryIssues || []).length) reasons.push('metadata/inventory drift');
  const productFailures = (report?.rows || []).filter((row) => row.status === 'product-fail');
  if (productFailures.length) reasons.push(`${productFailures.length} product failure(s)`);
  if (recoveryReport?.status === 'conflict' || recoveryReport?.status === 'failed') {
    reasons.push(`storage recovery ${recoveryReport.status}`);
  }
  if (!inventoryOnly) {
    const environmentRows = (report?.rows || []).filter((row) => row.status === 'environment-fail');
    if (environmentRows.length) reasons.push(`${environmentRows.length} environment failure(s)`);
    const manualRows = (report?.rows || []).filter((row) => row.status === 'manual-pending');
    if (manualRows.length) reasons.push(`${manualRows.length} manual-pending row(s)`);
    const notRunRows = (report?.rows || []).filter((row) => row.status === 'not-run');
    if (notRunRows.length) reasons.push(`${notRunRows.length} not-run row(s)`);
  }
  return {
    ok: reasons.length === 0,
    exitCode: reasons.length ? 1 : 0,
    reasons,
  };
}
