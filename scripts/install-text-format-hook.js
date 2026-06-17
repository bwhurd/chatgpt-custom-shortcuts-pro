#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const managedMarker = 'Managed by scripts/install-text-format-hook.js';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const repoRoot = git(['rev-parse', '--show-toplevel']);
if (!repoRoot) {
  throw new Error('Unable to resolve the Git repository root.');
}

const hookPath = git(['rev-parse', '--path-format=absolute', '--git-path', 'hooks/pre-commit']);
if (!path.isAbsolute(hookPath)) {
  throw new Error('Unable to resolve the absolute local pre-commit hook path.');
}

mkdirSync(path.dirname(hookPath), { recursive: true });

if (existsSync(hookPath)) {
  const existing = readFileSync(hookPath, 'utf8');
  const isManagedByCurrentInstaller = existing.includes(managedMarker);
  const isManagedByLegacyInstaller = existing.includes(
    'Managed by scripts/install-text-format-hook.ps1',
  );
  if (!isManagedByCurrentInstaller && !isManagedByLegacyInstaller) {
    throw new Error(`Refusing to overwrite existing non-managed hook: ${hookPath}`);
  }
}

const hook = `${[
  '#!/bin/sh',
  `# ${managedMarker}`,
  'set -eu',
  'repo_root="$(git rev-parse --show-toplevel)"',
  'cd "$repo_root"',
  'npm run repair:text:staged',
].join('\n')}\n`;

writeFileSync(hookPath, hook, 'utf8');
chmodSync(hookPath, 0o755);

console.log(`Installed or refreshed text-format hook: ${hookPath}`);
