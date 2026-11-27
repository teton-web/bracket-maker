export type AuthUserView = {
  email: string;
  emailVerified: boolean;
};

function userFrom(value: unknown): AuthUserView | null {
  if (!value || typeof value !== 'object') return null;
  const user = value as Record<string, unknown>;
  if (typeof user.email !== 'string' || user.email.length === 0) return null;
  return {
    email: user.email,
    emailVerified: user.emailVerified === true,
  };
}

/** Accepts a Better Auth session, a `{ user, session }` payload, or a user. */
export function sessionUser(data: unknown): AuthUserView | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const direct = userFrom(record.user);
  if (direct) return direct;
  if (record.session && typeof record.session === 'object') {
    const nested = userFrom((record.session as Record<string, unknown>).user);
    if (nested) return nested;
  }
  return userFrom(record);
}
