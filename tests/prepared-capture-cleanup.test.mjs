import assert from 'node:assert/strict';
import test from 'node:test';
import { recordPreparedCaptureCleanup } from './playwright/lib/devscrape-wide-core.mjs';

function captureState(status = 'captured') {
  const actionId = 'shortcutKeyCopyAllCodeBlocks';
  const reason = status === 'failed' ? 'original-capture-failure' : 'captured';
  return {
    actionId,
    rows: [{ actionId, reason, stateCapture: { status, error: reason } }],
    checkpoint: { completedCases: [{ actionId, captureStatus: status, reason }] },
    supplementalArtifactByState: new Map([
      [
        'probe-code-block-content',
        { status, error: reason, rawHtml: '<code>fixture</code>', captureBytes: 20 },
      ],
    ]),
  };
}

test('clean and unnecessary cleanup preserve captured evidence and record the actual status', () => {
  for (const status of ['clean', 'not-needed']) {
    const state = captureState();
    assert.deepEqual(recordPreparedCaptureCleanup({ ...state, cleanup: { status } }), {
      failed: false,
      status,
    });
    assert.equal(state.rows[0].stateCapture.status, 'captured');
    assert.equal(state.rows[0].stateCapture.cleanupStatus, status);
    assert.equal(state.checkpoint.completedCases[0].captureCleanupStatus, status);
    assert.equal(
      state.supplementalArtifactByState.get('probe-code-block-content').captureBytes,
      20,
    );
    assert.equal(state.checkpoint.captureCleanupFailures, undefined);
  }
});

test('failed, partial and unknown cleanup preserve captured evidence with diagnostics', () => {
  for (const status of ['failed', 'partial', undefined]) {
    const state = captureState();
    const artifact = state.supplementalArtifactByState.get('probe-code-block-content');
    assert.equal(recordPreparedCaptureCleanup({ ...state, cleanup: { status } }).failed, true);
    assert.equal(state.rows[0].stateCapture.status, 'captured');
    assert.equal(state.rows[0].reason, 'captured');
    assert.equal(state.checkpoint.completedCases[0].captureStatus, 'captured');
    assert.equal(state.checkpoint.completedCases[0].reason, 'captured');
    assert.equal(state.rows[0].stateCapture.cleanupStatus, status || 'unknown');
    assert.equal(state.checkpoint.completedCases[0].captureCleanupStatus, status || 'unknown');
    assert.equal(state.supplementalArtifactByState.get('probe-code-block-content'), artifact);
    assert.equal(artifact.rawHtml, '<code>fixture</code>');
    assert.equal(artifact.captureBytes, 20);
    assert.equal(state.checkpoint.captureCleanupFailures.length, 1);
  }
});

test('cleanup failure preserves the original failed capture cause', () => {
  const state = captureState('failed');
  const artifact = state.supplementalArtifactByState.get('probe-code-block-content');
  recordPreparedCaptureCleanup({ ...state, cleanup: { status: 'failed' } });
  assert.equal(state.rows[0].reason, 'original-capture-failure');
  assert.equal(state.rows[0].stateCapture.status, 'failed');
  assert.equal(state.checkpoint.completedCases[0].captureStatus, 'failed');
  assert.equal(state.supplementalArtifactByState.get('probe-code-block-content'), artifact);
  assert.equal(state.rows[0].stateCapture.error, 'original-capture-failure');
  assert.equal(state.checkpoint.completedCases[0].reason, 'original-capture-failure');
  assert.equal(
    state.supplementalArtifactByState.get('probe-code-block-content').error,
    'original-capture-failure',
  );
  assert.equal(state.checkpoint.captureCleanupFailures.length, 1);
});
