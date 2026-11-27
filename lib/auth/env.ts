export const AUTH_ENV_ERROR =
  'Missing NEON_AUTH_BASE_URL or NEON_AUTH_COOKIE_SECRET. Add both to .env.local before using auth.';

export function readAuthEnv(env: Record<string, string | undefined>): {
  baseUrl: string;
  cookieSecret: string;
} {
  const baseUrl = env.NEON_AUTH_BASE_URL;
  const cookieSecret = env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !cookieSecret) {
    throw new Error(AUTH_ENV_ERROR);
  }
  return { baseUrl, cookieSecret };
}
