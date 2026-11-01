import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT must be an integer between 0 and 65535');
}

const app = createApp();
const server = app.listen(port, () => {
  console.log(
    `TaskFlow API listening on http://localhost:${server.address().port}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => app.locals.database.close()));
}
server.on('error', (error) => {
  app.locals.database.close();
  throw error;
});
