import { Router } from 'express';

export function createAuthRouter(controller, authenticate) {
  const router = Router();
  router.post('/signup', controller.signup);
  router.post('/login', controller.login);
  router.post('/logout', authenticate, controller.logout);
  return router;
}

export function createPublicRouter() {
  const router = Router();
  router.get('/info', (_req, res) => {
    res.json({ message: 'Welcome stranger! This info is public.' });
  });
  return router;
}

export function createProtectedRouter(controller, authenticate) {
  const router = Router();
  router.use(authenticate);
  router.get('/profile', controller.profile);
  router.get('/dashboard', controller.dashboard);
  return router;
}
