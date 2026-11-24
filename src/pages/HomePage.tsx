import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import type { AdminSession, Post } from '../types/post';
import { SITE_CONFIG } from '../config/site';
import { formatDateDisplay } from '../lib/markdown';

interface HomePageProps {
  posts: Post[];
  session: AdminSession | null;
}

export function HomePage({ posts, session }: HomePageProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [glide, setGlide] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });

  const handleRowEnter = useCallback((el: HTMLLIElement) => {
    const list = listRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = el.getBoundingClientRect();
    setGlide({
      top: rowRect.top - listRect.top + 4,
      height: Math.max(0, rowRect.height - 8),
      visible: true,
    });
  }, []);

  const handleListLeave = useCallback(() => {
    setGlide((prev) => ({ ...prev, visible: false }));
  }, []);

  return (
    <div className="studio-stage">
      <div className="mx-auto w-full max-w-[1160px] px-6 pb-12 pt-14 sm:px-10 sm:pt-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left Sticky Editorial Intro Column */}
          <header className="hero-enter lg:sticky lg:top-28 lg:col-span-4 lg:self-start">
            <div className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <span
                className="h-1.5 w-1.5 rounded-full bg-accent"
                aria-hidden="true"
              />
              <span>{SITE_CONFIG.author}</span>
            </div>

            <h1 className="font-display mt-4 text-[clamp(1.65rem,2.6vw,2.15rem)] font-medium leading-[1.24] text-ink">
              I write here to think clearly{' '}
              <span className="text-ink-2">
                and keep a record of what I learn.
              </span>
            </h1>

            {posts.length > 0 && (
              <p className="mt-6 font-mono text-[12px] text-ink-3 tabular-nums">
                {String(posts.length).padStart(2, '0')}{' '}
                {posts.length === 1 ? 'post' : 'posts'} published
              </p>
            )}
          </header>

          {/* Right Blog List Column */}
          <section
            aria-label="Blog posts"
            className="hero-enter-delay lg:col-span-8"
          >
            {posts.length === 0 ? (
              <div className="border-t border-rule py-14">
                <p className="text-[15.5px] text-ink-2">No posts yet.</p>
                {session && (
                  <Link to="/admin/new" className="btn-primary mt-6 min-h-[40px] px-5">
                    <PenLine className="h-4 w-4" />
                    <span>Write first post</span>
                  </Link>
                )}
              </div>
            ) : (
              <div className="relative">
                {/* Gliding custom-bezier hover highlight */}
                <div
                  aria-hidden="true"
                  className="row-glide-pill hidden sm:block"
                  style={{
                    transform: `translate3d(0, ${glide.top}px, 0)`,
                    height: `${glide.height}px`,
                    opacity: glide.visible ? 1 : 0,
                  }}
                />

                <ul
                  ref={listRef}
                  onMouseLeave={handleListLeave}
                  className="post-list-group relative border-t border-rule"
                >
                  {posts.map((post) => (
                    <li
                      key={post.slug}
                      onMouseEnter={(e) => handleRowEnter(e.currentTarget)}
                      className="post-list-item border-b border-rule"
                    >
                      <Link
                        to={`/post/${post.slug}`}
                        className="group flex flex-col justify-between gap-1.5 py-5 sm:flex-row sm:items-baseline sm:gap-8 sm:py-5"
                      >
                        <div className="row-shift min-w-0 flex-1">
                          <h2 className="text-[16.5px] font-medium leading-[1.4] tracking-[-0.015em] text-ink sm:text-[17.5px]">
                            {post.title}
                            {post.source === 'local' && (
                              <span className="ml-2 inline-block rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 align-middle text-[11px] font-medium text-accent">
                                Draft
                              </span>
                            )}
                          </h2>
                          {post.summary && (
                            <p className="mt-1.5 line-clamp-2 text-[14.5px] leading-[1.58] text-ink-2">
                              {post.summary}
                            </p>
                          )}
                        </div>

                        <time
                          dateTime={post.date}
                          className="shrink-0 font-mono text-[12.5px] text-ink-2 tabular-nums transition-colors duration-200 group-hover:text-ink"
                        >
                          {formatDateDisplay(post.date)}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
