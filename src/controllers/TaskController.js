export class TaskController {
  constructor(taskService) {
    this.taskService = taskService;
  }

  getAll = async (req, res) => {
    res.json(await this.taskService.getAllTasks(req.query));
  };

  getById = async (req, res) => {
    res.json(await this.taskService.getTaskById(req.params.id));
  };

  create = async (req, res) => {
    const task = await this.taskService.createTask(req.body);
    res.location(`/tasks/${task.id}`).status(201).json(task);
  };

  update = async (req, res) => {
    res.json(await this.taskService.updateTask(req.params.id, req.body));
  };

  delete = async (req, res) => {
    await this.taskService.deleteTask(req.params.id);
    res.status(204).end();
  };

  getStatistics = async (_req, res) => {
    res.json(await this.taskService.getStatistics());
  };

  reset = async (_req, res) => {
    res.json(await this.taskService.resetTasks());
  };
}
