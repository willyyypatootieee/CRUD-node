import { validateCredentials } from '../validators/authValidator.js';

export function toProfile(user) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    email_confirmed_at: user.email_confirmed_at,
    last_sign_in_at: user.last_sign_in_at,
  };
}

export class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  signup = async (req, res) => {
    const { email, password } = validateCredentials(req.body);
    const user = await this.authService.signUp(email, password);
    res.status(201).json({ user: toProfile(user) });
  };

  login = async (req, res) => {
    const { email, password } = validateCredentials(req.body);
    const session = await this.authService.login(email, password);
    res.json({ ...session, user: toProfile(session.user) });
  };

  logout = async (req, res) => {
    await this.authService.logout(req.accessToken);
    res.status(204).end();
  };

  profile = async (req, res) => {
    res.json({ user: toProfile(req.user) });
  };

  dashboard = async (req, res) => {
    res.json({
      message: 'Welcome to your protected dashboard',
      user: toProfile(req.user),
    });
  };
}
