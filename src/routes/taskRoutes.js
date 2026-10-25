import { Router } from 'express';

export function createTaskRouter(controller) {
  const router = Router();
  router.get('/', controller.getAll);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.delete);
  return router;
}
