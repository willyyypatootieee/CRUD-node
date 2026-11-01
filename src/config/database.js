import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedTasks } from '../data/seedTasks.js';

const defaultPath = fileURLToPath(
  new URL('../../data/tasks.db', import.meta.url),
);

export function openDatabase({
  databasePath = process.env.DATABASE_PATH || defaultPath,
  initialTasks = seedTasks,
} = {}) {
  if (databasePath !== ':memory:')
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new Database(databasePath, { timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.transaction(() => {
      const existing = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tasks'",
        )
        .get();
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
        );
        CREATE TABLE IF NOT EXISTS task_metadata (
          key TEXT PRIMARY KEY,
          value INTEGER NOT NULL
        );
      `);
      if (
        !db
          .prepare("SELECT value FROM task_metadata WHERE key = 'next_id'")
          .get()
      ) {
        if (!existing) {
          const insert = db.prepare(
            'INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)',
          );
          for (const task of initialTasks)
            insert.run(task.id, task.title, Number(task.done));
        }
        db.prepare(
          "INSERT INTO task_metadata (key, value) VALUES ('next_id', (SELECT COALESCE(MAX(id), 0) + 1 FROM tasks))",
        ).run();
      }
    }).immediate();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
