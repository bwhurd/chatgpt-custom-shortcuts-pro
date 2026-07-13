import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const contentPath = path.join(testDir, '..', 'extension', 'content.js');
const contentSource = fs.readFileSync(contentPath, 'utf8');
const sliceStart = contentSource.indexOf('    const THREAD_NAVIGATION_BOUNDARY_SETTLE_DELAY');
const sliceEnd = contentSource.indexOf('    function getThreadNavigationMessageId', sliceStart);

assert.notEqual(sliceStart, -1, 'thread-navigation helper start marker is missing');
assert.notEqual(sliceEnd, -1, 'thread-navigation helper end marker is missing');

const helperSource = contentSource.slice(sliceStart, sliceEnd).replace(/^    /gm, '');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.setContent(`
    <button id="thinking">
      <span>Worked for</span><div class="tabular-nums">42s</div><span>&gt;</span>
    </button>
    <section data-testid="conversation-turn-0">
      <div id="group-0">
        <button id="previous-0" disabled></button><div class="tabular-nums">1/2</div><button id="next-0"></button>
      </div>
    </section>
    <section data-testid="conversation-turn-1">
      <div id="group-1">
        <button id="previous-1"></button><div class="tabular-nums">1/2</div><button id="next-1"></button>
      </div>
    </section>
    <section data-testid="conversation-turn-2">
      <div id="group-2">
        <button id="previous-2"></button><div class="tabular-nums">2/2</div><button id="next-2" disabled></button>
      </div>
    </section>
  `);
  await page.addScriptTag({
    content: `
      const svgSelectorForTokens = () => 'svg[data-never]';
      const withPrefix = () => 'button[data-never]';
      ${helperSource}
    `,
  });

  const result = await page.evaluate(() => {
    const collect = (direction) =>
      collectThreadNavigationCandidates({
        ariaLabel: `fixture-${direction}`,
        direction,
        iconTokens: [],
      });
    const groupId = (button) => getThreadNavigationGroup(button)?.id;
    const container = { scrollTop: 120 };

    const previous = collect('previous');
    const next = collect('next');
    const previousActionable = previous.filter(isThreadNavigationButtonActionable);
    const nextActionable = next.filter(isThreadNavigationButtonActionable);

    resetThreadNavigationPreviewState();
    const initialPreviousChoice = chooseThreadNavigationPreviewTarget(
      previous[2],
      previous,
      { direction: 'previous' },
    );
    trackThreadNavigationPreviewTarget(previous[2]);
    const busyWhileScrolling = threadNavigationPreviewState.inFlight;
    completeThreadNavigationPreviewTarget(previous[2]);
    const idleAfterScroll = !threadNavigationPreviewState.inFlight;
    const adjacentPreviousChoice = chooseThreadNavigationPreviewTarget(
      previous[2],
      previous,
      { direction: 'previous' },
    );

    trackThreadNavigationPreviewTarget(previous[0]);
    completeThreadNavigationPreviewTarget(previous[0]);
    const previousEdgeChoice = chooseThreadNavigationPreviewTarget(
      previous[0],
      previous,
      { direction: 'previous' },
    );

    trackThreadNavigationPreviewTarget(next[2]);
    completeThreadNavigationPreviewTarget(next[2]);
    const nextEdgeChoice = chooseThreadNavigationPreviewTarget(next[2], next, {
      direction: 'next',
    });

    const stableMiddleKey = getThreadNavigationTargetKey(previous[1]);
    const middleTurn = document.querySelector('[data-testid="conversation-turn-1"]');
    middleTurn.replaceWith(middleTurn.cloneNode(true));
    const refreshedPrevious = collect('previous');
    const stableIdentityPreviousTarget = getAdjacentThreadNavigationTarget(
      refreshedPrevious,
      stableMiddleKey,
      'previous',
    );

    resetThreadNavigationPreviewState();
    trackThreadNavigationPreviewTarget(refreshedPrevious[1]);
    completeThreadNavigationPreviewTarget(refreshedPrevious[1]);
    container.scrollTop = 200;
    const continuesAfterScrollShift = chooseThreadNavigationPreviewTarget(
      refreshedPrevious[2],
      refreshedPrevious,
      { direction: 'previous' },
    );

    return {
      adjacentPreviousTarget: groupId(adjacentPreviousChoice.target),
      busyWhileScrolling,
      idleAfterScroll,
      initialPreviousTarget: groupId(initialPreviousChoice.target),
      nextActionable: nextActionable.map(groupId),
      nextEdgeBoundary: nextEdgeChoice.scanBoundary,
      nextGroups: next.map(groupId),
      nextWrapTarget: groupId(getThreadNavigationWrapTarget(next, 'next')),
      previousActionable: previousActionable.map(groupId),
      previousEdgeBoundary: previousEdgeChoice.scanBoundary,
      previousGroups: previous.map(groupId),
      previousWrapTarget: groupId(getThreadNavigationWrapTarget(previous, 'previous')),
      continuesAfterScrollShift: groupId(continuesAfterScrollShift.target),
      stableIdentityPreviousTarget: groupId(stableIdentityPreviousTarget),
    };
  });

  assert.deepEqual(result.previousGroups, ['group-0', 'group-1', 'group-2']);
  assert.deepEqual(result.nextGroups, ['group-0', 'group-1', 'group-2']);
  assert.deepEqual(result.previousActionable, ['group-1', 'group-2']);
  assert.deepEqual(result.nextActionable, ['group-0', 'group-1']);
  assert.equal(result.initialPreviousTarget, 'group-2');
  assert.equal(result.adjacentPreviousTarget, 'group-1');
  assert.equal(result.previousEdgeBoundary, 'top');
  assert.equal(result.nextEdgeBoundary, 'bottom');
  assert.equal(result.previousWrapTarget, 'group-2');
  assert.equal(result.nextWrapTarget, 'group-0');
  assert.equal(result.stableIdentityPreviousTarget, 'group-0');
  assert.equal(result.continuesAfterScrollShift, 'group-0');
  assert.equal(result.busyWhileScrolling, true);
  assert.equal(result.idleAfterScroll, true);

  console.log('Thread navigation loop fixture passed.');
} finally {
  await browser.close();
}
