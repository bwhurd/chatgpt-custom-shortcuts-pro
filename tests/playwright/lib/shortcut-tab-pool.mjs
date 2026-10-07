export const DEFAULT_TAB_LIMIT = 10;

// Settle every task before returning so callers can safely cross a serial barrier.
export async function settleTabPool(items, run, limit = DEFAULT_TAB_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid tab limit');
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          results[index] = { status: 'fulfilled', value: await run(items[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    }),
  );
  return results;
}
