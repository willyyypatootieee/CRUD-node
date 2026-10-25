import { AppError } from '../errors/AppError.js';

export function validateId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new AppError('Task ID must be a positive safe integer');
  }
  return Number(value);
}
