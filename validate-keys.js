/**
 * To run this file in VS Code using PowerShell:
 * Run Command: node validate-keys.js
 */
const fs = require('node:fs');
const cheerio = require('cheerio');

// Load files
const html = fs.readFileSync('popup.html', 'utf8');
const json = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

// Keys that exist only in JSON (not represented by an <input>) but are valid
const JSON_ONLY_KEYS = new Set(['modelPickerKeyCodes']);

// Load HTML with cheerio
const $ = cheerio.load(html);
const inputs = $('input:not([type=hidden])');

// Build the expected key set from data-sync first, then id as a fallback.
// We intentionally ignore plain "name" unless it's the intended sync key.
const expectedKeys = new Set();
inputs.each((_, el) => {
	const $el = $(el);
	const ds = ($el.attr('data-sync') || '').trim();
	const id = ($el.attr('id') || '').trim();

	if (ds) {
		expectedKeys.add(ds);
	} else if (id) {
		expectedKeys.add(id);
	}
});

// Get keys from JSON
const jsonKeys = Object.keys(json.data || {});

// Check for mismatches (HTML -> JSON)
const missingInJson = Array.from(expectedKeys).filter((k) => !jsonKeys.includes(k));

// Check for unused keys in JSON (JSON -> HTML), ignoring whitelisted JSON-only keys
const unusedInHtml = jsonKeys.filter((k) => !expectedKeys.has(k) && !JSON_ONLY_KEYS.has(k));

console.log('--- Mismatches (HTML keys not in JSON) ---');
console.log(
	missingInJson.length ? missingInJson.map((k) => `KEY not in JSON: ${k}`).join('\n') : 'None!',
);

console.log('\n--- Unused keys in JSON ---');
console.log(unusedInHtml.length ? unusedInHtml.join('\n') : 'None!');
