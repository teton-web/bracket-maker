/** Guest pages that must stay reachable without a session. `/tournament` covers `/tournament/new` and `/tournament/[id]`. */
export const GUEST_ROUTES = [
  '/',
  '/history',
  '/players',
  '/stats',
  '/tournament',
  '/robots.txt',
  '/sitemap.xml',
] as const;

/** Signed-out auth screens. Neon also skips these by default; they are listed so a wider matcher cannot lock them. */
export const AUTH_PAGES = [
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
] as const;

export const publicRoutes: string[] = [...GUEST_ROUTES, ...AUTH_PAGES];
