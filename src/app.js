import express from 'express';
import { createRootRouter } from './routes/index.js';
import { seedTasks } from './data/seedTasks.js';
import { TaskRepository } from './repositories/TaskRepository.js';
import { TaskService } from './services/TaskService.js';
import { TaskController } from './controllers/TaskController.js';
import { createTaskRouter } from './routes/taskRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

export function createApp({ initialTasks = seedTasks } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use(createRootRouter());
  const repository = new TaskRepository(initialTasks);
  const service = new TaskService(repository);
  app.use('/tasks', createTaskRouter(new TaskController(service)));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
