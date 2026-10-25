import { AppError } from '../errors/AppError.js';
import {
  validateBody,
  validateChanges,
  validateId,
  validateTitle,
  validateQuery,
} from '../validators/taskValidator.js';

export class TaskService {
  constructor(taskRepository, initialTasks = []) {
    this.taskRepository = taskRepository;
    this.initialTasks = initialTasks.map((task) => ({ ...task }));
  }

  getAllTasks(query = {}) {
    const { done, search, limit, offset } = validateQuery(query);
    const tasks = this.taskRepository.findAll().filter((task) => {
      return (
        (done === undefined || task.done === done) &&
        (!search || task.title.toLowerCase().includes(search))
      );
    });
    return tasks.slice(
      offset,
      limit === undefined ? undefined : offset + limit,
    );
  }

  getStatistics() {
    const tasks = this.taskRepository.findAll();
    const completed = tasks.filter((task) => task.done).length;
    return {
      total: tasks.length,
      completed,
      pending: tasks.length - completed,
    };
  }

  resetTasks() {
    return this.taskRepository.reset(this.initialTasks);
  }

  createTask(data) {
    validateBody(data);
    return this.taskRepository.create({ title: validateTitle(data.title) });
  }

  updateTask(value, data) {
    const id = validateId(value);
    const changes = validateChanges(data);
    this.getTaskById(id);
    return this.taskRepository.update(id, changes);
  }

  deleteTask(value) {
    const task = this.getTaskById(value);
    this.taskRepository.delete(task.id);
  }

  getTaskById(value) {
    const id = validateId(value);
    const task = this.taskRepository.findById(id);
    if (!task) throw new AppError(`Task ${id} not found`, 404);
    return task;
  }
}
