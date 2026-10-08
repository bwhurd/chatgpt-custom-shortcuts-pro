const CHECK_REPORT_SCHEMA_VERSION = 3;
const RUN_MANIFEST_SCHEMA_VERSION = 1;
const EXECUTABLE_PROBE_MODES = new Set([
  'click-target',
  'focus-target',
  'opens-target',
  'direct-menu-target',
  'viewport-target',
  'clipboard-text',
  'dom-state',
]);
const TARGET_STATUSES = new Set(['pass', 'fail', 'no-scrape-coverage', 'not-run']);
const SHORTCUT_STATUSES = new Set(['pass', 'fail', 'partial', 'manual', 'not-applicable']);
const PROBE_STATUSES = new Set([
  'pass',
  'fail',
  'skipped',
  'environment-fail',
  'manual',
  'not-applicable',
  'not-live-probed',
  'coverage-gap',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasChatGptConversationUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'chatgpt.com' &&
      /^\/c\/[^/]+$/.test(parsed.pathname) &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

function invalidEvidenceReason(report, options) {
  if (!isRecord(report)) return 'No current-page check report was provided.';
  if (report.schemaVersion !== CHECK_REPORT_SCHEMA_VERSION) {
    return 'The check report is missing or has an unsupported schema version.';
  }

  const manifest = report.runManifest;
  if (!isRecord(manifest) || manifest.schemaVersion !== RUN_MANIFEST_SCHEMA_VERSION) {
    return 'The report does not contain a supported run manifest.';
  }
  if (manifest.runKind !== 'devscrapewide') {
    return 'The report is not from a fresh DevScrapeWide page capture.';
  }
  if (
    typeof manifest.folderName !== 'string' ||
    manifest.folderName === '' ||
    report.folderName !== manifest.folderName
  ) {
    return 'The report folder does not match the run manifest.';
  }
  const folderFromPath = safeString(report.folderPath).split(/[\\/]/).filter(Boolean).at(-1);
  if (!folderFromPath || folderFromPath !== manifest.folderName) {
    return 'The report path does not identify its manifest folder.';
  }

  const startedAt = parseTimestamp(options.startedAt);
  const completedAt = parseTimestamp(options.completedAt);
  const manifestStartedAt = parseTimestamp(manifest.startedAt);
  const manifestCompletedAt = parseTimestamp(manifest.completedAt);
  const reportGeneratedAt = parseTimestamp(report.generatedAt);
  if (
    startedAt === null ||
    completedAt === null ||
    startedAt > completedAt ||
    manifestStartedAt === null ||
    manifestCompletedAt === null ||
    reportGeneratedAt === null
  ) {
    return 'Invocation or report timestamps are missing or malformed.';
  }
  if (
    manifestStartedAt < startedAt ||
    manifestStartedAt > manifestCompletedAt ||
    manifestCompletedAt > reportGeneratedAt ||
    reportGeneratedAt > completedAt
  ) {
    return 'The report timestamps do not fall within this validation invocation.';
  }

  if (!isRecord(manifest.pageInfo)) return 'The run manifest has no captured page information.';
  const expectedFixtureUrl = options.fixtureUrl || manifest.fixtureUrl;
  if (!hasChatGptConversationUrl(expectedFixtureUrl)) {
    return 'The expected source is not a ChatGPT conversation URL.';
  }
  if (
    manifest.fixtureUrl !== expectedFixtureUrl ||
    report.fixtureUrl !== manifest.fixtureUrl ||
    manifest.pageInfo.fixtureUrl !== manifest.fixtureUrl ||
    manifest.pageInfo.url !== manifest.fixtureUrl ||
    manifest.pageInfo.fixtureOk !== true
  ) {
    return 'The captured page, report, and manifest do not identify the same loaded fixture.';
  }

  if (!Array.isArray(manifest.artifacts)) return 'The run manifest has no artifact inventory.';
  for (const countName of ['capturedCount', 'failedCount', 'deferredCount']) {
    if (!Number.isInteger(manifest[countName]) || manifest[countName] < 0) {
      return `The run manifest has a malformed ${countName}.`;
    }
  }
  for (const artifact of manifest.artifacts) {
    if (
      !isRecord(artifact) ||
      typeof artifact.filename !== 'string' ||
      !['captured', 'alias', 'failed', 'deferred'].includes(artifact.status)
    ) {
      return 'The run manifest contains malformed artifact evidence.';
    }
  }
  if (
    !Array.isArray(report.targetRows) ||
    !Array.isArray(report.shortcutRows) ||
    !Array.isArray(report.liveProbeRows) ||
    !Array.isArray(report.missingArtifacts) ||
    !Array.isArray(report.missingExpectedFiles) ||
    !Array.isArray(report.inventoryIssues) ||
    !isRecord(report.summary) ||
    !isRecord(report.summary.liveProbes)
  ) {
    return 'The check report is missing target, probe, or artifact evidence.';
  }
  if (
    !report.missingArtifacts.every(
      (artifact) => isRecord(artifact) && typeof artifact.filename === 'string',
    ) ||
    !report.missingExpectedFiles.every(
      (item) => isRecord(item) && typeof item.filename === 'string',
    ) ||
    !report.inventoryIssues.every((issue) => isRecord(issue))
  ) {
    return 'The artifact or inventory issue list contains malformed evidence.';
  }

  if (!safeString(options.cdpEndpoint) || !safeString(options.profileDirectory)) {
    return 'The CDP endpoint and profile directory are required to identify the validation source.';
  }

  const probeRunStatus = report.summary.liveProbes.runStatus;
  if (!['completed', 'failed', 'not-run'].includes(probeRunStatus)) {
    return 'The live-probe report has an unsupported run status.';
  }
  for (const countName of [
    'total',
    'executable',
    'passed',
    'failed',
    'skipped',
    'environmentFailed',
    'manual',
    'notApplicable',
    'notLiveProbed',
    'coverageGaps',
  ]) {
    if (
      !Number.isInteger(report.summary.liveProbes[countName]) ||
      report.summary.liveProbes[countName] < 0
    ) {
      return `The live-probe summary has a malformed ${countName}.`;
    }
  }
  for (const countName of ['fixedTotal', 'fixedPassed', 'fixedCoverageGaps']) {
    const count = report.summary.liveProbes[countName];
    if (count !== undefined && (!Number.isInteger(count) || count < 0)) {
      return `The live-probe summary has a malformed ${countName}.`;
    }
  }
  if (probeRunStatus === 'completed') {
    const { fixedTotal, fixedPassed, fixedCoverageGaps } = report.summary.liveProbes;
    if (
      !Number.isInteger(fixedTotal) ||
      !Number.isInteger(fixedPassed) ||
      !Number.isInteger(fixedCoverageGaps) ||
      fixedPassed > fixedTotal ||
      fixedCoverageGaps > fixedTotal ||
      fixedPassed + fixedCoverageGaps > fixedTotal ||
      report.summary.liveProbes.total !== report.liveProbeRows.length + fixedTotal
    ) {
      return 'The completed live-probe summary does not match its action and fixed-contract rows.';
    }
  }
  if (
    probeRunStatus === 'not-run' &&
    (report.liveProbeRows.length > 0 || report.summary.liveProbes.total > 0)
  ) {
    return 'The live-probe report is marked not-run but contains probe results.';
  }

  for (const row of report.targetRows) {
    if (
      !isRecord(row) ||
      typeof row.targetId !== 'string' ||
      !TARGET_STATUSES.has(row.status) ||
      !isStringArray(row.expectedFiles) ||
      !isStringArray(row.matchedExpectedFiles) ||
      !isStringArray(row.missingExpectedFiles)
    ) {
      return 'The target rows contain malformed or unsupported evidence.';
    }
    if (
      row.matchedExpectedFiles.some((filename) => !row.expectedFiles.includes(filename)) ||
      row.missingExpectedFiles.some((filename) => !row.expectedFiles.includes(filename)) ||
      (row.status === 'pass' &&
        (row.expectedFiles.length === 0 ||
          row.matchedExpectedFiles.length === 0 ||
          row.missingExpectedFiles.length > 0))
    ) {
      return `Target ${row.targetId} has inconsistent expected-dump evidence.`;
    }
  }
  for (const row of report.shortcutRows) {
    if (
      !isRecord(row) ||
      typeof row.actionId !== 'string' ||
      typeof row.validationMode !== 'string' ||
      typeof row.activationProbeMode !== 'string' ||
      typeof row.activationProbeSafe !== 'boolean' ||
      !SHORTCUT_STATUSES.has(row.status) ||
      (row.targetIds !== undefined && !isStringArray(row.targetIds)) ||
      (row.usedByActionIds !== undefined && !isStringArray(row.usedByActionIds))
    ) {
      return 'The shortcut inventory contains malformed evidence.';
    }
  }
  for (const row of report.liveProbeRows) {
    if (
      !isRecord(row) ||
      typeof row.actionId !== 'string' ||
      typeof row.probeMode !== 'string' ||
      !PROBE_STATUSES.has(row.status)
    ) {
      return 'The live-probe rows contain malformed or unsupported evidence.';
    }
  }
  const liveProbeCounts = {
    executable: report.liveProbeRows.filter((row) => EXECUTABLE_PROBE_MODES.has(row.probeMode))
      .length,
    passed: report.liveProbeRows.filter((row) => row.status === 'pass').length,
    failed: report.liveProbeRows.filter((row) => row.status === 'fail').length,
    skipped: report.liveProbeRows.filter((row) => row.status === 'skipped').length,
    environmentFailed: report.liveProbeRows.filter((row) => row.status === 'environment-fail')
      .length,
    manual: report.liveProbeRows.filter((row) => row.status === 'manual').length,
    notApplicable: report.liveProbeRows.filter((row) => row.status === 'not-applicable').length,
    notLiveProbed: report.liveProbeRows.filter((row) => row.status === 'not-live-probed').length,
    coverageGaps: report.liveProbeRows.filter((row) => row.status === 'coverage-gap').length,
  };
  if (
    Object.entries(liveProbeCounts).some(([key, count]) => report.summary.liveProbes[key] !== count)
  ) {
    return 'The live-probe summary counts do not match its action rows.';
  }

  return '';
}

function getActionIdsForTarget(target, shortcutRows) {
  const declaredIds = Array.isArray(target.usedByActionIds) ? target.usedByActionIds : [];
  const referencedIds = shortcutRows
    .filter((shortcut) => {
      const targetIds = [
        ...(Array.isArray(shortcut.targetIds) ? shortcut.targetIds : []),
        ...(Array.isArray(shortcut.targetRefs) ? shortcut.targetRefs : []),
      ];
      return targetIds.includes(target.targetId);
    })
    .map((shortcut) => shortcut.actionId);
  return unique([...declaredIds, ...referencedIds]);
}

function targetIsExplicitlyOutOfScope(target, shortcutRows) {
  const actionIds = getActionIdsForTarget(target, shortcutRows);
  if (actionIds.length === 0) return false;
  const shortcutsById = new Map(shortcutRows.map((shortcut) => [shortcut.actionId, shortcut]));
  return actionIds.every((actionId) => {
    const shortcut = shortcutsById.get(actionId);
    return shortcut && ['manual-only', 'not-applicable'].includes(shortcut.validationMode);
  });
}

function targetFailureIsOnlyMissingCapture(target) {
  return (
    target.status === 'fail' &&
    (target.missingExpectedFiles.length > 0 ||
      /expected dump files were missing/i.test(target.statusReason || ''))
  );
}

function targetFailureContext(target, shortcutRows) {
  const actionIds = getActionIdsForTarget(target, shortcutRows);
  const identifiers = unique([target.identifier, target.canonicalIdentifier]);
  return {
    ...(actionIds.length > 0 ? { actionId: actionIds[0], usedByActionIds: actionIds } : {}),
    ...(identifiers.length > 0 ? { identifier: identifiers[0] } : {}),
  };
}

function probeFailureContext(actionId, report) {
  const shortcut = report.shortcutRows.find((row) => row.actionId === actionId);
  const targetId = shortcut?.targetIds?.[0];
  const target = report.targetRows.find((row) => row.targetId === targetId);
  return {
    ...(targetId ? { targetId } : {}),
    ...(target?.identifier || target?.canonicalIdentifier
      ? { identifier: target.identifier || target.canonicalIdentifier }
      : {}),
  };
}

function shortcutFailureIsOnlyMissingCapture(shortcut, targetRows) {
  const failedTargets = (shortcut.targetIds || [])
    .map((targetId) => targetRows.find((target) => target.targetId === targetId))
    .filter((target) => target?.status === 'fail');
  if (failedTargets.length === 0 || !failedTargets.every(targetFailureIsOnlyMissingCapture)) {
    return false;
  }
  const propagatedReason = failedTargets
    .map((target) => `${target.targetId}: ${target.statusReason}`)
    .join(' | ');
  return shortcut.statusReason === propagatedReason;
}

function summarizeTargets(report, partialReasons, failures, scopeLimitations) {
  const summary = {
    status: 'passed',
    total: report.targetRows.length,
    passed: 0,
    failed: 0,
    partial: 0,
    outOfScope: 0,
    reason: '',
  };

  for (const target of report.targetRows) {
    if (target.status === 'pass') {
      const matchedFiles = Array.isArray(target.matchedExpectedFiles)
        ? target.matchedExpectedFiles
        : [];
      if (matchedFiles.length === 0) {
        summary.partial += 1;
        partialReasons.push(`Target ${target.targetId} has no matched expected dump.`);
      } else {
        summary.passed += 1;
      }
    } else if (target.status === 'fail') {
      if (targetFailureIsOnlyMissingCapture(target)) {
        summary.partial += 1;
        partialReasons.push(`Target ${target.targetId} is missing expected dump files.`);
      } else {
        summary.failed += 1;
        failures.push({
          ...targetFailureContext(target, report.shortcutRows),
          targetId: target.targetId,
          reason: safeString(target.statusReason) || 'Target presence validation failed.',
        });
      }
    } else if (
      target.status === 'no-scrape-coverage' &&
      targetIsExplicitlyOutOfScope(target, report.shortcutRows)
    ) {
      summary.outOfScope += 1;
      scopeLimitations.push({
        reason: `Target ${target.targetId} has no scrape coverage and is referenced only by manual-only or not-applicable shortcuts.`,
      });
    } else {
      summary.partial += 1;
      const reason =
        target.status === 'no-scrape-coverage'
          ? `Target ${target.targetId} has no scrape coverage.`
          : `Target ${target.targetId} was not checked in the captured run.`;
      partialReasons.push(reason);
    }
  }

  if (summary.failed > 0) summary.status = 'failed';
  else if (summary.partial > 0 || report.targetRows.length === 0) {
    summary.status = 'partial';
    if (report.targetRows.length === 0) {
      partialReasons.push('The current-page report contains no target rows to validate.');
    }
  }
  summary.reason =
    summary.status === 'passed'
      ? `All ${summary.passed} in-scope targets matched expected captured dumps.`
      : summary.status === 'failed'
        ? `${summary.failed} target presence check(s) failed.`
        : `${summary.partial} target(s) have incomplete presence evidence.`;
  return summary;
}

function summarizeProbes(report, partialReasons, failures, scopeLimitations) {
  const probeStatus = report.summary.liveProbes.runStatus;
  const probeRows = report.liveProbeRows;
  const expectedActions = new Set(
    report.shortcutRows
      .filter(
        (shortcut) =>
          shortcut.validationMode !== 'manual-only' &&
          shortcut.validationMode !== 'not-applicable' &&
          shortcut.activationProbeSafe === true &&
          EXECUTABLE_PROBE_MODES.has(shortcut.activationProbeMode),
      )
      .map((shortcut) => shortcut.actionId),
  );
  const rowsByAction = new Map(probeRows.map((row) => [row.actionId, row]));
  const declaredSummary = report.summary.liveProbes;
  const fixedTotal = Number.isInteger(declaredSummary.fixedTotal) ? declaredSummary.fixedTotal : 0;
  const fixedPassed = Number.isInteger(declaredSummary.fixedPassed)
    ? declaredSummary.fixedPassed
    : 0;
  const summary = {
    status: probeStatus === 'not-run' ? 'unverified' : 'passed',
    total: probeRows.length + fixedTotal,
    executable: expectedActions.size,
    passed: 0,
    failed: 0,
    partial: 0,
    outOfScope: 0,
    fixedTotal,
    fixedPassed,
    reason: '',
  };

  for (const shortcut of report.shortcutRows) {
    if (shortcut.validationMode === 'manual-only') {
      scopeLimitations.push({
        reason: `${shortcut.actionId} is explicitly manual-only and has no automated live activation proof.`,
      });
    } else if (shortcut.validationMode === 'not-applicable') {
      scopeLimitations.push({
        reason: `${shortcut.actionId} is explicitly not applicable to live activation proof.`,
      });
    } else if (
      shortcut.activationProbeMode === 'not-live-probed' ||
      shortcut.activationProbeSafe !== true
    ) {
      scopeLimitations.push({
        reason: `${shortcut.actionId} has no metadata-approved live activation probe.`,
      });
      summary.partial += 1;
      partialReasons.push(`${shortcut.actionId} has no metadata-approved live activation proof.`);
    }
  }

  if (probeStatus === 'not-run') {
    summary.reason = 'Live activation probes were not run.';
    partialReasons.push(summary.reason);
    return summary;
  }

  for (const row of probeRows) {
    const isExpected = expectedActions.has(row.actionId);
    if (row.status === 'fail') {
      summary.failed += 1;
      failures.push({
        actionId: row.actionId,
        ...probeFailureContext(row.actionId, report),
        reason: safeString(row.reason) || 'Live activation probe failed.',
      });
    } else if (isExpected && row.status === 'pass') {
      summary.passed += 1;
    } else if (row.status === 'manual' || row.status === 'not-applicable') {
      const shortcut = report.shortcutRows.find((item) => item.actionId === row.actionId);
      if (!isExpected && ['manual-only', 'not-applicable'].includes(shortcut?.validationMode)) {
        summary.outOfScope += 1;
      } else {
        summary.partial += 1;
        partialReasons.push(
          `Live activation for ${row.actionId} is not covered by the expected safe probe.`,
        );
      }
    } else if (row.status !== 'pass') {
      summary.partial += 1;
      partialReasons.push(
        `Live activation for ${row.actionId} is incomplete (${row.status}${row.reason ? `: ${row.reason}` : ''}).`,
      );
    }
  }

  for (const actionId of expectedActions) {
    if (!rowsByAction.has(actionId)) {
      summary.partial += 1;
      partialReasons.push(`Live activation proof is missing for ${actionId}.`);
    }
  }

  if (declaredSummary.failed > summary.failed) {
    summary.failed = declaredSummary.failed;
    failures.push({
      reason: `${declaredSummary.failed} live activation probe(s) failed in the run summary.`,
    });
  }
  const environmentalIssues = Math.max(
    declaredSummary.environmentFailed,
    probeRows.filter((row) => row.status === 'environment-fail').length,
  );
  if (environmentalIssues > 0) {
    summary.partial = Math.max(summary.partial, environmentalIssues);
    partialReasons.push(
      `${environmentalIssues} live activation probe(s) were blocked by environment setup.`,
    );
  }
  if (
    declaredSummary.skipped > 0 ||
    declaredSummary.notLiveProbed > 0 ||
    declaredSummary.coverageGaps > 0
  ) {
    summary.partial = Math.max(
      summary.partial,
      declaredSummary.skipped,
      declaredSummary.notLiveProbed,
      declaredSummary.coverageGaps,
    );
    partialReasons.push(
      'Some live activation or fixed-contract coverage was skipped or incomplete.',
    );
  }
  if (fixedPassed < fixedTotal) {
    summary.partial = Math.max(summary.partial, fixedTotal - fixedPassed);
    partialReasons.push(
      `${fixedTotal - fixedPassed} fixed keyboard contract(s) lack passing proof.`,
    );
  }
  if (probeStatus === 'failed') {
    summary.partial += 1;
    partialReasons.push('The live activation probe run did not complete cleanly.');
  }
  if (summary.passed < summary.executable && summary.failed === 0 && summary.partial === 0) {
    summary.partial += 1;
    partialReasons.push('The live activation probe set is incomplete.');
  }

  if (summary.failed > 0) summary.status = 'failed';
  else if (summary.partial > 0) summary.status = 'partial';
  summary.reason =
    summary.status === 'passed'
      ? summary.executable === 0
        ? 'No executable live probes are in scope; manual-only and not-applicable actions remain outside automated activation proof.'
        : `All ${summary.passed} metadata-approved live activation probes passed.`
      : summary.status === 'failed'
        ? `${summary.failed} live activation probe(s) failed.`
        : 'Live activation evidence is incomplete.';
  return summary;
}

export function classifyCurrentPageValidation(report, options = {}) {
  const checkedAtTimestamp = parseTimestamp(options.completedAt);
  const result = {
    status: 'unverified',
    reason: '',
    checkedAt: checkedAtTimestamp === null ? null : new Date(checkedAtTimestamp).toISOString(),
    pageUrl: safeString(report?.runManifest?.pageInfo?.url),
    cdpEndpoint: safeString(options.cdpEndpoint),
    profileDirectory: safeString(options.profileDirectory),
    failures: [],
    scopeLimitations: [],
    targetSummary: {
      status: 'unverified',
      total: 0,
      passed: 0,
      failed: 0,
      partial: 0,
      outOfScope: 0,
      reason: 'Target evidence was not verified.',
    },
    probeSummary: {
      status: 'unverified',
      total: 0,
      executable: 0,
      passed: 0,
      failed: 0,
      partial: 0,
      outOfScope: 0,
      reason: 'Live activation evidence was not verified.',
    },
  };

  const invalidReason = invalidEvidenceReason(report, options);
  if (invalidReason) {
    result.reason = invalidReason;
    return result;
  }

  result.scopeLimitations.push({
    reason:
      'The report confirms the expected ChatGPT fixture page loaded, but does not attest account identity or sign-in status.',
  });
  const partialReasons = [];
  result.targetSummary = summarizeTargets(
    report,
    partialReasons,
    result.failures,
    result.scopeLimitations,
  );
  result.probeSummary = summarizeProbes(
    report,
    partialReasons,
    result.failures,
    result.scopeLimitations,
  );

  if (report.inventoryIssues.length > 0) {
    for (const issue of report.inventoryIssues) {
      result.failures.push({
        ...(typeof issue.actionId === 'string' ? { actionId: issue.actionId } : {}),
        ...(typeof issue.targetId === 'string' ? { targetId: issue.targetId } : {}),
        reason:
          safeString(issue.message) || safeString(issue.type) || 'Shortcut inventory guard failed.',
      });
    }
  }
  if (report.missingArtifacts.length > 0) {
    partialReasons.push(
      `${report.missingArtifacts.length} scrape artifact(s) are missing or failed.`,
    );
  }
  if (report.missingExpectedFiles.length > 0) {
    partialReasons.push(`${report.missingExpectedFiles.length} expected dump file(s) are missing.`);
  }
  const failedArtifacts = report.runManifest.artifacts.filter(
    (artifact) => artifact.status === 'failed',
  );
  const deferredArtifacts = report.runManifest.artifacts.filter(
    (artifact) => artifact.status === 'deferred',
  );
  if (report.runManifest.failedCount > failedArtifacts.length || failedArtifacts.length > 0) {
    partialReasons.push('The capture manifest records failed scrape artifacts.');
  }
  if (report.runManifest.deferredCount > deferredArtifacts.length || deferredArtifacts.length > 0) {
    partialReasons.push('The capture manifest records deferred scrape artifacts.');
  }
  for (const shortcut of report.shortcutRows) {
    if (shortcut.status === 'partial') {
      partialReasons.push(`Shortcut ${shortcut.actionId} has partial target coverage.`);
    } else if (shortcut.status === 'fail') {
      const targetId = shortcut.targetIds?.[0];
      const target = report.targetRows.find((row) => row.targetId === targetId);
      if (shortcutFailureIsOnlyMissingCapture(shortcut, report.targetRows)) {
        partialReasons.push(`Shortcut ${shortcut.actionId} is missing expected dump files.`);
      } else {
        result.failures.push({
          actionId: shortcut.actionId,
          ...(targetId ? { targetId } : {}),
          ...(target?.identifier || target?.canonicalIdentifier
            ? { identifier: target.identifier || target.canonicalIdentifier }
            : {}),
          reason: safeString(shortcut.statusReason) || 'Shortcut inventory validation failed.',
        });
      }
    } else if (shortcut.status === 'manual') {
      result.scopeLimitations.push({
        reason: `${shortcut.actionId} is classified manual and has no automated live activation proof.`,
      });
    } else if (shortcut.status === 'not-applicable') {
      result.scopeLimitations.push({
        reason: `${shortcut.actionId} is classified not applicable to automated validation.`,
      });
    }
  }

  for (const reason of unique(partialReasons)) {
    if (!result.scopeLimitations.some((limitation) => limitation.reason === reason)) {
      result.scopeLimitations.push({ reason });
    }
  }

  if (result.failures.length > 0) {
    result.status = 'failed';
    result.reason = `${result.failures.length} current-page validation check(s) failed.`;
  } else if (
    partialReasons.length > 0 ||
    result.targetSummary.status !== 'passed' ||
    result.probeSummary.status !== 'passed'
  ) {
    result.status = 'partial';
    result.reason =
      unique(partialReasons)[0] ||
      (result.targetSummary.status !== 'passed'
        ? result.targetSummary.reason
        : result.probeSummary.reason);
  } else {
    result.status = 'passed';
    result.reason = 'Fresh in-scope target-presence and live activation checks passed.';
  }

  return result;
}
