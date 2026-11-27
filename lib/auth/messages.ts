export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const INVALID_CREDENTIAL_CODES = new Set([
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_PASSWORD',
  'INVALID_CREDENTIALS',
  'invalid_credentials',
]);

const UNVERIFIED_EMAIL_CODES = new Set(['EMAIL_NOT_VERIFIED', 'email_not_confirmed']);

export type AuthErrorLike = {
  message?: string;
  code?: string;
  status?: number;
  codes?: string[];
};

export function isSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Normalizes a Better Auth result error and a thrown Neon AuthError. */
export function asAuthError(value: unknown): AuthErrorLike | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : null;
  const codes = [readString(record.code), readString(nested?.code)].filter((code): code is string => Boolean(code));
  const message = readString(record.message) ?? readString(nested?.message);
  const status = typeof record.status === 'number' ? record.status : typeof nested?.status === 'number' ? nested.status : undefined;
  if (!message && codes.length === 0 && status === undefined) return null;
  return { message, code: codes[0], codes, status };
}

export function isUnverifiedEmail(error: AuthErrorLike | null | undefined): boolean {
  return Boolean(error?.codes?.some((code) => UNVERIFIED_EMAIL_CODES.has(code)));
}

export function authErrorMessage(
  error: AuthErrorLike | null | undefined,
  fallback: string,
  options?: { invalidOnUnauthorized?: boolean }
): string {
  if (!error) return fallback;
  const codes = error.codes ?? (error.code ? [error.code] : []);
  if (codes.some((code) => UNVERIFIED_EMAIL_CODES.has(code))) {
    return error.message?.trim() || 'Email verification required.';
  }
  const unauthorized = options?.invalidOnUnauthorized && error.status === 401;
  if (codes.some((code) => INVALID_CREDENTIAL_CODES.has(code)) || unauthorized) {
    return INVALID_CREDENTIALS_MESSAGE;
  }
  const message = error.message?.trim() ?? '';
  if (/invalid (email or )?password/i.test(message) || /invalid credentials/i.test(message)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }
  return message || fallback;
}
