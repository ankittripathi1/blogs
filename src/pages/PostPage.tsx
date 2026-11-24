import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CornerUpLeft,
  Eye,
  EyeOff,
  PenLine,
} from 'lucide-react';
import type { AdminSession, Post } from '../types/post';
import { extractHeadings, formatDateDisplay } from '../lib/markdown';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface PostPageProps {
  posts: Post[];
  session: AdminSession | null;
}

export function PostPage({ posts, session }: PostPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const [progress, setProgress] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const postIndex = useMemo(() => posts.findIndex((p) => p.slug === slug), [posts, slug]);
  const post = postIndex >= 0 ? posts[postIndex] : undefined;
  const prevPost = postIndex >= 0 ? posts[postIndex + 1] : undefined;
  const nextPost = postIndex > 0 ? posts[postIndex - 1] : undefined;

  const headings = useMemo(
    () => (post ? extractHeadings(post.body) : []),
    [post],
  );

  useEffect(() => {
    setActiveHeadingId(headings[0]?.id ?? '');
    setMobileTocOpen(false);
  }, [slug, headings]);

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(0);
      } else {
        setProgress(Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)));
      }

      if (headings.length === 0) return;

      // Near the bottom of the page, highlight the last heading
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40) {
        setActiveHeadingId(headings[headings.length - 1].id);
        return;
      }

      const threshold = 140;
      let currentId = headings[0].id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= threshold) {
          currentId = h.id;
        } else {
          break;
        }
      }
      setActiveHeadingId(currentId);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [slug, headings]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveHeadingId(id);
    setMobileTocOpen(false);
  }, []);

  if (!post) {
    return (
      <div className="mx-auto flex min-h-[65vh] w-full max-w-[1160px] flex-col items-start justify-center px-6 sm:px-10">
        <p className="font-mono text-[12px] text-ink-2">404 / Missing entry</p>
        <h1 className="font-display mt-3 text-[clamp(1.75rem,3.6vw,2.35rem)] font-semibold leading-[1.18] text-ink">
          Entry not found
        </h1>
        <p className="mt-3 text-[16px] text-ink-2">
          This post may have been renamed, deleted, or is saved only on another device.
        </p>
        <Link to="/" className="btn-secondary mt-7">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to blog</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={focusMode ? 'fixed inset-0 z-40 overflow-y-auto bg-paper' : ''}>
      {/* Razor-thin reading progress hairline */}
      <div className="fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent">
        <div
          className="h-full bg-accent transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      <article className="mx-auto w-full max-w-[1160px] px-6 pb-16 pt-10 sm:px-10 sm:pt-14">
        <div
          className={
            focusMode
              ? 'mx-auto max-w-[680px]'
              : 'grid grid-cols-1 gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16'
          }
        >
          {/* Left Sticky Index Sidebar (Benji-style) */}
          {!focusMode && (
            <aside className="hidden lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-4">
                <Link
                  to="/"
                  className="toc-link inline-flex items-center gap-2 text-[13.5px] text-ink-3 hover:text-ink"
                >
                  <CornerUpLeft className="h-3.5 w-3.5" />
                  <span>Index</span>
                </Link>

                {headings.length > 0 && (
                  <nav aria-label="On this page" className="mt-12">
                    <ul className="space-y-2">
                      {headings.map((heading) => {
                        const isActive = activeHeadingId === heading.id;
                        return (
                          <li key={heading.id}>
                            <button
                              type="button"
                              onClick={() => scrollToHeading(heading.id)}
                              aria-current={isActive ? 'location' : undefined}
                              className={`toc-link block w-full text-left text-[13.5px] leading-[1.45] cursor-pointer ${
                                heading.level === 3 ? 'pl-3' : ''
                              } ${
                                isActive
                                  ? 'font-medium text-ink'
                                  : 'text-ink-3 hover:text-ink-2'
                              }`}
                            >
                              {heading.text}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </nav>
                )}
              </div>
            </aside>
          )}

          {/* Main Reading Column */}
          <div className="min-w-0 max-w-[680px]">
            {/* Top compact utility bar */}
            <div className="mb-8 flex items-center justify-between gap-4">
              {focusMode ? (
                <span className="font-mono text-[12px] text-ink-2">
                  Focus reading
                </span>
              ) : (
                <Link
                  to="/"
                  className="toc-link inline-flex items-center gap-2 text-[13.5px] text-ink-2 hover:text-ink lg:hidden"
                >
                  <CornerUpLeft className="h-3.5 w-3.5" />
                  <span>Index</span>
                </Link>
              )}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFocusMode((v) => !v)}
                  aria-pressed={focusMode}
                  title={focusMode ? 'Exit focus mode (Esc)' : 'Distraction-free reading'}
                  className="btn-secondary min-h-[32px] px-3 text-[12.5px]"
                >
                  {focusMode ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  <span>{focusMode ? 'Exit focus' : 'Focus'}</span>
                </button>

                {session && !focusMode && (
                  <Link
                    to={`/admin/edit/${post.slug}`}
                    className="btn-secondary min-h-[32px] px-3 text-[12.5px]"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Article Header */}
            <header className="hero-enter">
              <h1 className="font-display text-[clamp(1.75rem,3.6vw,2.35rem)] font-semibold leading-[1.2] text-ink">
                {post.title}
              </h1>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[13px] text-ink-2 tabular-nums">
                <time dateTime={post.date}>{formatDateDisplay(post.date)}</time>
                <span aria-hidden="true" className="text-ink-3">·</span>
                <span>{post.readingTimeMinutes} min read</span>
                {post.source === 'local' && (
                  <>
                    <span aria-hidden="true" className="text-ink-3">·</span>
                    <span className="text-accent">Local draft</span>
                  </>
                )}
              </div>

              {post.summary && (
                <p className="mt-5 text-[16.5px] leading-[1.68] text-ink-2">
                  {post.summary}
                </p>
              )}

              {post.tags.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2" aria-label="Tags">
                  {post.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-rule bg-surface px-3 py-0.5 font-mono text-[12px] text-ink-2"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              )}

              {/* Mobile collapsible section index */}
              {!focusMode && headings.length > 0 && (
                <div className="mt-6 rounded-[10px] border border-rule bg-surface/60 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileTocOpen((v) => !v)}
                    aria-expanded={mobileTocOpen}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-[13.5px] font-medium text-ink cursor-pointer"
                  >
                    <span>On this page</span>
                    <ChevronDown
                      className={`h-4 w-4 text-ink-2 transition-transform duration-200 ${
                        mobileTocOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {mobileTocOpen && (
                    <ul className="space-y-1.5 border-t border-rule px-4 py-3">
                      {headings.map((heading) => {
                        const isActive = activeHeadingId === heading.id;
                        return (
                          <li key={heading.id}>
                            <button
                              type="button"
                              onClick={() => scrollToHeading(heading.id)}
                              className={`toc-link block w-full py-0.5 text-left text-[13.5px] cursor-pointer ${
                                heading.level === 3 ? 'pl-3' : ''
                              } ${
                                isActive
                                  ? 'font-medium text-ink'
                                  : 'text-ink-2 hover:text-ink'
                              }`}
                            >
                              {heading.text}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {post.coverImage && (
                <div className="mt-8 overflow-hidden rounded-[10px] border border-rule bg-surface">
                  <img
                    src={
                      post.coverImage.startsWith('./')
                        ? `${import.meta.env.BASE_URL}${post.coverImage.slice(2)}`
                        : post.coverImage
                    }
                    alt=""
                    className="max-h-[460px] w-full object-cover"
                  />
                </div>
              )}
            </header>

            {/* Article Body */}
            <div className="mt-9 border-t border-rule pt-9 sm:mt-10 sm:pt-10">
              <MarkdownRenderer markdown={post.body} />
            </div>

            {/* Bottom Entry Navigation */}
            {!focusMode && (prevPost || nextPost) && (
              <nav
                aria-label="Adjacent entries"
                className="mt-16 grid grid-cols-1 gap-4 border-t border-rule pt-9 sm:grid-cols-2"
              >
                {nextPost ? (
                  <Link
                    to={`/post/${nextPost.slug}`}
                    className="group flex flex-col items-start rounded-[10px] border border-rule bg-surface/40 p-5 transition-colors hover:border-rule-strong hover:bg-surface"
                  >
                    <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-2">
                      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
                      <span>Newer</span>
                    </span>
                    <span className="mt-2 text-[16px] font-medium leading-[1.35] text-ink">
                      {nextPost.title}
                    </span>
                  </Link>
                ) : (
                  <div className="hidden sm:block" />
                )}

                {prevPost && (
                  <Link
                    to={`/post/${prevPost.slug}`}
                    className="group flex flex-col items-end rounded-[10px] border border-rule bg-surface/40 p-5 text-right transition-colors hover:border-rule-strong hover:bg-surface"
                  >
                    <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-2">
                      <span>Older</span>
                      <ArrowRight className="arrow-nudge h-3.5 w-3.5" />
                    </span>
                    <span className="mt-2 text-[16px] font-medium leading-[1.35] text-ink">
                      {prevPost.title}
                    </span>
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
