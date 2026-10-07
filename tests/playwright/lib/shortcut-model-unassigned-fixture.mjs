import assert from 'node:assert/strict';
import { runSlotCase } from './shortcut-model-slots-fixture.mjs';

// A temporary binding tests the real presentation filter. Canonical but absent
// actions must stay inert; this is not a successful model-selection assertion.
export async function runUnassignedModelCase(context, content, item, started) {
  assert.equal(item.assigned, false, `${item.rowId}: expected original blank binding`);
  assert.deepEqual(item.actionIds, [], `${item.rowId}: expected absent presentation`);
  assert.equal(item.availability, 'unavailable');
  assert.ok(item.canonicalActionId, `${item.rowId}: canonical action must be retained`);
  const result = await runSlotCase(
    context,
    content,
    { ...item, modelActionId: '', actionIds: [] },
    started,
  );
  if (result.status === 'pass') {
    assert.equal(result.observed.assignedCode, item.fixtureCode);
    assert.ok(!result.observed.presentedSlots.includes(Number(item.slot)));
  }
  return {
    ...result,
    type: 'model-unassigned-unavailable',
    originalBinding: '',
    fixtureBinding: item.fixtureCode,
    canonicalActionId: item.canonicalActionId,
    canonicalAvailability: 'unavailable',
    proofResult: result.status === 'pass' ? 'ignored-unavailable' : 'failed',
    workingActionProven: false,
    pathScope:
      'Real profile and trusted window listener with isolated temporary binding; current presentation excludes the canonical action, so no target is activated and the action queue is not entered.',
  };
}
