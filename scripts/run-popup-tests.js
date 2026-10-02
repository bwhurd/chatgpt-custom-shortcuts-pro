const { spawnSync } = require('node:child_process');

// Preserve Node's FORCE_COLOR precedence without passing conflicting flags to workers.
const env = { ...process.env };
if (env.NO_COLOR !== undefined && env.FORCE_COLOR === undefined) env.FORCE_COLOR = '0';
delete env.NO_COLOR;
const result = spawnSync(
  process.execPath,
  [
    require.resolve('@playwright/test/cli'),
    'test',
    'tests/playwright/popup-visual.spec.mjs',
    '--workers=1',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
