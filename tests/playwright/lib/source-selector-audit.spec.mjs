import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { buildSourceSelectorInventory } from './source-selector-audit.mjs';

test('source-selector inventory parses a BOM-prefixed manifest', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'cgcsp-selector-audit-'));

  try {
    await mkdir(path.join(repoRoot, 'extension'));
    await writeFile(
      path.join(repoRoot, 'extension/manifest.json'),
      '\uFEFF{"content_scripts":[{"js":["content.js"]}]}',
      'utf8',
    );
    await writeFile(path.join(repoRoot, 'extension/content.js'), "document.querySelector('.target');", 'utf8');

    const inventory = await buildSourceSelectorInventory(repoRoot);

    expect(inventory.files).toEqual(['extension/content.js']);
    expect(inventory.groups[0]?.candidates).toEqual([{ kind: 'css', selector: '.target' }]);
    expect(inventory.sourceErrors).toEqual([]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
