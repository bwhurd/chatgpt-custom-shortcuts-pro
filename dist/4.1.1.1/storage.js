/* storage.js (global, non-module) — Drive appDataFolder backend */
(() => {
  const FILE_NAME = 'extension_settings.json';
  const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const CLOUD_ID_KEY = 'csp_cloud_file_id_v1';

  // Some settings are not part of OPTIONS_DEFAULTS but should round-trip in backups.
  const ALWAYS_KEEP_KEYS = new Set(['modelNames']);

  const hasOptionsStorage = () =>
    typeof window.optionsStorage === 'object' && window.optionsStorage;

  const getDefaultsBag = () =>
    (globalThis.OPTIONS_DEFAULTS && typeof globalThis.OPTIONS_DEFAULTS === 'object'
      ? globalThis.OPTIONS_DEFAULTS
      : hasOptionsStorage() && window.optionsStorage?.defaults) || null;

  const getOptionKeys = () => {
    const bag = getDefaultsBag();
    return bag ? Object.keys(bag) : [];
  };

  const pickOptions = (obj = {}) => {
    const keys = getOptionKeys();
    // If defaults aren't available yet, don't drop keys; return a shallow copy.
    if (!keys.length) return { ...obj };
    const keep = new Set([...keys, ...ALWAYS_KEEP_KEYS]);
    const out = {};
    for (const k of keep) if (k in obj) out[k] = obj[k];
    return out;
  };

  async function loadLocalSettings() {
    try {
      if (hasOptionsStorage()) {
        const all = await window.optionsStorage.getAll();
        return pickOptions(all);
      }
    } catch (_) {}
    try {
      const all = await chrome.storage.sync.get(null);
      return pickOptions(all);
    } catch (_) {
      return {};
    }
  }

  async function saveLocalSettings(settings) {
    const filtered = pickOptions(settings || {});
    if (hasOptionsStorage()) {
      await window.optionsStorage.setAll(filtered);
      return filtered;
    }
    await chrome.storage.sync.set(filtered);
    return filtered;
  }

  const getToken = async (interactive = false) =>
    (await window.CloudAuth?.getAuthToken?.({ interactive })) || '';
  async function removeCachedToken(token) {
    if (!token) return;
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
  }

  // --- Drive helpers (timeouted fetch + appData only + account-scoped cache) ---
  const DEFAULT_TIMEOUT_MS = 20000;
  const isUnauthorized = (s) => s === 401 || s === 403;

  const fetchWithAuth = async (
    url,
    {
      token,
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_TIMEOUT_MS,
      cache = 'no-store',
    } = {},
  ) => {
    if (!token) throw new Error('Auth required');
    const h = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers };
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(new DOMException('timeout', 'AbortError')), timeout);
    try {
      return await fetch(url, { method, headers: h, body, cache, signal: ac.signal });
    } finally {
      clearTimeout(tid);
    }
  };

  const getActiveAccountId = () =>
    new Promise((res) => {
      try {
        chrome.identity.getProfileUserInfo((u) => res(u?.id || 'default'));
      } catch (_) {
        res('default');
      }
    });
  const cloudKeyFor = (acct) => `${CLOUD_ID_KEY}:${acct || 'default'}`;

  async function findFileId(token) {
    const acct = await getActiveAccountId();
    const KEY = cloudKeyFor(acct);
    const local = await chrome.storage.local.get(KEY);
    if (local[KEY]) return { id: local[KEY] };

    const url = new URL(DRIVE_FILES);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('q', `name='${FILE_NAME}' and trashed=false`);
    url.searchParams.set('fields', 'files(id,modifiedTime)');
    url.searchParams.set('pageSize', '1');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('ts', String(Date.now()));

    const r = await fetchWithAuth(url.toString(), { token });
    if (isUnauthorized(r.status)) return { unauthorized: true };
    if (!r.ok) throw new Error(`Drive list failed (${r.status})`);
    const data = await r.json();
    const id = data?.files?.[0]?.id || null;
    if (id) await chrome.storage.local.set({ [KEY]: id });
    return { id };
  }

  async function createFile(token, json) {
    const boundary = `csp-${Math.random().toString(36).slice(2)}`;
    const metadata = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata,
    )}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--\r\n`;

    const r = await fetchWithAuth(`${DRIVE_UPLOAD}?uploadType=multipart`, {
      token,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'X-Upload-Content-Type': 'application/json',
      },
      body,
    });
    if (isUnauthorized(r.status)) return { unauthorized: true };
    if (!r.ok) throw new Error(`Drive create failed (${r.status})`);
    const created = await r.json();
    return { id: created?.id || null };
  }

  async function updateFile(token, fileId, json) {
    const r = await fetchWithAuth(`${DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
      token,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    if (isUnauthorized(r.status)) return { unauthorized: true };
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error(`Drive update failed (${r.status})`);
    return {};
  }

  async function downloadFile(token, fileId) {
    const url = new URL(`${DRIVE_FILES}/${fileId}`);
    url.searchParams.set('alt', 'media');
    url.searchParams.set('ts', String(Date.now()));
    const r = await fetchWithAuth(url.toString(), { token });
    if (isUnauthorized(r.status)) return { unauthorized: true };
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error(`Drive download failed (${r.status})`);
    return { obj: await r.json() };
  }

  // Accepts optional { token, dropToken } so callers can supply a transient token.
  async function saveSyncedSettings(settings, { token: suppliedToken, dropToken = false } = {}) {
    const json = JSON.stringify(settings || {});
    let token = suppliedToken || (await getToken(false));
    const mintedLocally = !suppliedToken;

    if (!token) token = await getToken(true);
    if (!token) throw new Error('Auth required');

    const acct = await (typeof chrome?.identity !== 'undefined' ? getActiveAccountId() : 'default');
    const CLOUD_KEY = cloudKeyFor(await acct);

    let { id, unauthorized } = await findFileId(token);
    if (unauthorized) {
      if (mintedLocally) await removeCachedToken(token);
      token = suppliedToken || (await getToken(true));
      if (!token) throw new Error('Auth required');
      ({ id } = await findFileId(token));
    }

    // Update if we have an id; else create
    if (id) {
      let res = await updateFile(token, id, json);
      if (res?.unauthorized) {
        // Wrong-account cached id; clear it and retry with a fresh listing
        await chrome.storage.local.remove(CLOUD_KEY);
        if (mintedLocally) await removeCachedToken(token);
        token = suppliedToken || (await getToken(true));
        if (!token) throw new Error('Auth required');
        ({ id } = await findFileId(token));
        res = id ? await updateFile(token, id, json) : res;
      }
      if (res?.notFound) {
        await chrome.storage.local.remove(CLOUD_KEY);
        id = null;
      } else if (!res?.unauthorized) {
        await chrome.storage.local.set({ [CLOUD_KEY]: id });
        if (dropToken && mintedLocally) await removeCachedToken(token);
        return;
      }
    }

    const created = await createFile(token, json);
    if (created?.unauthorized) {
      if (mintedLocally) await removeCachedToken(token);
      const t2 = suppliedToken || (await getToken(true));
      if (!t2) throw new Error('Auth required');
      const c2 = await createFile(t2, json);
      if (!c2?.id) throw new Error('Drive permission missing or Drive API disabled');
      await chrome.storage.local.set({ [CLOUD_KEY]: c2.id });
      if (dropToken && mintedLocally) await removeCachedToken(t2);
      return;
    }
    if (!created?.id) throw new Error('Drive permission missing or Drive API disabled');
    await chrome.storage.local.set({ [CLOUD_KEY]: created.id });
    if (dropToken && mintedLocally) await removeCachedToken(token);
  }

  async function loadSyncedSettings({ token: suppliedToken, dropToken = false } = {}) {
    let token = suppliedToken || (await getToken(false));
    const mintedLocally = !suppliedToken;

    if (!token) token = await getToken(true);
    if (!token) throw new Error('Auth required');

    const acct = await (typeof chrome?.identity !== 'undefined' ? getActiveAccountId() : 'default');
    const CLOUD_KEY = cloudKeyFor(await acct);

    // Try known id first
    const known = (await chrome.storage.local.get(CLOUD_KEY))[CLOUD_KEY] || null;
    if (known) {
      let dl = await downloadFile(token, known);
      if (dl?.unauthorized) {
        // Wrong account/token for this id; clear id and retry via listing
        await chrome.storage.local.remove(CLOUD_KEY);
        if (mintedLocally) await removeCachedToken(token);
        token = suppliedToken || (await getToken(true));
        if (!token) throw new Error('Auth required');
        dl = await downloadFile(token, known); // one more try in case token was the issue
      }
      if (!dl?.notFound && !dl?.unauthorized) {
        if (dropToken && mintedLocally) await removeCachedToken(token);
        return pickOptions(dl?.obj || {});
      }
      await chrome.storage.local.remove(CLOUD_KEY); // stale id, fall through
    }

    // Fallback: list and download latest by modifiedTime
    let { id, unauthorized } = await findFileId(token);
    if (unauthorized) {
      if (mintedLocally) await removeCachedToken(token);
      token = suppliedToken || (await getToken(true));
      if (!token) throw new Error('Auth required');
      ({ id } = await findFileId(token));
    }

    if (!id) {
      if (dropToken && mintedLocally) await removeCachedToken(token);
      return {};
    }

    let dl = await downloadFile(token, id);
    if (dl?.unauthorized) {
      if (mintedLocally) await removeCachedToken(token);
      token = suppliedToken || (await getToken(true));
      if (!token) throw new Error('Auth required');
      dl = await downloadFile(token, id);
    }

    await chrome.storage.local.set({ [CLOUD_KEY]: id });
    if (dropToken && mintedLocally) await removeCachedToken(token);
    return pickOptions(dl?.obj || {});
  }

  const mergeSettings = (local, remote) => ({ ...local, ...remote });

  const _clearKnownFileId = () => chrome.storage.local.remove('csp_cloud_file_id_v1');

  window.CloudStorage = {
    loadLocalSettings,
    saveLocalSettings,
    loadSyncedSettings,
    saveSyncedSettings,
    mergeSettings,
    _clearKnownFileId,
  };
})();
