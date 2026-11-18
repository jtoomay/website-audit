import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { UsageInfo } from '../../../shared/report';

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-accent text-white">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="M15 15l5 5" />
        </svg>
      </span>
      StackScout
    </span>
  );
}

/** Usage pill; refreshes whenever the route changes (e.g. after a scan). */
function Usage() {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const location = useLocation();
  useEffect(() => {
    api.me().then((r) => setUsage(r.usage)).catch(() => setUsage(null));
  }, [location.key]);
  if (!usage) return null;
  return (
    <span className="hidden rounded-full border border-line bg-paper px-3 py-1 text-xs text-muted sm:inline">
      <span className="font-medium capitalize text-ink">{usage.plan}</span> · {usage.used}/{usage.limit} scans this month
    </span>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-ink'}`;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <NavLink to="/app">
            <Logo />
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/app" end className={link}>
              Scan
            </NavLink>
            <NavLink to="/app/history" className={link}>
              History
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Usage />
            <span className="hidden max-w-48 truncate text-xs text-muted md:inline">{session?.user.email}</span>
            <button className="btn-ghost !px-3 !py-1.5" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
