import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const dispatchStart = contentSource.indexOf(
  '        async function findHintedTargetAfterOpeningMenus(sourceSlot) {',
);
const dispatchEnd = contentSource.indexOf(
  '\n        function dispatchActionWithoutVisibleHint(action, options, complete) {',
  dispatchStart,
);
assert.ok(dispatchStart >= 0 && dispatchEnd > dispatchStart, 'hint dispatch route should be present');
const dispatchSource = contentSource.slice(dispatchStart, dispatchEnd);
const existingMenuIndex = dispatchSource.indexOf('const existingMain = getVisibleModelMenuState().main;');
const openClosedMenuIndex = dispatchSource.indexOf('if (!(existingMain instanceof Element))');
assert.ok(
  existingMenuIndex >= 0 && openClosedMenuIndex > existingMenuIndex,
  'the route should preserve an already-open menu and open a closed one',
);
const applyHintsIndex = dispatchSource.indexOf('ModelPickerHints.apply();');
const directMenuIndex = dispatchSource.indexOf('getOpenComposerModelRadioMenu();', applyHintsIndex);
const directTargetIndex = dispatchSource.indexOf('getUniqueVisibleMenuItemForSlot(', directMenuIndex);
const legacyAdvancedIndex = dispatchSource.indexOf('ensurePillAdvancedOptionsExpanded(mainMenu)', directTargetIndex);
assert.ok(
  applyHintsIndex >= 0 &&
    directMenuIndex > applyHintsIndex &&
    dispatchSource.includes('directComposerMenu?.menu === mainMenu') &&
    directTargetIndex > directMenuIndex &&
    dispatchSource.includes('sourceSlot,\n              directComposerMenu.menu', directTargetIndex) &&
    dispatchSource.indexOf('return directComposerTarget;', directTargetIndex) > directTargetIndex &&
    legacyAdvancedIndex > directTargetIndex,
  'the profile-specific root row should be returned before legacy Advanced handling',
);
assert.match(
  dispatchSource,
  /const sourceSlot = Number\(options\.sourceSlot\);[\s\S]*?findHintedTargetAfterOpeningMenus\(sourceSlot\)/,
  'dispatch should resolve the row for the assigned shortcut slot',
);

const scenarios = [
  {
    profile: 'chat',
    slot: 8,
    shortcut: 'Alt+2',
    rows: [
      { label: 'Default', role: 'menuitemradio' },
      { label: 'GPT-5.6 Sol', role: 'menuitemradio', hints: { chat: 'Alt+1' } },
      { label: 'GPT-5.5', role: 'menuitemradio', hints: { chat: 'Alt+2' } },
      { label: 'High', role: 'menuitemradio', hints: { chat: 'Alt+2' } },
      { label: 'Fast', role: 'menuitemcheckbox', hints: { chat: 'Alt+2' } },
    ],
    expected: 'GPT-5.5',
  },
  {
    profile: 'work',
    slot: 8,
    shortcut: 'Alt+1',
    rows: [
      { label: 'Default', role: 'menuitemradio' },
      { label: 'GPT-6 Astra', role: 'menuitemradio', hints: { work: 'Alt+1' } },
      { label: 'GPT-5.5', role: 'menuitemradio', hints: { work: 'Alt+5' } },
      { label: 'High', role: 'menuitemradio', hints: { work: 'Alt+1' } },
      { label: 'Fast', role: 'menuitemcheckbox', hints: { work: 'Alt+1' } },
    ],
    expected: 'GPT-6 Astra',
  },
];

for (const scenario of scenarios) {
  const modelRows = scenario.rows.filter(
    (row) => row.role === 'menuitemradio' && /^gpt[-\s]*\d/i.test(row.label),
  );
  const matches = modelRows.filter((row) => row.hints?.[scenario.profile] === scenario.shortcut);
  assert.equal(matches.length, 1, `${scenario.profile} slot ${scenario.slot} should target one root model`);
  assert.equal(matches[0].label, scenario.expected);
  assert.ok(!['Default', 'High', 'Fast'].includes(matches[0].label));
}
