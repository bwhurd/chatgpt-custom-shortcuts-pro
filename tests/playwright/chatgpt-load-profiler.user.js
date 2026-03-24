// ==UserScript==
// @name         ChatGPT CSP Load Profiler
// @namespace    https://chatgpt.com/
// @version      0.1.0
// @description  Logs simple reload timings for ChatGPT with CSP off/on and moveTopBarToBottom off/on.
// @match        https://chatgpt.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LOG_KEY = 'tm_csp_chatgpt_load_profiler_v1';
  const MAX_LOGS = 200;
  const POLL_MS = 250;
  const MIN_VISIBLE_SETTLE_MS = 1500;
  const EXTENSION_SETTLE_AFTER_COMPLETE_MS = 4000;
  const MAX_WAIT_MS = 15000;

  const roundMs = (value) =>
    Number.isFinite(value) ? Math.round(value * 10) / 10 : null;

  const nowMs = () => roundMs(performance.now());

  const readLogs = () => {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  };

  const writeLogs = (logs) => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-MAX_LOGS)));
    } catch (_) {}
  };

  const nav = performance.getEntriesByType('navigation')[0] || null;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    runId,
    startedAtIso: new Date().toISOString(),
    href: location.href,
    pathname: location.pathname,
    search: location.search,
    titleInitial: document.title || '',
    titleFinal: '',
    navType: nav?.type || 'unknown',
    timings: {
      fetchStart: roundMs(nav?.fetchStart),
      responseEnd: roundMs(nav?.responseEnd),
      domInteractive: roundMs(nav?.domInteractive),
      domContentLoaded: roundMs(nav?.domContentLoadedEventEnd),
      loadEventEnd: roundMs(nav?.loadEventEnd),
      domComplete: roundMs(nav?.domComplete),
      firstContentfulPaint: null,
      largestContentfulPaint: null,
      extensionDetected: null,
      pageHeaderSeen: null,
      bottomBarDetected: null,
      bottomBarReady: null,
      completeSeen: null,
      finalized: null,
    },
    scenario: 'undetermined',
  };

  let finalized = false;
  let loadEventSeenAt = null;
  let titleLast = document.title || '';

  const hasExtensionMarker = () =>
    !!(
      document.getElementById('csp-hide-disclaimer-style') ||
      document.getElementById('csp-fade-message-buttons-style') ||
      document.documentElement.classList.contains('csp-bottom-bar-ready') ||
      document.body.classList.contains('csp-bottom-bar-ready')
    );

  const hasBottomBar = () => !!document.getElementById('bottomBarContainer');

  const hasBottomBarReady = () =>
    !!(
      document.documentElement.classList.contains('csp-bottom-bar-ready') ||
      document.body.classList.contains('csp-bottom-bar-ready') ||
      document.querySelector(
        '#bottomBarContainer button[data-id="static-sidebar-btn"], #bottomBarContainer button[data-testid="model-switcher-dropdown-button"]',
      )
    );

  const scan = () => {
    titleLast = document.title || titleLast;

    if (record.timings.pageHeaderSeen == null && document.querySelector('#page-header')) {
      record.timings.pageHeaderSeen = nowMs();
    }

    if (record.timings.extensionDetected == null && hasExtensionMarker()) {
      record.timings.extensionDetected = nowMs();
    }

    if (record.timings.bottomBarDetected == null && hasBottomBar()) {
      record.timings.bottomBarDetected = nowMs();
    }

    if (record.timings.bottomBarReady == null && hasBottomBarReady()) {
      record.timings.bottomBarReady = nowMs();
    }

    if (record.timings.completeSeen == null && document.readyState === 'complete') {
      record.timings.completeSeen = nowMs();
    }
  };

  const computeScenario = () => {
    if (record.timings.extensionDetected == null) return 'extension_not_loaded';
    if (record.timings.bottomBarDetected != null || record.timings.bottomBarReady != null) {
      return 'extension_loaded_moveTopBarToBottomCheckbox_true';
    }
    return 'extension_loaded_moveTopBarToBottomCheckbox_false';
  };

  const emitSummary = () => {
    const summary = {
      scenario: record.scenario,
      title: record.titleFinal,
      path: record.pathname,
      navType: record.navType,
      domContentLoadedMs: record.timings.domContentLoaded,
      loadEventEndMs: record.timings.loadEventEnd,
      domCompleteMs: record.timings.domComplete,
      fcpMs: record.timings.firstContentfulPaint,
      lcpMs: record.timings.largestContentfulPaint,
      extensionDetectedMs: record.timings.extensionDetected,
      bottomBarDetectedMs: record.timings.bottomBarDetected,
      bottomBarReadyMs: record.timings.bottomBarReady,
      extensionAfterLoadMs:
        record.timings.bottomBarReady != null && record.timings.loadEventEnd != null
          ? roundMs(record.timings.bottomBarReady - record.timings.loadEventEnd)
          : null,
      finalizedMs: record.timings.finalized,
    };

    console.groupCollapsed(
      `[CSP Load Profiler] ${summary.scenario} | ${summary.title || '(untitled)'}`,
    );
    console.table([summary]);
    console.log('Raw record:', record);
    console.log(
      'Helpers: window.__cspLoadProfiler.dump(), window.__cspLoadProfiler.last(), window.__cspLoadProfiler.clear()',
    );
    console.groupEnd();
  };

  const finalize = () => {
    if (finalized) return;
    finalized = true;

    scan();
    record.titleFinal = titleLast || document.title || '';
    record.scenario = computeScenario();
    record.timings.finalized = nowMs();

    const logs = readLogs();
    logs.push(record);
    writeLogs(logs);
    emitSummary();
  };

  const shouldFinalize = () => {
    const now = nowMs();
    if (now >= MAX_WAIT_MS) return true;

    const completeSeen = record.timings.completeSeen;
    if (completeSeen == null) return false;

    if (record.timings.extensionDetected == null) {
      return now >= completeSeen + MIN_VISIBLE_SETTLE_MS;
    }

    if (record.timings.bottomBarReady != null) {
      return now >= Math.max(record.timings.bottomBarReady + 500, completeSeen + 1000);
    }

    return now >= completeSeen + EXTENSION_SETTLE_AFTER_COMPLETE_MS;
  };

  const intervalId = setInterval(() => {
    if (finalized) {
      clearInterval(intervalId);
      return;
    }

    scan();
    if (shouldFinalize()) {
      clearInterval(intervalId);
      finalize();
    }
  }, POLL_MS);

  window.addEventListener(
    'load',
    () => {
      loadEventSeenAt = nowMs();
      if (record.timings.loadEventEnd == null) record.timings.loadEventEnd = loadEventSeenAt;
    },
    { once: true },
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden' && !finalized) {
        finalize();
      }
    },
    { passive: true },
  );

  const paintObserver =
    'PerformanceObserver' in window
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint' && record.timings.firstContentfulPaint == null) {
              record.timings.firstContentfulPaint = roundMs(entry.startTime);
            }
          }
        })
      : null;

  try {
    paintObserver?.observe({ type: 'paint', buffered: true });
  } catch (_) {}

  const lcpObserver =
    'PerformanceObserver' in window
      ? new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const last = entries[entries.length - 1];
          if (last) record.timings.largestContentfulPaint = roundMs(last.startTime);
        })
      : null;

  try {
    lcpObserver?.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  window.__cspLoadProfiler = {
    dump() {
      const logs = readLogs();
      console.table(
        logs.map((item) => ({
          startedAtIso: item.startedAtIso,
          scenario: item.scenario,
          title: item.titleFinal || item.titleInitial,
          path: item.pathname,
          domContentLoadedMs: item.timings?.domContentLoaded ?? null,
          loadEventEndMs: item.timings?.loadEventEnd ?? null,
          lcpMs: item.timings?.largestContentfulPaint ?? null,
          bottomBarReadyMs: item.timings?.bottomBarReady ?? null,
        })),
      );
      return logs;
    },
    last() {
      const logs = readLogs();
      return logs[logs.length - 1] || null;
    },
    clear() {
      localStorage.removeItem(LOG_KEY);
      console.info('[CSP Load Profiler] Cleared stored logs.');
    },
  };
})();
