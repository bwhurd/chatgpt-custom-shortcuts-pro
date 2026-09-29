// Read the existing toggle before ChatGPT paints its composer. No DOM watcher.
(() => {
  if (
    location.hostname.replace(/^www\./, '') !== 'chatgpt.com' ||
    /^\/(?:gpts(?:\/|$)|codex(?:\/|$)|g\/|library\/)/.test(location.pathname)
  ) {
    return;
  }

  chrome.storage.sync.get({ moveTopBarToBottomCheckbox: false }, (settings) => {
    document.documentElement?.classList.toggle(
      'csp-bottom-bar-enabled',
      Boolean(settings.moveTopBarToBottomCheckbox),
    );
  });
})();
