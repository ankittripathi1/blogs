import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, PenLine } from 'lucide-react';
import type { AdminSession, Post } from '../types/post';
import { formatDateDisplay } from '../lib/markdown';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface PostPageProps {
  posts: Post[];
  session: AdminSession | null;
}

export function PostPage({ posts, session }: PostPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const [progress, setProgress] = useState(0);
  const [focusMode, setFocusMode] = useState(false);

  const postIndex = useMemo(() => posts.findIndex((p) => p.slug === slug), [posts, slug]);
  const post = postIndex >= 0 ? posts[postIndex] : undefined;
  const prevPost = postIndex >= 0 ? posts[postIndex + 1] : undefined;
  const nextPost = postIndex > 0 ? posts[postIndex - 1] : undefined;

  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [slug]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

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

  const issueNumber = String(postIndex + 1).padStart(2, '0');

  return (
    <div className={focusMode ? 'fixed inset-0 z-40 overflow-y-auto bg-paper' : ''}>
      {/* Razor-thin reading progress hairline */}
      <div className="fixed inset-x-0 top-0 z-50 h-[2px] bg-transparent">
        <div
          className="h-full bg-accent transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      <article className="mx-auto w-full max-w-[1160px] px-6 pb-12 pt-8 sm:px-10 sm:pt-12">
        {/* Top utility row */}
        <div className="flex items-center justify-between gap-4 border-b border-rule pb-5">
          {focusMode ? (
            <span className="font-mono text-[12px] text-ink-2 tabular-nums">
              Focus reading · No. {issueNumber}
            </span>
          ) : (
            <Link to="/" className="group editorial-link text-[13.5px] font-medium">
              <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
              <span>All entries</span>
            </Link>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFocusMode((v) => !v)}
              aria-pressed={focusMode}
              title={focusMode ? 'Exit focus mode (Esc)' : 'Distraction-free reading'}
              className="btn-secondary min-h-[34px] px-3 text-[13px]"
            >
              {focusMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{focusMode ? 'Exit focus' : 'Focus'}</span>
            </button>

            {session && !focusMode && (
              <Link
                to={`/admin/edit/${post.slug}`}
                className="btn-secondary min-h-[34px] px-3 text-[13px]"
              >
                <PenLine className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Link>
            )}
          </div>
        </div>

        {/* Centered Editorial Reading Column */}
        <div className="mx-auto max-w-[740px]">
          <header className="hero-enter pt-10 sm:pt-14">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-ink-2 tabular-nums">
              <span className="text-accent">No. {issueNumber}</span>
              <span aria-hidden="true" className="text-ink-3">/</span>
              <time dateTime={post.date}>{formatDateDisplay(post.date)}</time>
              <span aria-hidden="true" className="text-ink-3">/</span>
              <span>{post.readingTimeMinutes} min read</span>
              {post.source === 'local' && (
                <>
                  <span aria-hidden="true" className="text-ink-3">/</span>
                  <span className="text-accent">Local draft</span>
                </>
              )}
            </div>

            <h1 className="font-display mt-4 text-[clamp(1.85rem,3.8vw,2.55rem)] font-semibold leading-[1.18] text-ink">
              {post.title}
            </h1>

            {post.summary && (
              <p className="mt-4 text-[17px] leading-[1.65] text-ink-2 sm:text-[17.5px]">
                {post.summary}
              </p>
            )}

            {post.tags.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tags">
                {post.tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-rule bg-surface px-3 py-1 font-mono text-[12px] text-ink-2"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {post.coverImage && (
              <div className="mt-9 overflow-hidden rounded-[10px] border border-rule bg-surface">
                <img
                  src={post.coverImage}
                  alt=""
                  className="max-h-[460px] w-full object-cover"
                />
              </div>
            )}
          </header>

          {/* Article Body */}
          <div className="mt-10 border-t border-rule pt-10 sm:mt-12 sm:pt-12">
            <MarkdownRenderer markdown={post.body} />
          </div>

          {/* Bottom Entry Navigation */}
          {!focusMode && (prevPost || nextPost) && (
            <nav
              aria-label="Adjacent entries"
              className="mt-18 grid grid-cols-1 gap-4 border-t border-rule pt-9 sm:grid-cols-2"
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
                  <span className="mt-2 text-[16.5px] font-medium leading-[1.35] text-ink">
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
                  <span className="mt-2 text-[16.5px] font-medium leading-[1.35] text-ink">
                    {prevPost.title}
                  </span>
                </Link>
              )}
            </nav>
          )}
        </div>
      </article>
    </div>
  );
}
