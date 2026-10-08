import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIRECTORY, '..', '..', '..');
export const FAST_VISUAL_REPORT_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  'test-results',
  'shortcuts-fast',
);

const EXTERNAL_DEFER_CATEGORIES = new Set([
  'audio-omitted',
  'clipboard-omitted',
  'native-upload-omitted',
]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

function valueText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function uniqueText(values) {
  return [...new Set(asArray(values).map(valueText).filter(Boolean))];
}

function escapeHtml(value) {
  return valueText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMarkdown(value) {
  return valueText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/[\r\n]+/g, ' ')
    .replace(/([*_`{}#])/g, '\\$1')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

function normalizeRowStatus(row, observations) {
  const status = String(row.status || '').toLowerCase();
  if (['fail', 'failure', 'error', 'environment-fail'].includes(status)) return status;
  const observationStatuses = observations.map((item) => String(item.status || '').toLowerCase());
  if (observationStatuses.some((item) => ['fail', 'failure', 'error'].includes(item)))
    return 'fail';
  if (observationStatuses.includes('environment-fail')) return 'environment-fail';
  if (status) return status;
  if (observationStatuses.length && observationStatuses.every((item) => item === 'pass'))
    return 'pass';
  return 'not-run';
}

function targetReferences(row) {
  const refs = row.targetRefs || row.targetIds || row.targets || [];
  return uniqueText(
    asArray(refs).map((item) =>
      typeof item === 'object' && item !== null ? item.targetId || item.targetRef || item.id : item,
    ),
  );
}

function targetsForRow(row, targetById) {
  return targetReferences(row).map((targetRef) => {
    const target = targetById.get(targetRef);
    return {
      targetRef,
      kind: target?.kind || '',
      identifier: target?.identifier || '',
      selectors: uniqueText([...asArray(target?.selectors), ...asArray(target?.searchNeedles)]),
      matchGroups: Array.isArray(target?.matchGroups) ? target.matchGroups : [],
      notes: target?.notes || '',
    };
  });
}

function observationsForRow(row, report) {
  if (Array.isArray(row.observations) && row.observations.length) return row.observations;
  return asArray(report.observations).filter((item) => item.actionId === row.actionId);
}

function reportObservations(report) {
  if (asArray(report.observations).length) return asArray(report.observations);
  return asArray(report.rows).flatMap((row) => asArray(row.observations));
}

function failureReason(row, observations, issues = []) {
  const observedReasons = observations
    .filter((item) =>
      ['fail', 'failure', 'error', 'environment-fail'].includes(String(item.status).toLowerCase()),
    )
    .map((item) => item.reason)
    .filter(Boolean);
  return uniqueText([
    ...observedReasons,
    ...issues.map((issue) => issue.message || issue.reason),
    row.reason,
  ]).join(' ');
}

function makeRowDetail(row, report, targetById, status, issues = []) {
  const observations = observationsForRow(row, report);
  const chords = uniqueText(observations.map((item) => item.chord));
  const configuredCode = row.code || row.defaultCode || '';
  return {
    actionId: row.actionId || '',
    rowId: row.rowId || '',
    label: row.label || row.actionId || row.contractId || row.rowId || 'Unattributed report row',
    contractId: row.contractId || '',
    status,
    chord: chords.length
      ? chords.join(', ')
      : configuredCode
        ? `not recorded (configured code ${configuredCode})`
        : 'not recorded',
    configuredCode,
    targetRefs: targetReferences(row),
    targets: targetsForRow(row, targetById),
    source: row.source || '',
    owner: row.owner || '',
    proofScope: row.proofScope || '',
    reason: failureReason(row, observations, issues),
    nextStep: row.nextStep || row.unblock || '',
    deferCategory: row.deferCategory || '',
    observations,
    issues,
  };
}

function isExternalBoundary(row) {
  return (
    row.status === 'external' ||
    Boolean(row.externalCoverage) ||
    EXTERNAL_DEFER_CATEGORIES.has(row.deferCategory)
  );
}

function scopeDescription(report, selectedIds, totalRows) {
  if (report.scope === 'blocked-startup' || report.outcome?.coverage === 'blocked-startup')
    return 'blocked startup/source preparation; no checks ran';
  if (report.scope) return valueText(report.scope);
  if (report.catalogueOnly) return 'catalogue-only; no keyboard checks were run';
  if (report.selection?.filtered) {
    return `filtered selection; ${selectedIds.length} action(s) selected from ${totalRows} catalogue row(s)`;
  }
  return 'full controlled shortcut check';
}

function analyzeReport(report) {
  const currentPageValidation = {
    ...(report.currentPageValidation || {
      status: 'unverified',
      reason:
        'Fresh authenticated ChatGPT target validation has not run. Fixture results cannot establish the current page state.',
    }),
  };
  if (!['passed', 'failed', 'partial', 'unverified'].includes(currentPageValidation.status)) {
    currentPageValidation.status = 'unverified';
    currentPageValidation.reason = 'The current-page evidence has no recognized validation status.';
  }
  if (
    currentPageValidation.status === 'passed' &&
    (!Number.isFinite(Date.parse(currentPageValidation.checkedAt)) ||
      !/^https:\/\/chatgpt\.com\/c\/[^/?#]+$/.test(currentPageValidation.pageUrl || '') ||
      currentPageValidation.targetSummary?.status !== 'passed' ||
      currentPageValidation.probeSummary?.status !== 'passed')
  ) {
    currentPageValidation.status = 'unverified';
    currentPageValidation.reason =
      'A passed label without current-page provenance and complete target/probe evidence is unverified.';
  }
  const currentPageFailures = asArray(currentPageValidation.failures).map((item) => ({
    ...item,
    label: item.actionId || item.targetId || 'Current-page validation',
    status: 'fail',
    targetRefs: item.targetId ? [item.targetId] : [],
    fixKind: 'current-page-failure',
  }));
  if (currentPageValidation.status === 'failed' && !currentPageFailures.length)
    currentPageFailures.push({
      label: 'Current-page validation',
      reason: currentPageValidation.reason,
      status: 'fail',
      fixKind: 'current-page-failure',
    });
  const rows = asArray(report.rows);
  const targetById = new Map(asArray(report.targets).map((target) => [target.targetId, target]));
  const selection = report.selection || {};
  const selectedIds = new Set(uniqueText(selection.actionIds));
  const issues = asArray(report.issues);
  const failuresByKey = new Map();
  const failures = [];
  const coverageGaps = [];
  const scopeLimitations = [];
  const unselectedRows = [];
  const passRows = [];

  const addFailure = (detail) => {
    const key = detail.actionId || detail.rowId || `${detail.label}:${detail.reason}`;
    const previous = failuresByKey.get(key);
    if (previous) {
      previous.issues.push(...detail.issues);
      previous.reason = uniqueText([previous.reason, detail.reason]).join(' ');
      return;
    }
    failuresByKey.set(key, detail);
    failures.push(detail);
  };

  for (const row of rows) {
    const rowIssues = issues.filter(
      (issue) =>
        (row.actionId && issue.actionId === row.actionId) ||
        (row.rowId && issue.rowId === row.rowId),
    );
    const observations = observationsForRow(row, report);
    const status = normalizeRowStatus(row, observations);
    if (['fail', 'failure', 'error', 'environment-fail'].includes(status)) {
      addFailure(makeRowDetail(row, report, targetById, status, rowIssues));
      continue;
    }
    if (status === 'pass') {
      passRows.push(makeRowDetail(row, report, targetById, status));
      if (row.externalCoverage) {
        scopeLimitations.push({
          ...makeRowDetail(row, report, targetById, 'scope'),
          kind: 'external-coverage-boundary',
          reason: row.externalCoverage.reason || row.externalCoverage.nextStep || row.reason || '',
        });
      }
      continue;
    }
    if (status === 'not-applicable') {
      scopeLimitations.push({
        ...makeRowDetail(row, report, targetById, 'scope'),
        kind: 'not-applicable',
      });
      continue;
    }
    if (isExternalBoundary(row)) {
      scopeLimitations.push({
        ...makeRowDetail(row, report, targetById, 'scope'),
        kind: 'external-coverage-boundary',
        reason:
          row.externalCoverage?.reason ||
          row.externalCoverage?.nextStep ||
          row.reason ||
          'This behavior is outside controlled keyboard proof.',
      });
      continue;
    }
    if (
      status === 'not-run' &&
      row.admitted &&
      selection.filtered &&
      row.actionId &&
      !selectedIds.has(row.actionId)
    ) {
      unselectedRows.push({
        ...makeRowDetail(row, report, targetById, 'not-selected'),
        kind: 'intentionally-unselected',
        reason: 'This implemented action was outside the requested filtered selection.',
      });
      continue;
    }
    if (status === 'not-run' && report.catalogueOnly) {
      scopeLimitations.push({
        ...makeRowDetail(row, report, targetById, 'catalogue-only'),
        kind: 'catalogue-only',
        reason: 'Catalogue discovery does not run keyboard proof.',
      });
      continue;
    }
    if (
      status === 'not-run' &&
      row.contractId &&
      selection.filtered &&
      !(row.requiredActions || []).every((actionId) => selectedIds.has(actionId))
    ) {
      unselectedRows.push({
        ...makeRowDetail(row, report, targetById, 'not-selected'),
        kind: 'contract-outside-selection',
        reason:
          'The filtered selection did not include every action required to prove this contract.',
      });
      continue;
    }
    if (['deferred', 'not-run'].includes(status)) {
      const detail = makeRowDetail(row, report, targetById, status);
      if (status === 'not-run' && !detail.reason)
        detail.reason = 'No keyboard proof was recorded for this action in the selected run.';
      if (status === 'deferred' && !detail.reason)
        detail.reason = 'This action does not have an admitted fast keyboard case.';
      coverageGaps.push({
        ...detail,
        kind: status === 'deferred' ? 'deferred-action' : 'unproven-action',
      });
    }
  }

  for (const issue of issues) {
    const matchingRow = rows.find(
      (row) =>
        (issue.actionId && row.actionId === issue.actionId) ||
        (issue.rowId && row.rowId === issue.rowId),
    );
    if (issue.fatal) {
      if (matchingRow) {
        const detail = makeRowDetail(
          matchingRow,
          report,
          targetById,
          'failure',
          issues.filter((candidate) => candidate === issue),
        );
        addFailure(detail);
      } else {
        addFailure({
          actionId: issue.actionId || '',
          rowId: issue.rowId || '',
          label: issue.actionId || issue.rowId || 'Inventory guard',
          status: 'failure',
          chord: '',
          configuredCode: '',
          targetRefs: uniqueText(issue.targetRefs || issue.targetId),
          targets: [],
          source: issue.source || '',
          owner: issue.owner || '',
          proofScope: 'inventory-guard',
          reason: issue.message || issue.reason || 'Fatal shortcut inventory issue.',
          nextStep: issue.nextStep || '',
          observations: [],
          issues: [issue],
        });
      }
    } else if (!matchingRow) {
      coverageGaps.push({
        kind: 'inventory-warning',
        actionId: issue.actionId || '',
        rowId: issue.rowId || '',
        label: issue.actionId || issue.rowId || 'Inventory warning',
        status: 'warning',
        reason: issue.message || issue.reason || 'Non-fatal shortcut inventory issue.',
        owner: issue.owner || '',
        source: issue.source || '',
        targetRefs: uniqueText(issue.targetRefs || issue.targetId),
        targets: [],
        chord: '',
        nextStep: issue.nextStep || '',
        issues: [issue],
      });
    }
  }

  const warningRows = [...asArray(report.warnings), ...asArray(report.outcome?.warnings)].map(
    (warning) =>
      typeof warning === 'object' && warning !== null
        ? {
            ...warning,
            reason: warning.reason || warning.message || valueText(warning),
          }
        : { reason: valueText(warning) },
  );
  const rawWarnings = [
    ...new Map(
      warningRows.map((warning) => [
        JSON.stringify([warning.rowId, warning.actionId, warning.owner, warning.reason]),
        warning,
      ]),
    ).values(),
  ];
  const checkResults = asArray(report.checkResults).map((result) => ({
    ...result,
    name: result.name || result.id || 'Unnamed check',
    status: String(result.status || 'unknown').toLowerCase(),
    seconds: result.seconds ?? result.durationSeconds ?? null,
    reason:
      result.error?.message ||
      result.error ||
      result.message ||
      result.reason ||
      result.output ||
      (['fail', 'failed', 'failure', 'error'].includes(String(result.status).toLowerCase())
        ? 'See check command output.'
        : ''),
  }));
  const checkFailures = checkResults
    .filter((result) => ['fail', 'failed', 'failure', 'error'].includes(result.status))
    .map((result) => ({
      actionId: '',
      rowId: '',
      label: `Check stage: ${result.name}`,
      stageName: result.name,
      status: 'failure',
      chord: '',
      configuredCode: '',
      targetRefs: [],
      targets: [],
      source: result.source || '',
      owner: result.owner || 'check runner',
      proofScope: 'repository-check',
      reason: result.reason,
      nextStep: result.nextStep || '',
      observations: [],
      issues: [],
      seconds: result.seconds,
    }));
  const checkWarnings = checkResults.filter((result) =>
    ['warn', 'warning', 'partial', 'unverified'].includes(result.status),
  );
  const reportSaysFailure =
    report.status === 'failure' ||
    report.outcome?.status === 'failure' ||
    report.exitCode === 1 ||
    report.outcome?.exitCode === 1 ||
    report.scope === 'blocked-startup' ||
    report.outcome?.coverage === 'blocked-startup' ||
    report.scheduling?.serialBarrierPassed === false ||
    (typeof report.scheduling?.observedParallelTabs === 'number' &&
      report.scheduling.observedParallelTabs > 10);
  const observations = reportObservations(report);
  if (reportSaysFailure && failures.length === 0) {
    addFailure({
      actionId: '',
      rowId: '',
      label:
        report.scope === 'blocked-startup' || report.outcome?.coverage === 'blocked-startup'
          ? 'Startup / source preparation'
          : 'Shortcut check',
      status: 'failure',
      chord: '',
      configuredCode: '',
      targetRefs: [],
      targets: [],
      source: report.source || '',
      owner: report.owner || '',
      proofScope: report.scope || '',
      reason:
        report.reason ||
        report.error?.message ||
        report.outcome?.reason ||
        report.outcome?.errors?.[0]?.message ||
        report.errors?.[0]?.message ||
        (report.scheduling?.serialBarrierPassed === false
          ? 'The required serial scheduling barrier did not pass.'
          : 'The shortcut run reported failure before an action row could be attributed.'),
      nextStep: '',
      observations: [],
      issues: [],
    });
  }

  const outcomeStatus =
    failures.length || checkFailures.length || currentPageFailures.length
      ? 'FAIL'
      : coverageGaps.length ||
          scopeLimitations.length ||
          unselectedRows.length ||
          rawWarnings.length ||
          checkWarnings.length ||
          currentPageValidation.status !== 'passed' ||
          report.outcome?.status === 'success-with-warnings' ||
          report.outcome?.coverage === 'partial'
        ? 'WARN'
        : observations.some(
              (item) => item.attempted || item.status === 'pass' || item.status === 'fail',
            )
          ? 'PASS'
          : currentPageValidation.status === 'passed'
            ? 'PASS'
            : 'WARN';
  const attempted = observations.filter(
    (item) => item.attempted || ['pass', 'fail'].includes(item.status),
  ).length;
  const scope = {
    kind:
      report.scope ||
      (report.outcome?.coverage === 'blocked-startup' ? 'blocked-startup' : '') ||
      (report.catalogueOnly
        ? 'catalogue-only'
        : selection.filtered
          ? 'filtered'
          : 'full-controlled'),
    label: scopeDescription(report, [...selectedIds], rows.length),
    filtered: Boolean(selection.filtered),
    catalogueOnly: Boolean(report.catalogueOnly),
    selectedActionIds: [...selectedIds],
    selectedCount: selectedIds.size,
  };
  const fixList = [
    ...failures.map((item) => ({ ...item, fixKind: 'failure' })),
    ...checkFailures.map((item) => ({ ...item, fixKind: 'failed-check-stage' })),
    ...coverageGaps.map((item) => ({ ...item, fixKind: 'coverage-gap' })),
    ...currentPageFailures,
  ];
  return {
    status: outcomeStatus,
    exitCode: failures.length || checkFailures.length || currentPageFailures.length ? 1 : 0,
    scope,
    summary: {
      status: outcomeStatus,
      catalogueRows: rows.length,
      selectedActions: selectedIds.size,
      attempted,
      passed: passRows.filter((row) => row.actionId).length,
      failed: failures.length,
      failedStages: checkFailures.length,
      passedStages: checkResults.filter((result) => result.status === 'pass').length,
      coverageGaps: coverageGaps.length,
      scopeLimitations: scopeLimitations.length,
      unselected: unselectedRows.length,
      warnings: rawWarnings.length + checkWarnings.length,
      checks: attempted
        ? `${attempted} keyboard observation(s) recorded${checkResults.length ? `; ${checkResults.length} repository check stage(s)` : ''}`
        : checkResults.length
          ? `No keyboard checks recorded; ${checkResults.length} repository check stage(s)`
          : report.checks || report.outcome?.checks || 'No checks ran',
    },
    failures,
    checkResults,
    checkFailures,
    checkWarnings,
    coverageGaps,
    scopeLimitations,
    unselectedRows,
    passRows,
    warnings: rawWarnings,
    fixList,
    currentPageValidation,
    currentPageFailures,
    title:
      report.scope === 'current-page'
        ? 'Current ChatGPT page validation'
        : 'Shortcut fixture regressions',
  };
}

function markdownList(items, describe) {
  if (!items.length) return '_None._';
  return items.map((item, index) => `${index + 1}. ${describe(item)}`).join('\n');
}

function markdownTargets(item) {
  if (!asArray(item.targets).length)
    return asArray(item.targetRefs).map(escapeMarkdown).join(', ') || '—';
  return item.targets
    .map((target) => {
      const values = [target.targetRef, target.identifier, ...target.selectors].filter(Boolean);
      return uniqueText(values).map(escapeMarkdown).join('; ');
    })
    .join(' | ');
}

function renderMarkdown(analysis, generatedAt) {
  const lines = [
    `# ${analysis.title}`,
    '',
    `**Status:** ${analysis.status}  `,
    `**Scope:** ${escapeMarkdown(analysis.scope.label)}  `,
    `**Generated:** ${escapeMarkdown(generatedAt)}  `,
    `**Checks:** ${escapeMarkdown(analysis.summary.checks)}`,
    '',
    `**Current ChatGPT page:** ${escapeMarkdown(analysis.currentPageValidation.status.toUpperCase())}`,
    escapeMarkdown(analysis.currentPageValidation.reason || ''),
    `**Checked:** ${escapeMarkdown(analysis.currentPageValidation.checkedAt || 'Not checked')}`,
    `**Captured live page:** ${escapeMarkdown(analysis.currentPageValidation.pageUrl || 'Unavailable')} · **Configured profile:** ${escapeMarkdown(analysis.currentPageValidation.profileDirectory || 'Unavailable')}`,
    `**Live target presence:** ${escapeMarkdown(analysis.currentPageValidation.targetSummary?.status || 'unverified')} · **Live activations:** ${escapeMarkdown(analysis.currentPageValidation.probeSummary?.status || 'unverified')}`,
    '',
    '| Passed actions | Failed shortcuts | Failed check stages | Coverage gaps | Scope limitations | Unselected | Warnings |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    `| ${analysis.summary.passed} | ${analysis.summary.failed} | ${analysis.summary.failedStages} | ${analysis.summary.coverageGaps} | ${analysis.summary.scopeLimitations} | ${analysis.summary.unselected} | ${analysis.summary.warnings} |`,
    '',
    '## Check stages',
    '',
  ];
  if (analysis.checkResults.length) {
    lines.push('| Check | Status | Time (seconds) | Details |');
    lines.push('| --- | --- | ---: | --- |');
    for (const result of analysis.checkResults) {
      lines.push(
        `| ${escapeMarkdown(result.name)} | ${escapeMarkdown(result.status)} | ${escapeMarkdown(result.seconds ?? '—')} | ${escapeMarkdown(result.reason || '—')} |`,
      );
    }
  } else lines.push('_No aggregate check stages were supplied._');
  lines.push('', '## Failures', '');
  if (analysis.failures.length) {
    lines.push(
      '| Shortcut action | Status | Chord | Targets and selectors | Source / owner | Reason |',
    );
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of analysis.failures) {
      lines.push(
        `| ${escapeMarkdown(item.actionId || item.label)} | ${escapeMarkdown(item.status)} | ${escapeMarkdown(item.chord || '—')} | ${markdownTargets(item)} | ${escapeMarkdown([item.source, item.owner].filter(Boolean).join(' / ') || '—')} | ${escapeMarkdown(item.reason || '—')} |`,
      );
    }
  } else
    lines.push(
      analysis.scope.kind === 'current-page'
        ? '_See the current-page status and fix list._'
        : '_No failures found in the prepared fixture pages. This is not current-page target validation._',
    );
  lines.push(
    '',
    '## Current-page coverage',
    '',
    markdownList(asArray(analysis.currentPageValidation.scopeLimitations), (item) =>
      escapeMarkdown(item.reason || item),
    ),
    '',
  );
  lines.push('', '## Coverage gaps', '');
  if (analysis.coverageGaps.length) {
    lines.push('| Shortcut / contract | Owner | Missing proof or coverage | Next step |');
    lines.push('| --- | --- | --- | --- |');
    for (const item of analysis.coverageGaps) {
      lines.push(
        `| ${escapeMarkdown(item.actionId || item.contractId || item.label)} | ${escapeMarkdown(item.owner || item.source || '—')} | ${escapeMarkdown(item.reason || '—')} | ${escapeMarkdown(item.nextStep || '—')} |`,
      );
    }
  } else lines.push('_No unresolved controlled-coverage gaps._');
  lines.push('', '## Scope and known limitations', '');
  const scopeItems = [...analysis.scopeLimitations, ...analysis.unselectedRows];
  lines.push(
    markdownList(
      scopeItems,
      (item) =>
        `**${escapeMarkdown(item.actionId || item.label)}** (${escapeMarkdown(item.kind)}): ${escapeMarkdown(item.reason || '—')}`,
    ),
    '',
    '## Fix list',
    '',
  );
  lines.push(
    markdownList(analysis.fixList, (item) => {
      const chord = item.chord ? `; chord: ${escapeMarkdown(item.chord)}` : '';
      const targets = markdownTargets(item);
      const targetText = targets !== '—' ? `; targets: ${targets}` : '';
      const owner = item.owner ? `; owner: ${escapeMarkdown(item.owner)}` : '';
      const stage = item.stageName ? ` (${escapeMarkdown(item.stageName)})` : '';
      return `**${escapeMarkdown(item.actionId || item.label)}**${stage} [${escapeMarkdown(item.fixKind)}] ${escapeMarkdown(item.reason || 'Review this row')}${chord}${targetText}${owner}`;
    }),
    '',
  );
  if (!analysis.fixList.length && analysis.currentPageValidation.status !== 'passed')
    lines.push(
      'Complete current-page validation has not passed. See the live target and activation status above.',
      '',
    );
  if (analysis.warnings.length) {
    lines.push(
      '## Run warnings',
      '',
      markdownList(analysis.warnings, (item) => escapeMarkdown(item.reason)),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

function htmlDetails(item) {
  const targets = item.targets.length
    ? `<ul>${item.targets
        .map(
          (target) =>
            `<li><strong>${escapeHtml(target.targetRef)}</strong>${target.kind ? ` <span class="muted">(${escapeHtml(target.kind)})</span>` : ''}${target.identifier ? `<div>Canonical identifier: <code>${escapeHtml(target.identifier)}</code></div>` : ''}${target.selectors.length ? `<div>Selectors / search needles: <code>${escapeHtml(target.selectors.join(' · '))}</code></div>` : ''}${target.notes ? `<div class="muted">${escapeHtml(target.notes)}</div>` : ''}</li>`,
        )
        .join('')}</ul>`
    : `<p>${escapeHtml(item.targetRefs.join(', ') || 'No target references recorded.')}</p>`;
  const observations = item.observations?.length
    ? `<details><summary>Recorded observations (${item.observations.length})</summary><pre>${escapeHtml(JSON.stringify(item.observations, null, 2))}</pre></details>`
    : '';
  const issues = item.issues?.length
    ? `<details><summary>Related inventory issues (${item.issues.length})</summary><pre>${escapeHtml(JSON.stringify(item.issues, null, 2))}</pre></details>`
    : '';
  return `<details class="diagnostics"><summary>Target and run details</summary>${targets}${item.proofScope ? `<p><strong>Proof scope:</strong> ${escapeHtml(item.proofScope)}</p>` : ''}${item.nextStep ? `<p><strong>Next step:</strong> ${escapeHtml(item.nextStep)}</p>` : ''}${observations}${issues}</details>`;
}

function renderHtmlTable(items, { failure = false } = {}) {
  if (!items.length) return '<p class="empty">None.</p>';
  const rows = items
    .map((item) => {
      const status = String(item.status || 'warning').toLowerCase();
      const chord = item.chord || '—';
      const targets = item.targets?.length
        ? item.targets.map((target) => target.targetRef).join(', ')
        : item.targetRefs?.join(', ') || '—';
      const reason = item.reason || '—';
      const details = htmlDetails(item);
      const actionTitle = item.actionId || item.label;
      const actionLabel =
        item.actionId && item.label && item.label !== item.actionId
          ? `<div>${escapeHtml(item.label)}</div>`
          : '';
      return `<tr><td><strong>${escapeHtml(actionTitle)}</strong>${actionLabel}${item.contractId ? `<div class="muted">${escapeHtml(item.contractId)}</div>` : ''}<div class="muted">${escapeHtml(item.rowId || '')}</div></td><td><span class="pill ${escapeHtml(statusClass(status))}">${escapeHtml(statusLabel(status))}</span></td>${failure ? `<td><code>${escapeHtml(chord)}</code><div class="muted">Configured code: ${escapeHtml(item.configuredCode || 'not recorded')}</div></td>` : ''}<td>${escapeHtml(targets)}</td><td>${escapeHtml([item.source, item.owner].filter(Boolean).join(' / ') || '—')}</td><td>${escapeHtml(reason)}${details}</td></tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Shortcut / row</th><th>Status</th>${failure ? '<th>Chord</th>' : ''}<th>Target refs</th><th>Source / owner</th><th>Reason and diagnostics</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function statusClass(status) {
  if (['fail', 'failure', 'error', 'environment-fail'].includes(status)) return 'bad';
  if (status === 'pass') return 'good';
  return 'warn';
}

function statusLabel(status) {
  if (status === 'environment-fail') return 'environment failure';
  return status;
}

function renderHtmlChecks(checkResults) {
  if (!checkResults.length) return '<p class="empty">No aggregate check stages were supplied.</p>';
  const rows = checkResults
    .map(
      (result) =>
        `<tr><td><strong>${escapeHtml(result.name)}</strong></td><td><span class="pill ${escapeHtml(statusClass(result.status))}">${escapeHtml(statusLabel(result.status))}</span></td><td>${escapeHtml(result.seconds ?? '—')}</td><td>${escapeHtml(result.reason || '—')}</td></tr>`,
    )
    .join('');
  return `<div class="table-wrap"><table><thead><tr><th>Check</th><th>Status</th><th>Seconds</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderHtml(analysis, generatedAt, outputDirectory) {
  const scopeItems = [...analysis.scopeLimitations, ...analysis.unselectedRows];
  const fixList = analysis.fixList.length
    ? `<ol>${analysis.fixList
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.actionId || item.label)}</strong> <span class="pill ${item.fixKind === 'coverage-gap' ? 'warn' : 'bad'}">${escapeHtml(item.fixKind)}</span><p>${escapeHtml(item.reason || 'Review this row.')}${item.chord ? ` Chord: ${escapeHtml(item.chord)}.` : ''}${item.targetRefs?.length ? ` Targets: ${escapeHtml(item.targetRefs.join(', '))}.` : ''}${item.owner ? ` Owner: ${escapeHtml(item.owner)}.` : ''}</p></li>`,
        )
        .join('')}</ol>`
    : '<p class="empty">No observed failures in this report. Current-page status and coverage are shown above.</p>';
  const allWarnings = [
    ...analysis.warnings,
    ...analysis.checkWarnings.map((item) => ({ reason: `${item.name}: ${item.reason}` })),
  ];
  const warnings = allWarnings.length
    ? `<ul>${allWarnings.map((item) => `<li>${escapeHtml(item.reason)}</li>`).join('')}</ul>`
    : '<p class="empty">No additional run warnings.</p>';
  const summaryCards = [
    ['Passed actions', analysis.summary.passed, 'good'],
    ['Failed', analysis.summary.failed, analysis.summary.failed ? 'bad' : 'good'],
    [
      'Failed check stages',
      analysis.summary.failedStages,
      analysis.summary.failedStages ? 'bad' : 'good',
    ],
    [
      'Coverage gaps',
      analysis.summary.coverageGaps,
      analysis.summary.coverageGaps ? 'warn' : 'good',
    ],
    ['Known scope items', analysis.summary.scopeLimitations, 'neutral'],
    ['Unselected', analysis.summary.unselected, 'neutral'],
  ]
    .map(
      ([label, count, tone]) =>
        `<div class="card ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(count)}</strong></div>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(analysis.title)} — ${escapeHtml(analysis.status)}</title>
  <style>
    :root { color-scheme: light; font: 15px/1.5 system-ui, sans-serif; background: #f5f7fb; color: #172033; }
    body { margin: 0; padding: 28px; }
    main { max-width: 1440px; margin: 0 auto; }
    h1, h2 { line-height: 1.2; }
    h1 { margin: 0 0 8px; }
    h2 { margin-top: 30px; }
    .meta, .muted { color: #637087; font-size: .9em; }
    .status-line { display: flex; align-items: center; gap: 12px; margin: 14px 0; }
    .pill { border-radius: 999px; display: inline-block; font-size: .78em; font-weight: 700; padding: 2px 9px; text-transform: uppercase; }
    .bad { color: #8d1722; background: #ffe1e4; }
    .good { color: #145b37; background: #d9f5e5; }
    .warn { color: #785000; background: #fff0c2; }
    .neutral { color: #40516b; background: #e7edf5; }
    .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); margin: 20px 0; }
    .card { background: white; border: 1px solid #dce3ed; border-radius: 10px; padding: 13px 16px; }
    .card span { display: block; color: #58677d; font-size: .86em; }
    .card strong { display: block; font-size: 1.8em; }
    nav { display: flex; flex-wrap: wrap; gap: 8px 18px; border-bottom: 1px solid #dce3ed; padding-bottom: 12px; }
    a { color: #1557a0; }
    .table-wrap { overflow-x: auto; background: white; border: 1px solid #dce3ed; border-radius: 10px; }
    table { border-collapse: collapse; min-width: 900px; width: 100%; }
    th, td { border-bottom: 1px solid #e7ebf1; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #edf2f8; font-size: .84em; }
    tr:last-child td { border-bottom: 0; }
    code, pre { background: #f0f3f8; border-radius: 4px; font-family: ui-monospace, monospace; }
    code { overflow-wrap: anywhere; padding: 2px 4px; }
    pre { max-height: 340px; overflow: auto; padding: 12px; white-space: pre-wrap; }
    details { margin-top: 8px; }
    details summary { color: #315984; cursor: pointer; font-size: .9em; }
    .diagnostics ul { padding-left: 22px; }
    .empty { color: #637087; font-style: italic; }
    .fix-list { background: white; border: 1px solid #dce3ed; border-radius: 10px; padding: 8px 28px; }
    footer { border-top: 1px solid #dce3ed; color: #637087; font-size: .85em; margin-top: 32px; padding-top: 12px; overflow-wrap: anywhere; }
    @media (max-width: 680px) { body { padding: 16px; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(analysis.title)}</h1>
    <section class="card neutral" aria-label="Current ChatGPT validation"><strong>Current ChatGPT page: ${escapeHtml(analysis.currentPageValidation.status.toUpperCase())}</strong><p>${escapeHtml(analysis.currentPageValidation.reason || '')}</p><p>Checked: ${escapeHtml(analysis.currentPageValidation.checkedAt || 'Not checked')} · Live target presence: ${escapeHtml(analysis.currentPageValidation.targetSummary?.status || 'unverified')} · Live activations: ${escapeHtml(analysis.currentPageValidation.probeSummary?.status || 'unverified')}</p><ul>${asArray(
      analysis.currentPageValidation.scopeLimitations,
    )
      .map((item) => `<li>${escapeHtml(item.reason || item)}</li>`)
      .join('')}</ul></section>
    <p class="meta">Captured live page: ${escapeHtml(analysis.currentPageValidation.pageUrl || 'Unavailable')} · Configured profile: ${escapeHtml(analysis.currentPageValidation.profileDirectory || 'Unavailable')}</p>
    <div class="status-line"><span class="pill ${statusClass(analysis.status.toLowerCase())}">${escapeHtml(analysis.status)}</span><span>${escapeHtml(analysis.scope.label)}</span></div>
    <p class="meta">Generated ${escapeHtml(generatedAt)} · ${escapeHtml(analysis.summary.checks)}</p>
    <section class="cards" aria-label="Run summary">${summaryCards}<div class="card neutral"><span>Fix items</span><strong>${analysis.fixList.length}</strong></div></section>
    <nav aria-label="Report sections"><a href="#fix-list">Fix list</a><a href="#check-stages">Check stages</a><a href="#failures">Shortcut failures</a><a href="#coverage-gaps">Coverage gaps</a><a href="#scope">Scope and limitations</a><a href="#passes">Passed rows</a><a href="#warnings">Run warnings</a></nav>
    <section id="fix-list"><h2>Fix list</h2><div class="fix-list">${fixList}</div></section>
    <section id="check-stages"><h2>Check stages</h2>${renderHtmlChecks(analysis.checkResults)}</section>
    <section id="failures"><h2>Failures</h2>${renderHtmlTable(analysis.failures, { failure: true })}</section>
    <section id="coverage-gaps"><h2>Coverage gaps</h2>${renderHtmlTable(analysis.coverageGaps)}</section>
    <section id="scope"><h2>Scope and known limitations</h2>${renderHtmlTable(scopeItems)}<p class="meta">These rows describe intentionally unselected actions, catalogue-only work, or stated native/external proof boundaries.</p></section>
    <section id="passes"><h2>Passed rows</h2>${renderHtmlTable(analysis.passRows)}</section>
    <section id="warnings"><h2>Run warnings</h2>${warnings}</section>
    <footer>Artifacts: ${escapeHtml(outputDirectory)} · Machine-readable JSON and Markdown reports are saved beside this page.</footer>
  </main>
</body>
</html>
`;
}

/** Write a fresh JSON, Markdown, and HTML report for a canonical fast shortcut run. */
export async function writeFastVisualReport(
  report,
  { outputDirectory = FAST_VISUAL_REPORT_DIRECTORY } = {},
) {
  const directory = resolve(
    outputDirectory instanceof URL ? fileURLToPath(outputDirectory) : outputDirectory,
  );
  const generatedAt = new Date().toISOString();
  const analysis = analyzeReport(report || {});
  const reportDocument = {
    ...(report || {}),
    visualReportVersion: 1,
    generatedAt,
    runStatus: analysis.status,
    runScope: analysis.scope,
    visualSummary: analysis.summary,
    failures: analysis.failures,
    checkFailures: analysis.checkFailures,
    coverageGaps: analysis.coverageGaps,
    scopeLimitations: analysis.scopeLimitations,
    unselectedRows: analysis.unselectedRows,
    passRows: analysis.passRows,
    visualWarnings: analysis.warnings,
    fixList: analysis.fixList,
    currentPageValidation: analysis.currentPageValidation,
  };
  const jsonPath = resolve(directory, 'report.json');
  const markdownPath = resolve(directory, 'report.md');
  const htmlPath = resolve(directory, 'report.html');
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(reportDocument, null, 2)}\n`, 'utf8'),
    writeFile(markdownPath, renderMarkdown(analysis, generatedAt), 'utf8'),
    writeFile(htmlPath, renderHtml(analysis, generatedAt, directory), 'utf8'),
  ]);
  return {
    outputDirectory: directory,
    json: jsonPath,
    markdown: markdownPath,
    html: htmlPath,
    status: analysis.status,
    exitCode: analysis.exitCode,
    summary: analysis.summary,
  };
}
