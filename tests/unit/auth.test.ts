import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { AUTH_ENV_ERROR, readAuthEnv } from '../../lib/auth/env';
import { asAuthError, authErrorMessage, INVALID_CREDENTIALS_MESSAGE, isSixDigitCode, isUnverifiedEmail } from '../../lib/auth/messages';
import { AUTH_PAGES, GUEST_ROUTES, publicRoutes } from '../../lib/auth/public-routes';
import { sessionUser } from '../../lib/auth/session-user';

const GUEST_PAGES = ['/', '/history', '/players', '/stats', '/tournament'];

describe('auth helpers', () => {
  test('public routes keep every guest page and the auth screens open', () => {
    for (const route of GUEST_PAGES) {
      expect(publicRoutes).toContain(route);
    }
    for (const route of GUEST_ROUTES) {
      expect(publicRoutes).toContain(route);
    }
    for (const route of AUTH_PAGES) {
      expect(publicRoutes).toContain(route);
    }
    expect(publicRoutes).not.toContain('/account');
    expect(publicRoutes).not.toContain('/auth');
  });

  test('proxy only matches the account page', () => {
    const proxy = readFileSync('proxy.ts', 'utf8');
    expect(proxy).toContain("matcher: ['/account', '/account/:path*']");
  });

  test('six-digit codes are digits only', () => {
    expect(isSixDigitCode('123456')).toBe(true);
    expect(isSixDigitCode('12345')).toBe(false);
    expect(isSixDigitCode('1234567')).toBe(false);
    expect(isSixDigitCode('12345a')).toBe(false);
  });

  test('wrong password maps to invalid credentials', () => {
    expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'nope' }, 'fallback')).toBe(
      INVALID_CREDENTIALS_MESSAGE
    );
    expect(authErrorMessage({ code: 'INVALID_PASSWORD' }, 'fallback')).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage({ message: 'Invalid credentials' }, 'fallback')).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage({ status: 401, message: 'Unauthorized' }, 'fallback')).toBe('Unauthorized');
    expect(
      authErrorMessage({ status: 401, message: 'Unauthorized' }, 'fallback', { invalidOnUnauthorized: true })
    ).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, 'fallback')).toBe(
      'Email not verified'
    );
    expect(
      authErrorMessage(
        { code: 'email_not_confirmed', status: 401, message: 'Email verification required' },
        'fallback',
        { invalidOnUnauthorized: true }
      )
    ).toBe('Email verification required');
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid email or password' }, 'fallback')).toBe(
      INVALID_CREDENTIALS_MESSAGE
    );
    const thrown = asAuthError({
      message: 'Invalid email or password',
      code: 'invalid_credentials',
      status: 401,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401, message: 'Invalid email or password' },
    });
    expect(isUnverifiedEmail(thrown)).toBe(false);
    expect(authErrorMessage(thrown, 'fallback', { invalidOnUnauthorized: true })).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage(null, 'fallback')).toBe('fallback');
  });

  test('missing auth env names the variables', () => {
    expect(() => readAuthEnv({})).toThrow(AUTH_ENV_ERROR);
    expect(readAuthEnv({ NEON_AUTH_BASE_URL: 'https://auth.example', NEON_AUTH_COOKIE_SECRET: 'x' })).toEqual({
      baseUrl: 'https://auth.example',
      cookieSecret: 'x',
    });
  });

  test('session user accepts the shapes Neon returns', () => {
    expect(sessionUser(null)).toBeNull();
    expect(sessionUser({ user: { email: 'a@example.com', emailVerified: true } })).toEqual({
      email: 'a@example.com',
      emailVerified: true,
    });
    expect(sessionUser({ session: { user: { email: 'b@example.com', emailVerified: false } } })).toEqual({
      email: 'b@example.com',
      emailVerified: false,
    });
    expect(sessionUser({ email: 'c@example.com' })).toEqual({
      email: 'c@example.com',
      emailVerified: false,
    });
  });

  test('.env.example lists names only', () => {
    const text = readFileSync('.env.example', 'utf8');
    expect(text).not.toContain('=');
    for (const name of ['DATABASE_URL', 'NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET', 'RESEND_API_KEY']) {
      expect(text).toContain(name);
    }
  });
});
