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
}
