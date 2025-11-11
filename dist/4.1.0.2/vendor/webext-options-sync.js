// Minimal stub for dev/unpacked so code doesn't crash.
// For real features, replace with the real webext-options-sync.
class OptionsSync {
  constructor({ defaults = {}, storageType = 'sync', logging = false, migrations = [] } = {}) {
    this.defaults = defaults;
    this.storage = chrome.storage[storageType] || chrome.storage.sync;
    this.logging = logging;
    this.migrations = migrations;
  }

  async getAll() {
    // Return only declared default keys to avoid pulling unrelated sync keys (like cloud backups)
    const all = await this.storage.get(null);
    const out = { ...this.defaults };
    for (const k of Object.keys(this.defaults)) {
      if (k in all) out[k] = all[k];
    }
    return out;
  }

  async set(changes) {
    return this.storage.set(changes);
  }

  // BUG FIX: Add the missing setAll method
  // storage.js calls this, but it was missing from the stub.
  async setAll(changes) {
    // In this stub, setAll does the same as set (full overwrite)
    return this.storage.set(changes);
  }

  // mimic the real helper
  static migrations = {
    removeUnused: async () => {},
  };
}

window.OptionsSync = OptionsSync;
