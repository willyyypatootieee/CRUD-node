import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { createRootRouter } from './routes/index.js';
import { seedTasks } from './data/seedTasks.js';
import { TaskRepository } from './repositories/TaskRepository.js';
import { TaskService } from './services/TaskService.js';
import { TaskController } from './controllers/TaskController.js';
import { createTaskRouter } from './routes/taskRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { createUtilityRouter } from './routes/utilityRoutes.js';
import { openDatabase } from './config/database.js';

const specification = JSON.parse(
  readFileSync(new URL('./docs/openapi.json', import.meta.url), 'utf8'),
);

export function createApp({
  initialTasks = seedTasks,
  databasePath,
  repository,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(createRootRouter());
  app.get('/openapi.json', (_req, res) => res.json(specification));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(specification));
  if (!repository) {
    const database = openDatabase({ databasePath, initialTasks });
    app.locals.database = database;
    repository = new TaskRepository(database);
  }
  const service = new TaskService(repository, initialTasks);
  const controller = new TaskController(service);
  app.use('/tasks', createTaskRouter(controller));
  app.use(createUtilityRouter(controller));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
