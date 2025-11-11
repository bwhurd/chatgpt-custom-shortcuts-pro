// Import the chrome.runtime module
const { runtime } = chrome;

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-popup') {
    chrome.action.openPopup();
  }
});

// CloudAuth background broker — runs the interactive OAuth so popup can close safely
// CloudAuth background broker — runs the interactive OAuth so popup can close safely
(() => {
  if (globalThis.__cloudAuthBG) return; // guard against duplicate registration
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
  const log = (...a) => console.log('[CloudAuth BG]', ...a);
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
  async function saveTokens(t) {
    const { access_token, refresh_token, expires_in } = t || {};
    const exp = expires_in ? now() + expires_in - 60 : 0;
    const m = {};
    if (access_token) m[TOK] = access_token;
    if (refresh_token) m[REF] = refresh_token;
    if (exp) m[EXP] = exp;
    if (Object.keys(m).length) await S.set(m);
    log('tokens saved', { hasAT: !!access_token, hasRT: !!refresh_token, exp });
  }
  async function exchange(grant) {
    log('token exchange', {
      grant: grant.grant_type,
      hasCode: !!grant.code,
      hasRT: !!grant.refresh_token,
    });
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grant),
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!r.ok) {
      log('exchange failed', r.status, body);
      throw new Error(`TOKEN_ENDPOINT_${r.status}:${body?.error || 'error'}`);
    }
    log('exchange ok', r.status, body?.scope);
    return body;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'cloudAuth.login') {
      (async () => {
        try {
          log('login start');
          const state = rnd();
          const resp = await chrome.identity.launchWebAuthFlow({
            url: authUrl(state),
            interactive: true,
          });
          const u = new URL(resp);
          log('redirect received', u.origin);
          const p = u.searchParams;
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
          log('login success');
          sendResponse({ ok: true });
        } catch (e) {
          log('login error', e?.message || e);
          sendResponse({ ok: false, error: e?.message || 'LOGIN_FAILED' });
        }
      })();
      return true; // keep channel open
    }
  });
})();
