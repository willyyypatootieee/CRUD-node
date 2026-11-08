import { createApp } from './app.js';
import { openDatabase } from './config/database.js';
import { openPostgres } from './config/postgres.js';
import { createSupabaseAuthService } from './config/supabase.js';
import { PostgresTaskRepository } from './repositories/PostgresTaskRepository.js';
import { TaskRepository } from './repositories/TaskRepository.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}

const authService = createSupabaseAuthService();
await authService.checkConnection();
let storage;
let repository;
let closeStorage;

if (process.env.DATABASE_URL) {
  storage = await openPostgres();
  repository = new PostgresTaskRepository(storage);
  closeStorage = () => storage.end();
  console.log('Task storage: Postgres');
} else {
  storage = openDatabase();
  repository = new TaskRepository(storage);
  closeStorage = async () => storage.close();
  console.log(
    'Task storage: SQLite fallback (set DATABASE_URL to use Postgres)',
  );
}

const app = createApp({ repository, authService });
const server = app.listen(port, () => {
  console.log(
    `TaskFlow API listening on http://localhost:${server.address().port}`,
  );
  console.log('Server running and connected to Supabase');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () =>
    server.close(() => {
      closeStorage().catch((error) => {
        console.error('Storage shutdown failed:', error.message);
        process.exitCode = 1;
      });
    }),
  );
}
server.on('error', async (error) => {
  console.error('HTTP server failed:', error.message);
  await closeStorage();
  process.exitCode = 1;
});
