import { AppError } from '../errors/AppError.js';

export function createAuthenticate(authService) {
  return async function authenticate(req, _res, next) {
    const header = req.get('authorization');
    const match =
      typeof header === 'string' && /^Bearer\s+(\S+)$/i.exec(header.trim());
    if (!match) return next(new AppError('Access token required', 401));
    try {
      req.user = await authService.verifyToken(match[1]);
      req.accessToken = match[1];
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
