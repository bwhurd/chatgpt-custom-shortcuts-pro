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
  const POPUP_URL_BASE = chrome.runtime.getURL('popup.html');
  const POPUP_URL_MATCH = `${POPUP_URL_BASE}*`;
  const LAST_ACTION_TAB_KEY = 'csp_last_action_chatgpt_tab_id';
  const DEFAULT_POPUP_WIDTH = 800;
  const DEFAULT_POPUP_HEIGHT = 600;
  let actionPopupWindowId = null;
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
  // Do NOT call chrome.permissions.request here. MV3 service workers lack user gestures.
  // The popup must request optional permissions before we run the broker flow.
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
  const getDisplays = async () => {
    try {
      const displays = await chrome.system.display.getInfo();
      return Array.isArray(displays) ? displays : [];
    } catch {
      return [];
    }
  };
  const getTargetDisplay = async () => {
    const displays = await getDisplays();
    if (!displays.length) return null;
    try {
      const currentWindow = await chrome.windows.getLastFocused();
      const left = Number(currentWindow?.left);
      const top = Number(currentWindow?.top);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        const match = displays.find((display) => {
          const area = display?.workArea || display?.bounds;
          if (!area) return false;
          return (
            left >= area.left &&
            left < area.left + area.width &&
            top >= area.top &&
            top < area.top + area.height
          );
        });
        if (match) return match;
      }
    } catch {}
    return displays.find((display) => display?.isPrimary) || displays[0];
  };
  const getPopupBounds = async () => {
    const display = await getTargetDisplay();
    const area = display?.workArea || display?.bounds || {
      left: 0,
      top: 0,
      width: DEFAULT_POPUP_WIDTH,
      height: DEFAULT_POPUP_HEIGHT,
    };
    const width = Math.max(420, Math.min(DEFAULT_POPUP_WIDTH, Number(area.width) - 32 || DEFAULT_POPUP_WIDTH));
    const height = Math.max(420, Math.min(DEFAULT_POPUP_HEIGHT, Number(area.height) - 32 || DEFAULT_POPUP_HEIGHT));
    const left = Math.max(area.left, Math.round(area.left + (area.width - width) / 2));
    const top = Math.max(area.top, Math.round(area.top + (area.height - height) / 2));
    return { width, height, left, top };
  };
  const isChatGptUrl = (url) => /^https?:\/\/([^.]+\.)?chatgpt\.com\//i.test(String(url || ''));
  const resolveLaunchChatGptTab = async (clickedTab) => {
    if (clickedTab?.id && isChatGptUrl(clickedTab.url)) return clickedTab;
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const active = (Array.isArray(tabs) ? tabs : []).find((tab) => tab?.id && isChatGptUrl(tab.url));
      if (active) return active;
    } catch {}
    const rememberedTabId = await getRememberedActionTabId();
    if (rememberedTabId) {
      try {
        const tab = await chrome.tabs.get(rememberedTabId);
        if (tab?.id && isChatGptUrl(tab.url)) return tab;
      } catch {}
    }
    return null;
  };
  const buildPopupUrl = (tabId) => {
    const u = new URL(POPUP_URL_BASE);
    u.searchParams.set('actionWindow', '1');
    if (Number.isInteger(tabId) && tabId > 0) u.searchParams.set('sourceTabId', String(tabId));
    return u.toString();
  };
  const getRememberedActionTabId = async () => {
    try {
      const stored = await S.get([LAST_ACTION_TAB_KEY]);
      const tabId = Number(stored?.[LAST_ACTION_TAB_KEY] || 0) || 0;
      return tabId > 0 ? tabId : 0;
    } catch {
      return 0;
    }
  };
  const resolveChatGptTabId = async (preferredTabId = 0) => {
    const candidates = [Number(preferredTabId) || 0, await getRememberedActionTabId()].filter((id) => id > 0);
    for (const tabId of candidates) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.id && /^https?:\/\/([^.]+\.)?chatgpt\.com\//i.test(String(tab.url || ''))) return tab.id;
      } catch {}
    }
    try {
      const tabs = await chrome.tabs.query({ url: ['*://chatgpt.com/*', '*://*.chatgpt.com/*'] });
      const list = Array.isArray(tabs) ? tabs.filter(Boolean) : [];
      const active = list.find((tab) => tab.active);
      return (active?.id || list.slice().sort((a, b) => Number(b?.lastAccessed || 0) - Number(a?.lastAccessed || 0))[0]?.id || 0);
    } catch {
      return 0;
    }
  };
  const relayToChatGptTab = async (payload, preferredTabId = 0) => {
    const tabId = await resolveChatGptTabId(preferredTabId);
    if (!tabId) return { ok: false, error: 'NO_CHATGPT_TAB' };
    try {
      const response = await chrome.tabs.sendMessage(tabId, payload);
      return response && typeof response === 'object' ? response : { ok: false };
    } catch (error) {
      if (/Receiving end does not exist/i.test(String(error?.message || ''))) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        try {
          const retry = await chrome.tabs.sendMessage(tabId, payload);
          return retry && typeof retry === 'object' ? retry : { ok: false };
        } catch (retryError) {
          return { ok: false, error: retryError?.message || error?.message || 'SEND_FAILED' };
        }
      }
      return { ok: false, error: error?.message || 'SEND_FAILED' };
    }
  };
  const findExistingActionPopupWindowId = async () => {
    try {
      const tabs = await chrome.tabs.query({ url: POPUP_URL_MATCH });
      const existing = (Array.isArray(tabs) ? tabs : []).find((tab) => Number.isInteger(tab?.windowId));
      return existing?.windowId ?? null;
    } catch {
      return null;
    }
  };
  const focusExistingActionPopup = async () => {
    const targetWindowId = actionPopupWindowId || (await findExistingActionPopupWindowId());
    if (!targetWindowId) return false;
    try {
      actionPopupWindowId = targetWindowId;
      await chrome.windows.update(targetWindowId, { focused: true, drawAttention: false });
      return true;
    } catch {
      actionPopupWindowId = null;
      return false;
    }
  };
  const openActionPopupWindow = async (tab) => {
    const sourceTab = await resolveLaunchChatGptTab(tab);
    const sourceTabId = Number.isInteger(sourceTab?.id) ? sourceTab.id : null;
    if (sourceTabId) {
      try {
        await S.set({ [LAST_ACTION_TAB_KEY]: sourceTabId });
      } catch {}
    }
    if (await focusExistingActionPopup()) return;
    const bounds = await getPopupBounds();
    const created = await chrome.windows.create({
      url: buildPopupUrl(sourceTabId),
      type: 'popup',
      focused: true,
      width: bounds.width,
      height: bounds.height,
      left: bounds.left,
      top: bounds.top,
    });
    actionPopupWindowId = created?.id ?? null;
  };
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === actionPopupWindowId) actionPopupWindowId = null;
  });
  chrome.action.onClicked.addListener((tab) => {
    void openActionPopupWindow(tab);
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'csp.relayToChatGptTab') {
      (async () => {
        const result = await relayToChatGptTab(msg.payload, Number(msg.targetTabId) || 0);
        sendResponse(result);
      })();
      return true;
    }
    if (msg?.type === 'cloudAuth.login') {
      (async () => {
        try {
          // Identity permission must already be granted by the popup's user gesture.
          if (!(await hasIdentity())) throw new Error('PERMISSION_DENIED');
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
