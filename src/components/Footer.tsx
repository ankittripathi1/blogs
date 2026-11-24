import { useLocation } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { SITE_CONFIG } from '../config/site';
import type { AdminSession } from '../types/post';

interface FooterProps {
  session: AdminSession | null;
}

export function Footer(_props: FooterProps) {
  const location = useLocation();
  if (location.pathname.startsWith('/admin')) {
    return null;
  }

  const year = new Date().getFullYear();

  const socials = [
    { label: 'LinkedIn', href: SITE_CONFIG.socials.linkedin },
    { label: 'GitHub', href: SITE_CONFIG.socials.github },
    { label: 'Twitter', href: SITE_CONFIG.socials.twitter },
  ];

  return (
    <footer className="mt-14 border-t border-rule">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-3 px-6 py-7 text-[13.5px] text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <span className="tabular-nums">
          {SITE_CONFIG.author} · {year}
        </span>

        <div className="flex flex-wrap items-center gap-6">
          {socials.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="editorial-link"
            >
              <span>{label}</span>
              <ArrowUpRight className="arrow-nudge-ne h-3.5 w-3.5 text-ink-3" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
