// CloudAuth background broker — runs the interactive OAuth so popup can close safely
(() => {
  if (globalThis.__cloudAuthBG) return;
  globalThis.__cloudAuthBG = 1;

  const TOK = 'csp_auth_token_v2',
    REF = 'csp_auth_refresh_v2',
    EXP = 'csp_auth_exp_v2';
  const CLIENT_ID = '327917786122-ha30ge1mejf2rikmk52u2ciu8h9hc2r0.apps.googleusercontent.com';
  const TOKEN_URL = 'https://profound-yeot-41eb0a.netlify.app/oauth/google/token';
  const SCOPES = ['https://www.googleapis.com/auth/drive.appdata'];
  const S = chrome.storage.session;
  const now = () => Math.floor(Date.now() / 1000);
  const redirect = () => chrome.identity.getRedirectURL();
  const rnd = () => {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return btoa(String.fromCharCode(...a))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };
  const authUrl = (state) => {
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
  };

  const hasIdentity = () =>
    new Promise((r) => chrome.permissions.contains({ permissions: ['identity'] }, r));
  const reqIdentity = () =>
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
  async function exchange(grant) {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grant),
    });
    if (!r.ok) throw new Error('TOKEN_ENDPOINT_ERROR');
    return r.json();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'cloudAuth.login') {
      (async () => {
        try {
          // Only request identity; do NOT request googleapis host origin
          if (!(await hasIdentity()) && !(await reqIdentity()))
            throw new Error('PERMISSION_DENIED');

          const state = rnd();
          const resp = await chrome.identity.launchWebAuthFlow({
            url: authUrl(state),
            interactive: true,
          });
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

          try {
            chrome.runtime.sendMessage({ type: 'cloudAuth.loggedIn' });
          } catch (_) {}
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || 'LOGIN_FAILED' });
        }
      })();
      return true; // keep channel open
    }
  });
})();
