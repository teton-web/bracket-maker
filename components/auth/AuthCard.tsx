import type { ReactNode } from 'react';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <div className="rounded-2xl border border-[var(--border-dim)] bg-[var(--bg-card)] p-6 shadow-[0_0_40px_rgba(0,245,255,0.06)]">
        <h1 className="heading text-2xl uppercase tracking-wide">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p> : null}
        <div className="mt-6 flex flex-col gap-4">{children}</div>
      </div>
      {footer ? <div className="mt-4 text-center text-sm text-[var(--text-secondary)]">{footer}</div> : null}
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-400">
      {message}
    </p>
  );
}
