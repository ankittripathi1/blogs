import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { AdminSession, Post, RepoMediaItem } from '../types/post';
import { formatDateDisplay } from '../lib/markdown';
import { deleteLocalPost, getLocalPosts } from '../lib/posts';
import {
  deletePostFromGitHub,
  fetchRepoPostsFromGitHub,
  listRepoImages,
  uploadImageAsset,
} from '../lib/github';
import { AdminShell } from '../components/AdminShell';

interface AdminDashboardPageProps {
  session: AdminSession;
  bundledPosts: Post[];
  section: 'posts' | 'media';
  onLiveRepoPosts: (posts: Post[]) => void;
}

export function AdminDashboardPage({
  session,
  bundledPosts,
  section,
  onLiveRepoPosts,
}: AdminDashboardPageProps) {
  const [livePosts, setLivePosts] = useState<Post[] | null>(null);
  const [localDrafts, setLocalDrafts] = useState<Post[]>(() => getLocalPosts());
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [query, setQuery] = useState('');
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Media state
  const [mediaItems, setMediaItems] = useState<RepoMediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncFromGitHub = useCallback(async () => {
    if (session.mode !== 'github') return;
    setSyncing(true);
    setErrorMsg(null);
    try {
      const fetched = await fetchRepoPostsFromGitHub(session);
      setLivePosts(fetched);
      onLiveRepoPosts(fetched);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sync from GitHub.');
    } finally {
      setSyncing(false);
    }
  }, [session, onLiveRepoPosts]);

  const loadMedia = useCallback(async () => {
    if (session.mode !== 'github') return;
    setLoadingMedia(true);
    setErrorMsg(null);
    try {
      const items = await listRepoImages(session);
      setMediaItems(items);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load media.');
    } finally {
      setLoadingMedia(false);
    }
  }, [session]);

  useEffect(() => {
    const refreshLocals = () => setLocalDrafts(getLocalPosts());
    window.addEventListener('daylog:posts-updated', refreshLocals);
    return () => window.removeEventListener('daylog:posts-updated', refreshLocals);
  }, []);

  useEffect(() => {
    if (section === 'posts' && session.mode === 'github') {
      void syncFromGitHub();
    } else if (section === 'media' && session.mode === 'github') {
      void loadMedia();
    }
  }, [section, session.mode, syncFromGitHub, loadMedia]);

  const publishedPosts = livePosts ?? bundledPosts;

  const combinedPosts = useMemo(() => {
    const draftSlugs = new Set(localDrafts.map((d) => d.slug));
    const list: Post[] = [
      ...localDrafts,
      ...publishedPosts.filter((p) => !draftSlugs.has(p.slug)),
    ];
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [localDrafts, publishedPosts]);

  const counts = useMemo(
    () => ({
      all: combinedPosts.length,
      published: combinedPosts.filter((p) => p.source === 'repo').length,
      drafts: combinedPosts.filter((p) => p.source === 'local').length,
    }),
    [combinedPosts],
  );

  const visiblePosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combinedPosts.filter((p) => {
      const matchesTab =
        filter === 'all' ||
        (filter === 'published' && p.source === 'repo') ||
        (filter === 'drafts' && p.source === 'local');
      if (!matchesTab) return false;
      if (!q) return true;
      return `${p.title} ${p.summary} ${p.tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [combinedPosts, filter, query]);

  const handleDelete = async (post: Post) => {
    const isRepo = post.source === 'repo';
    const prompt = isRepo ? `Delete "${post.title}" from GitHub?` : `Delete local draft "${post.title}"?`;
    if (!window.confirm(prompt)) return;

    setDeletingKey(post.slug);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      if (isRepo) {
        await deletePostFromGitHub(post.repoPath || `content/posts/${post.filename}`, session);
        setStatusMsg('Entry deleted from repository.');
        await syncFromGitHub();
      } else {
        deleteLocalPost(post.slug);
        setStatusMsg('Local draft deleted.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (session.mode !== 'github') {
      setErrorMsg('Connect GitHub to upload images to your repository.');
      return;
    }

    setUploadingMedia(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      for (const file of Array.from(files)) {
        await uploadImageAsset(file, session);
      }
      setStatusMsg('Images uploaded.');
      await loadMedia();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedPath(key);
    window.setTimeout(() => setCopiedPath(null), 1600);
  };

  const iconButtonClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-50 cursor-pointer';

  const statusMessages = (
    <>
      {statusMsg && (
        <p role="status" className="mt-4 text-[13.5px] font-medium text-success">
          {statusMsg}
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="mt-4 text-[13.5px] font-medium text-danger">
          {errorMsg}
        </p>
      )}
    </>
  );

  return (
    <AdminShell session={session}>
      <div className="mx-auto w-full max-w-[1120px] px-6 py-10 sm:px-10 sm:py-14">
        {section === 'posts' ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[28px] font-semibold leading-[1.2] text-ink">Entries</h1>
                <p className="mt-2 text-[14.5px] text-ink-2">
                  Manage your published writing and browser drafts.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {session.mode === 'github' && (
                  <button
                    type="button"
                    onClick={() => void syncFromGitHub()}
                    disabled={syncing}
                    className="btn-secondary min-h-[40px] px-4 text-[13.5px]"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    <span>Sync</span>
                  </button>
                )}
                <Link to="/admin/new" className="btn-primary min-h-[40px] px-4 text-[13.5px]">
                  <Plus className="h-4 w-4" />
                  <span>New entry</span>
                </Link>
              </div>
            </div>

            <div className="mt-9 flex flex-col justify-between gap-3 border-b border-rule pb-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All', count: counts.all },
                    { id: 'published', label: 'Published', count: counts.published },
                    { id: 'drafts', label: 'Drafts', count: counts.drafts },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    aria-pressed={filter === tab.id}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors cursor-pointer ${
                      filter === tab.id
                        ? 'bg-ink text-paper'
                        : 'text-ink-2 hover:bg-surface hover:text-ink'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`font-mono text-[12px] tabular-nums ${
                        filter === tab.id ? 'text-paper/70' : 'text-ink-3'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-[260px]">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter entries..."
                  aria-label="Filter entries"
                  className="w-full rounded-full border border-rule bg-surface py-2 pl-9 pr-4 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-rule-strong focus:outline-none"
                />
              </div>
            </div>

            {statusMessages}

            <div className="mt-1 divide-y divide-rule border-b border-rule">
              {visiblePosts.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-[15px] text-ink-2">No entries match this filter.</p>
                  <Link to="/admin/new" className="btn-secondary mt-5">
                    Write a new entry
                  </Link>
                </div>
              ) : (
                visiblePosts.map((post) => (
                  <div
                    key={`${post.source}-${post.slug}`}
                    className="flex items-center justify-between gap-4 py-4.5"
                  >
                    <Link to={`/admin/edit/${post.slug}`} className="group min-w-0 flex-1">
                      <h2 className="truncate text-[17px] font-medium leading-[1.35] text-ink transition-colors group-hover:text-accent">
                        {post.title}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[12px] text-ink-2 tabular-nums">
                        <span>{formatDateDisplay(post.date)}</span>
                        <span aria-hidden="true" className="text-ink-3">/</span>
                        <span>{post.readingTimeMinutes} min</span>
                        <span aria-hidden="true" className="text-ink-3">/</span>
                        {post.source === 'local' ? (
                          <span className="text-accent">Local draft</span>
                        ) : (
                          <span>Published</span>
                        )}
                      </div>
                    </Link>

                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        to={`/admin/edit/${post.slug}`}
                        aria-label={`Edit ${post.title}`}
                        title="Edit"
                        className={iconButtonClass}
                      >
                        <PenLine className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/post/${post.slug}`}
                        aria-label={`View ${post.title}`}
                        title="View"
                        className={iconButtonClass}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      {(post.source === 'local' || session.mode === 'github') && (
                        <button
                          type="button"
                          disabled={deletingKey === post.slug}
                          onClick={() => void handleDelete(post)}
                          aria-label={`Delete ${post.title}`}
                          title="Delete"
                          className={`${iconButtonClass} hover:text-danger`}
                        >
                          {deletingKey === post.slug ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-[28px] font-semibold leading-[1.2] text-ink">Media</h1>
                <p className="mt-2 text-[14.5px] text-ink-2">
                  Images uploaded to your repository for posts and covers.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleMediaUpload(e.target.files)}
              />
              <button
                type="button"
                disabled={uploadingMedia}
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary min-h-[40px] px-4 text-[13.5px]"
              >
                {uploadingMedia ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>Upload images</span>
              </button>
            </div>

            {statusMessages}

            {session.mode !== 'github' ? (
              <div className="mt-9 rounded-[10px] border border-rule bg-surface p-12 text-center">
                <ImageIcon className="mx-auto h-7 w-7 text-ink-3" />
                <p className="mt-3 text-[15px] text-ink-2">
                  Connect GitHub to browse and upload repository images.
                </p>
              </div>
            ) : loadingMedia ? (
              <div className="mt-16 flex justify-center text-ink-2">
                <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading media" />
              </div>
            ) : mediaItems.length === 0 ? (
              <div className="mt-9 rounded-[10px] border border-dashed border-rule-strong bg-surface p-12 text-center">
                <ImageIcon className="mx-auto h-7 w-7 text-ink-3" />
                <p className="mt-3 text-[15px] text-ink-2">No images uploaded yet.</p>
              </div>
            ) : (
              <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {mediaItems.map((item) => (
                  <div
                    key={item.sha}
                    className="overflow-hidden rounded-[10px] border border-rule bg-card"
                  >
                    <div className="aspect-[16/10] bg-surface">
                      <img
                        src={item.downloadUrl}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="border-t border-rule p-3.5">
                      <p className="truncate font-mono text-[12px] text-ink-2">{item.name}</p>
                      <div className="mt-3 flex gap-2">
                        {[
                          {
                            key: `md-${item.sha}`,
                            label: 'Copy Markdown',
                            text: `![${item.name}](${item.publicPath})`,
                          },
                          {
                            key: `cov-${item.sha}`,
                            label: 'Copy cover',
                            text: `#COVER: ${item.publicPath}`,
                          },
                        ].map(({ key, label, text }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => void copyText(key, text)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-rule bg-surface py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-rule-strong cursor-pointer"
                          >
                            {copiedPath === key ? (
                              <Check className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-ink-2" />
                            )}
                            <span>{copiedPath === key ? 'Copied' : label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
