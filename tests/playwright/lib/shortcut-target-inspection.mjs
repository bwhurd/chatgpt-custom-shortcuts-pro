import composerShortcuts from '../../../extension/shortcuts/composer.js';
import nativeSearch from '../../../extension/shortcuts/search.js';

// Runs in the existing extension world. No injection, preparation or activation.
export function readInstalledTargets(actionIds, expectedSources) {
  return actionIds.map((actionId) => {
    const moduleKey =
      actionId === 'shortcutKeySearchConversationHistory'
        ? 'search'
        : ['shortcutKeyActivateInput', 'shortcutKeyStudy'].includes(actionId)
          ? 'composer'
          : null;
    const base = { actionId, implementation: moduleKey ? 'shared-resolver' : 'legacy' };
    if (!moduleKey) return { ...base, status: 'unavailable', reason: 'legacy-resolver' };
    const namespace = globalThis.CSPShortcuts;
    if (namespace?.[moduleKey]?.sourceSignature !== expectedSources[moduleKey])
      return { ...base, status: 'unavailable', reason: 'extension-module-missing-or-stale' };
    if (typeof namespace.inspect !== 'function')
      return { ...base, status: 'unavailable', reason: 'inspection-facade-unavailable' };
    return namespace.inspect(actionId);
  });
}

export function inspectionExitCode(rows) {
  if (rows.some((row) => row.status === 'missing' || row.status === 'ambiguous')) return 1;
  return rows.length && rows.every((row) => row.status === 'ready') ? 0 : 2;
}

export function validateInspectionArgs(args) {
  const flags = new Set([
    '--action',
    '--inspect-targets',
    '--shortcut-action-id',
    '--cdp-endpoint',
    '--page-url',
    '--no-open-report',
  ]);
  for (const arg of args) {
    if (arg.startsWith('--') && !flags.has(arg))
      throw new Error(
        `--inspect-targets cannot be combined with ${arg}; inspection never prepares or activates targets.`,
      );
  }
}

export async function inspectInstalledShortcutTargets(context, page, actionIds) {
  const fallback = (reason) => ({
    inspectionOnly: true,
    proofScope: 'installed-target-resolution-only',
    rows: actionIds.map((actionId) => ({ actionId, status: 'unavailable', reason })),
  });
  const session = await context.newCDPSession(page);
  const contexts = [];
  session.on('Runtime.executionContextCreated', ({ context: executionContext }) => {
    if (executionContext) contexts.push(executionContext);
  });
  try {
    await session.send('Runtime.enable');
    const matches = contexts.filter(
      (item) =>
        item.name === 'ChatGPT Custom Shortcuts Pro' &&
        String(item.origin || '').startsWith('chrome-extension://') &&
        item.auxData?.isDefault !== true,
    );
    if (matches.length !== 1) return fallback('extension-context-missing-or-ambiguous');
    const result = await session.send('Runtime.evaluate', {
      contextId: matches[0].id,
      returnByValue: true,
      expression: `(${readInstalledTargets.toString()})(${JSON.stringify(actionIds)}, ${JSON.stringify({ search: nativeSearch.sourceSignature, composer: composerShortcuts.sourceSignature })})`,
    });
    if (result.exceptionDetails || !Array.isArray(result.result?.value))
      return fallback('inspection-evaluation-failed');
    return {
      inspectionOnly: true,
      proofScope: 'installed-target-resolution-only',
      rows: result.result.value,
    };
  } finally {
    await session.detach();
  }
}
