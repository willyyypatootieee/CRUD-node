import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.get('/', (req, res) => res.json({ message: 'TaskFlow API' }));
  return app;
}
