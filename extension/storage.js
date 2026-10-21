/* storage.js (global, non-module) — Drive appDataFolder backend */
(() => {
  const FILE_NAME = 'extension_settings.json';
  const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

  const OPTION_KEYS = new Set(Object.keys(globalThis.OPTIONS_DEFAULTS || {}));
  // Scraped model state belongs to the current ChatGPT account/session.
  const OPTION_KEYS_EXCLUDE = new Set([
    'modelCatalog',
    'modelCatalogLatest',
    'modelCatalogLegacy',
    'modelNames',
    'modelNamesAt',
    'modelNamesLatest',
    'modelNamesLatestAt',
    'modelNamesLegacy',
    'modelNamesLegacyAt',
  ]);
  const pickOptions = (obj = {}) => {
    const out = {};
    for (const k of OPTION_KEYS) {
      if (OPTION_KEYS_EXCLUDE.has(k)) continue;
      if (!(k in obj)) continue;
      if (
        k.startsWith('shortcutKey') ||
        k === 'selectThenCopy' ||
        k === 'selectThenCopyAllMessages'
      ) {
        out[k] = window.CSPShortcutBindings.normalize(obj[k], { empty: '\u00a0' });
      } else if (
        ['modelPickerKeyCodes', 'modelPickerKeyCodesLatest', 'modelPickerKeyCodesLegacy'].includes(
          k,
        )
      ) {
        if (Array.isArray(obj[k]))
          out[k] = obj[k].map((code) => window.CSPShortcutBindings.normalize(code));
      } else out[k] = obj[k];
    }
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
  async function refreshToken() {
    const token = (await window.CloudAuth?.refreshAuthToken?.()) || '';
    if (!token) throw new Error('Auth required');
    return token;
  }
  async function withUnauthorizedRetry(token, operation, request) {
    let result = await request(token);
    if (!result?.unauthorized) return { token, result };

    const refreshedToken = await refreshToken();
    result = await request(refreshedToken);
    if (result?.unauthorized) {
      throw new Error(`Drive ${operation} failed (${result.status || '401/403'})`);
    }
    return { token: refreshedToken, result };
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
    if (r.status === 401 || r.status === 403) return { unauthorized: true, status: r.status };
    if (!r.ok) throw new Error(`Drive list failed (${r.status})`);
    const data = await r.json();
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.files)) {
      throw new Error('Drive list failed (invalid response)');
    }
    const firstFile = data.files[0];
    if (data.files.length > 0 && (typeof firstFile?.id !== 'string' || !firstFile.id)) {
      throw new Error('Drive list failed (invalid response)');
    }
    const id = firstFile?.id || null;
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
    if (r.status === 401 || r.status === 403) return { unauthorized: true, status: r.status };
    if (!r.ok) throw new Error(`Drive create failed (${r.status})`);
    const created = await r.json();
    if (typeof created?.id !== 'string' || !created.id) {
      throw new Error('Drive create failed (invalid response)');
    }
    return { id: created.id };
  }
  async function updateFile(token, fileId, json) {
    const r = await fetch(`${DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: json,
    });
    if (r.status === 401 || r.status === 403) return { unauthorized: true, status: r.status };
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
    if (r.status === 401 || r.status === 403) return { unauthorized: true, status: r.status };
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error(`Drive download failed (${r.status})`);
    const obj = await r.json();
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Drive download failed (invalid response)');
    }
    return { obj };
  }

  async function saveSyncedSettings(settings) {
    const CLOUD_KEY = 'csp_cloud_file_id_v1';
    const json = JSON.stringify(settings || {});
    let token = await getToken(false);
    if (!token) token = await getToken(true);
    if (!token) throw new Error('Not authenticated');

    // Prefer known id, else list
    const lookup = await withUnauthorizedRetry(token, 'list', findFileId);
    token = lookup.token;
    let { id } = lookup.result;

    // Update or create
    if (id) {
      const update = await withUnauthorizedRetry(token, 'update', (t) => updateFile(t, id, json));
      token = update.token;
      const res = update.result;
      if (res?.notFound) {
        await chrome.storage.local.remove(CLOUD_KEY);
        id = null;
      } else {
        return;
      }
    }

    // Create path
    const creation = await withUnauthorizedRetry(token, 'create', (t) => createFile(t, json));
    const created = creation.result;
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
      const download = await withUnauthorizedRetry(token, 'download', (t) =>
        downloadFile(t, known),
      );
      token = download.token;
      const dl = download.result;
      if (!dl.notFound) return pickOptions(dl.obj);
      await chrome.storage.local.remove(CLOUD_KEY); // stale id, fall through
    }

    // Fallback: list and download
    const lookup = await withUnauthorizedRetry(token, 'list', findFileId);
    token = lookup.token;
    const { id } = lookup.result;
    if (!id) return {};
    const download = await withUnauthorizedRetry(token, 'download', (t) => downloadFile(t, id));
    const dl = download.result;
    if (dl.notFound) {
      await chrome.storage.local.remove(CLOUD_KEY);
      return {};
    }
    return pickOptions(dl.obj);
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
