import { AppError } from '../errors/AppError.js';

export function validateCredentials(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('Email and password are required', 400);
  }
  if (typeof data.email !== 'string' || !data.email.trim()) {
    throw new AppError('Email is required', 400);
  }
  if (typeof data.password !== 'string' || data.password.length === 0) {
    throw new AppError('Password is required', 400);
  }
  return { email: data.email.trim(), password: data.password };
}
