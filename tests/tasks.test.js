import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { TaskRepository } from '../src/repositories/TaskRepository.js';
import { openDatabase } from '../src/config/database.js';

async function fixture(t, options) {
  const app = createApp({ databasePath: ':memory:', ...options });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) =>
        server.close(() => {
          app.locals.database.close();
          resolve();
        }),
      ),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      text,
      headers: response.headers,
    };
  };
}

const cases = [
  [
    'TC-01 root metadata',
    '/',
    'GET',
    undefined,
    200,
    (body) => assert.equal(body.name, 'TaskFlow API'),
  ],
  [
    'TC-02 health',
    '/health',
    'GET',
    undefined,
    200,
    (body) => assert.equal(body.status, 'ok'),
  ],
  [
    'TC-03 task list',
    '/tasks',
    'GET',
    undefined,
    200,
    (body) => assert.equal(body.length, 3),
  ],
  [
    'TC-04 existing task',
    '/tasks/1',
    'GET',
    undefined,
    200,
    (body) => assert.equal(body.id, 1),
  ],
  ['TC-05 unknown task', '/tasks/99', 'GET', undefined, 404],
  [
    'TC-06 create task',
    '/tasks',
    'POST',
    { title: '  Buy milk  ', done: true },
    201,
    (body) => assert.deepEqual(body, { id: 4, title: 'Buy milk', done: false }),
  ],
  ['TC-07 missing title', '/tasks', 'POST', {}, 400],
  ['TC-08 whitespace title', '/tasks', 'POST', { title: '   ' }, 400],
  ['TC-09 non-string title', '/tasks', 'POST', { title: 12 }, 400],
  [
    'TC-10 update title',
    '/tasks/1',
    'PUT',
    { title: '  New title  ' },
    200,
    (body) =>
      assert.deepEqual(body, { id: 1, title: 'New title', done: false }),
  ],
  [
    'TC-11 update done',
    '/tasks/1',
    'PUT',
    { done: true },
    200,
    (body) => assert.equal(body.done, true),
  ],
  ['TC-12 empty update', '/tasks/1', 'PUT', {}, 400],
  ['TC-13 invalid done', '/tasks/1', 'PUT', { done: 'true' }, 400],
  ['TC-14 update unknown', '/tasks/99', 'PUT', { done: true }, 404],
  [
    'TC-15 delete task',
    '/tasks/1',
    'DELETE',
    undefined,
    204,
    (_body, response) => assert.equal(response.text, ''),
  ],
  ['TC-16 delete unknown', '/tasks/99', 'DELETE', undefined, 404],
  ['TC-17 malformed ID', '/tasks/abc', 'GET', undefined, 400],
];

for (const [name, path, method, data, status, check] of cases) {
  test(name, async (t) => {
    const request = await fixture(t);
    const response = await request(path, method, data);
    assert.equal(response.status, status);
    if (status >= 400) assert.equal(typeof response.body.error, 'string');
    check?.(response.body, response);
  });
}

test('TC-18 complete CRUD cycle and IDs are not reused', async (t) => {
  const request = await fixture(t);
  const created = await request('/tasks', 'POST', { title: 'Lifecycle' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('location'), '/tasks/4');
  assert.ok((await request('/tasks')).body.some((task) => task.id === 4));
  assert.equal(
    (await request('/tasks/4', 'PUT', { title: 'Updated', done: true })).status,
    200,
  );
  assert.deepEqual((await request('/tasks/4')).body, {
    id: 4,
    title: 'Updated',
    done: true,
  });
  assert.equal((await request('/tasks/4', 'DELETE')).status, 204);
  assert.equal((await request('/tasks/4')).status, 404);
  assert.equal((await request('/tasks', 'POST', { title: 'Next' })).body.id, 5);
});

test('filter, search and pagination compose without changing the array contract', async (t) => {
  const request = await fixture(t);
  assert.deepEqual(
    (await request('/tasks?done=true')).body.map((task) => task.id),
    [2],
  );
  assert.deepEqual(
    (
      await request('/tasks?done=false&search=SWAGGER&limit=1&offset=0')
    ).body.map((task) => task.id),
    [3],
  );
  assert.deepEqual(
    (await request('/tasks?offset=2&limit=2')).body.map((task) => task.id),
    [3],
  );
  assert.deepEqual((await request('/tasks?offset=99')).body, []);
});

test('invalid queries and malformed IDs return JSON 400', async (t) => {
  const request = await fixture(t);
  for (const query of [
    'done=yes',
    'done=true&done=false',
    'limit=0',
    'limit=-1',
    'offset=1.5',
    'limit=9007199254740992',
    'unknown=1',
    'search=a&search=b',
  ]) {
    assert.equal((await request(`/tasks?${query}`)).status, 400, query);
  }
  for (const id of ['0', '-1', '1.2', '01', '1abc', '9007199254740992']) {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      assert.equal(
        (
          await request(
            `/tasks/${id}`,
            method,
            method === 'PUT' ? { done: true } : undefined,
          )
        ).status,
        400,
      );
    }
  }
});

test('body validation rejects invalid shapes and updates are atomic', async (t) => {
  const request = await fixture(t);
  for (const body of [null, [], 'text', 7, false]) {
    assert.equal((await request('/tasks', 'POST', body)).status, 400);
    assert.equal((await request('/tasks/1', 'PUT', body)).status, 400);
  }
  for (const body of [
    { title: '' },
    { title: null },
    { done: null },
    { other: true },
    { title: 'Valid', done: 1 },
  ]) {
    assert.equal((await request('/tasks/1', 'PUT', body)).status, 400);
  }
  assert.equal(
    (await request('/tasks/1')).body.title,
    'Complete FlyRank assignment',
  );
  assert.equal(
    (await request('/tasks/1', 'PUT', { id: 999, done: true })).body.id,
    1,
  );
  assert.equal((await request('/tasks', 'POST')).status, 400);
});

test('statistics and reset restore seeds without recycling generated IDs', async (t) => {
  const request = await fixture(t);
  assert.deepEqual((await request('/stats')).body, {
    total: 3,
    completed: 1,
    pending: 2,
  });
  await request('/tasks', 'POST', { title: 'Temporary' });
  await request('/tasks/1', 'DELETE');
  const reset = await request('/reset', 'POST');
  assert.equal(reset.status, 200);
  assert.equal(reset.body.length, 3);
  assert.equal((await request('/tasks/4')).status, 404);
  assert.equal(
    (await request('/tasks', 'POST', { title: 'After reset' })).body.id,
    5,
  );
});

test('fresh applications and repository copies isolate mutable state', async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  await first('/tasks/1', 'DELETE');
  assert.equal((await second('/tasks/1')).status, 200);
  const initial = [{ id: 10, title: 'Original', done: false }];
  const database = openDatabase({
    databasePath: ':memory:',
    initialTasks: initial,
  });
  t.after(() => database.close());
  const repository = new TaskRepository(database);
  initial[0].title = 'External';
  repository.findAll()[0].title = 'Mutated';
  repository.findById(10).done = true;
  assert.deepEqual(repository.findById(10), {
    id: 10,
    title: 'Original',
    done: false,
  });
  assert.equal(repository.create({ title: 'Next' }).id, 11);
  assert.equal(repository.update(99, { done: true }), undefined);
});

test('malformed JSON, oversized bodies, unknown routes and documentation', async (t) => {
  const app = createApp({ databasePath: ':memory:' });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) =>
        server.close(() => {
          app.locals.database.close();
          resolve();
        }),
      ),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [body, status] of [
    ['{"title":', 400],
    [JSON.stringify({ title: 'x'.repeat(17000) }), 413],
  ]) {
    const response = await fetch(`${base}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, 'string');
  }
  const unknown = await fetch(`${base}/unknown`);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: 'Route not found' });
  const docs = await fetch(`${base}/docs`);
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /swagger-ui/);
  const spec = await (await fetch(`${base}/openapi.json`)).json();
  assert.equal(spec.openapi, '3.0.3');
  for (const path of [
    '/',
    '/health',
    '/tasks',
    '/tasks/{id}',
    '/stats',
    '/reset',
  ])
    assert.ok(spec.paths[path]);
});
