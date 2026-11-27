import { createNeonAuth } from '@neon/auth/next/server';
import { readAuthEnv } from '@/lib/auth/env';

type NeonAuthInstance = ReturnType<typeof createNeonAuth>;

let cached: NeonAuthInstance | undefined;

/**
 * Creates the Neon Auth server on first use.
 * Importing this module does not read env, so `next build` can load the route graph
 * when NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are unset.
 */
export function getAuth(): NeonAuthInstance {
  if (!cached) {
    readAuthEnv(process.env);
    cached = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      },
    });
  }
  return cached;
}
