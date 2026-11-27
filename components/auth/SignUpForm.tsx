'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthCard, AuthError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authClient } from '@/lib/auth/client';
import { asAuthError, authErrorMessage } from '@/lib/auth/messages';

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setError(null);
    setPending(true);
    try {
      const { data, error: signUpError } = await authClient.signUp.email({ name, email, password });
      if (signUpError) {
        setError(authErrorMessage(asAuthError(signUpError), 'Could not create the account.'));
        return;
      }
      if (data?.user && !data.user.emailVerified) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      router.push('/account');
      router.refresh();
    } catch (caught) {
      setError(authErrorMessage(asAuthError(caught), 'Could not create the account.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Create account"
      subtitle="Tournaments you already have on this device stay in this browser."
      footer={
        <Link href="/auth/sign-in" className="text-[var(--neon-cyan)] hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium">
            Name
          </label>
          <Input id="name" name="name" type="text" autoComplete="name" required />
        </div>
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
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <AuthError message={error} />
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}
