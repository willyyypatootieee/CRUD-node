import pg from 'pg';

export async function openPostgres(
  connectionString = process.env.DATABASE_URL,
) {
  if (!connectionString)
    throw new Error('DATABASE_URL is required; copy .env.example to .env');
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  pool.on('error', (error) =>
    console.error('Idle Postgres connection error:', error.message),
  );
  try {
    await pool.query('SELECT id, title, done FROM tasks LIMIT 0');
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
