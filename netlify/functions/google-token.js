exports.handler = async (event) => {
  const C = () => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: C(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: C(), body: 'POST only' };

  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PROD_EXTENSION_ID, DEV_EXTENSION_ID } =
      process.env;

    const body = JSON.parse(event.body || '{}');
    const { grant_type, code, refresh_token, redirect_uri, client_id } = body;

    const safeHost = (() => {
      try {
        return new URL(redirect_uri || '').host;
      } catch {
        return 'bad_url';
      }
    })();
    console.log('[google-token] inbound', {
      grant_type,
      client_id_ok: client_id === GOOGLE_CLIENT_ID,
      redirect_host: safeHost,
    });

    if (client_id !== GOOGLE_CLIENT_ID)
      return {
        statusCode: 400,
        headers: C(),
        body: JSON.stringify({ error: 'invalid_client_id' }),
      };

    const allow = [`https://${PROD_EXTENSION_ID}.chromiumapp.org/`];
    if (DEV_EXTENSION_ID) allow.push(`https://${DEV_EXTENSION_ID}.chromiumapp.org/`);

    if (grant_type === 'authorization_code') {
      if (!redirect_uri || !allow.some((p) => redirect_uri.startsWith(p)))
        return {
          statusCode: 400,
          headers: C(),
          body: JSON.stringify({ error: 'bad_redirect_uri' }),
        };
    } else if (grant_type !== 'refresh_token') {
      return {
        statusCode: 400,
        headers: C(),
        body: JSON.stringify({ error: 'unsupported_grant_type' }),
      };
    }

    const params = new URLSearchParams();
    params.set('client_id', GOOGLE_CLIENT_ID);
    params.set('client_secret', GOOGLE_CLIENT_SECRET);
    if (grant_type === 'authorization_code') {
      params.set('grant_type', 'authorization_code');
      params.set('code', code ? 'REDACTED' : '');
      params.set('redirect_uri', redirect_uri);
    } else {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', refresh_token ? 'REDACTED' : '');
    }

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // send real values, not redacted
      body: params
        .toString()
        .replace(
          'REDACTED',
          grant_type === 'authorization_code' ? code || '' : refresh_token || '',
        ),
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = { raw: text };
    }
    console.log('[google-token] google response', { status: r.status, keys: Object.keys(j || {}) });

    const status = r.ok ? 200 : 400;
    return { statusCode: status, headers: C(), body: JSON.stringify(j) };
  } catch (e) {
    console.error('[google-token] server_error', e?.message || e);
    return {
      statusCode: 500,
      headers: C(),
      body: JSON.stringify({ error: 'server_error', message: e.message }),
    };
  }
};
