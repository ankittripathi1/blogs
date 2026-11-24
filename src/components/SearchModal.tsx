import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search, X } from 'lucide-react';
import type { Post } from '../types/post';
import { formatDateDisplay } from '../lib/markdown';

interface SearchModalProps {
  open: boolean;
  posts: Post[];
  onClose: () => void;
}

export function SearchModal({ open, posts, onClose }: SearchModalProps) {
  const [rendered, setRendered] = useState(open);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setRendered(true);
      setQuery('');
      setActiveIndex(0);
      const raf = window.requestAnimationFrame(() => {
        setVisible(true);
        inputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setRendered(false), 260);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts.slice(0, 8);
    return posts.filter((post) => {
      const haystack = [
        post.title,
        post.summary,
        post.snippet ?? '',
        post.tags.join(' '),
        post.body,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [posts, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        navigate(`/post/${results[activeIndex].slug}`);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, results, activeIndex, navigate, onClose]);

  if (!rendered) return null;

  return (
    <div
      className={`modal-backdrop fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 backdrop-blur-xs sm:pt-24 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search blog posts"
        className={`modal-panel w-full max-w-[600px] overflow-hidden rounded-[14px] border border-rule-strong bg-card ${
          visible
            ? 'translate-y-0 scale-100 opacity-100'
            : '-translate-y-2 scale-[0.98] opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
          <Search className="h-[17px] w-[17px] shrink-0 text-ink-2" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, titles, or keywords..."
            aria-label="Search blog posts"
            className="w-full bg-transparent text-[15.5px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface hover:text-ink cursor-pointer"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto divide-y divide-rule">
          {results.length === 0 ? (
            <p className="px-5 py-12 text-center text-[15px] text-ink-2">
              No matching posts found.
            </p>
          ) : (
            results.map((post, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={post.slug}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    navigate(`/post/${post.slug}`);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors duration-200 cursor-pointer ${
                    isSelected ? 'bg-surface' : 'bg-card'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-mono text-[12px] text-ink-2">
                      <span className="tabular-nums">{formatDateDisplay(post.date)}</span>
                      <span>·</span>
                      <span className="tabular-nums">{post.readingTimeMinutes} min</span>
                      {post.source === 'local' && (
                        <>
                          <span>·</span>
                          <span className="text-accent">Draft</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[15.5px] font-medium text-ink">
                      {post.title}
                    </p>
                    {post.summary && (
                      <p className="mt-0.5 truncate text-[13.5px] text-ink-2">
                        {post.summary}
                      </p>
                    )}
                  </div>
                  <ArrowUpRight
                    className={`h-4 w-4 shrink-0 transition-opacity duration-200 ${
                      isSelected ? 'text-accent opacity-100' : 'text-ink-3 opacity-0'
                    }`}
                  />
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-rule bg-paper px-5 py-2.5 font-mono text-[11.5px] text-ink-2">
          <span>↑ ↓ navigate · ↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
