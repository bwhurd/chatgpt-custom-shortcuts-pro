/**
 * To run this file in VS Code using PowerShell:
 * Run Command: npm run validate:keys
 */
const path = require('node:path');
const { runSettingsWiringValidation } = require('./lib/settings-wiring-validator');

const repoRoot = path.resolve(__dirname, '..');

try {
  const result = runSettingsWiringValidation({ repoRoot });
  console.log(result.output);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error('Settings wiring validation crashed.');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
