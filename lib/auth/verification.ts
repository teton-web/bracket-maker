/**
 * `emailOtp.verifyEmail` returns `{ status, token, user }`.
 * `token` is the session token when auto sign-in is on, and null otherwise.
 * A `session` object is accepted for clients that wrap the same result.
 */
export function signedInAfterEmailVerification(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  if (typeof record.token === 'string' && record.token.length > 0) return true;
  return record.session != null && typeof record.session === 'object';
}
