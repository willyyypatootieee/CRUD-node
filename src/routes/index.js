import { Router } from 'express';

export function createRootRouter() {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      name: 'TaskFlow API',
      version: '1.0.0',
      docs: '/docs',
      health: '/health',
    });
  });
  router.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return router;
}
