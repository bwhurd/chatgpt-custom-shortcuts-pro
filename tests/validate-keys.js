/**
 * To run this file in VS Code using PowerShell:
 * Run Command: npm run validate:keys
 */
const path = require('node:path');
const { parseArgs } = require('node:util');
const { runSettingsWiringValidation } = require('./lib/settings-wiring-validator');

try {
  const { values } = parseArgs({ options: { 'repo-root': { type: 'string' } } });
  const repoRoot = path.resolve(values['repo-root'] || path.join(__dirname, '..'));
  const result = runSettingsWiringValidation({ repoRoot });
  console.log(result.output);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error('Settings wiring validation could not run.');
  console.error(error?.stack || error);
  process.exitCode = 1;
}
