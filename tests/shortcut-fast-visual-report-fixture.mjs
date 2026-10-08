import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFastVisualReport } from './playwright/lib/shortcut-fast-visual-report.mjs';

const temporaryRoot = await mkdtemp(join(tmpdir(), 'shortcut-fast-visual-report-'));

try {
  const report = {
    schemaVersion: 1,
    sourceFingerprint: 'synthetic-source-hash',
    selection: {
      actionIds: ['shortcutKeyUnsafeFailure', 'shortcutKeyMissingProof', 'shortcutKeyPassed'],
      filtered: true,
    },
    rows: [
      {
        rowId: 'global:shortcutKeyUnsafeFailure',
        actionId: 'shortcutKeyUnsafeFailure',
        label: '<img src=x onerror=alert(1)>',
        code: 'KeyK',
        targetRefs: ['composer-form'],
        source: 'extension/content.js#handleComposerShortcut',
        owner: 'extension/content.js <svg onload=alert(1)>',
        admitted: true,
        status: 'fail',
        reason: 'Fixture assertion failed.',
        observations: [
          {
            actionId: 'shortcutKeyUnsafeFailure',
            fixtureId: 'composer',
            proofScope: 'fixture-keyboard',
            status: 'fail',
            chord: 'Alt+KeyK',
            reason: 'The selector rejected </script><script>alert("x")</script>.',
          },
        ],
      },
      {
        rowId: 'global:shortcutKeyMissingProof',
        actionId: 'shortcutKeyMissingProof',
        label: 'Missing proof',
        code: 'KeyM',
        targetRefs: ['composer-form'],
        owner: 'extension/content.js',
        admitted: true,
        status: 'not-run',
        reason: 'Keyboard fixture is available; not yet run.',
      },
      {
        rowId: 'global:shortcutKeyUnselected',
        actionId: 'shortcutKeyUnselected',
        label: 'Outside filtered selection',
        code: 'KeyU',
        targetRefs: ['composer-form'],
        owner: 'extension/content.js',
        admitted: true,
        status: 'not-run',
      },
      {
        rowId: 'global:shortcutKeyNativeUpload',
        actionId: 'shortcutKeyNativeUpload',
        label: 'Native upload chooser',
        code: 'KeyF',
        admitted: true,
        status: 'not-run',
        externalCoverage: {
          status: 'not-proven',
          reason: 'Native file selection and account upload are outside controlled proof.',
        },
      },
      {
        rowId: 'browser:_execute_action',
        actionId: '_execute_action',
        label: 'Browser native action',
        status: 'external',
        admitted: false,
        reason: 'Browser-native activation is external and unexercised.',
        externalCoverage: {
          status: 'not-proven',
          reason: 'Browser-native activation is external and unexercised.',
        },
      },
      {
        rowId: 'global:shortcutKeyPassed',
        actionId: 'shortcutKeyPassed',
        label: 'Passed shortcut',
        code: 'KeyP',
        targetRefs: ['composer-form'],
        owner: 'extension/content.js',
        admitted: true,
        status: 'pass',
        observations: [
          {
            actionId: 'shortcutKeyPassed',
            status: 'pass',
            chord: 'Alt+KeyP',
            proofScope: 'fixture-keyboard',
          },
        ],
      },
    ],
    targets: [
      {
        targetId: 'composer-form',
        kind: 'selector-list',
        identifier: 'form[data-thread-find-composer="true"]',
        selectors: ['form[data-thread-find-composer="true"]'],
        searchNeedles: [
          'form[data-thread-find-composer="true"]',
          '<script>alert("target")</script>',
        ],
        matchGroups: [['data-thread-find-composer="true"']],
      },
    ],
    observations: [],
    issues: [],
    warnings: [{ rowId: 'browser:_execute_action', reason: 'Native activation is outside proof.' }],
    outcome: {
      warnings: [
        { rowId: 'browser:_execute_action', reason: 'Native activation is outside proof.' },
      ],
    },
    checkResults: [
      {
        name: 'Biome lint',
        status: 'fail',
        seconds: 2.4,
        error: 'Invalid configuration at <img src=x onerror=alert(2)>.',
      },
      { name: 'Report fixture', status: 'pass', seconds: 0.8 },
    ],
  };
  const outputDirectory = join(temporaryRoot, 'current');
  const written = await writeFastVisualReport(report, { outputDirectory });

  assert.equal(written.status, 'FAIL');
  assert.equal(written.exitCode, 1);
  assert.equal(written.json, join(outputDirectory, 'report.json'));
  assert.equal(written.markdown, join(outputDirectory, 'report.md'));
  assert.equal(written.html, join(outputDirectory, 'report.html'));

  const jsonText = await readFile(written.json, 'utf8');
  const markdown = await readFile(written.markdown, 'utf8');
  const html = await readFile(written.html, 'utf8');
  const rendered = JSON.parse(jsonText);
  assert.equal(rendered.runStatus, 'FAIL');
  assert.equal(rendered.summary, undefined, 'The writer preserves the input report summary field.');
  assert.equal(rendered.visualSummary.passed, 1);
  assert.equal(rendered.failures.length, 1);
  assert.equal(rendered.failures[0].actionId, 'shortcutKeyUnsafeFailure');
  assert.equal(rendered.failures[0].chord, 'Alt+KeyK');
  assert.deepEqual(rendered.failures[0].targetRefs, ['composer-form']);
  assert.ok(rendered.failures[0].targets[0].selectors.includes('<script>alert("target")</script>'));
  assert.equal(rendered.failures[0].source, 'extension/content.js#handleComposerShortcut');
  assert.equal(rendered.failures[0].owner, 'extension/content.js <svg onload=alert(1)>');
  assert.ok(rendered.failures[0].reason.includes('alert("x")'));
  assert.equal(rendered.checkResults.length, 2, 'The source check results remain available.');
  assert.equal(rendered.checkFailures.length, 1);
  assert.equal(rendered.checkFailures[0].stageName, 'Biome lint');
  assert.equal(
    rendered.checkFailures[0].reason,
    'Invalid configuration at <img src=x onerror=alert(2)>.',
  );

  assert.equal(rendered.coverageGaps.length, 1);
  assert.equal(rendered.coverageGaps[0].actionId, 'shortcutKeyMissingProof');
  assert.equal(rendered.unselectedRows.length, 1);
  assert.equal(rendered.unselectedRows[0].actionId, 'shortcutKeyUnselected');
  assert.deepEqual(rendered.scopeLimitations.map((item) => item.actionId).sort(), [
    '_execute_action',
    'shortcutKeyNativeUpload',
  ]);
  assert.deepEqual(
    rendered.fixList.map((item) => [item.fixKind, item.actionId, item.stageName || '']),
    [
      ['failure', 'shortcutKeyUnsafeFailure', ''],
      ['failed-check-stage', '', 'Biome lint'],
      ['coverage-gap', 'shortcutKeyMissingProof', ''],
    ],
    'The fix list includes shortcut/check failures and selected gaps, not pass, unselected, or native/external rows.',
  );
  assert.equal(rendered.passRows.length, 1);
  assert.equal(rendered.passRows[0].actionId, 'shortcutKeyPassed');

  assert.match(markdown, /## Failures/);
  assert.match(markdown, /## Check stages/);
  assert.match(markdown, /## Coverage gaps/);
  assert.match(markdown, /## Scope and known limitations/);
  assert.match(markdown, /## Fix list/);
  assert.match(markdown, /Alt\+KeyK/);
  assert.ok(markdown.includes('extension/content.js\\#handleComposerShortcut'));
  assert.ok(!markdown.includes('<img src=x'));
  assert.ok(!markdown.includes('<script>alert'));
  const markdownFixList = markdown.split('## Fix list')[1].split('\n## ')[0];
  assert.ok(markdownFixList.includes('shortcutKeyUnsafeFailure'));
  assert.ok(markdownFixList.includes('shortcutKeyMissingProof'));
  assert.ok(!markdownFixList.includes('shortcutKeyUnselected'));
  assert.ok(!markdownFixList.includes('shortcutKeyNativeUpload'));
  assert.ok(!markdownFixList.includes('_execute_action'));
  assert.ok(!markdownFixList.includes('shortcutKeyPassed'));
  assert.ok(markdownFixList.includes('Biome lint'));

  assert.match(html, /<table>/);
  assert.match(html, /<details/);
  assert.match(html, /Biome lint/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
  assert.match(html, /Alt\+KeyK/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;target&quot;\)&lt;\/script&gt;/);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /shortcutKeyNativeUpload/);
  assert.match(html, /shortcutKeyPassed/);

  const refreshed = await writeFastVisualReport(rendered, { outputDirectory });
  const refreshedDocument = JSON.parse(await readFile(refreshed.json, 'utf8'));
  assert.deepEqual(
    refreshedDocument.warnings,
    report.warnings,
    'Raw selection warnings are preserved.',
  );
  assert.equal(
    refreshedDocument.visualWarnings.length,
    1,
    'Enrichment must not duplicate warnings.',
  );
  assert.equal(refreshedDocument.visualSummary.warnings, 1);

  const startup = await writeFastVisualReport(
    {
      rows: [],
      observations: [],
      summary: { catalogue: 0, failed: 0 },
      outcome: {
        status: 'failure',
        coverage: 'blocked-startup',
        checks: 'No checks ran',
        errors: [{ message: 'Chromium could not start.' }],
        warnings: [],
      },
    },
    { outputDirectory },
  );
  const startupDocument = JSON.parse(await readFile(startup.json, 'utf8'));
  assert.equal(startup.status, 'FAIL');
  assert.equal(startupDocument.failures.length, 1);
  assert.equal(startupDocument.failures[0].label, 'Startup / source preparation');
  assert.match(startupDocument.failures[0].reason, /Chromium could not start/);
  assert.equal(startupDocument.summary.catalogue, 0, 'The source summary remains available.');
  assert.equal(startupDocument.visualSummary.checks, 'No checks ran');
  assert.ok(!startupDocument.failures[0].reason.includes('shortcutKeyUnsafeFailure'));

  console.log(
    'Fast visual report fixture passed: attribution, scope separation, escaping, and startup failure.',
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
