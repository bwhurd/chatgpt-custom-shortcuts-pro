import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { evaluateLiveProbeSemantic } from './playwright/lib/devscrape-wide-core.mjs';
import { runSearchChatsCase } from './playwright/lib/search-chats-fixture.mjs';

const content = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const searchModule = await readFile(
  new URL('../extension/shortcuts/search.js', import.meta.url),
  'utf8',
);
const item = { actionId: 'shortcutKeySearchConversationHistory', type: 'direct-control' };
const replaceAction = (body) => {
  const anchor =
    /shortcutKeySearchConversationHistory: \(\) => \{\s*void searchShortcutActions.run\(\);\s*\}/g;
  assert.equal(
    [...content.matchAll(anchor)].length,
    1,
    'Mutation must hit exactly the real Search action',
  );
  return content.replace(anchor, `shortcutKeySearchConversationHistory: () => { ${body} }`);
};
const oldSelectors = searchModule.replaceAll('#magnifying-glass-lg-light-', '#missing-search-');
assert.notEqual(oldSelectors, searchModule, 'Historical mutation must hit actual module');
const clickStub = searchModule.replace(
  /function activate\(element\) \{\s*return click\(element\) === true;\s*\}/,
  'function activate(element) { return true; }',
);
assert.notEqual(clickStub, searchModule, 'Click no-op mutation must hit the actual helper');

const cases = [
  { name: 'current-source', source: content, expected: 'pass' },
  {
    name: 'historical-missing-sprite-selectors',
    source: content,
    moduleSource: oldSelectors,
    expected: 'fail',
  },
  { name: 'handler-does-nothing', source: replaceAction('return true;'), expected: 'fail' },
  {
    name: 'click-reports-success-without-opening',
    source: content,
    moduleSource: clickStub,
    expected: 'fail',
  },
  {
    name: 'wrong-button-activation',
    source: replaceAction('document.getElementById("search-distractor").click();'),
    expected: 'fail',
  },
  {
    name: 'popup-missing-linked-results',
    source: replaceAction(
      'void searchShortcutActions.run(); document.querySelector("dialog [role=listbox]").removeAttribute("role");',
    ),
    expected: 'fail',
  },
  {
    name: 'duplicate-popups',
    source: replaceAction('void searchShortcutActions.run(); void searchShortcutActions.run();'),
    expected: 'fail',
  },
];

const browser = await chromium.launch({ headless: true });
const results = [];
const semanticResults = [];
for (const sample of [
  {
    name: 'closed-to-one-Search-popup',
    before: [],
    after: [{ dialogId: 'search-1' }],
    trusted: true,
    expected: 'pass',
  },
  { name: 'unrelated-dialog-increase', before: [], after: [], trusted: true, expected: 'fail' },
  {
    name: 'preexisting-Search-popup',
    before: [{ dialogId: 'search-1' }],
    after: [{ dialogId: 'search-1' }],
    trusted: true,
    expected: 'fail',
  },
  {
    name: 'two-Search-popups',
    before: [],
    after: [{ dialogId: 'search-1' }, { dialogId: 'search-2' }],
    trusted: true,
    expected: 'fail',
  },
  {
    name: 'untrusted-dispatch',
    before: [],
    after: [{ dialogId: 'search-1' }],
    trusted: false,
    expected: 'fail',
  },
  {
    name: 'missing-popup-evidence',
    before: undefined,
    after: undefined,
    trusted: true,
    expected: 'fail',
  },
]) {
  const proof = evaluateLiveProbeSemantic(
    { actionId: item.actionId, activationProbeMode: 'opens-target' },
    { targetId: 'search-chats-dialog' },
    { searchChatsPopups: sample.before, visibleTarget: false, visibleDialogCount: 0 },
    { searchChatsPopups: sample.after, visibleTarget: true, visibleDialogCount: 1 },
    null,
    false,
    { search: { trustedDispatch: sample.trusted } },
  );
  assert.equal(
    proof.status,
    sample.expected,
    `${sample.name}: live semantics must ${sample.expected}`,
  );
  semanticResults.push({ ...proof, name: sample.name, expected: sample.expected });
  console.log(`live-${sample.name}: expected ${sample.expected}, observed ${proof.status}`);
}
try {
  const context = await browser.newContext();
  await context.route('**/*', (route) => route.abort());
  for (const test of cases) {
    const result = await runSearchChatsCase(context, test.source, item, undefined, {
      searchModuleSource: test.moduleSource ?? searchModule,
    });
    assert.deepEqual(
      result.pageErrors,
      [],
      `${test.name}: failure must be behavioral, not a page error`,
    );
    assert.equal(result.status, test.expected, `${test.name}: validator must ${test.expected}`);
    if (test.expected === 'fail') {
      assert.match(result.reason, /Alt\+K must open a new visible Search popup/);
    }
    results.push({ name: test.name, expected: test.expected, ...result });
    console.log(
      `${test.name}: expected ${test.expected}, observed ${result.status}, page errors 0`,
    );
  }
} finally {
  await browser.close();
}
const reportDirectory = new URL('../test-results/search-chats-proof/', import.meta.url);
await mkdir(reportDirectory, { recursive: true });
await writeFile(
  new URL('proof.json', reportDirectory),
  `${JSON.stringify({ createdAt: new Date().toISOString(), sourceHash: createHash('sha256').update(content).digest('hex'), results, semanticResults }, null, 2)}\n`,
);
await writeFile(
  new URL('proof.md', reportDirectory),
  `# Search Chats validation proof\n\nThe canonical filtered fast test and these mutations use the same checker in tests/playwright/lib/search-chats-fixture.mjs. Mutations occur only in memory; installed storage and shipped source are untouched.\n\n| Case | Expected | Observed | Page errors |\n| --- | --- | --- | --- |\n${results.map((row) => `| ${row.name} | ${row.expected} | ${row.status} | ${row.pageErrors.length} |`).join('\n')}\n\nA pass requires a trusted Alt+K from the composer to open exactly one new visible Search modal with its combobox and linked listbox. Both recorded sprite sizes must pass; wrong keys/modifiers, hidden/disabled buttons and unrelated/hidden dialogs must not satisfy the check. Escape must dismiss each popup and the draft must be preserved.\n\nThe live probe uses the same DOM reader in search-chats-popup.mjs and the actual evaluateLiveProbeSemantic implementation:\n\n| Live semantic case | Expected | Observed |\n| --- | --- | --- |\n${semanticResults.map((row) => `| ${row.name} | ${row.expected} | ${row.status} |`).join('\n')}\n\nThis is controlled source regression proof. Installed live acceptance must separately start with Search closed and observe its popup after the trusted configured chord.\n`,
);
