import { AppError } from '../errors/AppError.js';

export function validateBody(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('Body must be a JSON object');
  }
}

export function validateTitle(title) {
  if (title === undefined) throw new AppError('Title is required');
  if (typeof title !== 'string' || !title.trim()) {
    throw new AppError('Title must be a non-empty string');
  }
  return title.trim();
}

export function validateChanges(data) {
  validateBody(data);
  const changes = {};
  if (Object.hasOwn(data, 'title')) changes.title = validateTitle(data.title);
  if (Object.hasOwn(data, 'done')) {
    if (typeof data.done !== 'boolean')
      throw new AppError('Done must be a Boolean');
    changes.done = data.done;
  }
  if (!Object.keys(changes).length) {
    throw new AppError('At least one of title or done is required');
  }
  return changes;
}

export function validateId(value) {
  if (
    !/^[1-9]\d*$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new AppError('Task ID must be a positive safe integer');
  }
  return Number(value);
}

export function validateQuery(query) {
  const allowed = ['done', 'search', 'limit', 'offset'];
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key))
      throw new AppError(`Unknown query parameter: ${key}`);
    if (typeof value !== 'string')
      throw new AppError(`${key} must be supplied once`);
  }
  const options = { offset: 0 };
  if (query.done !== undefined) {
    if (!['true', 'false'].includes(query.done))
      throw new AppError('Done filter must be true or false');
    options.done = query.done === 'true';
  }
  if (query.search !== undefined)
    options.search = query.search.trim().toLowerCase();
  for (const key of ['limit', 'offset']) {
    if (query[key] === undefined) continue;
    if (
      !/^(0|[1-9]\d*)$/.test(query[key]) ||
      !Number.isSafeInteger(Number(query[key]))
    ) {
      throw new AppError(`${key} must be a non-negative safe integer`);
    }
    options[key] = Number(query[key]);
  }
  if (options.limit === 0)
    throw new AppError('limit must be greater than zero');
  return options;
}
