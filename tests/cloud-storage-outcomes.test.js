const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

const authSource = fs.readFileSync(path.join(__dirname, '../extension/auth.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(__dirname, '../extension/storage.js'), 'utf8');
const TOKEN_URL = 'https://profound-yeot-41eb0a.netlify.app/oauth/google/token';
const CLOUD_KEY = 'csp_cloud_file_id_v1';

class FakeStorage {
  constructor(seed = {}, eventLog = null, area = 'unknown') {
    this.data = { ...seed };
    this.operations = [];
    this.eventLog = eventLog;
    this.area = area;
  }

  async get(keys) {
    if (typeof keys === 'string') return { [keys]: this.data[keys] };
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    }
    throw new TypeError('FakeStorage.get supports only string or array keys.');
  }

  async set(values) {
    this.operations.push({ type: 'set', values: { ...values } });
    this.eventLog?.push({
      type: 'storage',
      area: this.area,
      action: 'set',
      values: { ...values },
    });
    Object.assign(this.data, values);
  }

  async remove(keys) {
    const normalizedKeys = Array.isArray(keys) ? keys : [keys];
    this.operations.push({ type: 'remove', keys: [...normalizedKeys] });
    this.eventLog?.push({
      type: 'storage',
      area: this.area,
      action: 'remove',
      keys: [...normalizedKeys],
    });
    for (const key of normalizedKeys) delete this.data[key];
  }
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function initialSession() {
  return {
    csp_auth_token_v2: 'T1',
    csp_auth_refresh_v2: 'R1',
    csp_auth_exp_v2: Math.floor(Date.now() / 1000) + 3600,
  };
}

function createHarness({ session = initialSession(), local = {}, fetchImpl, cloudAuthProvider }) {
  const calls = [];
  const eventLog = [];
  const sessionStorage = new FakeStorage(session, eventLog, 'session');
  const localStorage = new FakeStorage(local, eventLog, 'local');
  let identityCacheRemovals = 0;
  let loginMessages = 0;
  const chrome = {
    storage: {
      session: sessionStorage,
      local: localStorage,
    },
    identity: {
      removeCachedAuthToken(_details, callback) {
        identityCacheRemovals += 1;
        callback?.();
      },
      clearAllCachedAuthTokens: async () => {},
      getProfileUserInfo: (callback) => callback({}),
    },
    permissions: { contains: (_details, callback) => callback(false) },
    runtime: {
      sendMessage(_message, callback) {
        loginMessages += 1;
        callback({ ok: false, error: 'unexpected login' });
      },
    },
  };
  const fetch = async (input, init = {}) => {
    const request = {
      url: String(input),
      method: init.method || 'GET',
      headers: { ...(init.headers || {}) },
      body: init.body,
      cache: init.cache,
    };
    calls.push(request);
    const event = {
      type: 'fetch',
      method: request.method,
      path: new URL(request.url).pathname,
    };
    eventLog.push(event);
    const result = await fetchImpl(request, { calls, sessionStorage, localStorage });
    event.status = result.status;
    return result;
  };
  const context = {
    chrome,
    window: {},
    fetch,
    URL,
    Date,
    Math,
    OPTIONS_DEFAULTS: { setting: 'default', modelCatalog: [] },
  };
  context.globalThis = context;
  if (cloudAuthProvider) {
    context.window.CloudAuth = cloudAuthProvider;
  } else {
    runInNewContext(authSource, context, { filename: 'extension/auth.js' });
  }
  runInNewContext(storageSource, context, { filename: 'extension/storage.js' });
  return {
    calls,
    chrome,
    eventLog,
    window: context.window,
    sessionStorage,
    localStorage,
    get identityCacheRemovals() {
      return identityCacheRemovals;
    },
    get loginMessages() {
      return loginMessages;
    },
  };
}

function createStorageOnlyTokenProvider() {
  const calls = { getAuthToken: 0, refreshAuthToken: 0 };
  const cloudAuth = {
    async getAuthToken() {
      calls.getAuthToken += 1;
      return calls.getAuthToken === 1 ? 'T1' : 'T2';
    },
    async refreshAuthToken() {
      calls.refreshAuthToken += 1;
      return cloudAuth.getAuthToken({ interactive: false });
    },
  };
  return { calls, cloudAuth };
}

function urlOf(request) {
  return new URL(request.url);
}

function driveCalls(harness) {
  return harness.calls.filter((request) => urlOf(request).hostname === 'www.googleapis.com');
}

function tokenCalls(harness) {
  return harness.calls.filter((request) => request.url === TOKEN_URL);
}

function authorization(request) {
  return request.headers.Authorization;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('a rejected Drive token is force-refreshed through actual auth.js and T2 succeeds', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      if (request.url === TOKEN_URL) {
        assert.equal(request.method, 'POST');
        assert.equal(request.headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(request.body), {
          grant_type: 'refresh_token',
          refresh_token: 'R1',
          client_id: '327917786122-ha30ge1mejf2rikmk52u2ciu8h9hc2r0.apps.googleusercontent.com',
        });
        return response(200, { access_token: 'T2', expires_in: 3600 });
      }
      const url = urlOf(request);
      if (request.method === 'GET' && url.pathname === '/drive/v3/files') {
        return authorization(request) === 'Bearer T1'
          ? response(401, { error: 'expired' })
          : response(200, { files: [{ id: 'file-1' }] });
      }
      if (request.method === 'PATCH') return response(200, {});
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => request.method),
    ['GET', 'GET', 'PATCH'],
  );
  assert.deepEqual(requests.map(authorization), ['Bearer T1', 'Bearer T2', 'Bearer T2']);
  assert.deepEqual(
    requests.slice(0, 2).map((request) => urlOf(request).searchParams.get('spaces')),
    ['appDataFolder', 'appDataFolder'],
  );
  assert.equal(requests[0].cache, 'no-store');
  assert.equal(requests[2].headers['Content-Type'], 'application/json');
  assert.equal(tokenCalls(harness).length, 1);
  assert.equal(harness.sessionStorage.data.csp_auth_token_v2, 'T2');
  assert.equal(harness.sessionStorage.data.csp_auth_refresh_v2, 'R1');
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'file-1');
  assert.deepEqual(harness.localStorage.operations, [
    { type: 'set', values: { [CLOUD_KEY]: 'file-1' } },
  ]);
  assert.equal(harness.identityCacheRemovals, 0);
  assert.equal(harness.loginMessages, 0);
});

test('a rejected cached-ID update succeeds after the actual auth refresh', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      if (request.url === TOKEN_URL) return response(200, { access_token: 'T2', expires_in: 3600 });
      assert.equal(request.method, 'PATCH');
      assert.equal(urlOf(request).pathname, '/upload/drive/v3/files/known-id');
      return authorization(request) === 'Bearer T1'
        ? response(401, { error: 'expired' })
        : response(204, null);
    },
  });

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => request.method),
    ['PATCH', 'PATCH'],
  );
  assert.deepEqual(requests.map(authorization), ['Bearer T1', 'Bearer T2']);
  assert.equal(tokenCalls(harness).length, 1);
  assert.equal(harness.sessionStorage.data.csp_auth_token_v2, 'T2');
  assert.equal(harness.sessionStorage.data.csp_auth_refresh_v2, 'R1');
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
  assert.equal(harness.identityCacheRemovals, 0);
  assert.equal(harness.loginMessages, 0);
});

for (const operation of ['Save', 'Restore']) {
  test(`${operation} rejects a list response with a non-array files value`, async () => {
    const harness = createHarness({
      fetchImpl: async (request) => {
        assert.equal(request.method, 'GET');
        return response(200, { files: {} });
      },
    });

    await assert.rejects(
      operation === 'Save'
        ? harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' })
        : harness.window.CloudStorage.loadSyncedSettings(),
      /Drive list failed \(invalid response\)/,
    );

    assert.deepEqual(
      driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
      [['GET', '/drive/v3/files']],
    );
    assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
    assert.deepEqual(harness.localStorage.operations, []);
  });
}

for (const operation of ['Save', 'Restore']) {
  test(`${operation} rejects a list HTTP 500 instead of treating it as absence`, async () => {
    const harness = createHarness({
      fetchImpl: async (request) => {
        assert.equal(request.method, 'GET');
        assert.equal(urlOf(request).pathname, '/drive/v3/files');
        return response(500, { error: 'temporary failure' });
      },
    });

    await assert.rejects(
      operation === 'Save'
        ? harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' })
        : harness.window.CloudStorage.loadSyncedSettings(),
      /Drive list failed \(500\)/,
    );

    assert.deepEqual(
      driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
      [['GET', '/drive/v3/files']],
    );
    assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
    assert.deepEqual(harness.localStorage.operations, []);
  });
}

test('Save rejects a listed file with a non-string ID', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      assert.equal(request.method, 'GET');
      return response(200, { files: [{ id: 42 }] });
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive list failed \(invalid response\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Save rejects an empty listed ID without creating or caching a duplicate', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      assert.equal(request.method, 'GET');
      return response(200, { files: [{ id: '' }] });
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive list failed \(invalid response\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Save rejects and does not cache a create response with a non-string ID', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      if (request.method === 'GET') return response(200, { files: [] });
      if (request.method === 'POST') return response(200, { id: 42 });
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive create failed \(invalid response\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [
      ['GET', '/drive/v3/files'],
      ['POST', '/upload/drive/v3/files'],
    ],
  );
  assert.deepEqual(driveCalls(harness).map(authorization), ['Bearer T1', 'Bearer T1']);
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Save rejects an empty create ID without retrying or caching it', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      if (request.method === 'GET') return response(200, { files: [] });
      if (request.method === 'POST') return response(200, { id: '' });
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive create failed \(invalid response\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [
      ['GET', '/drive/v3/files'],
      ['POST', '/upload/drive/v3/files'],
    ],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, []);
});

test('persistent update authorization failures reject after the forced refresh', async () => {
  const statuses = [401, 403];
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      if (request.url === TOKEN_URL) return response(200, { access_token: 'T2', expires_in: 3600 });
      const updateCount = driveCalls(harness).filter((call) => call.method === 'PATCH').length;
      return response(statuses[updateCount - 1], { error: 'unauthorized' });
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive update failed \(403\)/,
  );

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => request.method),
    ['PATCH', 'PATCH'],
  );
  assert.deepEqual(requests.map(authorization), ['Bearer T1', 'Bearer T2']);
  assert.ok(requests.every((request) => request.headers['Content-Type'] === 'application/json'));
  assert.equal(tokenCalls(harness).length, 1);
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
});

const persistentAuthorizationScenarios = [
  {
    name: 'Save list',
    local: {},
    expectedError: /Drive list failed \(403\)/,
    run: (harness) => harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    respond(_request, attempt) {
      return response(attempt === 1 ? 401 : 403, { error: 'unauthorized' });
    },
    expectedMethods: ['GET', 'GET'],
    expectedPaths: ['/drive/v3/files', '/drive/v3/files'],
    expectedAuthorization: ['Bearer T1', 'Bearer T2'],
    expectedId: undefined,
  },
  {
    name: 'Restore list',
    local: {},
    expectedError: /Drive list failed \(403\)/,
    run: (harness) => harness.window.CloudStorage.loadSyncedSettings(),
    respond(_request, attempt) {
      return response(attempt === 1 ? 401 : 403, { error: 'unauthorized' });
    },
    expectedMethods: ['GET', 'GET'],
    expectedPaths: ['/drive/v3/files', '/drive/v3/files'],
    expectedAuthorization: ['Bearer T1', 'Bearer T2'],
    expectedId: undefined,
  },
  {
    name: 'known-ID download',
    local: { [CLOUD_KEY]: 'known-id' },
    expectedError: /Drive download failed \(403\)/,
    run: (harness) => harness.window.CloudStorage.loadSyncedSettings(),
    respond(request, attempt) {
      assert.equal(request.method, 'GET');
      assert.equal(urlOf(request).pathname, '/drive/v3/files/known-id');
      return response(attempt === 1 ? 401 : 403, { error: 'unauthorized' });
    },
    expectedMethods: ['GET', 'GET'],
    expectedPaths: ['/drive/v3/files/known-id', '/drive/v3/files/known-id'],
    expectedAuthorization: ['Bearer T1', 'Bearer T2'],
    expectedId: 'known-id',
  },
  {
    name: 'fallback download',
    local: {},
    expectedError: /Drive download failed \(403\)/,
    run: (harness) => harness.window.CloudStorage.loadSyncedSettings(),
    respond(request, attempt) {
      const pathname = urlOf(request).pathname;
      assert.equal(request.method, 'GET');
      if (pathname === '/drive/v3/files') {
        return response(200, { files: [{ id: 'listed-id' }] });
      }
      assert.equal(pathname, '/drive/v3/files/listed-id');
      const downloadAttempt = attempt - 1;
      return response(downloadAttempt === 1 ? 401 : 403, { error: 'unauthorized' });
    },
    expectedMethods: ['GET', 'GET', 'GET'],
    expectedPaths: ['/drive/v3/files', '/drive/v3/files/listed-id', '/drive/v3/files/listed-id'],
    expectedAuthorization: ['Bearer T1', 'Bearer T1', 'Bearer T2'],
    expectedId: 'listed-id',
  },
];

for (const scenario of persistentAuthorizationScenarios) {
  test(`persistent 401 then 403 from ${scenario.name} rejects with exact retry side effects`, async () => {
    let driveAttempt = 0;
    const tokenProvider = createStorageOnlyTokenProvider();
    const harness = createHarness({
      local: scenario.local,
      cloudAuthProvider: tokenProvider.cloudAuth,
      fetchImpl: async (request) => {
        driveAttempt += 1;
        return scenario.respond(request, driveAttempt);
      },
    });

    await assert.rejects(scenario.run(harness), scenario.expectedError);

    const requests = driveCalls(harness);
    assert.deepEqual(
      requests.map((request) => request.method),
      scenario.expectedMethods,
    );
    assert.deepEqual(
      requests.map((request) => urlOf(request).pathname),
      scenario.expectedPaths,
    );
    assert.deepEqual(requests.map(authorization), scenario.expectedAuthorization);
    assert.equal(tokenCalls(harness).length, 0);
    assert.deepEqual(tokenProvider.calls, { getAuthToken: 2, refreshAuthToken: 1 });
    assert.equal(harness.identityCacheRemovals, 0);
    assert.equal(harness.localStorage.data[CLOUD_KEY], scenario.expectedId);
  });
}

test('a successful empty list is genuine absence', async () => {
  const harness = createHarness({
    fetchImpl: async () => response(200, { files: [] }),
  });

  const settings = await harness.window.CloudStorage.loadSyncedSettings();

  assert.deepEqual(plain(settings), {});
  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
});

test('a listed Save writes the discovered file ID only once before updating', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      const pathname = urlOf(request).pathname;
      if (request.method === 'GET' && pathname === '/drive/v3/files') {
        return response(200, { files: [{ id: 'listed-id' }] });
      }
      if (request.method === 'PATCH' && pathname === '/upload/drive/v3/files/listed-id') {
        return response(200, {});
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [
      ['GET', '/drive/v3/files'],
      ['PATCH', '/upload/drive/v3/files/listed-id'],
    ],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'listed-id');
  assert.deepEqual(harness.localStorage.operations, [
    { type: 'set', values: { [CLOUD_KEY]: 'listed-id' } },
  ]);
});

test('stale-ID Save removes the old ID before creating and caches exactly one replacement', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'stale-id' },
    fetchImpl: async (request) => {
      const pathname = urlOf(request).pathname;
      if (request.method === 'PATCH' && pathname === '/upload/drive/v3/files/stale-id') {
        return response(404, { error: 'not found' });
      }
      if (request.method === 'POST' && pathname === '/upload/drive/v3/files') {
        return response(200, { id: 'created-id' });
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  assert.deepEqual(harness.eventLog, [
    {
      type: 'fetch',
      method: 'PATCH',
      path: '/upload/drive/v3/files/stale-id',
      status: 404,
    },
    {
      type: 'storage',
      area: 'local',
      action: 'remove',
      keys: [CLOUD_KEY],
    },
    {
      type: 'fetch',
      method: 'POST',
      path: '/upload/drive/v3/files',
      status: 200,
    },
    {
      type: 'storage',
      area: 'local',
      action: 'set',
      values: { [CLOUD_KEY]: 'created-id' },
    },
  ]);
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'created-id');
  assert.deepEqual(harness.localStorage.operations, [
    { type: 'remove', keys: [CLOUD_KEY] },
    { type: 'set', values: { [CLOUD_KEY]: 'created-id' } },
  ]);
});

test('a successful no-ID Save creates and caches a file after one empty listing', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      if (request.method === 'GET') return response(200, { files: [] });
      if (request.method === 'POST') return response(200, { id: 'created-id' });
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => request.method),
    ['GET', 'POST'],
  );
  assert.deepEqual(requests.map(authorization), ['Bearer T1', 'Bearer T1']);
  assert.equal(urlOf(requests[0]).searchParams.get('spaces'), 'appDataFolder');
  assert.match(requests[1].headers['Content-Type'], /^multipart\/related; boundary=/);
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'created-id');
  assert.deepEqual(harness.localStorage.operations, [
    { type: 'set', values: { [CLOUD_KEY]: 'created-id' } },
  ]);
});

test('a no-ID Save rejects after one create retry on persistent 401 then 403', async () => {
  const tokenProvider = createStorageOnlyTokenProvider();
  const harness = createHarness({
    cloudAuthProvider: tokenProvider.cloudAuth,
    fetchImpl: async (request) => {
      const pathname = urlOf(request).pathname;
      if (request.method === 'GET' && pathname === '/drive/v3/files') {
        return response(200, { files: [] });
      }
      assert.equal(request.method, 'POST');
      assert.equal(pathname, '/upload/drive/v3/files');
      const attempt = driveCalls(harness).filter((call) => call.method === 'POST').length;
      if (attempt === 1) return response(401, { error: 'unauthorized' });
      if (attempt === 2) return response(403, { error: 'unauthorized' });
      return response(200, { id: 'unexpected-created-id' });
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive create failed \(403\)/,
  );

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => [request.method, urlOf(request).pathname]),
    [
      ['GET', '/drive/v3/files'],
      ['POST', '/upload/drive/v3/files'],
      ['POST', '/upload/drive/v3/files'],
    ],
  );
  assert.deepEqual(requests.map(authorization), ['Bearer T1', 'Bearer T1', 'Bearer T2']);
  assert.deepEqual(tokenProvider.calls, { getAuthToken: 2, refreshAuthToken: 1 });
  assert.equal(tokenCalls(harness).length, 0);
  assert.equal(harness.identityCacheRemovals, 0);
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, []);
});

test('a failed refresh grant falls through to the login broker for a no-ID create retry', async () => {
  const brokerToken = 'BROKER-TOKEN';
  let brokerMessages = 0;
  const harness = createHarness({
    fetchImpl: async (request) => {
      if (request.url === TOKEN_URL) return response(500, { error: 'temporary' });
      const pathname = urlOf(request).pathname;
      if (request.method === 'GET' && pathname === '/drive/v3/files') {
        return response(200, { files: [] });
      }
      assert.equal(request.method, 'POST');
      assert.equal(pathname, '/upload/drive/v3/files');
      const attempt = driveCalls(harness).filter((call) => call.method === 'POST').length;
      if (attempt === 1) return response(401, { error: 'unauthorized' });
      if (attempt === 2) return response(200, { id: 'broker-created-id' });
      throw new Error(`Unexpected create attempt ${attempt}`);
    },
  });
  harness.chrome.runtime.sendMessage = (message, callback) => {
    brokerMessages += 1;
    assert.equal(message.type, 'cloudAuth.login');
    void harness.sessionStorage
      .set({
        csp_auth_token_v2: brokerToken,
        csp_auth_exp_v2: Math.floor(Date.now() / 1000) + 3600,
      })
      .then(() => callback({ ok: true }));
  };

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => request.method),
    ['GET', 'POST', 'POST'],
  );
  assert.deepEqual(requests.map(authorization), [
    'Bearer T1',
    'Bearer T1',
    `Bearer ${brokerToken}`,
  ]);
  assert.equal(tokenCalls(harness).length, 1);
  assert.equal(brokerMessages, 1);
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'broker-created-id');
});

test('a cached-ID Save updates successfully without listing or creating', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      assert.equal(request.method, 'PATCH');
      assert.equal(urlOf(request).pathname, '/upload/drive/v3/files/known-id');
      return response(200, {});
    },
  });

  await harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' });

  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => [request.method, urlOf(request).pathname]),
    [['PATCH', '/upload/drive/v3/files/known-id']],
  );
  assert.equal(authorization(requests[0]), 'Bearer T1');
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
});

test('a cached-ID Save rejects on HTTP 500 without changing the ID', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      assert.equal(request.method, 'PATCH');
      assert.equal(urlOf(request).pathname, '/upload/drive/v3/files/known-id');
      return response(500, { error: 'temporary failure' });
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.saveSyncedSettings({ setting: 'saved' }),
    /Drive update failed \(500\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['PATCH', '/upload/drive/v3/files/known-id']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Restore rejects a null 2xx download body instead of reporting no backup', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      assert.equal(request.method, 'GET');
      assert.equal(urlOf(request).pathname, '/drive/v3/files/known-id');
      return response(200, null);
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.loadSyncedSettings(),
    /Drive download failed \(invalid response\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files/known-id']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Restore rejects an array download body instead of reporting no backup', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      assert.equal(request.method, 'GET');
      assert.equal(urlOf(request).pathname, '/drive/v3/files/known-id');
      return response(200, []);
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.loadSyncedSettings(),
    /Drive download failed \(invalid response\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files/known-id']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Restore rejects a cached-ID download HTTP 500 and preserves the ID', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      assert.equal(request.method, 'GET');
      assert.equal(urlOf(request).pathname, '/drive/v3/files/known-id');
      return response(500, { error: 'temporary failure' });
    },
  });

  await assert.rejects(
    harness.window.CloudStorage.loadSyncedSettings(),
    /Drive download failed \(500\)/,
  );

  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files/known-id']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
});

test('Restore returns a valid cached-ID backup without listing or rewriting the ID', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'known-id' },
    fetchImpl: async (request) => {
      assert.equal(request.method, 'GET');
      assert.equal(urlOf(request).pathname, '/drive/v3/files/known-id');
      assert.equal(urlOf(request).searchParams.get('alt'), 'media');
      assert.equal(request.cache, 'no-store');
      return response(200, { setting: 'restored' });
    },
  });

  const settings = await harness.window.CloudStorage.loadSyncedSettings();

  assert.deepEqual(plain(settings), { setting: 'restored' });
  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [['GET', '/drive/v3/files/known-id']],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'known-id');
  assert.deepEqual(harness.localStorage.operations, []);
});

test('a rejected fallback download succeeds after refreshing and caches the listed ID', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      if (request.url === TOKEN_URL) return response(200, { access_token: 'T2', expires_in: 3600 });
      const url = urlOf(request);
      if (url.pathname === '/drive/v3/files')
        return response(200, { files: [{ id: 'listed-id' }] });
      assert.equal(request.method, 'GET');
      assert.equal(url.pathname, '/drive/v3/files/listed-id');
      return authorization(request) === 'Bearer T1'
        ? response(401, { error: 'expired' })
        : response(200, { setting: 'restored' });
    },
  });

  const settings = await harness.window.CloudStorage.loadSyncedSettings();

  assert.deepEqual(plain(settings), { setting: 'restored' });
  const requests = driveCalls(harness);
  assert.deepEqual(
    requests.map((request) => urlOf(request).pathname),
    ['/drive/v3/files', '/drive/v3/files/listed-id', '/drive/v3/files/listed-id'],
  );
  assert.deepEqual(requests.map(authorization), ['Bearer T1', 'Bearer T1', 'Bearer T2']);
  assert.equal(tokenCalls(harness).length, 1);
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'listed-id');
  assert.deepEqual(harness.localStorage.operations, [
    { type: 'set', values: { [CLOUD_KEY]: 'listed-id' } },
  ]);
});

test('restore recovers a stale cached id after download 404 and uses the listed id', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'stale-id' },
    fetchImpl: async (request) => {
      const url = urlOf(request);
      if (url.pathname.endsWith('/stale-id')) return response(404, { error: 'not found' });
      if (url.pathname === '/drive/v3/files')
        return response(200, { files: [{ id: 'current-id' }] });
      if (url.pathname.endsWith('/current-id')) {
        return response(200, { setting: 'restored', modelCatalog: ['session-only'] });
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  const settings = await harness.window.CloudStorage.loadSyncedSettings();

  assert.deepEqual(plain(settings), { setting: 'restored' });
  assert.deepEqual(
    driveCalls(harness).map((request) => urlOf(request).pathname),
    ['/drive/v3/files/stale-id', '/drive/v3/files', '/drive/v3/files/current-id'],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], 'current-id');
});

test('a known-ID 404 followed by an empty list clears the ID and returns genuine absence', async () => {
  const harness = createHarness({
    local: { [CLOUD_KEY]: 'stale-id' },
    fetchImpl: async (request) => {
      const pathname = urlOf(request).pathname;
      if (pathname === '/drive/v3/files/stale-id') return response(404, { error: 'not found' });
      if (pathname === '/drive/v3/files') return response(200, { files: [] });
      throw new Error(`Unexpected request ${request.method} ${request.url}`);
    },
  });

  const settings = await harness.window.CloudStorage.loadSyncedSettings();

  assert.deepEqual(plain(settings), {});
  assert.deepEqual(
    driveCalls(harness).map((request) => urlOf(request).pathname),
    ['/drive/v3/files/stale-id', '/drive/v3/files'],
  );
  assert.deepEqual(driveCalls(harness).map(authorization), ['Bearer T1', 'Bearer T1']);
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, [{ type: 'remove', keys: [CLOUD_KEY] }]);
});

test('fallback download 404 clears the id that the listing just cached', async () => {
  const harness = createHarness({
    fetchImpl: async (request) => {
      const url = urlOf(request);
      if (url.pathname === '/drive/v3/files')
        return response(200, { files: [{ id: 'vanished-id' }] });
      return response(404, { error: 'not found' });
    },
  });

  const settings = await harness.window.CloudStorage.loadSyncedSettings();

  assert.deepEqual(plain(settings), {});
  assert.deepEqual(
    driveCalls(harness).map((request) => [request.method, urlOf(request).pathname]),
    [
      ['GET', '/drive/v3/files'],
      ['GET', '/drive/v3/files/vanished-id'],
    ],
  );
  assert.equal(harness.localStorage.data[CLOUD_KEY], undefined);
  assert.deepEqual(harness.localStorage.operations, [
    { type: 'set', values: { [CLOUD_KEY]: 'vanished-id' } },
    { type: 'remove', keys: [CLOUD_KEY] },
  ]);
});
