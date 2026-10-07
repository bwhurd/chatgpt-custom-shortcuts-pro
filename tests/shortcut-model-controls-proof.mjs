import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { runModelControlCase } from './playwright/lib/shortcut-model-controls-fixture.mjs';

const content = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const started = performance.now();
try {
  for (const actionId of process.argv.slice(2)) {
    const row = await runModelControlCase(
      context,
      content,
      { actionId, type: 'model-control' },
      started,
    );
    console.log(JSON.stringify(row));
    if (row.status !== 'pass') process.exitCode = 1;
  }
} finally {
  await browser.close();
}
