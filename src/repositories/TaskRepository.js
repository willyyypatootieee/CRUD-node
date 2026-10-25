export class TaskRepository {
  #tasks;
  #nextId;

  constructor(initialTasks = []) {
    this.#tasks = new Map(initialTasks.map((task) => [task.id, { ...task }]));
    this.#nextId = Math.max(0, ...this.#tasks.keys()) + 1;
  }

  findAll() {
    return [...this.#tasks.values()].map((task) => ({ ...task }));
  }

  findById(id) {
    const task = this.#tasks.get(id);
    return task ? { ...task } : undefined;
  }

  create({ title }) {
    const task = { id: this.#nextId++, title, done: false };
    this.#tasks.set(task.id, task);
    return { ...task };
  }

  update(id, changes) {
    const task = this.#tasks.get(id);
    if (!task) return undefined;
    const updated = { ...task, ...changes, id };
    this.#tasks.set(id, updated);
    return { ...updated };
  }

  delete(id) {
    return this.#tasks.delete(id);
  }
}
