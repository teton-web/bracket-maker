'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authClient } from '@/lib/auth/client';
import { asAuthError, authErrorMessage, isSixDigitCode } from '@/lib/auth/messages';

export function ResetPasswordForm({ initialEmail = '' }: { initialEmail?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const otp = String(form.get('otp') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setError(null);
    setNotice(null);
    if (!isSixDigitCode(otp)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setPending(true);
    try {
      const { error: resetError } = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (resetError) {
        setError(authErrorMessage(asAuthError(resetError), 'Could not reset the password.'));
        return;
      }
      router.push('/auth/sign-in');
    } catch (caught) {
      setError(authErrorMessage(asAuthError(caught), 'Could not reset the password.'));
    } finally {
      setPending(false);
    }
  }

  async function resend(form: HTMLFormElement) {
    const email = String(new FormData(form).get('email') ?? '').trim();
    if (!email) {
      setError('Enter the email address that should receive the code.');
      return;
    }
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const { error: sendError } = await authClient.forgetPassword.emailOtp({ email });
      if (sendError) {
        setError(authErrorMessage(asAuthError(sendError), 'Could not send a new code.'));
        return;
      }
      setNotice('A new 6-digit code is on its way.');
    } catch (caught) {
      setError(authErrorMessage(asAuthError(caught), 'Could not send a new code.'));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Enter the 6-digit code and a new password."
      footer={
        <Link href="/auth/forgot-password" className="text-[var(--neon-cyan)] hover:underline">
          Request another code
        </Link>
      }
    >
      <form method="post" action="/auth/reset-password" onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={initialEmail} />
        </div>
        <div>
          <label htmlFor="otp" className="mb-2 block text-sm font-medium">
            6-digit code
          </label>
          <Input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            New password
          </label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <AuthError message={error} />
        {notice ? <p className="text-sm text-[var(--neon-green)]">{notice}</p> : null}
        <Button type="submit" disabled={pending || resending}>
          {pending ? 'Updating password…' : 'Reset password'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || resending}
          onClick={(event) => {
            const form = event.currentTarget.closest('form');
            if (form) void resend(form);
          }}
        >
          {resending ? 'Sending code…' : 'Resend code'}
        </Button>
      </form>
    </AuthCard>
  );
}
