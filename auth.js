/* auth.js — foreground helper; interactive login delegated to background */
(() => {
  const PROFILE_KEY = 'csp_auth_profile_v1';
  const TOK = 'csp_auth_token_v2',
    REF = 'csp_auth_refresh_v2',
    EXP = 'csp_auth_exp_v2';
  const CLIENT_ID = '327917786122-ha30ge1mejf2rikmk52u2ciu8h9hc2r0.apps.googleusercontent.com';
  const TOKEN_URL = 'https://profound-yeot-41eb0a.netlify.app/oauth/google/token';
  const S = chrome.storage.session;
  const setLocal = (k, v) => chrome.storage.local.set({ [k]: v });
  const now = () => Math.floor(Date.now() / 1000);
  const hasId = () =>
    new Promise((r) => chrome.permissions.contains({ permissions: ['identity'] }, r));
  const reqId = () =>
    new Promise((r) => chrome.permissions.request({ permissions: ['identity'] }, r));

  async function saveTokens(t) {
    const { access_token, refresh_token, expires_in } = t || {};
    const exp = expires_in ? now() + expires_in - 60 : 0;
    const m = {};
    if (access_token) m[TOK] = access_token;
    if (refresh_token) m[REF] = refresh_token;
    if (exp) m[EXP] = exp;
    if (Object.keys(m).length) await S.set(m);
  }
  async function tokens() {
    const o = await S.get([TOK, REF, EXP]);
    return { token: o[TOK] || '', refresh: o[REF] || '', exp: o[EXP] || 0 };
  }
  async function exchange(grant) {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grant),
    });
    if (!r.ok) throw new Error('TOKEN_ENDPOINT_ERROR');
    return r.json();
  }

  async function ensure(interactive = false) {
    const { token, refresh, exp } = await tokens();
    if (token && exp > now()) return token;
    if (refresh) {
      try {
        const t = await exchange({
          grant_type: 'refresh_token',
          refresh_token: refresh,
          client_id: CLIENT_ID,
        });
        await saveTokens(t);
        if (t.access_token) return t.access_token;
      } catch {}
    }
    if (!interactive) return '';
    if (!(await hasId()) && !(await reqId())) throw new Error('PERMISSION_DENIED');
    const res = await new Promise((r) =>
      chrome.runtime.sendMessage({ type: 'cloudAuth.login' }, r),
    );
    if (!res || !res.ok) throw new Error(res?.error || 'LOGIN_FAILED');
    return (await tokens()).token || '';
  }

  async function fetchProfile() {
    try {
      const has = await new Promise((r) =>
        chrome.permissions.contains({ permissions: ['identity.email'] }, r),
      );
      if (has && chrome.identity.getProfileUserInfo) {
        const info = await new Promise((r) =>
          chrome.identity.getProfileUserInfo((i) => r(i || {})),
        );
        const p = { email: info.email || '', name: '', sub: info.id || '' };
        await setLocal(PROFILE_KEY, p);
        return p;
      }
    } catch {}
    const p = { email: '', name: '', sub: '' };
    await setLocal(PROFILE_KEY, p);
    return p;
  }

  async function getSavedAuth() {
    const { token, refresh } = await tokens();
    if (!(token || refresh)) {
      await setLocal(PROFILE_KEY, null);
      return { profile: null };
    }
    const o = await chrome.storage.local.get(PROFILE_KEY);
    return { profile: o[PROFILE_KEY] || { email: '', name: '', sub: '' } };
  }

  async function googleLogin() {
    await S.remove([TOK, REF, EXP]);
    const t = await ensure(true);
    if (!t) throw new Error('LOGIN_FAILED');
    const profile = await fetchProfile();
    return { profile };
  }

  async function googleLogout() {
    await S.remove([TOK, REF, EXP]);
    await setLocal(PROFILE_KEY, null);
    try {
      await window.CloudStorage?._clearKnownFileId?.();
    } catch {}
  }

  window.CloudAuth = {
    getSavedAuth,
    googleLogin,
    googleLogout,
    getAuthToken: (o = {}) => ensure(!!o.interactive),
  };
})();
