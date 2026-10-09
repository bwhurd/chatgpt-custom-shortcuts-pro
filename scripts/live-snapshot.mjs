import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { classifyCurrentPageValidation } from '../tests/playwright/lib/current-page-validation.mjs';
import {
  buildCheckReport,
  buildCurrentShortcutInventory,
  loadDevScrapeWideContract,
} from '../tests/playwright/lib/devscrape-wide-core.mjs';
import {
  assertCapabilities,
  unknownCapabilities,
} from '../tests/playwright/lib/shortcut-capabilities.mjs';
import {
  evaluateTargetPresence,
  targetMatchesText,
  targetMatchesTokens,
} from '../tests/playwright/lib/shortcut-target-presence.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
export const SNAPSHOT_SCHEMA_VERSION = 2;
const LEGACY_SNAPSHOT_SCHEMA_VERSION = 1;
export const SNAPSHOT_KIND = 'captured-token-evidence';
export const SNAPSHOT_ORIGIN = 'https://chatgpt.com';
export const MAX_SNAPSHOT_STATES = 64;
export const MAX_SNAPSHOT_BYTES = 256 * 1024;
export const MAX_TOKENS_PER_STATE = 1024;
export const MAX_TOKEN_LENGTH = 512;
export const MAX_CAPTURE_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_CAPTURE_TOTAL_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_INVOCATION_AGE_MS = 24 * 60 * 60 * 1000;
export const SOURCE_FINGERPRINT_PATHS = Object.freeze([
  'extension/_locales/en/messages.json',
  'extension/composer-layout-bootstrap.js',
  'extension/composer-layout.css',
  'extension/content.js',
  'extension/lib/DevScrapeWide.js',
  'extension/manifest.json',
  'extension/options-storage.js',
  'extension/settings-schema.js',
  'extension/shared/model-picker-labels.js',
  'extension/shared/model-picker-selectors.js',
  'extension/shared/shortcut-action-metadata.js',
  'package-lock.json',
  'package.json',
  'scripts/check-live-chrome-profile.ps1',
  'scripts/live-snapshot.mjs',
  'scripts/run-current-page-check.mjs',
  'tests/playwright/devscrape-wide.mjs',
  'tests/playwright/lib/current-page-validation.mjs',
  'tests/playwright/lib/devscrape-wide-core.mjs',
  'tests/playwright/lib/shortcut-audit-artifacts.mjs',
  'tests/playwright/lib/shortcut-capabilities.mjs',
  'tests/playwright/lib/shortcut-fast-visual-report.mjs',
  'tests/playwright/lib/shortcut-target-inventory.mjs',
  'tests/playwright/lib/shortcut-target-presence.mjs',
]);

const RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'invocationId',
  'startedAt',
  'completedAt',
  'sourceFingerprint',
  'runFolder',
  'captureExitCode',
  'probeShortcuts',
  'validationReport',
  'currentPageValidation',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'origin',
  'capturedAt',
  'sourceFingerprint',
  'capabilities',
  'coverageStatus',
  'states',
]);
const LEGACY_SNAPSHOT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'origin',
  'capturedAt',
  'sourceFingerprint',
  'coverageStatus',
  'states',
]);
const STATE_KEYS = Object.freeze(['stateId', 'filename', 'status', 'tokens']);
const VALID_STATE_STATUSES = new Set(['captured', 'missing', 'deferred']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const CAPTURE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,254}\.txt$/;
const CHATGPT_CONVERSATION_URL_PATTERN = /^https:\/\/chatgpt\.com\/c\/[^/?#]+$/;
const SAFE_ERROR_MESSAGES = Object.freeze({
  ALIAS_INCOMPLETE: 'The registered alias captures are incomplete.',
  ALIAS_INVALID: 'The live snapshot alias evidence is inconsistent.',
  CONTRACT_INVALID: 'The current source inventory is invalid.',
  EVALUATOR_PARITY: 'The live snapshot does not preserve target evaluator parity.',
  EVIDENCE_INCOMPLETE: 'Required current-page evidence is incomplete.',
  EVIDENCE_INVALID: 'The exact current-page evidence is unavailable or inconsistent.',
  EVIDENCE_STALE: 'The exact current-page evidence is stale.',
  EVIDENCE_TOO_LARGE: 'The current-page evidence exceeds a supported size limit.',
  EVIDENCE_UNAVAILABLE: 'The current-page capture is unavailable.',
  OBSERVED_FAILURE: 'The current-page evidence contains an observed validation failure.',
  OUTPUT_PATH_INVALID: 'The candidate path is not the owned ignored candidate path.',
  PATH_INVALID: 'A current-page evidence path is unsafe or unavailable.',
  SCHEMA_INVALID: 'The live snapshot does not match the supported safe schema.',
  SNAPSHOT_READ: 'The requested snapshot cannot be read safely.',
  SOURCE_MISMATCH: 'Source changed after the current-page capture.',
  SOURCE_UNAVAILABLE: 'A required current-page snapshot source file is unavailable.',
  TOKEN_INVALID: 'The live snapshot contains forbidden or noncanonical token evidence.',
});

function publicErrorMessage(error, fallback) {
  return SAFE_ERROR_MESSAGES[error?.code] || fallback;
}

function samePath(left, right) {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isCanonicalAbsolutePath(value) {
  return typeof value === 'string' && path.isAbsolute(value) && path.normalize(value) === value;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actualKeys.length === expected.length &&
    actualKeys.every((key, index) => key === expected[index])
  );
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalIsoTimestamp(value) {
  const parsed = parseTimestamp(value);
  return parsed !== null && new Date(parsed).toISOString() === value;
}

function normalizeLf(source) {
  return String(source).replace(/\r\n?/g, '\n');
}

function safeRecordError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function computeSourceFingerprint({ root = REPOSITORY_ROOT } = {}) {
  const rootPath = path.resolve(root);
  const hash = createHash('sha256');
  hash.update('current-page-live-snapshot-source-v1\n', 'utf8');
  for (const relativePath of [...SOURCE_FINGERPRINT_PATHS].sort()) {
    const absolutePath = path.join(rootPath, ...relativePath.split('/'));
    let source;
    try {
      source = await readFile(absolutePath, 'utf8');
    } catch {
      throw safeRecordError(
        'SOURCE_UNAVAILABLE',
        'A required current-page snapshot source file is unavailable.',
      );
    }
    hash.update(relativePath, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(normalizeLf(source), 'utf8');
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}

export async function loadCurrentContract() {
  const { exports } = await loadDevScrapeWideContract();
  const registry = [...(exports.DUMP_REGISTRY || []), ...(exports.DEFERRED_ARTIFACTS || [])];
  const inventory = await buildCurrentShortcutInventory(registry);
  return { registry, inventory };
}

function assertRegistry(registry) {
  if (!Array.isArray(registry) || registry.length === 0 || registry.length > MAX_SNAPSHOT_STATES) {
    throw safeRecordError('CONTRACT_INVALID', 'The current registered state inventory is invalid.');
  }
  const stateIds = new Set();
  const filenames = new Set();
  for (const entry of registry) {
    if (
      !isRecord(entry) ||
      !STATE_ID_PATTERN.test(entry.stateId || '') ||
      !CAPTURE_FILENAME_PATTERN.test(entry.filename || '') ||
      entry.filename.includes('..') ||
      entry.filename.includes('/') ||
      entry.filename.includes('\\') ||
      stateIds.has(entry.stateId) ||
      filenames.has(entry.filename)
    ) {
      throw safeRecordError(
        'CONTRACT_INVALID',
        'The current registered state inventory is invalid.',
      );
    }
    stateIds.add(entry.stateId);
    filenames.add(entry.filename);
  }
  const byFilename = new Map(registry.map((entry) => [entry.filename, entry]));
  for (const entry of registry) {
    if (entry.aliasOf && !byFilename.has(entry.aliasOf)) {
      throw safeRecordError('CONTRACT_INVALID', 'A registered alias has no canonical source.');
    }
    const visited = new Set([entry.filename]);
    let cursor = entry;
    while (cursor.aliasOf) {
      if (visited.has(cursor.aliasOf)) {
        throw safeRecordError('CONTRACT_INVALID', 'The registered alias graph contains a cycle.');
      }
      visited.add(cursor.aliasOf);
      cursor = byFilename.get(cursor.aliasOf);
    }
  }
  return { stateIds, filenames, byFilename };
}

function flattenMatchGroups(target) {
  const groups = Array.isArray(target?.matchGroups) ? target.matchGroups : [];
  const tokens = [];
  for (const group of groups) {
    const needles = Array.isArray(group) ? group : [group];
    for (const needle of needles) {
      if (typeof needle === 'string' && needle.length > 0) tokens.push(needle);
    }
  }
  return [...new Set(tokens)];
}

function buildAllowedTokensByFilename(registry, inventory) {
  assertRegistry(registry);
  if (!isRecord(inventory) || !Array.isArray(inventory.targets)) {
    throw safeRecordError('CONTRACT_INVALID', 'The current target inventory is invalid.');
  }
  const registeredFiles = new Set(registry.map((entry) => entry.filename));
  const allAllowedTokens = new Set();
  for (const target of inventory.targets) {
    if (!isRecord(target)) {
      throw safeRecordError('CONTRACT_INVALID', 'The current target inventory is invalid.');
    }
    const expectedFiles = Array.isArray(target.expectedFiles) ? target.expectedFiles : [];
    const tokens = flattenMatchGroups(target);
    for (const filename of expectedFiles) {
      if (!registeredFiles.has(filename)) {
        throw safeRecordError(
          'CONTRACT_INVALID',
          'The current target inventory references an unknown file.',
        );
      }
      for (const token of tokens) allAllowedTokens.add(token);
    }
  }

  // Each captured state must retain all safe code-owned needles it matched. This preserves the
  // original evaluator's allMatchedFiles result for matches outside a target's expected files.
  return new Map(registry.map((entry) => [entry.filename, new Set(allAllowedTokens)]));
}

function safeTokenShape(token) {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    token.includes('\0') ||
    token.includes('\r') ||
    token.includes('\n') ||
    token !== token.trim()
  ) {
    return false;
  }
  if (
    /https?:\/\//i.test(token) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(token) ||
    /(?:[A-Za-z]:\\|\\\\|\/(?:Users|home|private|var|tmp)\/)/.test(token) ||
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(token)
  ) {
    return false;
  }
  return true;
}

function canonicalTokenList(values) {
  return [...new Set(values)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function hasAliasTokenParity(registry, statesByFilename) {
  for (const entry of registry) {
    if (!entry.aliasOf) continue;
    const alias = statesByFilename.get(entry.filename);
    const source = statesByFilename.get(entry.aliasOf);
    if (!alias || !source || alias.status !== 'captured' || source.status !== 'captured')
      return false;
    if (alias.tokens.length !== source.tokens.length) return false;
    if (alias.tokens.some((token, index) => token !== source.tokens[index])) return false;
  }
  return true;
}

function isOutOfScopeTarget(target, inventory) {
  const shortcutsList = Array.isArray(inventory.shortcuts) ? inventory.shortcuts : [];
  const declaredActionIds = Array.isArray(target.usedByActionIds) ? target.usedByActionIds : [];
  const referencedActionIds = shortcutsList
    .filter((shortcut) => {
      const targetIds = [
        ...(Array.isArray(shortcut.targetIds) ? shortcut.targetIds : []),
        ...(Array.isArray(shortcut.targetRefs) ? shortcut.targetRefs : []),
      ];
      return targetIds.includes(target.targetId);
    })
    .map((shortcut) => shortcut.actionId);
  const actionIds = [...new Set([...declaredActionIds, ...referencedActionIds])];
  if (actionIds.length === 0) return false;
  const shortcuts = new Map(shortcutsList.map((shortcut) => [shortcut.actionId, shortcut]));
  return actionIds.every((actionId) => {
    const shortcut = shortcuts.get(actionId);
    return shortcut && ['manual-only', 'not-applicable'].includes(shortcut.validationMode);
  });
}

function calculateCoverageStatus(
  _registry,
  inventory,
  states,
  capabilities = unknownCapabilities(),
) {
  const files = Object.fromEntries(
    states
      .filter((state) => state.status === 'captured')
      .map((state) => [state.filename, new Set(state.tokens)]),
  );
  for (const target of inventory.targets) {
    const result = evaluateTargetPresence(target, files, {
      matches: (candidate, values) => targetMatchesTokens(candidate, values),
      capabilities,
    });
    if (result.status === 'not-applicable') continue;
    if (result.status === 'no-scrape-coverage' && isOutOfScopeTarget(target, inventory)) continue;
    if (result.status === 'no-scrape-coverage') return 'incomplete';
    if (result.missingExpectedFiles.length > 0) return 'incomplete';
    if (result.status === 'fail' && result.expectedFiles.length === 0) return 'incomplete';
    if (target.unknownUiStateRefs?.length || target.missingMatchGroups) return 'incomplete';
  }
  return 'complete';
}

function validateAliasCaptureParity(registry, states) {
  const statesByFilename = new Map(states.map((state) => [state.filename, state]));
  return hasAliasTokenParity(registry, statesByFilename);
}

export function projectCaptureEvidence({
  registry,
  inventory,
  files,
  captureStatuses = {},
  capturedAt,
  sourceFingerprint,
  capabilities = unknownCapabilities(),
}) {
  assertRegistry(registry);
  let safeCapabilities;
  try {
    safeCapabilities = assertCapabilities(capabilities);
  } catch {
    throw safeRecordError('EVIDENCE_INVALID', 'Fresh capability evidence is missing or invalid.');
  }
  if (
    !isRecord(files) ||
    !canonicalIsoTimestamp(capturedAt) ||
    !SHA256_PATTERN.test(sourceFingerprint || '')
  ) {
    throw safeRecordError('EVIDENCE_INVALID', 'Fresh capture evidence is incomplete.');
  }
  const allowedTokensByFilename = buildAllowedTokensByFilename(registry, inventory);
  const states = registry.map((entry) => {
    const rawText = files[entry.filename];
    const requestedStatus = captureStatuses[entry.filename];
    let status = VALID_STATE_STATUSES.has(requestedStatus) ? requestedStatus : '';
    if (!status)
      status =
        typeof rawText === 'string'
          ? 'captured'
          : entry.status === 'deferred'
            ? 'deferred'
            : 'missing';
    if (status !== 'captured' || typeof rawText !== 'string') {
      return {
        stateId: entry.stateId,
        filename: entry.filename,
        status: status === 'deferred' ? 'deferred' : 'missing',
        tokens: [],
      };
    }
    const observed = [];
    for (const token of allowedTokensByFilename.get(entry.filename)) {
      if (!safeTokenShape(token)) {
        throw safeRecordError('TOKEN_INVALID', 'A code-owned target token is not safe to publish.');
      }
      if (rawText.includes(token)) observed.push(token);
    }
    const tokens = canonicalTokenList(observed);
    if (tokens.length > MAX_TOKENS_PER_STATE) {
      throw safeRecordError('EVIDENCE_TOO_LARGE', 'A capture state exceeds the token-count limit.');
    }
    return { stateId: entry.stateId, filename: entry.filename, status: 'captured', tokens };
  });

  if (!validateAliasCaptureParity(registry, states)) {
    throw safeRecordError(
      'ALIAS_INCOMPLETE',
      'Registered alias captures do not contain matching evidence.',
    );
  }
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: SNAPSHOT_KIND,
    origin: SNAPSHOT_ORIGIN,
    capturedAt,
    sourceFingerprint,
    capabilities: safeCapabilities,
    coverageStatus: calculateCoverageStatus(registry, inventory, states, safeCapabilities),
    states,
  };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw safeRecordError('EVIDENCE_TOO_LARGE', 'The projected snapshot exceeds the size limit.');
  }
  return snapshot;
}

function genericSnapshotSchemaError() {
  return safeRecordError(
    'SCHEMA_INVALID',
    'The live snapshot does not match the supported safe schema.',
  );
}

function validateSnapshotStructure(snapshot) {
  const snapshotSchemaVersion = snapshot?.schemaVersion;
  const schemaKeys =
    snapshotSchemaVersion === LEGACY_SNAPSHOT_SCHEMA_VERSION
      ? LEGACY_SNAPSHOT_KEYS
      : snapshotSchemaVersion === SNAPSHOT_SCHEMA_VERSION
        ? SNAPSHOT_KEYS
        : null;
  if (
    !schemaKeys ||
    !hasExactKeys(snapshot, schemaKeys) ||
    snapshot.kind !== SNAPSHOT_KIND ||
    snapshot.origin !== SNAPSHOT_ORIGIN ||
    !canonicalIsoTimestamp(snapshot.capturedAt) ||
    !SHA256_PATTERN.test(snapshot.sourceFingerprint || '') ||
    !['complete', 'incomplete'].includes(snapshot.coverageStatus) ||
    !Array.isArray(snapshot.states) ||
    snapshot.states.length === 0 ||
    snapshot.states.length > MAX_SNAPSHOT_STATES
  ) {
    throw genericSnapshotSchemaError();
  }
  if (snapshotSchemaVersion === SNAPSHOT_SCHEMA_VERSION) {
    try {
      assertCapabilities(snapshot.capabilities);
    } catch {
      throw genericSnapshotSchemaError();
    }
  }
  const stateIds = new Set();
  const filenames = new Set();
  let totalTokens = 0;
  for (const state of snapshot.states) {
    if (
      !hasExactKeys(state, STATE_KEYS) ||
      !STATE_ID_PATTERN.test(state.stateId || '') ||
      !CAPTURE_FILENAME_PATTERN.test(state.filename || '') ||
      state.filename.includes('..') ||
      state.filename.includes('/') ||
      state.filename.includes('\\') ||
      !VALID_STATE_STATUSES.has(state.status) ||
      !Array.isArray(state.tokens) ||
      state.tokens.length > MAX_TOKENS_PER_STATE ||
      stateIds.has(state.stateId) ||
      filenames.has(state.filename)
    ) {
      throw genericSnapshotSchemaError();
    }
    stateIds.add(state.stateId);
    filenames.add(state.filename);
    if (state.status !== 'captured' && state.tokens.length !== 0) {
      throw genericSnapshotSchemaError();
    }
    let previous = '';
    const tokenSet = new Set();
    for (const token of state.tokens) {
      if (!safeTokenShape(token) || tokenSet.has(token) || (previous && previous >= token)) {
        throw safeRecordError(
          'TOKEN_INVALID',
          'The live snapshot contains forbidden or noncanonical token evidence.',
        );
      }
      previous = token;
      tokenSet.add(token);
      totalTokens += 1;
    }
  }
  if (totalTokens > MAX_SNAPSHOT_STATES * MAX_TOKENS_PER_STATE) {
    throw genericSnapshotSchemaError();
  }
  return snapshotSchemaVersion;
}

function validateRegistryAlignment(snapshot, registry) {
  assertRegistry(registry);
  if (snapshot.states.length !== registry.length) {
    throw genericSnapshotSchemaError();
  }
  const snapshotById = new Map(snapshot.states.map((state) => [state.stateId, state]));
  for (const entry of registry) {
    const state = snapshotById.get(entry.stateId);
    if (!state || state.filename !== entry.filename) throw genericSnapshotSchemaError();
  }
}

function allowedTokenSetByFilename(registry, inventory) {
  return buildAllowedTokensByFilename(registry, inventory);
}

function validateCurrentTokens(snapshot, registry, inventory) {
  const allowed = allowedTokenSetByFilename(registry, inventory);
  const statesByFilename = new Map(snapshot.states.map((state) => [state.filename, state]));
  for (const state of snapshot.states) {
    const allowedForFile = allowed.get(state.filename);
    if (!allowedForFile || state.tokens.some((token) => !allowedForFile.has(token))) {
      throw safeRecordError(
        'TOKEN_INVALID',
        'The live snapshot contains a token not owned by current source.',
      );
    }
    const tokenSet = new Set(state.tokens);
    for (const observed of tokenSet) {
      for (const allowedToken of allowedForFile) {
        if (observed.includes(allowedToken) && !tokenSet.has(allowedToken)) {
          throw safeRecordError(
            'EVALUATOR_PARITY',
            'The live snapshot omits a required substring token.',
          );
        }
      }
    }
  }
  if (!hasAliasTokenParity(registry, statesByFilename)) {
    throw safeRecordError('ALIAS_INVALID', 'The live snapshot alias evidence is inconsistent.');
  }
}

function buildSyntheticParityCases() {
  return [
    {
      target: { matchGroups: [['__alpha__', '__beta__'], ['__gamma__']] },
      sourceStrings: ['__alpha__', '__beta__', '__gamma__'],
    },
    {
      target: { matchGroups: [['__first__'], ['__second__', '__third__']] },
      sourceStrings: ['__first__', '__second__', '__third__'],
    },
  ];
}

export function assertTargetEvaluatorParity() {
  for (const { target, sourceStrings } of buildSyntheticParityCases()) {
    const count = 2 ** sourceStrings.length;
    for (let mask = 0; mask < count; mask += 1) {
      const values = new Set(sourceStrings.filter((_, index) => (mask & (1 << index)) !== 0));
      const sourceText = [...values].join('\u0000');
      if (targetMatchesText(target, sourceText) !== targetMatchesTokens(target, values)) {
        throw safeRecordError('EVALUATOR_PARITY', 'The target presence evaluators disagree.');
      }
    }
  }
  return true;
}

export function replaySnapshot(
  snapshot,
  { registry, inventory, sourceFingerprint, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {},
) {
  const snapshotSchemaVersion = validateSnapshotStructure(snapshot);
  if (snapshotSchemaVersion === LEGACY_SNAPSHOT_SCHEMA_VERSION) {
    return {
      status: 'unverified',
      exitCode: 0,
      warnings: ['snapshot-schema-outdated'],
      driftTargets: [],
      coverageStatus: snapshot.coverageStatus,
      capturedAt: snapshot.capturedAt,
      replayed: false,
    };
  }
  assertTargetEvaluatorParity();
  const age = now - Date.parse(snapshot.capturedAt);
  const warnings = [];
  const fingerprintMatches = snapshot.sourceFingerprint === sourceFingerprint;
  if (age < 0) warnings.push('capture-time-in-future');
  else if (age > maxAgeMs) warnings.push('capture-stale');
  if (!fingerprintMatches) warnings.push('source-fingerprint-mismatch');
  if (snapshot.coverageStatus !== 'complete') warnings.push('coverage-incomplete');

  if (!fingerprintMatches) {
    return {
      status: 'unverified',
      exitCode: 0,
      warnings,
      driftTargets: [],
      coverageStatus: snapshot.coverageStatus,
      capturedAt: snapshot.capturedAt,
      replayed: false,
    };
  }

  validateRegistryAlignment(snapshot, registry);
  validateCurrentTokens(snapshot, registry, inventory);
  const files = Object.fromEntries(
    snapshot.states
      .filter((state) => state.status === 'captured')
      .map((state) => [state.filename, new Set(state.tokens)]),
  );
  const targetResults = inventory.targets.map((target) => {
    const presence = evaluateTargetPresence(target, files, {
      matches: (candidate, tokens) => targetMatchesTokens(candidate, tokens),
      capabilities: snapshot.capabilities,
    });
    return {
      targetId: target.targetId,
      ...presence,
      missingExpectedFiles:
        presence.status === 'not-applicable' ? [] : presence.missingExpectedFiles,
    };
  });
  const computedCoverage = calculateCoverageStatus(
    registry,
    inventory,
    snapshot.states,
    snapshot.capabilities,
  );
  if (snapshot.coverageStatus !== computedCoverage) {
    throw safeRecordError('SCHEMA_INVALID', 'The live snapshot coverage status is inconsistent.');
  }
  const driftTargets = targetResults
    .filter((result) => result.status === 'fail')
    .map((result) => ({
      targetId: result.targetId,
      kind: result.missingExpectedFiles.length > 0 ? 'missing-evidence' : 'target-not-found',
    }));
  const incomplete = snapshot.coverageStatus !== 'complete' || warnings.length > 0;
  return {
    status: incomplete ? 'unverified' : driftTargets.length ? 'drift' : 'verified',
    exitCode: 0,
    warnings,
    driftTargets,
    coverageStatus: snapshot.coverageStatus,
    capturedAt: snapshot.capturedAt,
    replayed: true,
    targetResults,
  };
}

function ignoredCandidatePath(root, outputPath) {
  const expectedDirectory = path.resolve(root, 'test-results', 'live-snapshot');
  const candidate = path.resolve(outputPath || path.join(expectedDirectory, 'candidate.json'));
  if (
    path.dirname(candidate) !== expectedDirectory ||
    path.basename(candidate) !== 'candidate.json'
  ) {
    throw safeRecordError(
      'OUTPUT_PATH_INVALID',
      'Candidate output must be the ignored candidate.json file.',
    );
  }
  return { expectedDirectory, candidate };
}

async function ensureSafeDirectory(root, target, { create = false, allowRoot = false } = {}) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  let rootInfo;
  try {
    rootInfo = await lstat(rootPath);
  } catch {
    throw safeRecordError('PATH_INVALID', 'A required local evidence directory is unavailable.');
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw safeRecordError('PATH_INVALID', 'A required local evidence directory is unsafe.');
  }
  const rootReal = await realpath(rootPath).catch(() => null);
  if (!rootReal || !samePath(rootReal, rootPath)) {
    throw safeRecordError('PATH_INVALID', 'A required local evidence directory is unsafe.');
  }
  const relative = path.relative(rootPath, targetPath);
  if (
    (!allowRoot && relative === '') ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw safeRecordError('PATH_INVALID', 'A local evidence path escaped its expected directory.');
  }
  if (relative === '') return rootPath;

  let current = rootPath;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if (error.code !== 'ENOENT' || !create) {
        throw safeRecordError(
          'PATH_INVALID',
          'A required local evidence directory is unavailable.',
        );
      }
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') {
          throw safeRecordError(
            'PATH_INVALID',
            'A required local evidence directory is unavailable.',
          );
        }
      }
      entry = await lstat(current).catch(() => null);
    }
    if (!entry || !entry.isDirectory() || entry.isSymbolicLink()) {
      throw safeRecordError('PATH_INVALID', 'A local evidence directory cannot contain a symlink.');
    }
    const resolved = await realpath(current).catch(() => null);
    if (!resolved || !samePath(resolved, current)) {
      throw safeRecordError('PATH_INVALID', 'A local evidence directory cannot contain a symlink.');
    }
  }
  return targetPath;
}

async function ensureSafeRegularFile(parentDirectory, filename, { allowMissing = false } = {}) {
  const parentPath = path.resolve(parentDirectory);
  const filePath = path.resolve(filename);
  if (!samePath(path.dirname(filePath), parentPath)) {
    throw safeRecordError(
      'PATH_INVALID',
      'A local evidence file is outside its expected directory.',
    );
  }
  const parentInfo = await lstat(parentPath).catch(() => null);
  const parentReal = await realpath(parentPath).catch(() => null);
  if (
    !parentInfo?.isDirectory() ||
    parentInfo.isSymbolicLink() ||
    !parentReal ||
    !samePath(parentReal, parentPath)
  ) {
    throw safeRecordError('PATH_INVALID', 'A local evidence file is outside a safe directory.');
  }
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw safeRecordError('PATH_INVALID', 'A required local evidence file is unavailable.');
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw safeRecordError('PATH_INVALID', 'A local evidence file cannot be a symlink.');
  }
  const fileReal = await realpath(filePath).catch(() => null);
  if (!fileReal || !samePath(fileReal, filePath) || !samePath(path.dirname(fileReal), parentReal)) {
    throw safeRecordError(
      'PATH_INVALID',
      'A local evidence file is outside its expected directory.',
    );
  }
  return filePath;
}

async function invalidateCandidate(candidate) {
  try {
    const info = await lstat(candidate);
    if (info.isDirectory()) return;
    await unlink(candidate);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function receiptProblem(receipt) {
  if (
    !hasExactKeys(receipt, RECEIPT_KEYS) ||
    receipt.schemaVersion !== 1 ||
    !UUID_PATTERN.test(receipt.invocationId || '') ||
    !canonicalIsoTimestamp(receipt.startedAt) ||
    !canonicalIsoTimestamp(receipt.completedAt) ||
    Date.parse(receipt.startedAt) > Date.parse(receipt.completedAt) ||
    !SHA256_PATTERN.test(receipt.sourceFingerprint || '') ||
    !isCanonicalAbsolutePath(receipt.runFolder) ||
    (receipt.captureExitCode !== null && !Number.isInteger(receipt.captureExitCode)) ||
    typeof receipt.probeShortcuts !== 'boolean' ||
    !isCanonicalAbsolutePath(receipt.validationReport) ||
    !isRecord(receipt.currentPageValidation)
  ) {
    return 'The local invocation receipt is incomplete or unsupported.';
  }
  return '';
}

function reportCaptureProblem(manifest, runFolder, receipt) {
  const startedAt = Date.parse(receipt.startedAt);
  const completedAt = Date.parse(receipt.completedAt);
  const manifestStartedAt = parseTimestamp(manifest?.startedAt);
  const manifestCompletedAt = parseTimestamp(manifest?.completedAt);
  const fixtureUrl = manifest?.fixtureUrl;
  try {
    assertCapabilities(manifest?.capabilities);
  } catch {
    return 'The exact run folder does not contain fresh capability evidence.';
  }
  if (
    !isRecord(manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.runKind !== 'devscrapewide' ||
    manifest.folderName !== path.basename(runFolder) ||
    !canonicalIsoTimestamp(manifest.startedAt) ||
    !canonicalIsoTimestamp(manifest.completedAt) ||
    manifestStartedAt < startedAt ||
    manifestStartedAt > manifestCompletedAt ||
    manifestCompletedAt > completedAt ||
    !CHATGPT_CONVERSATION_URL_PATTERN.test(fixtureUrl || '') ||
    !isRecord(manifest.pageInfo) ||
    manifest.pageInfo.fixtureOk !== true ||
    manifest.pageInfo.fixtureUrl !== fixtureUrl ||
    manifest.pageInfo.url !== fixtureUrl ||
    !Array.isArray(manifest.artifacts) ||
    !Array.isArray(manifest.writtenFiles)
  ) {
    return 'The exact run folder does not contain fresh registered ChatGPT capture evidence.';
  }
  return '';
}

async function readJsonObject(parentDirectory, filename, genericMessage) {
  const safeFilename = await ensureSafeRegularFile(parentDirectory, filename);
  const info = await lstat(safeFilename);
  if (info.size > MAX_CAPTURE_FILE_BYTES) {
    throw safeRecordError(
      'EVIDENCE_TOO_LARGE',
      'A local evidence JSON file exceeds the read limit.',
    );
  }
  let value;
  try {
    value = JSON.parse(await readFile(safeFilename, 'utf8'));
  } catch {
    throw safeRecordError('EVIDENCE_INVALID', genericMessage);
  }
  if (!isRecord(value)) throw safeRecordError('EVIDENCE_INVALID', genericMessage);
  return value;
}

async function readRegisteredCaptureFiles(runFolder, manifest, registry) {
  const registryInfo = assertRegistry(registry);
  const writtenFiles = new Set();
  for (const filename of manifest.writtenFiles) {
    if (
      typeof filename !== 'string' ||
      !registryInfo.byFilename.has(filename) ||
      writtenFiles.has(filename)
    ) {
      throw safeRecordError(
        'EVIDENCE_INVALID',
        'The capture manifest lists an unregistered or duplicate file.',
      );
    }
    writtenFiles.add(filename);
  }

  const physicalFiles = new Map();
  let totalBytes = 0;
  const entries = await readdir(runFolder, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith('.txt')) continue;
    if (!registryInfo.byFilename.has(entry.name) || !writtenFiles.has(entry.name)) {
      throw safeRecordError(
        'EVIDENCE_INVALID',
        'The exact capture folder contains an unregistered text file.',
      );
    }
    const filePath = path.join(runFolder, entry.name);
    const safeFilePath = await ensureSafeRegularFile(runFolder, filePath);
    const info = await lstat(safeFilePath);
    if (info.size > MAX_CAPTURE_FILE_BYTES) {
      throw safeRecordError('EVIDENCE_TOO_LARGE', 'A capture state exceeds the read limit.');
    }
    totalBytes += info.size;
    if (totalBytes > MAX_CAPTURE_TOTAL_BYTES) {
      throw safeRecordError('EVIDENCE_TOO_LARGE', 'The local capture exceeds the read limit.');
    }
    physicalFiles.set(entry.name, safeFilePath);
  }

  const liveProbePath = path.join(runFolder, 'live-probes.json');
  const safeLiveProbePath = await ensureSafeRegularFile(runFolder, liveProbePath, {
    allowMissing: true,
  });
  if (safeLiveProbePath) {
    const info = await lstat(safeLiveProbePath);
    if (info.size > MAX_CAPTURE_FILE_BYTES) {
      throw safeRecordError('EVIDENCE_TOO_LARGE', 'The local probe report exceeds the read limit.');
    }
    totalBytes += info.size;
    if (totalBytes > MAX_CAPTURE_TOTAL_BYTES) {
      throw safeRecordError('EVIDENCE_TOO_LARGE', 'The local capture exceeds the read limit.');
    }
  }

  const manifestByState = new Map();
  for (const artifact of manifest.artifacts) {
    if (
      !isRecord(artifact) ||
      typeof artifact.stateId !== 'string' ||
      typeof artifact.filename !== 'string' ||
      !['captured', 'alias', 'failed', 'deferred'].includes(artifact.status) ||
      manifestByState.has(artifact.stateId)
    ) {
      throw safeRecordError(
        'EVIDENCE_INVALID',
        'The capture manifest contains invalid state evidence.',
      );
    }
    const registered = registryInfo.byFilename.get(artifact.filename);
    if (!registered || registered.stateId !== artifact.stateId) {
      throw safeRecordError(
        'EVIDENCE_INVALID',
        'The capture manifest does not match current registered states.',
      );
    }
    manifestByState.set(artifact.stateId, artifact);
  }
  const expectedWrittenFiles = new Set(
    [...manifestByState.values()]
      .filter((artifact) => artifact.status === 'captured' || artifact.status === 'alias')
      .map((artifact) => artifact.filename),
  );
  if (
    expectedWrittenFiles.size !== writtenFiles.size ||
    [...expectedWrittenFiles].some((filename) => !writtenFiles.has(filename))
  ) {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The capture manifest file list disagrees with its registered states.',
    );
  }

  const files = {};
  const captureStatuses = {};
  for (const entry of registry) {
    const artifact = manifestByState.get(entry.stateId);
    if (!artifact || artifact.filename !== entry.filename) {
      captureStatuses[entry.filename] = entry.status === 'deferred' ? 'deferred' : 'missing';
      continue;
    }
    if (artifact.status === 'deferred' || entry.status === 'deferred') {
      if (physicalFiles.has(entry.filename)) {
        throw safeRecordError(
          'EVIDENCE_INVALID',
          'The capture folder contains a file for an uncaptured state.',
        );
      }
      captureStatuses[entry.filename] = 'deferred';
      continue;
    }
    if (artifact.status !== 'captured' && artifact.status !== 'alias') {
      if (physicalFiles.has(entry.filename)) {
        throw safeRecordError(
          'EVIDENCE_INVALID',
          'The capture folder contains a file for an uncaptured state.',
        );
      }
      captureStatuses[entry.filename] = 'missing';
      continue;
    }
    const safeFilePath = physicalFiles.get(entry.filename);
    if (!safeFilePath) {
      captureStatuses[entry.filename] = 'missing';
      continue;
    }
    const content = await readFile(safeFilePath, 'utf8');
    if (content.includes('\0')) {
      captureStatuses[entry.filename] = 'missing';
      continue;
    }
    files[entry.filename] = content;
    captureStatuses[entry.filename] = 'captured';
  }
  return { files, captureStatuses };
}

async function validateReceiptEvidence({ root, receipt, currentFingerprint, now, registry }) {
  const issue = receiptProblem(receipt);
  if (issue) throw safeRecordError('EVIDENCE_INVALID', issue);
  if (receipt.sourceFingerprint !== currentFingerprint) {
    throw safeRecordError('SOURCE_MISMATCH', 'The source changed after the current-page capture.');
  }
  const nowTime = typeof now === 'number' ? now : Date.now();
  if (!Number.isFinite(nowTime)) {
    throw safeRecordError('EVIDENCE_STALE', 'The local current-page capture is stale.');
  }
  const completedAt = Date.parse(receipt.completedAt);
  if (completedAt > nowTime || nowTime - completedAt > MAX_INVOCATION_AGE_MS) {
    throw safeRecordError('EVIDENCE_STALE', 'The local current-page capture is stale.');
  }

  const captureRoot = path.resolve(root, '_temp-files', 'inspector-captures');
  const runFolder = path.resolve(receipt.runFolder);
  if (!samePath(path.dirname(runFolder), captureRoot)) {
    throw safeRecordError(
      'PATH_INVALID',
      'The exact capture folder is outside the local capture root.',
    );
  }
  await ensureSafeDirectory(root, captureRoot);
  const realRunFolder = await ensureSafeDirectory(captureRoot, runFolder);
  if (!samePath(path.dirname(realRunFolder), path.resolve(captureRoot))) {
    throw safeRecordError(
      'PATH_INVALID',
      'The exact capture folder is not a direct child of the capture root.',
    );
  }
  const receiptRunReport = receipt.currentPageValidation.reportPath;
  if (
    !isCanonicalAbsolutePath(receiptRunReport) ||
    !samePath(receiptRunReport, path.join(realRunFolder, 'check-report.html'))
  ) {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The invocation report does not name the exact receipt capture folder.',
    );
  }
  const outputDirectory = path.resolve(root, 'test-results', 'shortcuts-live');
  const expectedReport = path.join(outputDirectory, 'report.json');
  if (!samePath(path.resolve(receipt.validationReport), expectedReport)) {
    throw safeRecordError(
      'PATH_INVALID',
      'The invocation report is outside the expected local report path.',
    );
  }
  await ensureSafeDirectory(root, outputDirectory);
  const realReport = await ensureSafeRegularFile(outputDirectory, expectedReport);

  const aggregate = await readJsonObject(
    outputDirectory,
    realReport,
    'The aggregate invocation report is unavailable.',
  );
  if (
    aggregate.visualReportVersion !== 1 ||
    aggregate.invocationId !== receipt.invocationId ||
    aggregate.startedAt !== receipt.startedAt ||
    aggregate.completedAt !== receipt.completedAt ||
    aggregate.sourceFingerprint !== receipt.sourceFingerprint ||
    !isDeepStrictEqual(aggregate.currentPageValidation, receipt.currentPageValidation)
  ) {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The aggregate report does not match the invocation receipt.',
    );
  }

  const manifestPath = path.join(realRunFolder, 'run-manifest.json');
  const manifest = await readJsonObject(
    realRunFolder,
    manifestPath,
    'The exact run manifest is unavailable.',
  );
  const manifestProblem = reportCaptureProblem(manifest, realRunFolder, receipt);
  if (manifestProblem) throw safeRecordError('EVIDENCE_INVALID', manifestProblem);
  const captureEvidence = await readRegisteredCaptureFiles(realRunFolder, manifest, registry);
  const runReportPath = path.join(realRunFolder, 'check-report.json');
  const savedCheckReport = await readJsonObject(
    realRunFolder,
    runReportPath,
    'The exact run check report is unavailable.',
  );
  const savedReportPath = savedCheckReport.folderPath;
  if (
    !isCanonicalAbsolutePath(savedReportPath) ||
    !samePath(savedReportPath, runFolder) ||
    savedCheckReport.folderName !== path.basename(runFolder) ||
    savedCheckReport.runManifest?.folderName !== manifest.folderName
  ) {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The exact check report does not match the receipt run folder.',
    );
  }

  let capabilities;
  try {
    capabilities = assertCapabilities(savedCheckReport.capabilities);
  } catch {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The exact check report has invalid capability evidence.',
    );
  }
  if (!isDeepStrictEqual(capabilities, manifest.capabilities)) {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The run manifest and check report capability evidence do not match.',
    );
  }

  const recomputedReport = await buildCheckReport({ folderName: path.basename(runFolder) });
  if (
    !isDeepStrictEqual(savedCheckReport.runManifest, manifest) ||
    !isDeepStrictEqual(savedCheckReport.capabilities, recomputedReport.capabilities) ||
    !isDeepStrictEqual(savedCheckReport.targetRows, recomputedReport.targetRows) ||
    !isDeepStrictEqual(savedCheckReport.shortcutRows, recomputedReport.shortcutRows) ||
    !isDeepStrictEqual(savedCheckReport.inventoryIssues, recomputedReport.inventoryIssues)
  ) {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The saved report disagrees with the exact capture and current code.',
    );
  }
  const currentValidation = classifyCurrentPageValidation(savedCheckReport, {
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    cdpEndpoint: receipt.currentPageValidation.cdpEndpoint,
    profileDirectory: receipt.currentPageValidation.profileDirectory,
  });
  if (currentValidation.status === 'unverified') {
    throw safeRecordError(
      'EVIDENCE_INVALID',
      'The exact run report does not reclassify as fresh evidence.',
    );
  }
  return {
    runFolder: realRunFolder,
    manifest,
    savedCheckReport,
    capabilities,
    currentValidation,
    ...captureEvidence,
  };
}

async function validateCandidateDirectory(root, outputPath) {
  const { expectedDirectory, candidate } = ignoredCandidatePath(root, outputPath);
  await ensureSafeDirectory(root, expectedDirectory, { create: true });
  const candidateInfo = await lstat(candidate).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw safeRecordError('OUTPUT_PATH_INVALID', 'The existing candidate path is unsafe.');
  });
  if (candidateInfo?.isSymbolicLink()) {
    await unlink(candidate).catch(() => {});
    throw safeRecordError('OUTPUT_PATH_INVALID', 'The existing candidate path is unsafe.');
  }
  if (candidateInfo && !candidateInfo.isFile()) {
    throw safeRecordError('OUTPUT_PATH_INVALID', 'The existing candidate path is unsafe.');
  }
  return candidate;
}

export async function exportCandidate({
  receiptPath,
  outputPath,
  root = REPOSITORY_ROOT,
  now = Date.now(),
} = {}) {
  let candidate;
  try {
    candidate = await validateCandidateDirectory(root, outputPath);
  } catch (error) {
    return {
      exitCode: 2,
      status: 'unavailable',
      message: publicErrorMessage(error, 'The candidate path is unavailable.'),
    };
  }

  let temporary;
  let temporaryCreated = false;
  try {
    if (typeof receiptPath !== 'string' || !path.isAbsolute(receiptPath)) {
      throw safeRecordError('EVIDENCE_INVALID', 'Pass an absolute local invocation receipt path.');
    }
    const expectedReceiptPath = path.resolve(
      root,
      'test-results',
      'shortcuts-live',
      'receipt.json',
    );
    if (!samePath(path.resolve(receiptPath), expectedReceiptPath)) {
      throw safeRecordError(
        'PATH_INVALID',
        'The receipt is outside the expected local evidence path.',
      );
    }
    const outputDirectory = path.dirname(expectedReceiptPath);
    await ensureSafeDirectory(root, outputDirectory);
    const realReceiptPath = await ensureSafeRegularFile(outputDirectory, expectedReceiptPath);
    const receipt = await readJsonObject(
      outputDirectory,
      realReceiptPath,
      'The local invocation receipt is unavailable.',
    );
    const currentFingerprint = await computeSourceFingerprint({ root });
    const { registry, inventory } = await loadCurrentContract();
    const evidence = await validateReceiptEvidence({
      root,
      receipt,
      currentFingerprint,
      now,
      registry,
    });
    const reclassified = evidence.currentValidation;
    if (receipt.probeShortcuts && reclassified.probeSummary.status === 'failed') {
      throw safeRecordError(
        'OBSERVED_FAILURE',
        'The exact activation-probe evidence contains an observed failure.',
      );
    }
    if (evidence.savedCheckReport.inventoryIssues.length > 0) {
      throw safeRecordError(
        'OBSERVED_FAILURE',
        'The current shortcut inventory has a validation failure.',
      );
    }
    if (reclassified.targetSummary.status === 'failed') {
      throw safeRecordError(
        'OBSERVED_FAILURE',
        'The exact target-presence evidence contains an observed failure.',
      );
    }
    if (reclassified.targetSummary.status !== 'passed') {
      throw safeRecordError(
        'EVIDENCE_INCOMPLETE',
        'Required target-presence evidence is incomplete.',
      );
    }

    const snapshot = projectCaptureEvidence({
      registry,
      inventory,
      files: evidence.files,
      captureStatuses: evidence.captureStatuses,
      capturedAt: evidence.manifest.completedAt,
      sourceFingerprint: currentFingerprint,
      capabilities: evidence.capabilities,
    });
    if (snapshot.coverageStatus !== 'complete') {
      throw safeRecordError(
        'EVIDENCE_INCOMPLETE',
        'Required registered target evidence is incomplete.',
      );
    }
    const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SNAPSHOT_BYTES) {
      throw safeRecordError('EVIDENCE_TOO_LARGE', 'The projected snapshot exceeds the size limit.');
    }
    temporary = path.join(path.dirname(candidate), `candidate.${randomUUID()}.tmp`);
    await writeFile(temporary, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    temporaryCreated = true;
    await rename(temporary, candidate);
    temporaryCreated = false;
    return {
      exitCode: 0,
      status: 'exported',
      stateCount: snapshot.states.length,
      bytes: Buffer.byteLength(serialized, 'utf8'),
      coverageStatus: snapshot.coverageStatus,
      capturedAt: snapshot.capturedAt,
    };
  } catch (error) {
    if (temporaryCreated && temporary) await unlink(temporary).catch(() => {});
    await invalidateCandidate(candidate).catch(() => {});
    const observedFailure = error.code === 'OBSERVED_FAILURE';
    const exitCode = observedFailure ? 1 : 2;
    return {
      exitCode,
      status: observedFailure ? 'failed' : 'unavailable',
      message: publicErrorMessage(error, 'Current-page evidence could not be exported.'),
    };
  }
}

async function readSnapshotFile(filename) {
  let info;
  try {
    info = await lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw safeRecordError('SNAPSHOT_READ', 'The requested snapshot cannot be read.');
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw safeRecordError('SNAPSHOT_READ', 'The requested snapshot is not a regular file.');
  }
  if (info.size > MAX_SNAPSHOT_BYTES) {
    throw safeRecordError('SCHEMA_INVALID', 'The live snapshot exceeds the supported size limit.');
  }
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch {
    throw safeRecordError('SCHEMA_INVALID', 'The live snapshot is not valid JSON.');
  }
}

export async function checkSnapshot({
  snapshotPath,
  root = REPOSITORY_ROOT,
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  contract,
  sourceFingerprint,
} = {}) {
  if (typeof snapshotPath !== 'string' || !path.isAbsolute(snapshotPath)) {
    return {
      exitCode: 1,
      status: 'invalid',
      message: 'Pass an absolute snapshot path.',
    };
  }
  let snapshot;
  try {
    snapshot = await readSnapshotFile(snapshotPath);
    if (!snapshot) {
      return {
        exitCode: 0,
        status: 'unverified',
        warnings: ['snapshot-missing'],
        driftTargets: [],
        replayed: false,
      };
    }
    const snapshotSchemaVersion = validateSnapshotStructure(snapshot);
    if (snapshotSchemaVersion === LEGACY_SNAPSHOT_SCHEMA_VERSION) {
      return replaySnapshot(snapshot);
    }
    const currentFingerprint = sourceFingerprint || (await computeSourceFingerprint({ root }));
    const currentContract = contract || (await loadCurrentContract());
    return replaySnapshot(snapshot, {
      registry: currentContract.registry,
      inventory: currentContract.inventory,
      sourceFingerprint: currentFingerprint,
      now: typeof now === 'number' ? now : Date.parse(now),
      maxAgeMs,
    });
  } catch (error) {
    return {
      exitCode: 1,
      status: 'invalid',
      message: publicErrorMessage(error, 'The live snapshot could not be validated.'),
    };
  }
}

function parseArguments(args) {
  if (args.length === 0 || !['export', 'check'].includes(args[0])) {
    throw new Error(
      'Use live-snapshot.mjs export --receipt <path> [--output <path>] or check --snapshot <path>.',
    );
  }
  const mode = args[0];
  const values = {};
  for (let index = 1; index < args.length; index += 1) {
    const key = args[index];
    if (!['--receipt', '--output', '--snapshot'].includes(key) || index + 1 >= args.length) {
      throw new Error('The live snapshot command has unsupported arguments.');
    }
    if (values[key]) throw new Error('The live snapshot command has duplicate arguments.');
    values[key] = args[index + 1];
    index += 1;
  }
  if (mode === 'export' && (!values['--receipt'] || values['--snapshot'])) {
    throw new Error('Export requires --receipt and accepts only --output.');
  }
  if (mode === 'check' && (!values['--snapshot'] || values['--receipt'] || values['--output'])) {
    throw new Error('Check requires --snapshot and accepts no export arguments.');
  }
  return { mode, values };
}

function printCheckResult(result) {
  if (result.status === 'invalid') {
    process.stderr.write(`Live snapshot: INVALID — ${result.message}\n`);
    return;
  }
  if (result.status === 'unverified') {
    const warnings = (result.warnings || []).join(', ') || 'snapshot unavailable';
    process.stdout.write(`Live snapshot: UNVERIFIED — ${warnings}\n`);
    return;
  }
  if (result.warnings?.length) {
    process.stdout.write(`Live snapshot: WARNING — ${result.warnings.join(', ')}\n`);
  } else {
    process.stdout.write(`Live snapshot: ${result.status.toUpperCase()}\n`);
  }
  if (result.driftTargets?.length) {
    for (const row of result.driftTargets) {
      process.stdout.write(`Target drift: ${row.targetId} (${row.kind})\n`);
    }
  }
  if (result.capturedAt) process.stdout.write(`Last observed: ${result.capturedAt}\n`);
}

async function runCli(args) {
  let parsed;
  try {
    parsed = parseArguments(args);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
  if (parsed.mode === 'export') {
    const result = await exportCandidate({
      receiptPath: parsed.values['--receipt'],
      outputPath: parsed.values['--output'] || undefined,
    });
    if (result.status === 'exported') {
      process.stdout.write(
        'Live snapshot candidate exported: ' +
          result.stateCount +
          ' states, ' +
          result.bytes +
          ' bytes, ' +
          result.coverageStatus +
          ' coverage.\n',
      );
    } else {
      process.stderr.write(
        `Live snapshot export: ${result.status.toUpperCase()} — ${result.message}\n`,
      );
    }
    return result.exitCode;
  }

  const result = await checkSnapshot({ snapshotPath: parsed.values['--snapshot'] });
  printCheckResult(result);
  return result.exitCode;
}

const invocationUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invocationUrl === import.meta.url) {
  process.exitCode = await runCli(process.argv.slice(2));
}
