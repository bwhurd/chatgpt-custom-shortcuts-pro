(() => {
  const LAZY_FAST_MODE_SETTING_KEY = 'lazyFastModeEnabled';
  const LAZY_FAST_MODE_FORCE_INERT = false;
  const LAZY_FAST_MODE_FULL_DISABLE = true;
  globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;

  const SCRIPT_ID = 'csp-lazy-fast-bridge';
  const config = Object.freeze({
    retainedTurnCount: 24,
    minTurnCountToTrim: 40,
    logPrefix: '[CSP Lazy Fast Mode]',
  });

  const injectBridge = () => {
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = chrome.runtime.getURL('lazy-fast-bridge.js');
    script.dataset.retainedTurnCount = String(config.retainedTurnCount);
    script.dataset.minTurnCountToTrim = String(config.minTurnCountToTrim);
    script.dataset.logPrefix = config.logPrefix;
    script.async = false;
    (document.documentElement || document.head).appendChild(script);
  };

  const enableAndInject = () => {
    globalThis.__CSP_ENABLE_LAZY_FAST_MODE = true;
    if (document.documentElement) {
      injectBridge();
    } else {
      document.addEventListener('DOMContentLoaded', injectBridge, { once: true });
    }
  };

  const forceStoredLazyFastModeOff = () => {
    try {
      chrome.storage.sync.get({ [LAZY_FAST_MODE_SETTING_KEY]: false }, (items) => {
        if (chrome.runtime?.lastError) return;
        if (items?.[LAZY_FAST_MODE_SETTING_KEY] !== true) return;
        chrome.storage.sync.set({ [LAZY_FAST_MODE_SETTING_KEY]: false });
      });
    } catch {}
  };

  if (LAZY_FAST_MODE_FULL_DISABLE) {
    forceStoredLazyFastModeOff();
    return;
  }

  if (LAZY_FAST_MODE_FORCE_INERT) {
    return;
  }

  try {
    chrome.storage.sync.get({ [LAZY_FAST_MODE_SETTING_KEY]: false }, (items) => {
      if (chrome.runtime?.lastError) return;
      if (!items?.[LAZY_FAST_MODE_SETTING_KEY]) return;
      enableAndInject();
    });
  } catch {
    globalThis.__CSP_ENABLE_LAZY_FAST_MODE = false;
  }
})();
