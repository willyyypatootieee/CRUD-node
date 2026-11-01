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
    return this.taskRepository.findAll(validateQuery(query));
  }

  getStatistics() {
    return this.taskRepository.getStatistics();
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
