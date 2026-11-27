import type { NextRequest } from 'next/server';
import { publicRoutes } from '@/lib/auth/public-routes';
import { getAuth } from '@/lib/auth/server';

/**
 * Only /account is matched. Guest pages never enter this proxy.
 * publicRoutes still lists every existing route so a future wider matcher stays guest-safe.
 */
export default function proxy(request: NextRequest) {
  return getAuth().middleware({
    loginUrl: '/auth/sign-in',
    publicRoutes,
  })(request);
}

export const config = {
  matcher: ['/account', '/account/:path*'],
};
