export class TaskController {
  constructor(taskService) {
    this.taskService = taskService;
  }

  getAll = (_req, res) => {
    res.json(this.taskService.getAllTasks());
  };

  getById = (req, res) => {
    res.json(this.taskService.getTaskById(req.params.id));
  };

  create = (req, res) => {
    const task = this.taskService.createTask(req.body);
    res.location(`/tasks/${task.id}`).status(201).json(task);
  };

  update = (req, res) => {
    res.json(this.taskService.updateTask(req.params.id, req.body));
  };

  delete = (req, res) => {
    this.taskService.deleteTask(req.params.id);
    res.status(204).end();
  };
}
