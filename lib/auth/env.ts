export const AUTH_ENV_ERROR =
  'Missing NEON_AUTH_BASE_URL or NEON_AUTH_COOKIE_SECRET. Add both to .env.local before using auth.';

export function isAuthConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.NEON_AUTH_BASE_URL && env.NEON_AUTH_COOKIE_SECRET);
}

export function readAuthEnv(env: Record<string, string | undefined>): {
  baseUrl: string;
  cookieSecret: string;
} {
  if (!isAuthConfigured(env)) {
    throw new Error(AUTH_ENV_ERROR);
  }
  return {
    baseUrl: env.NEON_AUTH_BASE_URL!,
    cookieSecret: env.NEON_AUTH_COOKIE_SECRET!,
  };
}
