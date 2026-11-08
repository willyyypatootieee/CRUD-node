import { createClient } from '@supabase/supabase-js';
import { AppError } from '../errors/AppError.js';

const authFailure = () => new AppError('Invalid or expired token', 401);

export class SupabaseAuthService {
  constructor({ url, key, client, fetchImpl = globalThis.fetch }) {
    if (!url || !key) throw new Error('Supabase URL and key are required');
    this.url = url.replace(/\/+$/, '');
    this.key = key;
    this.fetch = fetchImpl;
    this.client =
      client ??
      createClient(this.url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
  }

  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) {
      if (error.status === 429) {
        throw new AppError('Too many authentication attempts', 429);
      }
      throw new AppError(error.message || 'Unable to create account', 400);
    }
    if (!data.user) throw new Error('Supabase returned no user after sign up');
    return data.user;
  }

  async login(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session?.access_token) {
      if (error?.status === 429) {
        throw new AppError('Too many authentication attempts', 429);
      }
      throw new AppError('Invalid login credentials', 401);
    }
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: data.session.token_type,
      expires_in: data.session.expires_in,
      user: data.user,
    };
  }

  async verifyToken(token) {
    try {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data.user) throw authFailure();
      return data.user;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw authFailure();
    }
  }

  async checkConnection() {
    let response;
    try {
      response = await this.fetch(`${this.url}/auth/v1/health`, {
        headers: { apikey: this.key },
      });
    } catch {
      throw new Error(
        'Unable to reach Supabase; check SUPABASE_URL and network access',
      );
    }
    if (!response.ok) {
      throw new Error(
        `Supabase health check failed with HTTP ${response.status}`,
      );
    }
  }

  async logout(token) {
    let response;
    try {
      response = await this.fetch(`${this.url}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      throw new Error('Supabase logout request failed');
    }
    if (response.status === 401 || response.status === 403) throw authFailure();
    if (!response.ok) {
      throw new Error(`Supabase logout failed with HTTP ${response.status}`);
    }
  }
}
