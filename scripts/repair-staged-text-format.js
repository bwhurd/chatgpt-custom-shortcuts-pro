#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const textExtensions = new Set([
  '.ahk',
  '.css',
  '.gitattributes',
  '.gitignore',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ps1',
  '.txt',
  '.xml',
  '.yml',
  '.yaml',
]);
const textBasenames = new Set(['AGENTS.md', 'CHANGELOG.md', 'PROJECT_SPEC.md']);
const ignoredPathPrefixes = [
  '.git/',
  '_temp-files/',
  'dist/',
  'extension/vendor/',
  'netlify/',
  'node_modules/',
  'test-results/',
  'tools/',
];

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options });
}

function gitPaths(args) {
  const output = git([...args, '-z']);
  return output.split('\0').filter(Boolean);
}

function isTextFile(filePath) {
  const normalizedPath = filePath.replaceAll('\\', '/');
  if (ignoredPathPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) return false;
  return textBasenames.has(path.basename(filePath)) || textExtensions.has(path.extname(filePath));
}

function normalizeText(text) {
  const normalizedLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (normalizedLines.length > 1 && normalizedLines.at(-1) === '') {
    normalizedLines.pop();
  }
  return `${normalizedLines.map((line) => line.replace(/[ \t]+$/g, '')).join('\n')}\n`;
}

const repoRoot = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(repoRoot);

const stagedPaths = gitPaths(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
const unstagedPaths = new Set(gitPaths(['diff', '--name-only', '--diff-filter=ACMR']));
const repairs = [];

for (const filePath of stagedPaths.filter(isTextFile)) {
  if (!existsSync(filePath)) continue;

  const original = readFileSync(filePath, 'utf8');
  const normalized = normalizeText(original);
  if (original !== normalized) {
    repairs.push({ filePath, normalized });
  }
}

const blockedPaths = repairs
  .map(({ filePath }) => filePath)
  .filter((filePath) => unstagedPaths.has(filePath));
if (blockedPaths.length) {
  console.error('Text formatting issues found in partially staged file(s):');
  for (const filePath of blockedPaths) {
    console.error(`- ${filePath}`);
  }
  console.error(
    '\nRun `npm run format:text`, review the result, and stage the intended changes before committing.',
  );
  process.exit(1);
}

for (const { filePath, normalized } of repairs) {
  writeFileSync(filePath, normalized, 'utf8');
  execFileSync('git', ['add', '--', filePath], { stdio: 'inherit' });
}

if (repairs.length) {
  console.error(`Normalized and re-staged ${repairs.length} staged text file(s).`);
  for (const { filePath } of repairs) {
    console.error(`- ${filePath}`);
  }
}
