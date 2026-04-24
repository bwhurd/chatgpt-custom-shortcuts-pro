import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const devScrapeWidePath = path.join(repoRoot, 'extension', 'lib', 'DevScrapeWide.js');
const contentSourcePath = path.join(repoRoot, 'extension', 'content.js');
const outputPath = path.join(__dirname, 'chatgpt-devscrape-wide.user.js');

const EXPORTED_NAMES = [
  'DEV_SCRAPE_WIDE_FIXTURE_URL',
  'DEV_SCRAPE_WIDE_LAST_REPORT_KEY',
  'DEV_SCRAPE_WIDE_LAST_FOLDER_KEY',
  'DEV_SCRAPE_WIDE_CAPTURE_ROOT_REQUIRED_ERROR',
  'clearStoredCaptureRootHandle',
  'ensureCaptureRootHandle',
  'configureCaptureRootHandle',
  'isCaptureRootRequiredError',
  'getWideScrapePageInfo',
  'runWideScrapeInPage',
  'persistWideScrapeRun',
  'runWideScrapeCheck',
  'summarizeScrapeWriteResult',
  'summarizeCheckResult',
  'isAbortError',
];

const indentBlock = (text, spaces) => {
  const prefix = ' '.repeat(spaces);
  return String(text || '')
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : line))
    .join('\n');
};

const parseRegexLiteral = (literal) => {
  const match = String(literal || '').match(/^\/([\s\S]*)\/([a-z]*)$/);
  if (!match) {
    throw new Error(`Could not parse regex literal: ${literal}`);
  }
  return new RegExp(match[1], match[2]);
};

const buildSourcePresenceByIdentifier = (moduleSource, contentSource) => {
  const checkRulesMatch = moduleSource.match(/const CHECK_RULES = Object\.freeze\(\[(?<body>[\s\S]*?)\]\);/);
  const body = checkRulesMatch?.groups?.body;
  if (!body) {
    throw new Error('Could not find CHECK_RULES in DevScrapeWide.js');
  }

  const rulePattern =
    /identifier:\s*'(?<identifier>[^']+)'\s*,\s*sourcePattern:\s*(?<sourcePattern>\/(?:\\.|[^\/\r\n])+\/[a-z]*)/g;
  const matches = [...body.matchAll(rulePattern)];
  if (!matches.length) {
    throw new Error('Could not parse sourcePattern rules from DevScrapeWide.js');
  }

  return Object.fromEntries(
    matches.map((match) => {
      const identifier = match.groups?.identifier;
      const sourcePattern = match.groups?.sourcePattern;
      if (!identifier || !sourcePattern) {
        throw new Error('Parsed an incomplete CHECK_RULES entry');
      }
      return [identifier, parseRegexLiteral(sourcePattern).test(contentSource)];
    }),
  );
};

const rawDevScrapeWide = fs.readFileSync(devScrapeWidePath, 'utf8');
const rawContentSource = fs.readFileSync(contentSourcePath, 'utf8');
const sourcePresenceByIdentifier = buildSourcePresenceByIdentifier(rawDevScrapeWide, rawContentSource);
const sourcePresenceDeclaration = `const BUILD_SOURCE_PRESENCE_BY_IDENTIFIER = ${JSON.stringify(
  sourcePresenceByIdentifier,
  null,
  2,
)};`;

let transformedModule = rawDevScrapeWide.replace(/^\s*export\s+\{\s*isAbortError\s*\};?\s*$/m, '');
transformedModule = transformedModule.replace(/^export\s+/gm, '');
transformedModule = transformedModule.replace(
  /const \[\{ manifest, files \}, contentSource\] = await Promise\.all\(\[\s*loadRunFromDirectory\(latestRun\.handle\),\s*fetchPackagedText\(CONTENT_SOURCE_PATH\),\s*\]\);/,
  `const { manifest, files } = await loadRunFromDirectory(latestRun.handle);`,
);
if (!transformedModule.includes('const { manifest, files } = await loadRunFromDirectory(latestRun.handle);')) {
  throw new Error('Could not rewrite runWideScrapeCheck() content source load');
}
transformedModule = transformedModule.replace(
  'const sourcePresent = rule.sourcePattern.test(contentSource);',
  'const sourcePresent = BUILD_SOURCE_PRESENCE_BY_IDENTIFIER[rule.identifier] !== false;',
);
if (!transformedModule.includes('const sourcePresent = BUILD_SOURCE_PRESENCE_BY_IDENTIFIER[rule.identifier] !== false;')) {
  throw new Error('Could not rewrite runWideScrapeCheck() source presence test');
}

const moduleWrapper = `
const DevScrapeWide = (() => {
  const TM_STORAGE_PREFIX = 'tmDevScrapeWide:';
  const readTmStorageValue = (key) => {
    try {
      const raw = localStorage.getItem(TM_STORAGE_PREFIX + key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const writeTmStorageValue = (key, value) => {
    localStorage.setItem(TM_STORAGE_PREFIX + key, JSON.stringify(value));
  };
  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === 'string') return { [keys]: readTmStorageValue(keys) };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, readTmStorageValue(key)]));
          }
          if (keys && typeof keys === 'object') {
            return Object.fromEntries(
              Object.entries(keys).map(([key, fallback]) => [
                key,
                readTmStorageValue(key) ?? fallback,
              ]),
            );
          }
          return {};
        },
        async set(items) {
          Object.entries(items || {}).forEach(([key, value]) => {
            writeTmStorageValue(key, value);
          });
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          list.forEach((key) => {
            localStorage.removeItem(TM_STORAGE_PREFIX + key);
          });
        },
      },
    },
    runtime: {
      getURL(relativePath) {
        return String(relativePath || '');
      },
    },
  };

${indentBlock(sourcePresenceDeclaration, 2)}

${indentBlock(transformedModule, 2)}

  return {
    ${EXPORTED_NAMES.join(',\n    ')},
  };
})();
`.trim();

const userscriptBody = String.raw`
(function () {
  'use strict';

  ${moduleWrapper}

  const BUTTON_MIN_OPACITY = '0.08';
  const BUTTON_SIZE_PX = '24px';
  const BUTTON_RIGHT_PX = '16px';
  const BUTTON_FADE_DELAY_MS = 2200;
  const STATUS_BUBBLE_ID = 'tm-devscrape-wide-status';
  const BUTTON_SPECS = Object.freeze([
    {
      id: 'tm-devscrape-set-path',
      bottom: '80px',
      tooltip: 'Set Path',
      iconHtml:
        '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;"><path d="M3.5 7.5h5l2 2h10"/><path d="M4.5 6h4.3l1.8 1.8h8.9A1.5 1.5 0 0 1 21 9.3v8.2A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10A1.5 1.5 0 0 1 4.5 6z"/></svg>',
    },
    {
      id: 'tm-devscrape-run-wide',
      bottom: '48px',
      tooltip: 'DevScrapeWide',
      iconHtml:
        '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/><path d="M10.5 8v5"/><path d="M8 10.5h5"/></svg>',
    },
    {
      id: 'tm-devscrape-check-wide',
      bottom: '16px',
      tooltip: 'Check-Scrape',
      iconHtml:
        '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;"><path d="M9 12.5 11 14.5 15.5 9.5"/><path d="M14 4h5a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 4h5"/><path d="M8.5 4.5h5"/></svg>',
    },
  ]);

  const sleepAsync = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const buttonFadeTimers = new WeakMap();
  let statusFadeTimer = 0;
  let controlsMounted = false;

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const logStatus = (level, message, error = null) => {
    const method = typeof console?.[level] === 'function' ? console[level] : console.log;
    if (error) {
      method('[TM DevScrapeWide] ' + message, error);
      return;
    }
    method('[TM DevScrapeWide] ' + message);
  };

  const ensureStatusBubble = () => {
    let bubble = document.getElementById(STATUS_BUBBLE_ID);
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.id = STATUS_BUBBLE_ID;
    bubble.style.cssText = [
      'position: fixed',
      'right: 48px',
      'bottom: 16px',
      'max-width: 320px',
      'padding: 4px 8px',
      'border-radius: 999px',
      'background: rgba(17,24,39,.92)',
      'color: #f9fafb',
      'font: 11px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'box-shadow: 0 8px 20px rgba(0,0,0,.28)',
      'pointer-events: none',
      'opacity: 0',
      'transform: translateY(4px)',
      'transition: opacity .2s ease, transform .2s ease',
      'z-index: 2147483646',
      'white-space: nowrap',
      'overflow: hidden',
      'text-overflow: ellipsis',
    ].join(';');
    (document.body || document.documentElement).appendChild(bubble);
    return bubble;
  };

  const setStatus = (message, tone = 'neutral') => {
    const bubble = ensureStatusBubble();
    bubble.textContent = message || '';
    bubble.style.color =
      tone === 'error'
        ? '#fecaca'
        : tone === 'warn'
          ? '#fde68a'
          : tone === 'ok'
            ? '#bbf7d0'
            : '#f9fafb';
    bubble.style.opacity = message ? '1' : '0';
    bubble.style.transform = message ? 'translateY(0)' : 'translateY(4px)';
    window.clearTimeout(statusFadeTimer);
    if (!message) return;
    statusFadeTimer = window.setTimeout(() => {
      bubble.style.opacity = '0.08';
      bubble.style.transform = 'translateY(0)';
    }, 3600);
  };

  const setButtonOpacity = (button, value) => {
    button.style.opacity = String(value);
  };

  const scheduleButtonFade = (button) => {
    window.clearTimeout(buttonFadeTimers.get(button));
    const timer = window.setTimeout(() => {
      if (!button.matches(':hover') && !button.disabled) {
        setButtonOpacity(button, BUTTON_MIN_OPACITY);
      }
    }, BUTTON_FADE_DELAY_MS);
    buttonFadeTimers.set(button, timer);
  };

  const addTooltip = (button, text) => {
    const tooltip = document.createElement('div');
    tooltip.textContent = text;
    tooltip.style.cssText = [
      'position: absolute',
      'bottom: 50%',
      'right: 100%',
      'transform: translateX(-10px) translateY(50%)',
      'margin-right: 10px',
      'background: rgba(17,24,39,.96)',
      'color: #fff',
      'border-radius: 5px',
      'padding: 4px 8px',
      'font: 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'white-space: nowrap',
      'visibility: hidden',
      'opacity: 0',
      'transition: opacity .2s ease',
      'pointer-events: none',
      'box-shadow: 0 8px 20px rgba(0,0,0,.28)',
    ].join(';');
    button.appendChild(tooltip);
    return tooltip;
  };

  const createButton = (id, iconHTML, bottomPx, tooltipText, clickHandler) => {
    let button = document.getElementById(id);
    if (button instanceof HTMLButtonElement) return button;

    button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.setAttribute('aria-label', tooltipText);
    button.style.cssText = [
      'position: fixed',
      'width: ' + BUTTON_SIZE_PX,
      'height: ' + BUTTON_SIZE_PX,
      'padding: 0',
      'bottom: ' + bottomPx,
      'right: ' + BUTTON_RIGHT_PX,
      'border: none',
      'border-radius: 4px',
      'z-index: 2147483646',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'background: rgba(17,24,39,.92)',
      'box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 8px 20px rgba(0,0,0,.28)',
      'color: #f9fafb',
      'cursor: pointer',
      'opacity: 1',
      'transition: opacity .3s ease',
      'overflow: visible',
    ].join(';');
    button.innerHTML = iconHTML;

    const tooltip = addTooltip(button, tooltipText);
    button.addEventListener('mouseenter', () => {
      setButtonOpacity(button, '1');
      tooltip.style.visibility = 'visible';
      tooltip.style.opacity = '1';
    });
    button.addEventListener('mouseleave', () => {
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
      if (!button.disabled) {
        setButtonOpacity(button, BUTTON_MIN_OPACITY);
      }
    });
    button.addEventListener('click', clickHandler);

    (document.body || document.documentElement).appendChild(button);
    scheduleButtonFade(button);
    return button;
  };

  const getButtons = () =>
    BUTTON_SPECS.map((spec) => document.getElementById(spec.id)).filter(
      (button) => button instanceof HTMLButtonElement,
    );

  const setBusy = (value) => {
    getButtons().forEach((button) => {
      button.disabled = !!value;
      button.setAttribute('aria-busy', value ? 'true' : 'false');
      button.style.cursor = value ? 'progress' : 'pointer';
      if (value) {
        setButtonOpacity(button, '1');
      } else {
        scheduleButtonFade(button);
      }
    });
  };

  const ensureRootHandle = async () => {
    try {
      return await DevScrapeWide.ensureCaptureRootHandle(window, { interactive: false });
    } catch (error) {
      if (DevScrapeWide.isAbortError(error)) throw error;
      if (!DevScrapeWide.isCaptureRootRequiredError(error)) throw error;
      setStatus('Choose the inspector-captures folder...', 'warn');
      return DevScrapeWide.configureCaptureRootHandle(window);
    }
  };

  const renderReportHtml = (report) => {
    const rows = Array.isArray(report?.rows) ? report.rows : [];
    const missingArtifacts = Array.isArray(report?.missingArtifacts) ? report.missingArtifacts : [];
    const missingExpectedFiles = Array.isArray(report?.missingExpectedFiles)
      ? report.missingExpectedFiles
      : [];
    return [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"><title>DevScrapeWide Report</title>',
      '<style>',
      'body{font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#111827;background:#f8fafc;}',
      'h1{font-size:20px;margin:0 0 12px;}',
      'p{margin:0 0 10px;}',
      'table{border-collapse:collapse;width:100%;background:#fff;}',
      'th,td{border:1px solid #d1d5db;padding:8px 10px;text-align:left;vertical-align:top;}',
      'th{background:#e5e7eb;font-weight:600;}',
      '.ok{color:#166534;font-weight:700;}',
      '.fail{color:#991b1b;font-weight:700;}',
      '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}',
      '.section{margin-top:22px;}',
      'ul{margin:8px 0 0 20px;padding:0;}',
      '</style></head><body>',
      '<h1>DevScrapeWide Report</h1>',
      '<p><strong>Fixture:</strong> <span class="mono">' + escapeHtml(report?.fixtureUrl || '') + '</span></p>',
      '<p><strong>Folder:</strong> <span class="mono">' + escapeHtml(report?.folderName || '') + '</span></p>',
      '<p><strong>Summary:</strong> ' + escapeHtml(
        (report?.summary?.passed ?? 0) + ' passed, ' + (report?.summary?.failed ?? 0) + ' failed, ' + (report?.summary?.total ?? 0) + ' total.',
      ) + '</p>',
      '<table><thead><tr><th>Canonical Identifier</th><th>Dump Files</th><th>Status</th></tr></thead><tbody>',
      rows
        .map((row) => {
          const ok = row.status === 'pass';
          return [
            '<tr>',
            '<td class="mono">' + escapeHtml(row.identifier) + '</td>',
            '<td class="mono">' + escapeHtml((row.files || []).join(', ') || '(none)') + '</td>',
            '<td class="' + (ok ? 'ok' : 'fail') + '">' + (ok ? '✓' : 'X likely needs repair because the page changed') + '</td>',
            '</tr>',
          ].join('');
        })
        .join(''),
      '</tbody></table>',
      '<div class="section"><strong>Missing or Failed Dumps</strong>',
      missingArtifacts.length
        ? '<ul>' +
          missingArtifacts
            .map(
              (item) =>
                '<li><span class="mono">' +
                escapeHtml(item.filename) +
                '</span> — ' +
                escapeHtml(item.reason || 'Capture failed') +
                '</li>',
            )
            .join('') +
          '</ul>'
        : '<p>None.</p>',
      '</div>',
      '<div class="section"><strong>Missing Expected Files</strong>',
      missingExpectedFiles.length
        ? '<ul>' +
          missingExpectedFiles
            .map(
              (item) =>
                '<li><span class="mono">' +
                escapeHtml(item.identifier) +
                '</span> expected <span class="mono">' +
                escapeHtml(item.filename) +
                '</span></li>',
            )
            .join('') +
          '</ul>'
        : '<p>None.</p>',
      '</div>',
      '</body></html>',
    ].join('');
  };

  const openReportWindow = (report) => {
    const win = window.open('', '_blank', 'noopener');
    if (!win) return;
    win.document.open();
    win.document.write(renderReportHtml(report));
    win.document.close();
  };

  const mountControls = () => {
    if (controlsMounted) return;
    controlsMounted = true;

    const runWithBusyState = async (task) => {
      if (getButtons().some((button) => button.disabled)) return;
      try {
        setBusy(true);
        await task();
      } catch (error) {
        if (!DevScrapeWide.isAbortError(error)) {
          const message = error?.message || 'Unknown error';
          setStatus(message, 'error');
          logStatus('error', message, error);
        }
      } finally {
        setBusy(false);
      }
    };

    createButton(
      BUTTON_SPECS[0].id,
      BUTTON_SPECS[0].iconHtml,
      BUTTON_SPECS[0].bottom,
      BUTTON_SPECS[0].tooltip,
      () =>
        runWithBusyState(async () => {
          const rootHandle = await DevScrapeWide.configureCaptureRootHandle(window);
          const message =
            'Set Path configured for ' + (rootHandle?.name || 'inspector-captures') + '.';
          setStatus(message, 'ok');
          logStatus('info', message);
        }),
    );

    createButton(
      BUTTON_SPECS[1].id,
      BUTTON_SPECS[1].iconHtml,
      BUTTON_SPECS[1].bottom,
      BUTTON_SPECS[1].tooltip,
      () =>
        runWithBusyState(async () => {
          setStatus('Running wide scrape...', 'neutral');
          const scrapeResult = await DevScrapeWide.runWideScrapeInPage({
            windowObj: window,
            documentObj: document,
          });
          if (!scrapeResult || !Array.isArray(scrapeResult.artifacts)) {
            throw new Error(scrapeResult?.error || 'The ChatGPT page did not complete the scrape');
          }
          const rootHandle = await ensureRootHandle();
          const writeResult = await DevScrapeWide.persistWideScrapeRun({
            windowObj: window,
            rootHandle,
            scrapeResult,
          });
          const summary = DevScrapeWide.summarizeScrapeWriteResult(writeResult);
          const tone = scrapeResult.ok === false ? 'warn' : 'ok';
          setStatus(summary, tone);
          logStatus(tone === 'warn' ? 'warn' : 'info', summary);
        }),
    );

    createButton(
      BUTTON_SPECS[2].id,
      BUTTON_SPECS[2].iconHtml,
      BUTTON_SPECS[2].bottom,
      BUTTON_SPECS[2].tooltip,
      () =>
        runWithBusyState(async () => {
          setStatus('Checking latest scrape...', 'neutral');
          const rootHandle = await ensureRootHandle();
          const report = await DevScrapeWide.runWideScrapeCheck({ rootHandle });
          openReportWindow(report);
          const summary = DevScrapeWide.summarizeCheckResult(report);
          setStatus(summary, report.summary.failed ? 'warn' : 'ok');
          logStatus(report.summary.failed ? 'warn' : 'info', summary);
        }),
    );

    setStatus('Dev scrape ready', 'neutral');
  };

  const start = () => {
    if (document.body) {
      mountControls();
      return;
    }
    setTimeout(start, 50);
  };

  start();
})();
`;

const userscript = [
  '// ==UserScript==',
  '// @name         ChatGPT CSP DevScrapeWide',
  '// @namespace    https://chatgpt.com/',
  '// @version      0.1.0',
  '// @description  Dev-only ChatGPT scrape and check controls for selector validation.',
  '// @match        https://chatgpt.com/*',
  '// @run-at       document-idle',
  '// @grant        none',
  '// ==/UserScript==',
  '',
  '// Generated by tests/tampermonkey-dev-scrape/build-userscript.mjs',
  '',
  userscriptBody.trim(),
  '',
].join('\n');

fs.mkdirSync(__dirname, { recursive: true });
fs.writeFileSync(outputPath, userscript);
console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
