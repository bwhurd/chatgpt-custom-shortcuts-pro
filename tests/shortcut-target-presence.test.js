const assert = require('node:assert/strict');
const { before, test } = require('node:test');

let evaluateTargetPresence;
let targetMatchesText;
let targetMatchesTokens;

before(async () => {
  ({ evaluateTargetPresence, targetMatchesText, targetMatchesTokens } = await import(
    './playwright/lib/shortcut-target-presence.mjs'
  ));
});

function originalTargetMatchesText(target, text) {
  const haystack = String(text || '');
  const matchGroups = Array.isArray(target?.matchGroups) ? target.matchGroups : [];
  return matchGroups.some((group) => {
    const needles = Array.isArray(group) ? group : [group];
    const requiredNeedles = needles.filter(Boolean);
    return (
      requiredNeedles.length > 0 &&
      requiredNeedles.every((needle) => haystack.includes(String(needle)))
    );
  });
}

function originalEvaluateTargetPresence(
  target,
  files,
  { matches = originalTargetMatchesText } = {},
) {
  const allMatchedFiles = Object.entries(files)
    .filter(([, text]) => matches(target, text))
    .map(([fileName]) => fileName)
    .sort();
  const expectedFiles = Array.isArray(target.expectedFiles) ? target.expectedFiles : [];
  const missingExpectedFiles = expectedFiles.filter((fileName) => !Object.hasOwn(files, fileName));
  const matchedExpectedFiles = expectedFiles.filter((fileName) => matches(target, files[fileName]));
  const hasMatchGroups = Array.isArray(target.matchGroups) && target.matchGroups.length > 0;
  let status = 'pass';
  let statusReason = 'Target matched at least one expected scrape dump.';

  if ((target.unknownUiStateRefs || []).length > 0) {
    status = 'fail';
    statusReason = `Target references unknown scrape state(s): ${target.unknownUiStateRefs.join(', ')}`;
  } else if (target.missingMatchGroups) {
    status = 'fail';
    statusReason = 'Target has scrape state coverage but no deterministic match group.';
  } else if (!expectedFiles.length || !hasMatchGroups) {
    status = 'no-scrape-coverage';
    statusReason =
      target.notes ||
      'The target is known, but the current scrape family does not capture a deterministic dump for it yet.';
  } else if (missingExpectedFiles.length > 0) {
    status = 'fail';
    statusReason = `Expected dump files were missing: ${missingExpectedFiles.join(', ')}`;
  } else if (!matchedExpectedFiles.length) {
    status = 'fail';
    statusReason = 'Target was not found in any expected scrape dump.';
  }

  return {
    expectedFiles,
    matchedExpectedFiles,
    allMatchedFiles,
    missingExpectedFiles,
    status,
    statusReason,
  };
}

test('target presence preserves existing expected-file, alias, and match-group behavior', () => {
  const target = {
    expectedFiles: ['menu.html', 'missing.html', 'sidebar.html'],
    matchGroups: [['Menu', 'item'], ['Account']],
  };
  const files = {
    'z-alias.html': 'Menu item',
    'menu.html': 'Menu item',
    'sidebar.html': 'Account details',
    'partial.html': 'Menu only',
  };

  assert.deepEqual(
    evaluateTargetPresence(target, files),
    originalEvaluateTargetPresence(target, files),
  );
  assert.deepEqual(evaluateTargetPresence(target, files), {
    expectedFiles: ['menu.html', 'missing.html', 'sidebar.html'],
    matchedExpectedFiles: ['menu.html', 'sidebar.html'],
    allMatchedFiles: ['menu.html', 'sidebar.html', 'z-alias.html'],
    missingExpectedFiles: ['missing.html'],
    status: 'fail',
    statusReason: 'Expected dump files were missing: missing.html',
  });
  assert.equal(targetMatchesText(target, 'Menu item'), true);
  assert.equal(targetMatchesText(target, 'Menu only'), false);
});

test('target presence retains status precedence and malformed metadata normalization', () => {
  const files = { 'known.html': 'text without the target' };
  const cases = [
    {
      expectedFiles: ['known.html'],
      matchGroups: [['target']],
      unknownUiStateRefs: ['missing-state', 'retired-state'],
      missingMatchGroups: true,
    },
    {
      expectedFiles: ['known.html'],
      matchGroups: [],
      missingMatchGroups: true,
    },
    { expectedFiles: 'known.html', matchGroups: [['target']] },
    { expectedFiles: ['known.html'], matchGroups: 'target' },
    { expectedFiles: ['known.html'], matchGroups: [[], [false, null, '']] },
    { expectedFiles: [], matchGroups: [['target']], notes: 'Not captured yet.' },
    {},
  ];

  for (const target of cases) {
    assert.deepEqual(
      evaluateTargetPresence(target, files),
      originalEvaluateTargetPresence(target, files),
    );
  }

  assert.equal(
    evaluateTargetPresence(cases[0], files).statusReason,
    'Target references unknown scrape state(s): missing-state, retired-state',
  );
  assert.equal(
    evaluateTargetPresence(cases[1], files).statusReason,
    'Target has scrape state coverage but no deterministic match group.',
  );
  assert.equal(evaluateTargetPresence(cases[2], files).status, 'no-scrape-coverage');
  assert.equal(evaluateTargetPresence(cases[3], files).status, 'no-scrape-coverage');
  assert.equal(evaluateTargetPresence(cases[4], files).status, 'fail');
  assert.equal(
    evaluateTargetPresence(cases[4], files).statusReason,
    'Target was not found in any expected scrape dump.',
  );
  assert.equal(evaluateTargetPresence(cases[5], files).statusReason, 'Not captured yet.');
});

test('target presence suppresses only explicitly unavailable tagged capabilities', async () => {
  const { unknownCapabilities } = await import('./playwright/lib/shortcut-capabilities.mjs');
  const target = {
    targetId: 'pro-effort-standard',
    requiredCapabilities: ['proEffort'],
    expectedFiles: ['pro-menu.html'],
    matchGroups: [['Standard']],
  };
  const unavailable = { ...unknownCapabilities(), proEffort: 'unavailable' };
  const available = { ...unknownCapabilities(), proEffort: 'available' };

  assert.deepEqual(evaluateTargetPresence(target, {}, { capabilities: unavailable }), {
    expectedFiles: ['pro-menu.html'],
    matchedExpectedFiles: [],
    allMatchedFiles: [],
    missingExpectedFiles: ['pro-menu.html'],
    status: 'not-applicable',
    statusReason: 'Required capability is unavailable: proEffort.',
  });
  assert.equal(evaluateTargetPresence(target, {}, { capabilities: available }).status, 'fail');
  assert.equal(
    evaluateTargetPresence(target, {}, { capabilities: unknownCapabilities() }).status,
    'fail',
  );
  assert.equal(evaluateTargetPresence(target, {}).status, 'fail');
});

test('target metadata failures take precedence over unavailable capability evidence', async () => {
  const { unknownCapabilities } = await import('./playwright/lib/shortcut-capabilities.mjs');
  const capabilities = { ...unknownCapabilities(), configureRoute: 'unavailable' };
  const target = {
    requiredCapabilities: ['configureRoute'],
    expectedFiles: ['configure.html'],
    matchGroups: [['dialog']],
    unknownUiStateRefs: ['retired-configure-state'],
  };

  assert.equal(evaluateTargetPresence(target, {}, { capabilities }).status, 'fail');
  assert.equal(
    evaluateTargetPresence(target, {}, { capabilities }).statusReason,
    'Target references unknown scrape state(s): retired-configure-state',
  );
  assert.equal(
    evaluateTargetPresence(
      { ...target, unknownUiStateRefs: [], missingMatchGroups: true },
      {},
      {
        capabilities,
      },
    ).status,
    'fail',
  );
  assert.throws(
    () =>
      evaluateTargetPresence(
        { ...target, unknownUiStateRefs: [] },
        {},
        { capabilities: { ...capabilities, source: 'bad' } },
      ),
    /invalid code-owned schema/i,
  );
});

test('target token replay uses exact membership and preserves AND/OR groups', () => {
  const target = { matchGroups: [['menu', 'bar'], ['account']] };

  assert.equal(targetMatchesTokens(target, ['menu', 'bar']), true);
  assert.equal(targetMatchesTokens(target, new Set(['account'])), true);
  assert.equal(targetMatchesTokens(target, ['menu']), false);
  assert.equal(targetMatchesTokens({ matchGroups: [['menubar']] }, ['menu', 'bar']), false);
  assert.equal(targetMatchesTokens({ matchGroups: [['menubar']] }, new Set(['menubar'])), true);
  assert.equal(targetMatchesText({ matchGroups: [['menubar']] }, 'menu bar menubar'), true);
});

test('target presence accepts token matching through the same file evaluator', () => {
  const target = {
    expectedFiles: ['menu.html', 'sidebar.html'],
    matchGroups: [['menu', 'bar'], ['account']],
  };
  const files = {
    'menu.html': new Set(['menu', 'bar']),
    'sidebar.html': ['account'],
    'menu-alias.html': ['menu', 'bar'],
  };
  const presence = evaluateTargetPresence(target, files, { matches: targetMatchesTokens });

  assert.deepEqual(presence, {
    expectedFiles: ['menu.html', 'sidebar.html'],
    matchedExpectedFiles: ['menu.html', 'sidebar.html'],
    allMatchedFiles: ['menu-alias.html', 'menu.html', 'sidebar.html'],
    missingExpectedFiles: [],
    status: 'pass',
    statusReason: 'Target matched at least one expected scrape dump.',
  });
});
