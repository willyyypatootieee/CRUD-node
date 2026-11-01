export class PostgresTaskRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findAll({ done, search, limit, offset = 0 } = {}) {
    const clauses = [];
    const values = [];
    if (done !== undefined) {
      values.push(done);
      clauses.push(`done = $${values.length}`);
    }
    if (search) {
      values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      clauses.push(`title ILIKE $${values.length} ESCAPE E'\\\\'`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    values.push(limit ?? null, offset);
    const result = await this.pool.query(
      `SELECT id, title, done FROM tasks ${where} ORDER BY id LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return result.rows;
  }

  async findById(id) {
    const { rows } = await this.pool.query(
      'SELECT id, title, done FROM tasks WHERE id = $1',
      [id],
    );
    return rows[0];
  }

  async create({ title }) {
    const { rows } = await this.pool.query(
      'INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, done',
      [title],
    );
    return rows[0];
  }

  async update(id, changes) {
    const fields = [];
    const values = [];
    for (const field of ['title', 'done']) {
      if (changes[field] === undefined) continue;
      values.push(changes[field]);
      fields.push(`${field} = $${values.length}`);
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, title, done`,
      values,
    );
    return rows[0];
  }

  async delete(id) {
    const { rowCount } = await this.pool.query(
      'DELETE FROM tasks WHERE id = $1',
      [id],
    );
    return rowCount > 0;
  }

  async getStatistics() {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::integer AS total, COUNT(*) FILTER (WHERE done)::integer AS completed, COUNT(*) FILTER (WHERE NOT done)::integer AS pending FROM tasks',
    );
    return rows[0];
  }

  async reset(initialTasks) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize writes during reset. DELETE deliberately preserves the identity sequence.
      await client.query('LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE');
      await client.query('DELETE FROM tasks');
      for (const task of initialTasks) {
        await client.query(
          'INSERT INTO tasks (id, title, done) VALUES ($1, $2, $3)',
          [task.id, task.title, task.done],
        );
      }
      await client.query(
        "SELECT setval(pg_get_serial_sequence('tasks', 'id'), GREATEST((SELECT last_value FROM tasks_id_seq), (SELECT COALESCE(MAX(id), 1) FROM tasks)), true)",
      );
      const { rows } = await client.query(
        'SELECT id, title, done FROM tasks ORDER BY id',
      );
      await client.query('COMMIT');
      return rows;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Reset failed and rollback failed',
          { cause: rollbackError },
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
