import { NextResponse, type NextRequest } from 'next/server';
import { isAuthConfigured } from '@/lib/auth/env';
import { publicRoutes } from '@/lib/auth/public-routes';
import { getAuth } from '@/lib/auth/server';

/**
 * Only /account is matched. Guest pages never enter this proxy.
 * publicRoutes still lists every existing route so a future wider matcher stays guest-safe.
 * Missing auth env redirects to sign-in instead of constructing the Neon client.
 */
export default function proxy(request: NextRequest) {
  if (!isAuthConfigured(process.env)) {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }
  return getAuth().middleware({
    loginUrl: '/auth/sign-in',
    publicRoutes,
  })(request);
}

export const config = {
  matcher: ['/account', '/account/:path*'],
};
