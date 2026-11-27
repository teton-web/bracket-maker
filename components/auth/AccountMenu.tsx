'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { asAuthError, authErrorMessage } from '@/lib/auth/messages';
import { sessionUser } from '@/lib/auth/session-user';
import { cn } from '@/lib/utils';

export function AccountMenu({ layout = 'bar' }: { layout?: 'bar' | 'menu' }) {
  const pathname = usePathname();
  const { data, isPending, refetch } = authClient.useSession();
  const user = sessionUser(data);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const skipFirstPath = useRef(true);

  useEffect(() => {
    if (skipFirstPath.current) {
      skipFirstPath.current = false;
      return;
    }
    void refetch();
  }, [pathname, refetch]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const result = await authClient.signOut();
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setSignOutError(authErrorMessage(asAuthError(result.error), 'Could not sign out.'));
        setSigningOut(false);
        return;
      }
      window.location.href = '/';
    } catch (caught) {
      setSignOutError(authErrorMessage(asAuthError(caught), 'Could not sign out.'));
      setSigningOut(false);
    }
  }

  if (isPending && !user) {
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
      {signOutError ? (
        <p role="alert" className="text-xs text-red-400">
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
