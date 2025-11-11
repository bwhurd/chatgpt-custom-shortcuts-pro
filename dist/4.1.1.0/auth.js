/* auth.js — transient, optional Google backup (no profile/email; least-privilege) */
(() => {
  const KEYS = { CONNECTED: 'csp_drive_connected_v1', LEGACY_PROFILE: 'csp_auth_profile_v1' };
  const GOOGLE_ORIGIN = 'https://www.googleapis.com/*';

  const setConnected = (v) => chrome.storage.local.set({ [KEYS.CONNECTED]: !!v });
  const isConnected = async () =>
    !!(await chrome.storage.local.get(KEYS.CONNECTED))[KEYS.CONNECTED];

  const ensurePerms = async (interactive) => {
    const wanted = { permissions: ['identity'], origins: [GOOGLE_ORIGIN] };
    const has = await new Promise((res) => chrome.permissions.contains(wanted, res));
    if (has) return true;
    if (!interactive) return false;
    return new Promise((res) => chrome.permissions.request(wanted, (g) => res(!!g)));
  };

  const getAuthTokenChrome = (interactive) =>
    new Promise((resolve) => {
      // MV3 reads scopes from manifest.oauth2.scopes (drive.appdata)
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) return resolve('');
        resolve(token || '');
      });
    });

  async function getAuthToken({ interactive = false } = {}) {
    const ok = await ensurePerms(interactive);
    if (!ok) return '';
    return getAuthTokenChrome(interactive);
  }

  const removeCachedToken = (token) =>
    new Promise((r) => (token ? chrome.identity.removeCachedAuthToken({ token }, () => r()) : r()));

  async function getSavedAuth() {
    if (await isConnected()) {
      try {
        await getAuthToken({ interactive: false }); // silent mint if possible
      } catch (_) {}
      return { profile: {} }; // truthy object = "linked" without PII
    }
    return { profile: null };
  }

  async function googleLogin() {
    const ok = await ensurePerms(true);
    if (!ok) throw new Error('Permission denied');
    const token = await getAuthToken({ interactive: true });
    if (!token) throw new Error(chrome.runtime.lastError?.message || 'LOGIN_FAILED');
    await setConnected(true);
    return { profile: {} }; // truthy object = "linked" without PII
  }

  async function googleLogout() {
    try {
      const token = await getAuthToken({ interactive: false });
      if (token) await removeCachedToken(token);
    } finally {
      await setConnected(false);
      try {
        await chrome.storage.local.remove([KEYS.LEGACY_PROFILE, 'csp_cloud_file_id_v1']);
      } catch (_) {}
      try {
        await new Promise((res) =>
          chrome.permissions.remove({ permissions: ['identity'], origins: [GOOGLE_ORIGIN] }, () =>
            res(),
          ),
        );
      } catch (_) {}
    }
  }

  window.CloudAuth = { getSavedAuth, googleLogin, googleLogout, getAuthToken, removeCachedToken };
})();
