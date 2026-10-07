import assert from 'node:assert/strict';
import { settleTabPool } from './playwright/lib/shortcut-tab-pool.mjs';

let active = 0;
let peak = 0;
let cleaned = 0;
let releaseFirst;
const firstGate = new Promise((resolve) => {
  releaseFirst = resolve;
});
const started = [];
const results = await settleTabPool(
  Array.from({ length: 23 }, (_, i) => i),
  async (i) => {
    active++;
    peak = Math.max(peak, active);
    started.push(i);
    try {
      if (i === 0) await firstGate;
      if (i === 10) {
        assert.equal(cleaned < 10, true, 'Next task must start before the whole wave finishes');
        releaseFirst();
      }
      await Promise.resolve();
      if (i === 4) throw new Error('expected rejection');
      return i;
    } finally {
      active--;
      cleaned++;
    }
  },
);
assert.equal(peak, 10);
assert.equal(active, 0, 'Serial barrier must wait for cleanup');
assert.equal(cleaned, 23);
assert.equal(started.length, 23);
assert.equal(results[4].status, 'rejected');
assert.equal(results[22].value, 22);
assert.deepEqual(await settleTabPool([], () => assert.fail()), []);
await assert.rejects(
  settleTabPool([1], () => {}, 0),
  /Invalid tab limit/,
);
console.log('Rolling ten-tab pool: cap, replenishment, rejection, cleanup and barrier passed');
