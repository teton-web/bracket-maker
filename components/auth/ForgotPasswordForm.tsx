'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authClient } from '@/lib/auth/client';
import { asAuthError, authErrorMessage } from '@/lib/auth/messages';

export function ForgotPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    setError(null);
    setPending(true);
    try {
      const { error: sendError } = await authClient.forgetPassword.emailOtp({ email });
      if (sendError) {
        setError(authErrorMessage(asAuthError(sendError), 'Could not send a reset code.'));
        return;
      }
      router.push(`/auth/reset-password?email=${encodeURIComponent(email)}`);
    } catch (caught) {
      setError(authErrorMessage(asAuthError(caught), 'Could not send a reset code.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="We will email a 6-digit code if an account uses this address."
      footer={
        <Link href="/auth/sign-in" className="text-[var(--neon-cyan)] hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <AuthError message={error} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending code…' : 'Send reset code'}
        </Button>
      </form>
    </AuthCard>
  );
}
