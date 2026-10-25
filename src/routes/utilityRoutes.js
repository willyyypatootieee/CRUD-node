import { Router } from 'express';

export function createUtilityRouter(controller) {
  const router = Router();
  router.get('/stats', controller.getStatistics);
  router.post('/reset', controller.reset);
  return router;
}
