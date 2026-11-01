import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { openDatabase } from '../src/config/database.js';
import { TaskRepository } from '../src/repositories/TaskRepository.js';

function temporaryPath(t) {
  const directory = mkdtempSync(join(tmpdir(), 'taskflow-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'tasks.db');
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env } });
    let output = '';
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(output)),
    );
  });
}

test('disk storage preserves changes, empty tables and ID high-water mark across restarts', (t) => {
  const databasePath = temporaryPath(t);
  // A manually opened, otherwise empty file must still receive first-time seeds.
  writeFileSync(databasePath, '');
  let db = openDatabase({ databasePath });
  let repository = new TaskRepository(db);
  assert.equal(repository.findAll().length, 3);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  repository.create({ title: 'Persistent' });
  repository.update(4, { done: true });
  db.close();
  db = openDatabase({ databasePath });
  repository = new TaskRepository(db);
  assert.deepEqual(repository.findById(4), {
    id: 4,
    title: 'Persistent',
    done: true,
  });
  for (const task of repository.findAll()) repository.delete(task.id);
  db.close();
  db = openDatabase({ databasePath });
  try {
    repository = new TaskRepository(db);
    assert.deepEqual(repository.findAll(), []);
    assert.equal(repository.create({ title: 'After restart' }).id, 5);
    assert.throws(
      () => db.prepare('UPDATE tasks SET done = 2').run(),
      /CHECK constraint/,
    );
  } finally {
    db.close();
  }
});

test('search treats SQL syntax and LIKE wildcards as literal input', (t) => {
  const db = openDatabase({ databasePath: ':memory:' });
  t.after(() => db.close());
  const repository = new TaskRepository(db);
  const title = "100%_\\'; DROP TABLE tasks; --";
  repository.create({ title });
  assert.equal(repository.findAll({ search: title.toLowerCase() }).length, 1);
  assert.equal(repository.findAll({ search: '%' }).length, 1);
  assert.equal(repository.findAll().length, 4);
});

test('Node and Python initialize concurrently once and never reseed deleted tasks', async (t) => {
  const databasePath = temporaryPath(t);
  const env = { DATABASE_PATH: databasePath };
  await Promise.all([
    run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { openDatabase } from './src/config/database.js'; openDatabase().close();",
      ],
      env,
    ),
    run('python3', ['python/init_db.py'], env),
    run('python3', ['python/seed.py'], env),
  ]);
  const db = openDatabase({ databasePath });
  assert.equal(
    db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count,
    3,
  );
  db.prepare('DELETE FROM tasks').run();
  db.close();
  await run('python3', ['python/init_db.py'], env);
  const reopened = openDatabase({ databasePath });
  try {
    assert.equal(
      reopened.prepare('SELECT COUNT(*) AS count FROM tasks').get().count,
      0,
    );
  } finally {
    reopened.close();
  }
});
