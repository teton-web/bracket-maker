'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth/client';
import { sessionUser, type AuthUserView } from '@/lib/auth/session-user';
import { cn } from '@/lib/utils';

export function AccountMenu({ layout = 'bar' }: { layout?: 'bar' | 'menu' }) {
  const [user, setUser] = useState<AuthUserView | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authClient
      .getSession()
      .then((result) => {
        if (!cancelled) setUser(sessionUser(result.data));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.href = '/';
    }
  }

  if (loading) {
    return (
      <span className="px-2 text-xs uppercase tracking-wide text-[var(--text-muted)]" aria-live="polite">
        Loading account
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/auth/sign-in"
        className={cn(
          'heading rounded-lg px-4 py-2 text-sm uppercase tracking-wide text-[var(--text-secondary)] transition-colors hover:bg-white/5 hover:text-[var(--neon-cyan)]',
          layout === 'menu' && 'flex w-full'
        )}
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', layout === 'menu' && 'w-full flex-col items-start px-4 py-2')}>
      <Link
        href="/account"
        className="max-w-[180px] truncate text-sm text-[var(--text-secondary)] hover:text-[var(--neon-cyan)]"
        title={user.email}
      >
        {user.email}
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={signingOut}
        className="heading cursor-pointer rounded-lg px-3 py-2 text-xs uppercase tracking-wide text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--neon-cyan)] disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
