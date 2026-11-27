import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAuthConfigured } from '@/lib/auth/env';
import { getAuth } from '@/lib/auth/server';
import { sessionUser } from '@/lib/auth/session-user';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  if (!isAuthConfigured(process.env)) {
    redirect('/auth/sign-in');
  }
  const { data } = await getAuth().getSession();
  const user = sessionUser(data);
  if (!user) {
    redirect('/auth/sign-in');
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <div className="rounded-2xl border border-[var(--border-dim)] bg-[var(--bg-card)] p-6">
        <h1 className="heading text-2xl uppercase tracking-wide">Account</h1>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-[var(--text-muted)]">Email</dt>
            <dd className="mt-1 text-base text-[var(--text-primary)]">{user.email}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Verified</dt>
            <dd className="mt-1 text-base">{user.emailVerified ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
        {user.emailVerified ? null : (
          <Link
            href={`/auth/verify-email?email=${encodeURIComponent(user.email)}`}
            className="mt-6 inline-block text-sm text-[var(--neon-cyan)] hover:underline"
          >
            Verify email
          </Link>
        )}
      </div>
    </div>
  );
}
