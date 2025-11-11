// server.js (Node 18+)
import express from 'express';

const app = express();
app.use(express.json());

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  ALLOWED_EXTENSION_ID, // your chrome extension id
  PORT = 8080,
} = process.env;

const allowOrigin = `chrome-extension://${ALLOWED_EXTENSION_ID}`;
app.use((req, res, next) => {
  const o = req.headers.origin || '';
  if (o === allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.end();
  }
  next();
});

app.post('/oauth/google/token', async (req, res) => {
  try {
    const { grant_type, code, refresh_token, redirect_uri, client_id } = req.body || {};
    if (client_id !== GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'invalid_client_id' });
    const expectedPrefix = `https://${ALLOWED_EXTENSION_ID}.chromiumapp.org/`;
    if (
      grant_type === 'authorization_code' &&
      (!redirect_uri || !redirect_uri.startsWith(expectedPrefix))
    ) {
      return res.status(400).json({ error: 'bad_redirect_uri' });
    }
    const params = new URLSearchParams();
    params.set('client_id', GOOGLE_CLIENT_ID);
    params.set('client_secret', GOOGLE_CLIENT_SECRET);
    if (grant_type === 'authorization_code') {
      params.set('grant_type', 'authorization_code');
      params.set('code', code);
      params.set('redirect_uri', redirect_uri);
    } else if (grant_type === 'refresh_token') {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', refresh_token);
    } else {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = await r.json();
    if (!r.ok) return res.status(400).json(j);
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e.message });
  }
});

app.listen(PORT, () => console.log('Token exchanger listening on', PORT));
