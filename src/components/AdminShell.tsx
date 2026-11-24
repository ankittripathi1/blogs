import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, FileText, Image as ImageIcon, LogOut, PenLine } from 'lucide-react';
import { clearAdminSession } from '../lib/github';
import { SITE_CONFIG } from '../config/site';
import type { AdminSession } from '../types/post';
import { BrandMark } from './Navbar';
import { ThemeToggle } from './ThemeToggle';

interface AdminShellProps {
  session: AdminSession;
  children: ReactNode;
}

export function AdminShell({ session, children }: AdminShellProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleSignOut = () => {
    clearAdminSession();
    navigate('/admin');
  };

  const navItems = [
    { to: '/admin', label: 'Entries', icon: FileText, active: pathname === '/admin' },
    {
      to: '/admin/new',
      label: 'Write',
      icon: PenLine,
      active: pathname === '/admin/new' || pathname.startsWith('/admin/edit/'),
    },
    { to: '/admin/media', label: 'Media', icon: ImageIcon, active: pathname === '/admin/media' },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-6">
            <Link to="/" className="inline-flex min-h-[44px] items-center gap-2 text-ink">
              <BrandMark className="h-[19px] w-[19px] text-ink" />
              <span className="text-[16.5px] font-semibold tracking-[-0.02em]">
                {SITE_CONFIG.name}
              </span>
            </Link>

            <nav aria-label="Studio navigation" className="flex items-center gap-1">
              {navItems.map(({ to, label, icon: Icon, active }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors ${
                    active
                      ? 'bg-surface text-ink border border-rule-strong'
                      : 'text-ink-2 hover:bg-surface/70 hover:text-ink'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-4">
            <span
              className="hidden items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1 font-mono text-[12px] text-ink-2 md:inline-flex"
              title={
                session.mode === 'github'
                  ? `Connected to ${session.owner}/${session.repo}`
                  : 'Notes are saved locally in this browser'
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  session.mode === 'github' ? 'bg-success' : 'bg-accent'
                }`}
              />
              {session.mode === 'github' ? `${session.owner}/${session.repo}` : 'Local mode'}
            </span>

            <ThemeToggle />

            <Link
              to="/"
              className="editorial-link hidden min-h-[38px] px-1 text-[13.5px] font-medium sm:inline-flex"
            >
              <span>View blog</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>

            {session.user?.avatarUrl && (
              <img
                src={session.user.avatarUrl}
                alt={session.user.login}
                title={session.user.login}
                className="hidden h-7 w-7 rounded-full border border-rule-strong sm:block"
              />
            )}

            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-[13.5px] text-ink-2 transition-colors hover:bg-surface hover:text-ink cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
