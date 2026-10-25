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

export function validateId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new AppError('Task ID must be a positive safe integer');
  }
  return Number(value);
}
