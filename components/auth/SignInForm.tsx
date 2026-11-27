'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authClient } from '@/lib/auth/client';
import { asAuthError, authErrorMessage, isUnverifiedEmail } from '@/lib/auth/messages';

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setError(null);
    setNeedsVerification(null);
    setPending(true);
    const report = (value: unknown) => {
      const parsed = asAuthError(value);
      if (isUnverifiedEmail(parsed)) setNeedsVerification(email);
      setError(authErrorMessage(parsed, 'Could not sign in.', { invalidOnUnauthorized: true }));
    };
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        report(signInError);
        return;
      }
      router.push('/account');
      router.refresh();
    } catch (caught) {
      report(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      subtitle="Guest brackets on this device stay where they are."
      footer={
        <Link href="/auth/sign-up" className="text-[var(--neon-cyan)] hover:underline">
          Need an account? Sign up
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
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Link href="/auth/forgot-password" className="text-sm text-[var(--neon-cyan)] hover:underline">
          Forgot password?
        </Link>
        <AuthError message={error} />
        {needsVerification ? (
          <Link
            href={`/auth/verify-email?email=${encodeURIComponent(needsVerification)}`}
            className="text-sm text-[var(--neon-cyan)] hover:underline"
          >
            Enter your verification code
          </Link>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  );
}
