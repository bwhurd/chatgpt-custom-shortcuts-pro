import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'acorn';

const DOM_CALLS = new Set([
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'waitForSelector',
  'locator',
  'waitForElement',
  'observeMountedSelector',
  'findFirstVisibleElement',
  'waitForFirstVisibleElement',
]);

function children(node) {
  return Object.values(node).flatMap((value) =>
    Array.isArray(value) ? value.filter((item) => item?.type) : value?.type ? [value] : [],
  );
}

function strings(value) {
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : [];
}

function propertyName(node) {
  return node?.type === 'Identifier' ? node.name : node?.value;
}

// Resolve data expressions only. Never execute the content scripts or call their functions.
function staticValue(node, scope, seen = new Set()) {
  if (!node || seen.has(node) || seen.size > 80) return undefined;
  const next = new Set(seen).add(node);
  const value = (child) => staticValue(child, scope, next);
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier': {
      for (let current = scope; current; current = current.parent) {
        if (current.bindings.has(node.name)) {
          return staticValue(current.bindings.get(node.name), current, next);
        }
      }
      return undefined;
    }
    case 'ArrayExpression':
      return node.elements.map(value);
    case 'ObjectExpression': {
      const result = Object.create(null);
      for (const entry of node.properties) {
        if (entry.type === 'SpreadElement') Object.assign(result, value(entry.argument));
        else if (!entry.computed) result[propertyName(entry.key)] = value(entry.value);
      }
      return result;
    }
    case 'MemberExpression': {
      const object = value(node.object);
      const key = node.computed ? value(node.property) : propertyName(node.property);
      return object && typeof key === 'string' ? object[key] : undefined;
    }
    case 'ChainExpression':
      return value(node.expression);
    case 'LogicalExpression':
      return [value(node.left), value(node.right)];
    case 'ConditionalExpression':
      return [value(node.consequent), value(node.alternate)];
    case 'BinaryExpression': {
      if (node.operator !== '+') return undefined;
      const left = value(node.left),
        right = value(node.right);
      if (typeof left === 'string' && typeof right === 'string') return left + right;
      return undefined;
    }
    case 'TemplateLiteral': {
      let text = node.quasis[0].value.cooked;
      for (let index = 0; index < node.expressions.length; index += 1) {
        const part = value(node.expressions[index]);
        if (!['string', 'number'].includes(typeof part)) return undefined;
        text += part + node.quasis[index + 1].value.cooked;
      }
      return text;
    }
    case 'CallExpression': {
      if (node.callee.type !== 'MemberExpression' || propertyName(node.callee.property) !== 'join')
        return undefined;
      const array = value(node.callee.object);
      const separator = node.arguments.length ? value(node.arguments[0]) : ',';
      return Array.isArray(array) &&
        array.every((item) => typeof item === 'string') &&
        typeof separator === 'string'
        ? array.join(separator)
        : undefined;
    }
    default:
      return undefined;
  }
}

export async function buildSourceSelectorInventory(repoRoot) {
  const manifestSource = await readFile(path.join(repoRoot, 'extension/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestSource.replace(/^\uFEFF/, ''));
  const files = [...new Set(manifest.content_scripts.flatMap((entry) => entry.js || []))].filter(
    (file) => !/^(?:lib|vendor)\//.test(file),
  );
  const groups = [],
    sourceErrors = [];
  for (const file of files) {
    const filename = `extension/${file}`;
    const source = await readFile(path.join(repoRoot, filename), 'utf8');
    let ast;
    try {
      ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (error) {
      sourceErrors.push({ file: filename, reason: error.message });
      continue;
    }
    const scopes = new WeakMap(),
      parents = new WeakMap(),
      nodes = [];
    function index(node, parent, outer) {
      const isScope =
        node.type === 'Program' || node.type === 'BlockStatement' || /Function/.test(node.type);
      const scope = isScope ? { parent: outer, bindings: new Map() } : outer;
      scopes.set(node, scope);
      parents.set(node, parent);
      nodes.push(node);
      if (/Function/.test(node.type)) {
        for (const parameter of node.params || []) {
          if (parameter.type === 'Identifier') scope.bindings.set(parameter.name, null);
        }
      }
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
        scope.bindings.set(node.id.name, node.init);
      }
      for (const child of children(node)) index(child, node, scope);
    }
    index(ast, null, null);
    const indexedGroups = new Map();
    for (const node of nodes) {
      if (node.type !== 'CallExpression') continue;
      const method =
        node.callee.type === 'Identifier' ? node.callee.name : propertyName(node.callee.property);
      if (!DOM_CALLS.has(method) || !node.arguments.length) continue;
      let owner = node;
      while (
        parents.get(owner)?.type === 'LogicalExpression' &&
        parents.get(owner).operator === '||'
      )
        owner = parents.get(owner);
      const key = owner.start;
      if (!indexedGroups.has(key))
        indexedGroups.set(key, {
          file: filename,
          line: owner.loc.start.line,
          expression: source.slice(owner.start, owner.end).slice(0, 220),
          candidates: [],
          unresolved: [],
        });
      const group = indexedGroups.get(key);
      const values = [
        ...new Set(strings(staticValue(node.arguments[0], scopes.get(node))).filter(Boolean)),
      ];
      const kind =
        method === 'getElementById'
          ? 'id'
          : method === 'getElementsByClassName'
            ? 'class'
            : method === 'getElementsByTagName'
              ? 'tag'
              : 'css';
      if (!values.length)
        group.unresolved.push(
          source.slice(node.arguments[0].start, node.arguments[0].end).slice(0, 160),
        );
      for (const selector of values) {
        if (!group.candidates.some((entry) => entry.kind === kind && entry.selector === selector))
          group.candidates.push({ kind, selector });
      }
    }
    groups.push(...indexedGroups.values());
  }
  return { files: files.map((file) => `extension/${file}`), groups, sourceErrors };
}

async function inspectState(page, inventory, name) {
  return page.evaluate(
    ({ groups, name }) => ({
      name,
      url: location.href,
      results: groups.map((group) =>
        group.candidates.map(({ kind, selector }) => {
          try {
            const count =
              kind === 'id'
                ? Number(Boolean(document.getElementById(selector)))
                : kind === 'class'
                  ? document.getElementsByClassName(selector).length
                  : kind === 'tag'
                    ? document.getElementsByTagName(selector).length
                    : document.querySelectorAll(selector).length;
            return { count };
          } catch (error) {
            return { error: error.message };
          }
        }),
      ),
    }),
    { groups: inventory.groups, name },
  );
}

export async function runSourceSelectorAudit(page, inventory, { maxMenus = 12 } = {}) {
  const states = [await inspectState(page, inventory, 'conversation')],
    captureIssues = [];
  // Only native menu openers: never select commands, toggle settings, or generate a response.
  const openers = page.locator(
    [
      'form[data-chatgpt-composer] button[aria-haspopup="menu"]',
      'form[data-chatgpt-composer] button[aria-expanded]:not([data-composer-expand-toggle])',
      '[data-app-shell-main-titlebar] button[aria-haspopup="menu"]',
      '#bottomBarRight button[aria-haspopup="menu"]',
      'button[aria-label="Open profile menu"][aria-haspopup="menu"]',
      'button[data-testid="model-switcher-dropdown-button"]',
      'button[data-testid="composer-plus-btn"]',
      'button[data-testid="conversation-options-button"]',
      'button[data-testid="profile-button"]',
    ].join(', '),
  );
  const totalMenus = await openers.count();
  for (let index = 0; index < Math.min(totalMenus, maxMenus); index += 1) {
    const opener = openers.nth(index);
    const label = await opener.getAttribute('aria-label').catch(() => null);
    const stateName = `menu-${index + 1}${label ? `: ${label}` : ''}`;
    try {
      if (!(await opener.isVisible())) continue;
      await opener.click({ timeout: 1500 });
      await page
        .locator('[role="menu"][data-state="open"], [role="dialog"], [data-model-picker-view]')
        .first()
        .waitFor({ state: 'visible', timeout: 1500 });
      states.push(await inspectState(page, inventory, stateName));
    } catch (error) {
      captureIssues.push({ state: stateName, reason: error.message.split('\n')[0] });
    } finally {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  if (totalMenus > maxMenus)
    captureIssues.push({
      state: 'menus',
      reason: `Menu limit reached (${maxMenus}/${totalMenus}).`,
    });
  const rows = inventory.groups.map((group, index) => {
    const candidates = group.candidates.map((candidate, candidateIndex) => {
      const matches = states
        .filter((state) => state.results[index][candidateIndex].count > 0)
        .map((state) => state.name);
      const errors = [
        ...new Set(
          states.map((state) => state.results[index][candidateIndex].error).filter(Boolean),
        ),
      ];
      return { ...candidate, states: matches, errors };
    });
    const status = candidates.some((candidate) => candidate.states.length)
      ? 'matched'
      : !candidates.length
        ? 'unresolved'
        : candidates.every((candidate) => candidate.errors.length)
          ? 'invalid'
          : 'unmatched';
    return { ...group, status, candidates };
  });
  const summary = Object.fromEntries(
    ['matched', 'unmatched', 'invalid', 'unresolved'].map((status) => [
      status,
      rows.filter((row) => row.status === status).length,
    ]),
  );
  return {
    generatedAt: new Date().toISOString(),
    files: inventory.files,
    summary,
    rows,
    states: states.map(({ name, url }) => ({ name, url })),
    captureIssues,
    sourceErrors: inventory.sourceErrors,
    limits:
      'Presence audit only. Unmatched is a drift candidate, not proof of breakage. Conditional, responsive, generated, relative-root, and account-specific targets can need other states. Dynamic expressions remain explicit coverage gaps. Nested submenus and feature toggles are not exercised.',
  };
}

export async function writeSourceSelectorReport(report, captureRoot) {
  const directory = path.join(captureRoot, 'source-selector-audit-latest');
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, 'source-selector-report.json');
  const htmlPath = path.join(directory, 'source-selector-report.html');
  const escapeHtml = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  const priority = { invalid: 0, unmatched: 1, unresolved: 2, matched: 3 };
  const rows = [...report.rows].sort((a, b) => priority[a.status] - priority[b.status]);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Source selector audit</title>
<style>body{font:15px system-ui;margin:24px;max-width:1200px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}code{white-space:pre-wrap;overflow-wrap:anywhere}.matched{color:#27733c}.unmatched,.invalid{color:#a32c24}</style>
<h1>Source selector audit</h1><p>${escapeHtml(JSON.stringify(report.summary))}</p><p>${escapeHtml(report.limits)}</p>
<p>Captured states: ${escapeHtml(report.states.map((state) => state.name).join(', '))}</p>
<h2>Capture and source gaps</h2><pre>${escapeHtml(JSON.stringify([...report.captureIssues, ...report.sourceErrors], null, 2))}</pre>
<table><thead><tr><th>Status</th><th>Source</th><th>Selectors and evidence</th></tr></thead><tbody>${rows.map((row) => `<tr><td class="${row.status}">${row.status}</td><td>${escapeHtml(row.file)}:${row.line}<details><summary>Expression</summary><code>${escapeHtml(row.expression)}</code></details></td><td>${row.candidates.map((candidate) => `<code>${escapeHtml(candidate.selector)}</code><br>${escapeHtml(candidate.states.join(', ') || candidate.errors.join('; ') || 'No match in captured states')}<br>`).join('')}${row.unresolved.length ? `<p>Unresolved: <code>${escapeHtml(row.unresolved.join('; '))}</code></p>` : ''}</td></tr>`).join('')}</tbody></table></html>`;
  await Promise.all([
    writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8'),
    writeFile(htmlPath, html, 'utf8'),
  ]);
  return { jsonPath, htmlPath };
}
