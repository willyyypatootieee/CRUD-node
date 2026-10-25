import { Router } from 'express';

export function createTaskRouter(controller) {
  const router = Router();
  router.get('/', controller.getAll);
  router.get('/:id', controller.getById);
  return router;
}
