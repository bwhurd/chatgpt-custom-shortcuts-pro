/* auth.js — launchWebAuthFlow with optional identity permission */
(() => {
  const PROFILE_KEY = 'csp_auth_profile_v1';
  const TOK = 'csp_auth_token_v2',
    REF = 'csp_auth_refresh_v2',
    EXP = 'csp_auth_exp_v2';
  const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
  const CLIENT_ID = '327917786122-ha30ge1mejf2rikmk52u2ciu8h9hc2r0.apps.googleusercontent.com';
  const TOKEN_URL = 'https://profound-yeot-41eb0a.netlify.app/oauth/google/token';
  const S = chrome.storage.session;
  const setLocal = (k, v) => chrome.storage.local.set({ [k]: v });
  const now = () => Math.floor(Date.now() / 1000);
  const hasId = () =>
    new Promise((r) => chrome.permissions.contains({ permissions: ['identity'] }, r));
  const reqId = () =>
    new Promise((r) => chrome.permissions.request({ permissions: ['identity'] }, r));
  const redirect = () => chrome.identity.getRedirectURL();
  async function ensurePerm() {
    if (await hasId()) return true;
    return reqId();
  }
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
  function rnd() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  function authUrl(state) {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', CLIENT_ID);
    u.searchParams.set('redirect_uri', redirect());
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(' '));
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('state', state);
    return u.toString();
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
    } catch (_) {}
    const p = { email: '', name: '', sub: '' };
    await setLocal(PROFILE_KEY, p);
    return p;
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
      } catch (_) {}
    }
    if (!interactive) return '';
    if (!(await ensurePerm())) throw new Error('PERMISSION_DENIED');
    const state = rnd();
    const resp = await chrome.identity.launchWebAuthFlow({
      url: authUrl(state),
      interactive: true,
    });
    if (!resp) throw new Error('LOGIN_CANCELLED');
    const p = new URL(resp).searchParams;
    if (p.get('state') !== state) throw new Error('STATE_MISMATCH');
    const code = p.get('code');
    if (!code) throw new Error('NO_CODE');
    const t = await exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect(),
      client_id: CLIENT_ID,
    });
    await saveTokens(t);
    return t.access_token || '';
  }
  async function getSavedAuth() {
    const { token, refresh } = await tokens();
    const linked = !!(token || refresh);
    if (!linked) {
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
    } catch (_) {}
  }
  window.CloudAuth = {
    getSavedAuth,
    googleLogin,
    googleLogout,
    getAuthToken: (o = {}) => ensure(!!o.interactive),
  };
})();
