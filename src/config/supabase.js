import { SupabaseAuthService } from '../services/SupabaseAuthService.js';

export function createSupabaseAuthService(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_KEY are required. Copy .env.example to .env and add your project credentials.',
    );
  }
  return new SupabaseAuthService({ url, key });
}
