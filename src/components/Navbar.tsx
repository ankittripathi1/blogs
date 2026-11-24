import { Link, useLocation } from 'react-router-dom';
import { PenLine, Search } from 'lucide-react';
import { SITE_CONFIG } from '../config/site';
import type { AdminSession } from '../types/post';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  session: AdminSession | null;
  onOpenSearch: () => void;
}

export function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="4.5"
        y="3.5"
        width="15"
        height="17"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1="8"
        y1="8.5"
        x2="16"
        y2="8.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="12.5"
        x2="16"
        y2="12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="8"
        y1="16.5"
        x2="12.5"
        y2="16.5"
        stroke="var(--color-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Navbar({ session, onOpenSearch }: NavbarProps) {
  const location = useLocation();

  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1160px] items-center justify-between gap-4 px-6 sm:px-10">
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center gap-2 text-ink"
        >
          <BrandMark className="h-[19px] w-[19px] text-ink" />
          <span className="text-[16.5px] font-semibold tracking-[-0.02em]">
            {SITE_CONFIG.name}
          </span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search blog posts"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-rule bg-surface px-3 text-[13px] text-ink-2 transition-colors duration-200 hover:border-rule-strong hover:text-ink cursor-pointer"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded-[4px] border border-rule bg-paper px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2 sm:inline-block">
              ⌘K
            </kbd>
          </button>

          <ThemeToggle />

          {session && (
            <Link
              to="/admin"
              className="editorial-link hidden min-h-[36px] px-1.5 text-[13.5px] font-medium sm:inline-flex"
            >
              Entries
            </Link>
          )}

          <Link
            to="/admin/new"
            className="btn-primary min-h-[36px] px-4 text-[13px]"
          >
            <PenLine className="h-3.5 w-3.5 shrink-0" />
            <span>Write</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
