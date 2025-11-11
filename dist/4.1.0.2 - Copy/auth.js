/* auth.js (global, non-module) */
(() => {
  const PROFILE_KEY = 'csp_auth_profile_v1';
  const TOKEN_KEY = 'csp_auth_token_v1';
  const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
  const REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/drive.appdata',
  ];

  const setLocal = (k, v) => chrome.storage.local.set({ [k]: v });
  const setSession = async (t) =>
    t ? chrome.storage.session.set({ [TOKEN_KEY]: t }) : chrome.storage.session.remove(TOKEN_KEY);

  const getSessionToken = async () =>
    (await chrome.storage.session.get(TOKEN_KEY))[TOKEN_KEY] || '';

  const getAuthTokenChrome = (interactive) =>
    new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive, scopes: REQUIRED_SCOPES }, (token) => {
        if (chrome.runtime.lastError) return resolve('');
        resolve(token || '');
      });
    });

  const removeCached = (token) =>
    new Promise((resolve) => {
      if (!token) return resolve();
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });

  async function fetchProfile(token) {
    const r = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error('USERINFO_FAILED');
    const info = await r.json();
    const profile = { email: info.email || '', name: info.name || '', sub: info.sub || '' };
    await setLocal(PROFILE_KEY, profile);
    return profile;
  }

  async function getAuthToken({ interactive = false } = {}) {
    const cached = await getSessionToken();
    if (cached) return cached;
    const token = await getAuthTokenChrome(interactive);
    if (token) await setSession(token);
    return token;
  }

  async function getSavedAuth() {
    const token = await getAuthToken({ interactive: false });
    if (!token) {
      await setLocal(PROFILE_KEY, null);
      await setSession('');
      return { profile: null };
    }
    const o = await chrome.storage.local.get(PROFILE_KEY);
    if (o[PROFILE_KEY]?.email) return { profile: o[PROFILE_KEY] };
    try {
      const profile = await fetchProfile(token);
      return { profile };
    } catch {
      return { profile: null };
    }
  }

  async function googleLogin() {
    // Force a new token so Chrome can mint one with any newly-added scopes (Drive)
    try {
      const existing = await getSessionToken();
      if (existing) await removeCached(existing);
    } catch (_) {}
    const token = await getAuthToken({ interactive: true });
    if (!token) throw new Error(chrome.runtime.lastError?.message || 'LOGIN_FAILED');
    await setSession(token);
    const profile = await fetchProfile(token);
    return { profile };
  }

  async function googleLogout() {
    const token = (await getSessionToken()) || (await getAuthToken({ interactive: false })) || '';
    try {
      if (token) {
        await removeCached(token);
        try {
          await fetch(
            `https://accounts.google.com/o/oauth2/revoke?token=${encodeURIComponent(token)}`,
          );
        } catch (_) {}
      }
    } finally {
      await setSession('');
      await setLocal(PROFILE_KEY, null);
      try {
        await window.CloudStorage?._clearKnownFileId?.();
      } catch (_) {}
    }
  }

  window.CloudAuth = { getSavedAuth, googleLogin, googleLogout, getAuthToken };
})();
