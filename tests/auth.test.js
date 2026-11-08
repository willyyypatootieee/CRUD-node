import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { AppError } from '../src/errors/AppError.js';
import { createSupabaseAuthService } from '../src/config/supabase.js';
import { createApp } from '../src/app.js';
import { SupabaseAuthService } from '../src/services/SupabaseAuthService.js';

const user = {
  id: '8f14e45f-ea2c-4b1a-9c3a-4f0f0f0f0f0f',
  email: 'test@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  email_confirmed_at: null,
  last_sign_in_at: '2026-01-02T00:00:00.000Z',
};

function fakeAuthService() {
  return {
    async signUp(email, password) {
      assert.equal(password, 'password123');
      if (email === 'exists@example.com') {
        throw new AppError('User already registered', 400);
      }
      return { ...user, email };
    },
    async login(email, password) {
      if (email !== user.email || password !== 'password123') {
        throw new AppError('Invalid login credentials', 401);
      }
      return {
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        user,
      };
    },
    async verifyToken(token) {
      if (token !== 'valid-token') {
        throw new AppError('Invalid or expired token', 401);
      }
      return user;
    },
    async logout(token) {
      if (token !== 'valid-token') {
        throw new AppError('Invalid or expired token', 401);
      }
    },
  };
}

async function fixture(t) {
  const server = createApp({
    authService: fakeAuthService(),
    databasePath: ':memory:',
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      text,
    };
  };
}

test('public information is available without a token', async (t) => {
  const request = await fixture(t);
  const response = await request('/public/info');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    message: 'Welcome stranger! This info is public.',
  });
});

test('signup validates credentials and returns 201 with a safe user object', async (t) => {
  const request = await fixture(t);
  for (const body of [
    undefined,
    {},
    { email: 'test@example.com' },
    { password: 'x' },
    { email: '   ', password: 'x' },
    { email: 1, password: 'x' },
    [],
  ]) {
    assert.equal((await request('/auth/signup', 'POST', body)).status, 400);
  }
  const response = await request('/auth/signup', 'POST', {
    email: '  test@example.com  ',
    password: 'password123',
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, 'test@example.com');
  assert.equal(response.body.user.password, undefined);
});

test('signup forwards a provider validation error as 400', async (t) => {
  const request = await fixture(t);
  const response = await request('/auth/signup', 'POST', {
    email: 'exists@example.com',
    password: 'password123',
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'User already registered');
});

test('login returns tokens and never returns the password', async (t) => {
  const request = await fixture(t);
  const missing = await request('/auth/login', 'POST', {});
  assert.equal(missing.status, 400);
  const invalid = await request('/auth/login', 'POST', {
    email: 'test@example.com',
    password: 'wrong',
  });
  assert.equal(invalid.status, 401);
  assert.deepEqual(invalid.body, { error: 'Invalid login credentials' });
  const response = await request('/auth/login', 'POST', {
    email: 'test@example.com',
    password: 'password123',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.access_token, 'valid-token');
  assert.equal(response.body.refresh_token, 'refresh-token');
  assert.equal(response.body.user.id, user.id);
  assert.equal(response.body.user.password, undefined);
});

test('protected routes require a correctly formatted bearer token', async (t) => {
  const request = await fixture(t);
  for (const path of ['/protected/profile', '/protected/dashboard']) {
    for (const header of [
      undefined,
      '',
      'Bearer',
      'Bearer ',
      'Basic abc',
      'Bearer a b',
      'Bearer token, Bearer other',
    ]) {
      const response = await request(
        path,
        'GET',
        undefined,
        header === undefined ? {} : { Authorization: header },
      );
      assert.equal(response.status, 401, `${path} ${header}`);
      assert.deepEqual(response.body, { error: 'Access token required' });
    }
  }
});

test('invalid tokens are rejected and valid tokens reach both protected handlers', async (t) => {
  const request = await fixture(t);
  for (const path of ['/protected/profile', '/protected/dashboard']) {
    const invalid = await request(path, 'GET', undefined, {
      Authorization: 'Bearer tampered-token',
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(invalid.body, { error: 'Invalid or expired token' });
  }
  const profile = await request('/protected/profile', 'GET', undefined, {
    Authorization: 'bearer valid-token',
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, user.email);
  assert.equal(profile.body.user.password, undefined);
  const dashboard = await request('/protected/dashboard', 'GET', undefined, {
    Authorization: 'Bearer valid-token',
  });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.message, 'Welcome to your protected dashboard');
});

test('logout uses the verified token, returns 204 and rejects invalid tokens', async (t) => {
  const request = await fixture(t);
  const missing = await request('/auth/logout', 'POST');
  assert.equal(missing.status, 401);
  const invalid = await request('/auth/logout', 'POST', undefined, {
    Authorization: 'Bearer bad',
  });
  assert.equal(invalid.status, 401);
  const response = await request('/auth/logout', 'POST', undefined, {
    Authorization: 'Bearer valid-token',
  });
  assert.equal(response.status, 204);
  assert.equal(response.text, '');
});

test('SupabaseAuthService maps SDK results and revokes through the auth endpoint', async () => {
  const calls = [];
  const client = {
    auth: {
      async signUp(input) {
        calls.push(['signUp', input]);
        return { data: { user }, error: null };
      },
      async signInWithPassword(input) {
        calls.push(['login', input]);
        return {
          data: {
            user,
            session: {
              access_token: 'access',
              refresh_token: 'refresh',
              token_type: 'bearer',
              expires_in: 3600,
            },
          },
          error: null,
        };
      },
      async getUser(token) {
        calls.push(['getUser', token]);
        return token === 'access'
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: 'invalid' } };
      },
    },
  };
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push([url, options]);
    return { status: 204, ok: true };
  };
  const service = new SupabaseAuthService({
    url: 'https://project.supabase.co/',
    key: 'anon-key',
    client,
    fetchImpl,
  });
  assert.equal((await service.signUp('a@example.com', 'secret')).id, user.id);
  assert.equal(
    (await service.login('a@example.com', 'secret')).access_token,
    'access',
  );
  assert.equal((await service.verifyToken('access')).email, user.email);
  await assert.rejects(service.verifyToken('bad'), /Invalid or expired token/);
  await service.checkConnection();
  await service.logout('access');
  const logoutCall = fetchCalls.find(([url]) =>
    url.endsWith('/logout?scope=local'),
  );
  assert.equal(
    logoutCall[0],
    'https://project.supabase.co/auth/v1/logout?scope=local',
  );
  assert.equal(logoutCall[1].headers.Authorization, 'Bearer access');
  assert.equal(logoutCall[1].headers.apikey, 'anon-key');
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['signUp', 'login', 'getUser', 'getUser'],
  );
});

test('SupabaseAuthService maps provider failures without leaking credentials', async () => {
  const client = {
    auth: {
      async signUp() {
        return { data: {}, error: { message: 'Email invalid', status: 400 } };
      },
      async signInWithPassword() {
        return { data: {}, error: { message: 'Wrong password', status: 400 } };
      },
      async getUser() {
        return { data: { user: null }, error: { message: 'expired' } };
      },
    },
  };
  const service = new SupabaseAuthService({
    url: 'https://project.supabase.co',
    key: 'anon-key',
    client,
    fetchImpl: async () => ({ status: 401, ok: false }),
  });
  await assert.rejects(service.signUp('a@example.com', 'x'), /Email invalid/);
  await assert.rejects(
    service.login('a@example.com', 'x'),
    /Invalid login credentials/,
  );
  await assert.rejects(service.verifyToken('x'), /Invalid or expired token/);
  await assert.rejects(service.logout('x'), /Invalid or expired token/);
});

test('SupabaseAuthService works with the real SDK against a local auth server', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({
      url: req.url,
      method: req.method,
      body,
      headers: req.headers,
    });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/health') {
      return res.end(JSON.stringify({ name: 'GoTrue', version: 'local' }));
    }
    if (req.url === '/auth/v1/signup') {
      res.statusCode = 200;
      return res.end(JSON.stringify({ user }));
    }
    if (req.url === '/auth/v1/token?grant_type=password') {
      res.statusCode = 200;
      return res.end(
        JSON.stringify({
          access_token: 'sdk-access',
          refresh_token: 'sdk-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        }),
      );
    }
    if (req.url === '/auth/v1/user') {
      if (req.headers.authorization === 'Bearer sdk-access') {
        return res.end(JSON.stringify({ user }));
      }
      res.statusCode = 401;
      return res.end(JSON.stringify({ message: 'invalid token' }));
    }
    if (req.url === '/auth/v1/logout?scope=local') {
      res.statusCode = 204;
      return res.end();
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'not found' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const service = createSupabaseAuthService({
    SUPABASE_URL: url,
    SUPABASE_KEY: 'local-anon-key',
  });
  assert.equal((await service.signUp('a@example.com', 'secret')).id, user.id);
  assert.equal(
    (await service.login('a@example.com', 'secret')).access_token,
    'sdk-access',
  );
  assert.equal((await service.verifyToken('sdk-access')).email, user.email);
  await service.checkConnection();
  await service.logout('sdk-access');
  assert.ok(
    requests.some(
      (request) => request.url === '/auth/v1/token?grant_type=password',
    ),
  );
  assert.ok(
    requests.some((request) => request.url === '/auth/v1/logout?scope=local'),
  );
});

test('missing Supabase configuration fails with an actionable error', () => {
  assert.throws(
    () => createSupabaseAuthService({}),
    /SUPABASE_URL and SUPABASE_KEY are required/,
  );
});
