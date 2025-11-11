/* vendor/webext-options-sync.js — minimal, migration-capable helper (MV3, least-privilege) */
class OptionsSync {
  constructor({ defaults = {}, storageType = 'sync', logging = false, migrations = [] } = {}) {
    this.defaults = defaults || {};
    this.area = chrome.storage?.[storageType] || chrome.storage.sync;
    this.logging = !!logging;
    this.migrations = Array.isArray(migrations) ? migrations : [];
    this._initPromise = null;
  }

  log(...args) {
    if (this.logging) console.log('[OptionsSync]', ...args);
  }

  async _runMigrations(stored) {
    for (const m of this.migrations) {
      try {
        if (typeof m === 'function') {
          const r = m.length >= 2 ? m(stored, this.defaults) : m(stored);
          if (r && typeof r.then === 'function') await r;
        }
      } catch (e) {
        this.log('Migration failed:', e);
      }
    }
  }

  _pickKnown(obj = {}) {
    const out = {};
    for (const k of Object.keys(this.defaults)) {
      if (Object.hasOwn(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  _mergeWithDefaults(obj = {}) {
    return { ...this.defaults, ...this._pickKnown(obj) };
  }

  async _sanitizeAndPersist(all) {
    const working = { ...all };
    await this._runMigrations(working);

    const unknown = Object.keys(working).filter((k) => !(k in this.defaults));
    const sanitized = this._mergeWithDefaults(working);

    await this.area.set(sanitized);
    if (unknown.length) {
      try {
        await this.area.remove(unknown);
      } catch (_) {}
    }
    return sanitized;
  }

  async _ensureInitialized() {
    if (!this._initPromise) {
      this._initPromise = (async () => {
        let all = {};
        try {
          all = (await this.area.get(null)) || {};
        } catch (_) {}
        const sanitized = await this._sanitizeAndPersist(all);
        this.log('Initialized with', sanitized);
        return sanitized;
      })();
    }
    return this._initPromise;
  }

  async getAll() {
    await this._ensureInitialized();
    const current = (await this.area.get(null)) || {};
    return this._mergeWithDefaults(current);
  }

  async set(changes) {
    const update = this._pickKnown(changes || {});
    await this.area.set(update);
    return update;
  }

  async setAll(changes) {
    const update = this._mergeWithDefaults(changes || {});
    await this.area.set(update);
    return update;
  }

  static migrations = {
    // Keep last in the migrations array (see options-storage.js)
    removeUnused: (stored, defaults = {}) => {
      Object.keys(stored).forEach((k) => {
        if (!(k in defaults)) delete stored[k];
      });
    },
  };
}

window.OptionsSync = OptionsSync;
