import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { chromium } from 'playwright';

const contentSource = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const sliceStart = contentSource.indexOf('    function splitByCodeFences(text)');
const sliceEnd = contentSource.indexOf('    // Runtime bridge: sanitizeCopiedText', sliceStart);

assert.notEqual(sliceStart, -1, 'copy Markdown helper start marker is missing');
assert.notEqual(sliceEnd, -1, 'copy Markdown helper end marker is missing');

const helperSource = contentSource.slice(sliceStart, sliceEnd).replace(/^    /gm, '');
const context = vm.createContext({});
vm.runInContext(
  `const FENCE_RE = /^[ \\t]{0,3}([\`~]{3,})([^\\n\`~]*)?$/;\n${helperSource}\nglobalThis.testRemoveMarkdown = removeMarkdown;\nglobalThis.testStripMarkdownOutsideCodeblocks = stripMarkdownOutsideCodeblocks;`,
  context,
  { filename: 'extension/content.js#copy-markdown-helpers' },
);

const removeMarkdown = context.testRemoveMarkdown;
const stripMarkdownOutsideCodeblocks = context.testStripMarkdownOutsideCodeblocks;

const serializerStart = contentSource.indexOf(
  '    const COPY_PLAIN_TEXT_BLOCK_TAGS = new Set([',
);
const serializerEnd = contentSource.indexOf(
  '    function buildPlainTextWithFences',
  serializerStart,
);
assert.notEqual(serializerStart, -1, 'structured copy serializer start marker is missing');
assert.notEqual(serializerEnd, -1, 'structured copy serializer end marker is missing');

const serializerSource = contentSource.slice(serializerStart, serializerEnd).replace(/^    /gm, '');

const nestedBullets = [
  '* first level bullet',
  '    + second level bullet',
  '        - Third level bullet',
].join('\n');
assert.equal(
  removeMarkdown(nestedBullets),
  ['- first level bullet', '    - second level bullet', '        - Third level bullet'].join('\n'),
  'Alt+C should normalize bullet markers without dropping nested indentation',
);

const renderedNestedBullets = ['* first level bullet', '', '  * second level bullet', '', '    * Third level bullet'].join(
  '\n',
);
assert.equal(
  removeMarkdown(renderedNestedBullets),
  ['- first level bullet', '    - second level bullet', '        - Third level bullet'].join('\n'),
  'Alt+C should expand rendered two-space list nesting to four-space Markdown levels',
);

assert.equal(
  removeMarkdown('• first level bullet\n\n  · second level bullet'),
  '- first level bullet\n    - second level bullet',
  'rendered bullet glyphs should also become dash bullets with four-space nesting',
);

const observedNativePayload = [
  '### Test Header',
  '',
  '* first level bullet',
  '',
  '  * second level bullet',
  '',
  '    * Third level bullet',
  '',
  'Test body follows the header immediately.',
  '',
].join('\n');
assert.equal(
  stripMarkdownOutsideCodeblocks(observedNativePayload),
  [
    'Test Header',
    '- first level bullet',
    '    - second level bullet',
    '        - Third level bullet',
    '',
    'Test body follows the header immediately.',
    '',
  ].join('\n'),
  'the full observed native copy payload should match the Alt+C contract',
);

assert.equal(
  removeMarkdown('Intro\n### Header\n\nBody'),
  'Intro\n\nHeader\nBody',
  'headers should have one blank line before and no blank line after',
);

assert.equal(
  removeMarkdown('### Header\n\n\nBody'),
  'Header\nBody',
  'leading headers should not leave an empty line after the header',
);

const protectedCode = ['```markdown', '# keep heading', '* keep bullet', '', '', '    keep spaces', '```'].join(
  '\n',
);
const protectedInput = `Before\n\n${protectedCode}\n\n### Header\n\n**After**`;
const protectedExpected = `Before\n\n${protectedCode}\n\nHeader\nAfter`;
assert.equal(
  stripMarkdownOutsideCodeblocks(protectedInput),
  protectedExpected,
  'copy cleanup should preserve fenced code while applying header spacing outside it',
);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`
    <div class="markdown prose">
      <h3>Test Header</h3>
      <ul>
        <li>
          <p>first level bullet</p>
          <ul>
            <li>
              <p>second level bullet</p>
              <ul>
                <li><p>Third level bullet</p></li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
      <p>Test body follows the header immediately.</p>
    </div>
  `);

  const structuredText = await page.evaluate(({ source }) => {
    const buildStructuredCopyPlainText = new Function(
      `${source}\nreturn buildStructuredCopyPlainText;`,
    )();
    return buildStructuredCopyPlainText(document.querySelector('.prose'));
  }, { source: serializerSource });

  assert.equal(
    structuredText,
    [
      'Test Header',
      '- first level bullet',
      '    - second level bullet',
      '        - Third level bullet',
      '',
      'Test body follows the header immediately.',
    ].join('\n'),
    'rendered nested lists should copy as dash bullets with four spaces per level',
  );

  await page.setContent('<div class="prose"><p>Intro</p><h3>Header</h3><p>Body</p></div>');
  const structuredHeadingText = await page.evaluate(({ source }) => {
    const buildStructuredCopyPlainText = new Function(
      `${source}\nreturn buildStructuredCopyPlainText;`,
    )();
    return buildStructuredCopyPlainText(document.querySelector('.prose'));
  }, { source: serializerSource });

  assert.equal(
    structuredHeadingText,
    'Intro\n\nHeader\nBody',
    'rendered headings should have one preceding blank line and no following blank line',
  );
} finally {
  await browser.close();
}

console.log('Alt+C copy Markdown formatting preserves dash bullets, nested whitespace, and header spacing');
