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
const altCFormatterStart = contentSource.indexOf('    function formatAltCCopyText(text)');
const altCFormatterEnd = contentSource.indexOf('    function buildSingleMessageClipboardPayload', altCFormatterStart);
assert.notEqual(altCFormatterStart, -1, 'Alt+C formatter start marker is missing');
assert.notEqual(altCFormatterEnd, -1, 'Alt+C formatter end marker is missing');
const altCFormatterSource = contentSource.slice(altCFormatterStart, altCFormatterEnd).replace(/^    /gm, '');
const context = vm.createContext({});
vm.runInContext(
  `const FENCE_RE = /^[ \\t]{0,3}([\`~]{3,})([^\\n\`~]*)?$/;\n${helperSource}\n${altCFormatterSource}\nglobalThis.testRemoveMarkdown = removeMarkdown;\nglobalThis.testStripMarkdownOutsideCodeblocks = stripMarkdownOutsideCodeblocks;\nglobalThis.testFormatAltCCopyText = formatAltCCopyText;`,
  context,
  { filename: 'extension/content.js#copy-markdown-helpers' },
);

const removeMarkdown = context.testRemoveMarkdown;
const stripMarkdownOutsideCodeblocks = context.testStripMarkdownOutsideCodeblocks;
const formatAltCCopyText = context.testFormatAltCCopyText;

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

assert.equal(
  formatAltCCopyText('# Keep heading  \n### # Collapse heading   \nA — B — C  '),
  '# Keep heading\n# Collapse heading\nA - B - C',
  'Alt+C should preserve one heading marker, collapse repeated markers, replace em dashes, and trim line ends',
);
assert.equal(
  formatAltCCopyText('```text\n### # Keep code — unchanged  \n```\n### Outside — changed  '),
  '```text\n### # Keep code — unchanged  \n```\n# Outside - changed',
  'Alt+C should leave fenced code unchanged',
);
assert.equal(
  formatAltCCopyText('### # `inline — code` — prose  '),
  '# `inline — code` - prose',
  'Alt+C should collapse headings around inline code without changing code text',
);
assert.equal(
  formatAltCCopyText('[Docs](https://example.com) **bold** __strong__ *italic*'),
  'Docs bold strong italic',
  'Alt+C should simplify links and remove inline Markdown emphasis markers',
);
assert.equal(
  removeMarkdown(
    String.raw`For the material, expand into the following \*\*Labor & Delivery core curriculum\*\*. [imageThe ObG Project]\([https://www.obgproject.com/page](https://www.obgproject.com/page)\)`,
  ),
  'For the material, expand into the following Labor & Delivery core curriculum. The ObG Project',
  'Alt+C should clean escaped emphasis and nested image-link Markdown',
);
assert.equal(
  removeMarkdown('([The ObG Project][1]) ([image][2])'),
  'The ObG Project',
  'Alt+C should simplify reference links and remove image citation wrappers',
);
assert.equal(
  formatAltCCopyText('**outside**\n```md\n[keep](https://example.com) **keep** — unchanged\n```'),
  'outside\n```md\n[keep](https://example.com) **keep** — unchanged\n```',
  'Alt+C should preserve Markdown syntax inside fenced code',
);

const plainWriterStart = contentSource.indexOf('    async function writeClipboardPlainText(text)');
const plainWriterEnd = contentSource.indexOf('    async function copyClipboardPayload', plainWriterStart);
const messageWriterStart = contentSource.indexOf('    async function copySingleMessagePayloadFromElements');
const messageWriterEnd = contentSource.indexOf('    const ALT_C_CHECK_PATH', messageWriterStart);
assert.ok(plainWriterStart >= 0 && plainWriterEnd > plainWriterStart);
assert.ok(messageWriterStart >= 0 && messageWriterEnd > messageWriterStart);
const clipboardCalls = [];
const clipboardContext = vm.createContext({
  navigator: { clipboard: { writeText: async (value) => clipboardCalls.push(['plain', value]) } },
  buildSingleMessageClipboardPayload: () => ({ html: '<strong>Bold</strong>', text: 'Bold' }),
  copyClipboardPayload: async (payload) => clipboardCalls.push(['rich', payload]),
});
vm.runInContext(
  `${contentSource.slice(plainWriterStart, plainWriterEnd)}\n${contentSource.slice(messageWriterStart, messageWriterEnd)}\nglobalThis.copyMessage = copySingleMessagePayloadFromElements;`,
  clipboardContext,
);
await clipboardContext.copyMessage([{}], { altC: true });
assert.deepEqual(clipboardCalls, [['plain', 'Bold']], 'Alt+C must write only cleaned plain text');
clipboardCalls.length = 0;
await clipboardContext.copyMessage([{}]);
assert.deepEqual(
  clipboardCalls,
  [['rich', { html: '<strong>Bold</strong>', text: 'Bold' }]],
  'other extension copy paths should retain their rich payload',
);

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

  const headingWithMarker = await page.evaluate(({ source }) => {
    const buildStructuredCopyPlainText = new Function(
      `${source}\nreturn buildStructuredCopyPlainText;`,
    )();
    return buildStructuredCopyPlainText(document.querySelector('.prose'), {
      preserveHeadingMarker: true,
    });
  }, { source: serializerSource });
  assert.equal(
    headingWithMarker,
    '# Test Header\n- first level bullet\n    - second level bullet\n        - Third level bullet\n\nTest body follows the header immediately.',
    'Alt+C should keep a single hashtag for rendered headings',
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

  const feedbackStart = contentSource.indexOf('    const ALT_C_CHECK_PATH =');
  const feedbackEnd = contentSource.indexOf('    function selectAndMaybeCopySingleMessage', feedbackStart);
  assert.notEqual(feedbackStart, -1, 'Alt+C checkmark feedback is missing');
  const feedbackSource = contentSource.slice(feedbackStart, feedbackEnd).replace(/^    /gm, '');
  await page.setContent('<button aria-label="Copy response"><svg><path d="copy"></path></svg></button>');
  const copiedState = await page.evaluate(({ source }) => {
    const showFeedback = new Function(`${source}\nreturn showAltCCopyFeedback;`)();
    const button = document.querySelector('button');
    showFeedback(button);
    return {
      label: button.getAttribute('aria-label'),
      path: button.querySelector('path')?.getAttribute('d'),
    };
  }, { source: feedbackSource });
  assert.equal(copiedState.label, 'Copied', 'Alt+C should announce copied status');
  assert.notEqual(copiedState.path, 'copy', 'Alt+C should show the copied checkmark');
  await page.waitForTimeout(2100);
  const restoredState = await page.evaluate(() => {
    const button = document.querySelector('button');
    return {
      label: button.getAttribute('aria-label'),
      path: button.querySelector('path')?.getAttribute('d'),
    };
  });
  assert.deepEqual(
    restoredState,
    { label: 'Copy response', path: 'copy' },
    'Alt+C should restore the copy icon after feedback',
  );
} finally {
  await browser.close();
}

console.log('Alt+C plain text, heading markers, and copy-icon feedback passed');
