const CAPABILITY_NAMES = Object.freeze(['proEffort', 'configureRoute', 'dedicatedEffortControls']);
const CAPABILITY_VALUES = new Set(['available', 'unavailable', 'unknown']);
const LEGACY_CAPABILITY_KEYS = ['configureRoute', 'proEffort', 'schemaVersion', 'source'];
const CAPABILITY_KEYS = [
  'configureRoute',
  'dedicatedEffortControls',
  'proEffort',
  'schemaVersion',
  'source',
];
const FRESH_PROJECTION_SOURCE = 'fresh-current-model-catalog-action-projection-v2';

export function unknownCapabilities() {
  return {
    schemaVersion: 2,
    source: 'fresh-model-picker-v2',
    proEffort: 'unknown',
    configureRoute: 'unknown',
    dedicatedEffortControls: 'unknown',
  };
}

// Only a verified control from this invocation may establish its capability.
export function deriveFreshCapabilities({
  modelMenuText,
  modelMenuVerified = false,
  currentModelCatalogActionProjection,
} = {}) {
  const capabilities = unknownCapabilities();
  // The current slider uses id="pro" for its generic High position. Its
  // presence or absence proves neither Pro-only Standard/Extended support nor
  // unavailability. Keep that capability unknown without dedicated evidence.
  if (modelMenuVerified && typeof modelMenuText === 'string') {
    capabilities.configureRoute = modelMenuText.includes('model-configure-modal')
      ? 'available'
      : 'unavailable';
  }
  if (
    currentModelCatalogActionProjection?.schemaVersion === 2 &&
    currentModelCatalogActionProjection?.source === FRESH_PROJECTION_SOURCE &&
    currentModelCatalogActionProjection?.status === 'pass' &&
    currentModelCatalogActionProjection?.integratedEffort === true &&
    typeof currentModelCatalogActionProjection?.activeConfigId === 'string' &&
    currentModelCatalogActionProjection.activeConfigId.trim().length > 0 &&
    Array.isArray(currentModelCatalogActionProjection?.actions) &&
    currentModelCatalogActionProjection.actions.length > 0 &&
    Array.isArray(currentModelCatalogActionProjection?.issueCodes) &&
    currentModelCatalogActionProjection.issueCodes.length === 0
  ) {
    capabilities.dedicatedEffortControls = 'unavailable';
  }
  return capabilities;
}

export function assertCapabilities(capabilities) {
  const isLegacyCapabilities =
    capabilities?.schemaVersion === 1 &&
    Object.keys(capabilities || {})
      .sort()
      .join('|') === LEGACY_CAPABILITY_KEYS.join('|') &&
    capabilities.source === 'fresh-model-picker-v1';
  const isCurrentCapabilities =
    capabilities?.schemaVersion === 2 &&
    Object.keys(capabilities || {})
      .sort()
      .join('|') === CAPABILITY_KEYS.join('|') &&
    capabilities.source === 'fresh-model-picker-v2';
  if (
    !capabilities ||
    typeof capabilities !== 'object' ||
    Array.isArray(capabilities) ||
    (!isLegacyCapabilities && !isCurrentCapabilities) ||
    !['proEffort', 'configureRoute'].every((name) => CAPABILITY_VALUES.has(capabilities[name])) ||
    (isCurrentCapabilities && !CAPABILITY_VALUES.has(capabilities.dedicatedEffortControls))
  ) {
    throw new Error('Capability evidence has an invalid code-owned schema.');
  }
  return capabilities;
}

export function getUnavailableCapabilities(requiredCapabilities, capabilities) {
  if (capabilities === undefined || capabilities === null) return [];
  assertCapabilities(capabilities);
  if (requiredCapabilities === undefined) return [];
  if (
    !Array.isArray(requiredCapabilities) ||
    new Set(requiredCapabilities).size !== requiredCapabilities.length ||
    !requiredCapabilities.every((name) => CAPABILITY_NAMES.includes(name))
  ) {
    throw new Error('Required capability annotations are invalid.');
  }
  return requiredCapabilities.filter((name) => capabilities[name] === 'unavailable');
}
