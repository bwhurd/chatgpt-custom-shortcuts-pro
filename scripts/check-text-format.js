#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const fix = process.argv.includes('--write');
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

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
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

const changed = [];
for (const filePath of trackedFiles().filter(isTextFile)) {
  const original = readFileSync(filePath, 'utf8');
  const normalized = normalizeText(original);
  if (original === normalized) continue;
  changed.push(filePath);
  if (fix) writeFileSync(filePath, normalized, 'utf8');
}

if (changed.length) {
  const verb = fix ? 'Normalized' : 'Text formatting issues found in';
  console.error(`${verb} ${changed.length} tracked file(s):`);
  for (const filePath of changed) console.error(`- ${filePath}`);
  if (!fix) {
    console.error('\nRun `npm run format:text` to normalize line endings and trailing whitespace.');
    process.exit(1);
  }
}
