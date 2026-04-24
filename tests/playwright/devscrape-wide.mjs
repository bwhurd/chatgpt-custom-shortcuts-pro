import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

import { chromium } from 'playwright';

import {
  buildCheckReport,
  ensureInspectorCapturesRoot,
  evaluateWideScrapePageInfo,
  getInspectorCapturesRoot,
  getRepoRoot,
  injectDevScrapeWideIntoPage,
  loadDevScrapeWideContract,
  normalizeArtifactsInPage,
  runLiveShortcutActivationProbes,
  runWideScrapeWithPlaywright,
  verifyExtensionRuntimeReachable,
  waitForEndpointReady,
  waitForFixtureConversationReady,
  writeCheckReportFiles,
  writeLiveProbeReport,
  writeScrapeRun,
} from './lib/devscrape-wide-core.mjs';

const args = process.argv.slice(2);

function getArgValue(flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) return fallback;
  return args[index + 1];
}

function getArgValues(flag) {
  const values = [];
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === flag) values.push(args[index + 1]);
  }
  return values;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function getChromeBinary() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const explicit = getArgValue('--chrome-path', null);
  if (explicit) return explicit;
  return candidates[0];
}

function getExtensionDir() {
  return path.join(getRepoRoot(), 'extension');
}

function getUserDataDirRoot() {
  const explicit = getArgValue('--user-data-dir-root', null);
  if (explicit) return explicit;
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'User Data');
}

function getProfileName() {
  return getArgValue('--profile-name', 'CodexCleanProfile');
}

function getProfileDir() {
  return path.join(getUserDataDirRoot(), getProfileName());
}

function getCdpEndpoint() {
  return getArgValue('--cdp-endpoint', 'http://127.0.0.1:9333');
}

function getCandidateCdpEndpoints() {
  const explicit = getArgValue('--cdp-endpoint', null);
  if (explicit) return [explicit];
  return [
    'http://127.0.0.1:9333',
    'http://127.0.0.1:9222',
    'http://127.0.0.1:9223',
  ];
}

function getAction() {
  return getArgValue('--action', 'scrape-wide');
}

function shouldAutoLaunchChrome() {
  return !hasFlag('--no-auto-launch');
}

function shouldRequireExtensionCapture() {
  return hasFlag('--require-extension-capture');
}

function shouldProbeShortcuts() {
  return hasFlag('--probe-shortcuts');
}

function shouldPauseForExtensionSetup() {
  return hasFlag('--pause-for-extension-setup');
}

function printUsage() {
  console.log(`Usage:
  node tests/playwright/devscrape-wide.mjs --action setup-login
  node tests/playwright/devscrape-wide.mjs --action scrape-wide
  node tests/playwright/devscrape-wide.mjs --action check-wide [--folder FOLDER_NAME]
  node tests/playwright/devscrape-wide.mjs --action validate-wide
  node tests/playwright/devscrape-wide.mjs --action probe-shortcuts [--shortcut-action-id ACTION_ID]

Options:
  --cdp-endpoint URL       Force one CDP endpoint instead of probing the usual candidates
  --profile-name NAME      Default: CodexCleanProfile
  --chrome-path PATH       Override the Chrome binary used by setup-login
  --user-data-dir-root DIR Override the Chrome user data root used by setup-login
  --no-auto-launch         Require an already-running CDP Chrome for scrape/validate
  --require-extension-capture
                           Fail validate-wide if the optional extension-backed 1c dump is not captured
  --probe-shortcuts        Run no-token-safe live shortcut activation probes after scrape
  --shortcut-action-id ID  Limit probe-shortcuts to one shortcut. May be repeated.
  --pause-for-extension-setup
                           Pause after Chrome/CDP startup so the unpacked extension can be loaded manually
  --folder NAME            Folder to check instead of the newest scrape
`);
}

async function settleFixturePage(page) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await waitForFixtureConversationReady(page, 12000);
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForFixtureConversationReady(page, 30000);
  }
  await page.waitForTimeout(500);
}

async function launchSetupLogin() {
  const preferredEndpoint = getCdpEndpoint();
  const profileDir = getProfileDir();
  const chromeBinary = getChromeBinary();

  await mkdir(profileDir, { recursive: true });

  const existing = await findReachableEndpoint();
  if (existing) {
    console.log(`Reusing live CDP endpoint: ${existing.endpoint}`);
    console.log(`Browser: ${existing.version.Browser}`);
    console.log(`Chrome profile: ${profileDir}`);
    console.log('Open ChatGPT manually in that Chrome window and log in there if needed.');
    if (shouldPauseForExtensionSetup()) {
      const browser = await chromium.connectOverCDP(existing.endpoint);
      try {
        const context = browser.contexts()[0];
        if (!context) {
          throw new Error('No browser context was available over CDP');
        }
        await pauseForExtensionSetupIfNeeded(context, existing.endpoint);
      } finally {
        await browser.close().catch(() => {});
      }
    }
    return;
  }

  await launchChromeForCdp({
    initialUrl: shouldPauseForExtensionSetup() ? 'chrome://extensions' : 'about:blank',
    loadExtension: !shouldPauseForExtensionSetup(),
  });

  console.log(`Launched Chrome for manual login.`);
  console.log(`Chrome binary: ${chromeBinary}`);
  console.log(`Profile dir: ${profileDir}`);
  console.log(`CDP endpoint: ${preferredEndpoint}`);
  console.log('Open ChatGPT manually in that Chrome window and log in there if needed.');
  if (shouldPauseForExtensionSetup()) {
    console.log('Chrome was launched without extension override flags for manual Developer Mode setup.');
  } else {
    console.log('The local unpacked extension is loaded for the validation-only topbar capture.');
  }
  if (shouldPauseForExtensionSetup()) {
    const browser = await chromium.connectOverCDP(preferredEndpoint);
    try {
      const context = browser.contexts()[0];
      if (!context) {
        throw new Error('No browser context was available over CDP');
      }
      await pauseForExtensionSetupIfNeeded(context, preferredEndpoint);
    } finally {
      await browser.close().catch(() => {});
    }
  }
}

async function pauseForManualExtensionSetup({ cdpEndpoint, profileDir, extensionDir }) {
  console.log('');
  console.log('Manual extension setup pause requested.');
  console.log(`CDP endpoint: ${cdpEndpoint}`);
  console.log(`Chrome profile: ${profileDir}`);
  console.log(`Unpacked extension folder: ${extensionDir}`);
  console.log('In the launched Chrome window, open chrome://extensions, enable Developer mode, and load or enable that unpacked extension folder.');
  console.log('After it is loaded and enabled, return here and press Enter to continue.');

  if (!process.stdin.isTTY) {
    console.log('No interactive stdin is available; waiting 90 seconds before continuing.');
    await new Promise((resolve) => setTimeout(resolve, 90000));
    return;
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await readline.question('Press Enter after the extension is loaded...');
  } finally {
    readline.close();
  }
}

async function pauseForExtensionSetupIfNeeded(context, cdpEndpoint) {
  try {
    const result = await verifyExtensionRuntimeReachable(context, {
      extensionProfileDir: getProfileDir(),
    });
    console.log(`Extension already reachable: ${result.extensionId}`);
    return;
  } catch (error) {
    console.log(`Extension setup check failed: ${error?.message || error}`);
  }

  await pauseForManualExtensionSetup({
    cdpEndpoint,
    profileDir: getProfileDir(),
    extensionDir: getExtensionDir(),
  });

  const result = await verifyExtensionRuntimeReachable(context, {
    extensionProfileDir: getProfileDir(),
  });
  console.log(`Extension reachable after setup: ${result.extensionId}`);
}

async function launchChromeForCdp({
  initialUrl = 'about:blank',
  loadExtension = false,
} = {}) {
  const chromeBinary = getChromeBinary();
  const profileDir = getProfileDir();
  const preferredEndpoint = getCdpEndpoint();
  const endpointUrl = new URL(preferredEndpoint);

  await mkdir(profileDir, { recursive: true });

  const launchArgs = [
    `--remote-debugging-address=${endpointUrl.hostname}`,
    `--remote-debugging-port=${endpointUrl.port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
  ];
  if (loadExtension) {
    const extensionDir = getExtensionDir();
    launchArgs.push(
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
    );
  }
  launchArgs.push(initialUrl);

  const child = spawn(chromeBinary, launchArgs, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  await waitForEndpointReady(preferredEndpoint, 15000);
  return {
    endpoint: preferredEndpoint,
    chromeBinary,
    profileDir,
    child,
  };
}

async function waitForExistingEndpoint(endpoint) {
  try {
    return await waitForEndpointReady(endpoint, 1000);
  } catch {
    return null;
  }
}

async function findReachableEndpoint() {
  const candidates = getCandidateCdpEndpoints();
  const results = await Promise.all(
    candidates.map(async (endpoint) => ({
      endpoint,
      version: await waitForExistingEndpoint(endpoint),
    })),
  );
  return results.find((result) => result.version) || null;
}

async function connectToAttachedBrowser({
  autoLaunch = false,
  initialUrl = 'about:blank',
  loadExtension = false,
  pauseForExtensionSetup = false,
} = {}) {
  const discovered = await findReachableEndpoint();
  let cdpEndpoint = discovered?.endpoint || null;
  let launched = null;
  if (!cdpEndpoint && autoLaunch) {
    launched = await launchChromeForCdp({ initialUrl, loadExtension });
    cdpEndpoint = launched.endpoint;
    console.log(`Launched Chrome for validation: ${launched.chromeBinary}`);
    console.log(`Chrome profile: ${launched.profileDir}`);
  }
  cdpEndpoint = cdpEndpoint || getCdpEndpoint();
  await waitForEndpointReady(cdpEndpoint, 5000);
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new Error('No browser context was available over CDP');
  }
  if (pauseForExtensionSetup) {
    await pauseForExtensionSetupIfNeeded(context, cdpEndpoint);
  }
  return { browser, context, cdpEndpoint, launched };
}

async function scrapeWide({
  autoLaunch = shouldAutoLaunchChrome(),
  requireExtensionCapture = shouldRequireExtensionCapture(),
  probeShortcuts = shouldProbeShortcuts(),
} = {}) {
  const { exports } = await loadDevScrapeWideContract();
  await ensureInspectorCapturesRoot();
  const { browser, context, cdpEndpoint, launched } = await connectToAttachedBrowser({
    autoLaunch,
    initialUrl: shouldPauseForExtensionSetup()
      ? 'chrome://extensions'
      : exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    loadExtension: !shouldPauseForExtensionSetup(),
    pauseForExtensionSetup: shouldPauseForExtensionSetup(),
  });
  const page = await context.newPage();

  try {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await page.goto(exports.DEV_SCRAPE_WIDE_FIXTURE_URL, { waitUntil: 'domcontentloaded' });
    await settleFixturePage(page);
    await injectDevScrapeWideIntoPage(page);

    const pageInfo = await evaluateWideScrapePageInfo(page);
    console.log(`CDP endpoint: ${cdpEndpoint}`);
    console.log(`Fixture URL: ${exports.DEV_SCRAPE_WIDE_FIXTURE_URL}`);
    console.log(`Require extension capture: ${requireExtensionCapture ? 'yes' : 'no'}`);
    console.log(`Probe shortcuts: ${probeShortcuts ? 'yes' : 'no'}`);
    console.log(
      `Conversation turns detected: ${pageInfo.turnCount} (assistant=${pageInfo.assistantTurnCount}, user=${pageInfo.userTurnCount})`,
    );

    const scrapeResult = await runWideScrapeWithPlaywright(page, context, {
      requireExtensionCapture,
      extensionProfileDir: getProfileDir(),
    });
    if (!scrapeResult?.artifacts) {
      throw new Error(scrapeResult?.error || 'Scrape did not return artifacts');
    }

    await injectDevScrapeWideIntoPage(page);
    const artifactsToNormalize = scrapeResult.artifacts.filter(
      (artifact) => artifact.status === 'captured' || artifact.status === 'alias',
    );
    const normalizedArtifacts = await normalizeArtifactsInPage(page, artifactsToNormalize);
    const writeResult = await writeScrapeRun({ scrapeResult, normalizedArtifacts });
    if (probeShortcuts) {
      const liveProbeReport = await runLiveShortcutActivationProbes(page, context, {
        extensionProfileDir: getProfileDir(),
      });
      const liveProbePath = await writeLiveProbeReport(writeResult.folderPath, liveProbeReport);
      console.log(
        `Live shortcut probes: ${liveProbeReport.summary.passed} passed, ${liveProbeReport.summary.failed} failed, ${liveProbeReport.summary.environmentFailed} environment-failed, ${liveProbeReport.summary.notLiveProbed} not live-probed.`,
      );
      console.log(`Live probe report: ${liveProbePath}`);
    }
    const summary = exports.summarizeScrapeWriteResult(writeResult);

    console.log(summary);
    console.log(`Run folder: ${writeResult.folderPath}`);
    console.log(`Capture root: ${getInspectorCapturesRoot()}`);
    return writeResult;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    if (launched?.child?.pid) {
      try {
        launched.child.kill();
      } catch {}
    }
  }
}

async function checkWide() {
  const folderName = getArgValue('--folder', null);
  return checkWideForFolder(folderName);
}

function openLocalFile(filePath) {
  if (process.platform === 'win32') {
    const child = spawn('cmd', ['/c', 'start', '', filePath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return;
  }
  if (process.platform === 'darwin') {
    const child = spawn('open', [filePath], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }
  const child = spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function validateWide() {
  const requireExtensionCapture = shouldRequireExtensionCapture();
  const writeResult = await scrapeWide({
    autoLaunch: shouldAutoLaunchChrome(),
    requireExtensionCapture,
    probeShortcuts: shouldProbeShortcuts(),
  });
  const { report, reportFiles } = await checkWideForFolder(writeResult.folderName);
  openLocalFile(reportFiles.htmlPath);
  if (requireExtensionCapture && Array.isArray(report.missingArtifacts) && report.missingArtifacts.length > 0) {
    throw new Error(
      `Strict extension capture failed with ${report.missingArtifacts.length} failed artifact(s). See ${reportFiles.htmlPath}`,
    );
  }
  return { folderName: writeResult.folderName, reportFiles };
}

async function probeShortcutsOnly() {
  const { exports } = await loadDevScrapeWideContract();
  const onlyActionIds = getArgValues('--shortcut-action-id');
  const { browser, context, cdpEndpoint, launched } = await connectToAttachedBrowser({
    autoLaunch: shouldAutoLaunchChrome(),
    initialUrl: exports.DEV_SCRAPE_WIDE_FIXTURE_URL,
    loadExtension: false,
  });
  const page = await context.newPage();
  try {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await page.goto(exports.DEV_SCRAPE_WIDE_FIXTURE_URL, { waitUntil: 'domcontentloaded' });
    await settleFixturePage(page);
    const liveProbeReport = await runLiveShortcutActivationProbes(page, context, {
      extensionProfileDir: getProfileDir(),
      onlyActionIds,
    });
    console.log(
      `Live shortcut probes: ${liveProbeReport.summary.passed} passed, ${liveProbeReport.summary.failed} failed, ${liveProbeReport.summary.skipped} skipped, ${liveProbeReport.summary.environmentFailed} environment-failed.`,
    );
    for (const row of liveProbeReport.rows.filter((item) =>
      ['fail', 'skipped', 'environment-fail'].includes(item.status),
    )) {
      console.log(`${row.status.toUpperCase()}: ${row.actionId} - ${row.reason}`);
    }
    console.log(`CDP endpoint: ${cdpEndpoint}`);
    return liveProbeReport;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    if (launched?.child?.pid) {
      try {
        launched.child.kill();
      } catch {}
    }
  }
}

async function checkWideForFolder(folderName) {
  const { exports } = await loadDevScrapeWideContract();
  const report = await buildCheckReport({ folderName });
  const reportFiles = await writeCheckReportFiles(report);
  const summary = exports.summarizeCheckResult(report);

  console.log(summary);
  console.log(`Run folder: ${report.folderPath}`);
  console.log(`JSON report: ${reportFiles.jsonPath}`);
  console.log(`HTML report: ${reportFiles.htmlPath}`);
  if (Array.isArray(report.inventoryIssues) && report.inventoryIssues.length > 0) {
    throw new Error(
      `Shortcut metadata guard failed with ${report.inventoryIssues.length} issue(s). See ${reportFiles.htmlPath}`,
    );
  }
  return { report, reportFiles };
}

async function main() {
  const action = getAction();
  if (hasFlag('--help') || hasFlag('-h')) {
    printUsage();
    return;
  }

  if (action === 'setup-login') {
    await launchSetupLogin();
    return;
  }

  if (action === 'scrape-wide') {
    await scrapeWide();
    return;
  }

  if (action === 'check-wide') {
    await checkWide();
    return;
  }

  if (action === 'validate-wide') {
    await validateWide();
    return;
  }

  if (action === 'probe-shortcuts') {
    await probeShortcutsOnly();
    return;
  }

  throw new Error(`Unknown action "${action}"`);
}

main().catch((error) => {
  console.error(`[DevScrapeWide Playwright] ${error?.message || error}`);
  process.exitCode = 1;
});
