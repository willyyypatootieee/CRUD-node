import { createApp } from './app.js';
import { openPostgres } from './config/postgres.js';
import { PostgresTaskRepository } from './repositories/PostgresTaskRepository.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}

const database = await openPostgres();
const app = createApp({ repository: new PostgresTaskRepository(database) });
const server = app.listen(port, () => {
  console.log(
    `TaskFlow API listening on http://localhost:${server.address().port}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () =>
    server.close(() => {
      database.end().catch((error) => {
        console.error('Postgres shutdown failed:', error.message);
        process.exitCode = 1;
      });
    }),
  );
}
server.on('error', async (error) => {
  console.error('HTTP server failed:', error.message);
  await database.end();
  process.exitCode = 1;
});
