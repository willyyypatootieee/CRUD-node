import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import pg from 'pg';
import { PostgresTaskRepository } from '../src/repositories/PostgresTaskRepository.js';
import { createApp } from '../src/app.js';

test('Postgres query builder binds values and whitelists update columns', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
  };
  const repository = new PostgresTaskRepository(pool);
  const search = "100%_\\'; DROP TABLE tasks; --";
  await repository.findAll({ done: false, search, limit: 2, offset: 1 });
  assert.deepEqual(calls[0].values, [
    false,
    `%${search.replace(/[\\%_]/g, '\\$&')}%`,
    2,
    1,
  ]);
  assert.ok(!calls[0].sql.includes(search));
  await repository.update(3, {
    title: 'New',
    done: true,
    id: 99,
    injected: 'bad',
  });
  assert.equal(
    calls[1].sql,
    'UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING id, title, done',
  );
  assert.deepEqual(calls[1].values, ['New', true, 3]);
  assert.equal(await repository.delete(99), false);
});

test('reset rolls back failed writes and always releases its connection', async () => {
  const calls = [];
  let released = false;
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('INSERT')) throw new Error('Insert failed');
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const repository = new PostgresTaskRepository({
    connect: async () => client,
  });
  await assert.rejects(
    repository.reset([{ id: 1, title: 'Test', done: false }]),
    /Insert failed/,
  );
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(released);
});

test(
  'real Postgres repository, HTTP contracts and reconnect persistence',
  {
    skip:
      !process.env.TEST_DATABASE_URL &&
      'Set TEST_DATABASE_URL to run real Postgres integration tests',
  },
  async (t) => {
    // Use an isolated schema; never erase the normal application table.
    const admin = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const schema = `taskflow_test_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const makePool = () =>
      new pg.Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c search_path=${schema}`,
      });
    let pool = makePool();
    t.after(async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    await pool.query(
      readFileSync(new URL('../sql/001-init.sql', import.meta.url), 'utf8'),
    );
    let repository = new PostgresTaskRepository(pool);
    assert.equal((await repository.findAll()).length, 3);
    const created = await repository.create({ title: "Persist 100%_'; --" });
    assert.equal(created.id, 4);
    assert.equal((await repository.findAll({ search: '100%_' })).length, 1);
    await repository.update(created.id, { done: true });
    await pool.end();
    pool = makePool();
    repository = new PostgresTaskRepository(pool);
    assert.equal((await repository.findById(created.id)).done, true);
    const server = createApp({ repository }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${url}/tasks/4`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).done, true);
    const deleted = await fetch(`${url}/tasks/4`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    assert.equal(await deleted.text(), '');
    assert.equal((await fetch(`${url}/tasks/4`)).status, 404);
    const { seedTasks } = await import('../src/data/seedTasks.js');
    await repository.reset(seedTasks);
    assert.equal((await repository.create({ title: 'After reset' })).id, 5);
    assert.deepEqual(await repository.getStatistics(), {
      total: 4,
      completed: 1,
      pending: 3,
    });
  },
);
