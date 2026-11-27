import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm';

export const metadata: Metadata = { title: 'Verify email' };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">Loading…</p>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
