import { getUnavailableCapabilities } from './shortcut-capabilities.mjs';

export function targetMatchesText(target, text) {
  const haystack = String(text || '');
  const matchGroups = Array.isArray(target?.matchGroups) ? target.matchGroups : [];
  return matchGroups.some((group) => {
    const needles = Array.isArray(group) ? group : [group];
    const requiredNeedles = needles.filter(Boolean);
    return (
      requiredNeedles.length > 0 &&
      requiredNeedles.every((needle) => haystack.includes(String(needle)))
    );
  });
}

export function targetMatchesTokens(target, tokens) {
  const tokenSet = tokens instanceof Set ? tokens : new Set(Array.isArray(tokens) ? tokens : []);
  const matchGroups = Array.isArray(target?.matchGroups) ? target.matchGroups : [];
  return matchGroups.some((group) => {
    const needles = Array.isArray(group) ? group : [group];
    const requiredNeedles = needles.filter(Boolean);
    return (
      requiredNeedles.length > 0 && requiredNeedles.every((needle) => tokenSet.has(String(needle)))
    );
  });
}

export function evaluateTargetPresence(
  target,
  files,
  { matches = targetMatchesText, capabilities } = {},
) {
  const allMatchedFiles = Object.entries(files)
    .filter(([, text]) => matches(target, text))
    .map(([fileName]) => fileName)
    .sort();
  const expectedFiles = Array.isArray(target.expectedFiles) ? target.expectedFiles : [];
  const missingExpectedFiles = expectedFiles.filter((fileName) => !Object.hasOwn(files, fileName));
  const matchedExpectedFiles = expectedFiles.filter((fileName) => matches(target, files[fileName]));
  const hasMatchGroups = Array.isArray(target.matchGroups) && target.matchGroups.length > 0;
  let status = 'pass';
  let statusReason = 'Target matched at least one expected scrape dump.';

  if ((target.unknownUiStateRefs || []).length > 0) {
    status = 'fail';
    statusReason = `Target references unknown scrape state(s): ${target.unknownUiStateRefs.join(', ')}`;
  } else if (target.missingMatchGroups) {
    status = 'fail';
    statusReason = 'Target has scrape state coverage but no deterministic match group.';
  } else {
    const unavailableCapabilities = getUnavailableCapabilities(
      target.requiredCapabilities,
      capabilities,
    );
    if (unavailableCapabilities.length > 0) {
      status = 'not-applicable';
      statusReason = `Required capability is unavailable: ${unavailableCapabilities.join(', ')}.`;
    } else if (!expectedFiles.length || !hasMatchGroups) {
      status = 'no-scrape-coverage';
      statusReason =
        target.notes ||
        'The target is known, but the current scrape family does not capture a deterministic dump for it yet.';
    } else if (missingExpectedFiles.length > 0) {
      status = 'fail';
      statusReason = `Expected dump files were missing: ${missingExpectedFiles.join(', ')}`;
    } else if (!matchedExpectedFiles.length) {
      status = 'fail';
      statusReason = 'Target was not found in any expected scrape dump.';
    }
  }

  return {
    expectedFiles,
    matchedExpectedFiles,
    allMatchedFiles,
    missingExpectedFiles,
    status,
    statusReason,
  };
}
