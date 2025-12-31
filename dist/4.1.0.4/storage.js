/* storage.js (global, non-module) — Drive appDataFolder backend */
(() => {
  const FILE_NAME = 'extension_settings.json';
  const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  const OPTION_KEYS = new Set(Object.keys(globalThis.OPTIONS_DEFAULTS || {}));
  const pickOptions = (obj = {}) => {
    const out = {};
    for (const k of OPTION_KEYS) if (k in obj) out[k] = obj[k];
    return out;
  };
  const hasOptionsStorage = () =>
    typeof window.optionsStorage === 'object' && window.optionsStorage;

  async function loadLocalSettings() {
    if (hasOptionsStorage()) {
      const all = await window.optionsStorage.getAll();
      return pickOptions(all);
    }
    const all = await chrome.storage.sync.get(null);
    return pickOptions(all);
  }
  async function saveLocalSettings(settings) {
    const filtered = pickOptions(settings || {});
    if (hasOptionsStorage()) return window.optionsStorage.setAll(filtered);
    return chrome.storage.sync.set(filtered);
  }

  const getToken = async (interactive = false) =>
    (await window.CloudAuth?.getAuthToken?.({ interactive })) || '';
  async function removeCachedToken(token) {
    if (!token) return;
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
  }

  // Drive helpers
  async function findFileId(token) {
    const CLOUD_KEY = 'csp_cloud_file_id_v1';
    // Fast path: use cached id if present
    const local = await chrome.storage.local.get(CLOUD_KEY);
    if (local[CLOUD_KEY]) return { id: local[CLOUD_KEY] };

    const url = new URL(DRIVE_FILES);
    url.searchParams.set('spaces', 'appDataFolder');
    url.searchParams.set('q', `name='${FILE_NAME}' and trashed=false`);
    url.searchParams.set('fields', 'files(id,modifiedTime)');
    url.searchParams.set('pageSize', '1');
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('ts', String(Date.now())); // cache-buster
    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (r.status === 401 || r.status === 403) return { unauthorized: true };
    if (!r.ok) throw new Error(`Drive list failed (${r.status})`);
    const data = await r.json();
    const id = data?.files?.[0]?.id || null;
    if (id) await chrome.storage.local.set({ [CLOUD_KEY]: id });
    return { id };
  }
  async function createFile(token, json) {
    const boundary = `csp-${Math.random().toString(36).slice(2)}`;
    const metadata = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/json\r\n\r\n` +
      json +
      `\r\n--${boundary}--\r\n`;

    const r = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'X-Upload-Content-Type': 'application/json',
      },
      body,
    });
    if (r.status === 401 || r.status === 403) return { unauthorized: true };
    if (!r.ok) throw new Error(`Drive create failed (${r.status})`);
    const created = await r.json();
    return { id: created?.id || null };
  }
  async function updateFile(token, fileId, json) {
    const r = await fetch(`${DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: json,
    });
    if (r.status === 401 || r.status === 403) return { unauthorized: true };
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error(`Drive update failed (${r.status})`);
    return {};
  }
  async function downloadFile(token, fileId) {
    const url = new URL(`${DRIVE_FILES}/${fileId}`);
    url.searchParams.set('alt', 'media');
    url.searchParams.set('ts', String(Date.now()));
    const r = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (r.status === 401 || r.status === 403) return { unauthorized: true };
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error(`Drive download failed (${r.status})`);
    return { obj: await r.json() };
  }

  async function saveSyncedSettings(settings) {
    const CLOUD_KEY = 'csp_cloud_file_id_v1';
    const json = JSON.stringify(settings || {});
    let token = await getToken(false);
    if (!token) token = await getToken(true);
    if (!token) throw new Error('Not authenticated');

    // Prefer known id, else list
    let { id, unauthorized } = await findFileId(token);
    if (unauthorized) {
      await removeCachedToken(token);
      token = await getToken(true);
      if (!token) throw new Error('Auth required');
      ({ id } = await findFileId(token));
    }

    // Update or create
    if (id) {
      let res = await updateFile(token, id, json);
      if (res?.unauthorized) {
        await removeCachedToken(token);
        token = await getToken(true);
        if (!token) throw new Error('Auth required');
        res = await updateFile(token, id, json);
      }
      if (res?.notFound) {
        await chrome.storage.local.remove(CLOUD_KEY);
        id = null;
      } else {
        await chrome.storage.local.set({ [CLOUD_KEY]: id });
        return;
      }
    }

    // Create path
    const created = await createFile(token, json);
    if (created?.unauthorized) {
      await removeCachedToken(token);
      const t2 = await getToken(true);
      if (!t2) throw new Error('Auth required');
      const c2 = await createFile(t2, json);
      if (!c2?.id) throw new Error('Drive permission missing or Drive API disabled');
      await chrome.storage.local.set({ [CLOUD_KEY]: c2.id });
      return;
    }
    if (!created?.id) throw new Error('Drive permission missing or Drive API disabled');
    await chrome.storage.local.set({ [CLOUD_KEY]: created.id });
  }

  async function loadSyncedSettings() {
    const CLOUD_KEY = 'csp_cloud_file_id_v1';
    let token = await getToken(false);
    if (!token) token = await getToken(true);
    if (!token) throw new Error('Auth required');

    // Try known id first
    const known = (await chrome.storage.local.get(CLOUD_KEY))[CLOUD_KEY] || null;
    if (known) {
      let dl = await downloadFile(token, known);
      if (dl?.unauthorized) {
        await removeCachedToken(token);
        token = await getToken(true);
        if (!token) throw new Error('Auth required');
        dl = await downloadFile(token, known);
      }
      if (!dl?.notFound) return pickOptions(dl?.obj || {});
      await chrome.storage.local.remove(CLOUD_KEY); // stale id, fall through
    }

    // Fallback: list and download
    let { id, unauthorized } = await findFileId(token);
    if (unauthorized) {
      await removeCachedToken(token);
      token = await getToken(true);
      if (!token) throw new Error('Auth required');
      ({ id } = await findFileId(token));
    }
    if (!id) return {};
    let dl = await downloadFile(token, id);
    if (dl?.unauthorized) {
      await removeCachedToken(token);
      token = await getToken(true);
      if (!token) throw new Error('Auth required');
      dl = await downloadFile(token, id);
    }
    await chrome.storage.local.set({ [CLOUD_KEY]: id });
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
