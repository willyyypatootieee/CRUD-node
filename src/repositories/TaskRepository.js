const toTask = (row) => row && { ...row, done: Boolean(row.done) };

export class TaskRepository {
  constructor(database) {
    this.database = database;
  }

  findAll({ done, search, limit, offset = 0 } = {}) {
    const clauses = [];
    const parameters = [];
    if (done !== undefined) {
      clauses.push('done = ?');
      parameters.push(Number(done));
    }
    if (search) {
      clauses.push("LOWER(title) LIKE ? ESCAPE '\\'");
      parameters.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.database
      .prepare(
        `SELECT id, title, done FROM tasks ${where} ORDER BY id LIMIT ? OFFSET ?`,
      )
      .all(...parameters, limit ?? -1, offset)
      .map(toTask);
  }

  findById(id) {
    return toTask(
      this.database
        .prepare('SELECT id, title, done FROM tasks WHERE id = ?')
        .get(id),
    );
  }

  create({ title }) {
    return this.database
      .transaction(() => {
        // Persist the high-water mark even when the highest task is deleted or reset.
        const { id } = this.database
          .prepare(
            "SELECT MAX(value, (SELECT COALESCE(MAX(id), 0) + 1 FROM tasks)) AS id FROM task_metadata WHERE key = 'next_id'",
          )
          .get();
        this.database
          .prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, 0)')
          .run(id, title);
        this.database
          .prepare("UPDATE task_metadata SET value = ? WHERE key = 'next_id'")
          .run(id + 1);
        return this.findById(id);
      })
      .immediate();
  }

  update(id, changes) {
    const fields = [];
    const values = [];
    if (changes.title !== undefined) {
      fields.push('title = ?');
      values.push(changes.title);
    }
    if (changes.done !== undefined) {
      fields.push('done = ?');
      values.push(Number(changes.done));
    }
    if (!fields.length) return this.findById(id);
    return toTask(
      this.database
        .prepare(
          `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? RETURNING id, title, done`,
        )
        .get(...values, id),
    );
  }

  delete(id) {
    return (
      this.database.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes >
      0
    );
  }

  getStatistics() {
    return this.database
      .prepare(
        'SELECT COUNT(*) AS total, COUNT(CASE WHEN done = 1 THEN 1 END) AS completed, COUNT(CASE WHEN done = 0 THEN 1 END) AS pending FROM tasks',
      )
      .get();
  }

  reset(initialTasks) {
    return this.database
      .transaction(() => {
        this.database.prepare('DELETE FROM tasks').run();
        const insert = this.database.prepare(
          'INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)',
        );
        for (const task of initialTasks)
          insert.run(task.id, task.title, Number(task.done));
        this.database
          .prepare(
            "UPDATE task_metadata SET value = MAX(value, (SELECT COALESCE(MAX(id), 0) + 1 FROM tasks)) WHERE key = 'next_id'",
          )
          .run();
        return this.findAll();
      })
      .immediate();
  }
}
