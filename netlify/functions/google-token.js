exports.handler = async (event) => {
  const C = () => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: C(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: C(), body: 'POST only' };

  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

    const body = JSON.parse(event.body || '{}');
    const { grant_type, code, refresh_token, redirect_uri, client_id } = body;

    if (client_id !== GOOGLE_CLIENT_ID)
      return {
        statusCode: 400,
        headers: C(),
        body: JSON.stringify({ error: 'invalid_client_id' }),
      };

    // Accept any chromiumapp.org redirect. Google still validates redirect_uri against your OAuth client.
    if (grant_type === 'authorization_code') {
      try {
        const u = new URL(redirect_uri || '');
        if (!/\.chromiumapp\.org$/i.test(u.host))
          return {
            statusCode: 400,
            headers: C(),
            body: JSON.stringify({ error: 'bad_redirect_uri' }),
          };
      } catch {
        return {
          statusCode: 400,
          headers: C(),
          body: JSON.stringify({ error: 'bad_redirect_uri' }),
        };
      }
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
      params.set('code', code);
      params.set('redirect_uri', redirect_uri);
    } else {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', refresh_token);
    }

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = await r.json();
    const status = r.ok ? 200 : 400;
    return { statusCode: status, headers: C(), body: JSON.stringify(j) };
  } catch (e) {
    return {
      statusCode: 500,
      headers: C(),
      body: JSON.stringify({ error: 'server_error', message: e.message }),
    };
  }
};
