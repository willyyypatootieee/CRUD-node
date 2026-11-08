import { Router } from 'express';

export function createRootRouter() {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      name: 'TaskFlow API',
      version: '1.1.0',
      docs: '/docs',
      health: '/health',
      auth: '/auth',
      public: '/public/info',
      protected: '/protected/profile',
    });
  });
  router.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return router;
}
