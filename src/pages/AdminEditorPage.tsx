import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Code2,
  Columns2,
  Download,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  PenLine,
  Quote,
  Save,
  SlidersHorizontal,
  UploadCloud,
  X,
} from 'lucide-react';
import type { AdminSession, Post, PostInput } from '../types/post';
import {
  estimateReadingTime,
  formatDateDisplay,
  getTodayIsoDate,
  slugify,
} from '../lib/markdown';
import { deleteLocalPost, downloadPostMarkdown, saveLocalPost } from '../lib/posts';
import {
  buildGitHubNewFileUrl,
  publishPostToGitHub,
  uploadImageAsset,
  type PublishResult,
} from '../lib/github';
import { AdminShell } from '../components/AdminShell';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { NotionMarkdownEditor, type MarkdownEditorHandle } from '../components/NotionMarkdownEditor';

interface AdminEditorPageProps {
  session: AdminSession;
  posts: Post[];
}

type ViewMode = 'write' | 'split' | 'preview';

interface DraftFields {
  title: string;
  summary: string;
  date: string;
  tagsText: string;
  snippet: string;
  coverImage: string;
  featured: boolean;
  body: string;
}

function fieldsFromPost(post?: Post): DraftFields {
  if (!post) {
    return {
      title: '',
      summary: '',
      date: getTodayIsoDate(),
      tagsText: '',
      snippet: '',
      coverImage: '',
      featured: false,
      body: '',
    };
  }
  return {
    title: post.title,
    summary: post.summary,
    date: post.date || getTodayIsoDate(),
    tagsText: post.tags.join(', '),
    snippet: post.snippet ?? '',
    coverImage: post.coverImage ?? '',
    featured: Boolean(post.featured),
    body: post.body,
  };
}

function fieldsToPostInput(fields: DraftFields, existingSlug?: string): PostInput {
  const tags = fields.tagsText
    .split(',')
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
  return {
    slug: existingSlug ?? (fields.title.trim() ? slugify(fields.title) : 'untitled-note'),
    title: fields.title.trim(),
    date: fields.date.trim() || getTodayIsoDate(),
    project: 'General',
    tags,
    summary: fields.summary.trim(),
    snippet: fields.snippet.trim() || undefined,
    coverImage: fields.coverImage.trim() || undefined,
    featured: fields.featured,
    body: fields.body,
  };
}

const VIEW_MODE_KEY = 'daylog:editor-view';
const VIM_KEY = 'daylog:editor-vim';
const draftKey = (slug?: string) => `daylog:autosave:${slug ?? 'new'}`;

// Browser storage helpers. They fail quietly (private mode, full storage).
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Ignore: autosave is a safety net, not required.
  }
}

export function AdminEditorPage({ session, posts }: AdminEditorPageProps) {
  const { slug: editSlug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const existingPost = useMemo(
    () => (editSlug ? posts.find((p) => p.slug === editSlug) : undefined),
    [editSlug, posts],
  );

  const [fields, setFields] = useState<DraftFields>(() => fieldsFromPost(existingPost));
  // Write is the default now that the editor shows formatting; the last choice is remembered.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = readStored(VIEW_MODE_KEY);
    return stored === 'split' || stored === 'preview' ? stored : 'write';
  });
  const [showDetails, setShowDetails] = useState(false);
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const summaryInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);
  const viewTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [viewPill, setViewPill] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const updatePill = () => {
      const el = viewTabRefs.current[viewMode];
      if (!el) return;
      setViewPill({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
    };
    updatePill();
    window.addEventListener('resize', updatePill);
    return () => window.removeEventListener('resize', updatePill);
  }, [viewMode]);

  useEffect(() => writeStored(VIEW_MODE_KEY, viewMode), [viewMode]);

  const [vimEnabled, setVimEnabled] = useState(() => readStored(VIM_KEY) === '1');
  useEffect(() => writeStored(VIM_KEY, vimEnabled ? '1' : '0'), [vimEnabled]);

  // Load the post, then any unsaved changes autosaved for it.
  useEffect(() => {
    if (!existingPost && editSlug) return;
    const base = fieldsFromPost(existingPost);
    let restored: DraftFields | null = null;
    try {
      const raw = readStored(draftKey(editSlug));
      restored = raw ? { ...base, ...(JSON.parse(raw) as Partial<DraftFields>) } : null;
    } catch {
      restored = null;
    }
    if (restored && JSON.stringify(restored) !== JSON.stringify(base)) {
      setFields(restored);
      setNotice('Restored your unsaved changes.');
    } else {
      setFields(base);
    }
  }, [existingPost?.slug, editSlug]);

  // Autosave edits to this browser a second after typing stops, so a refresh or a closed
  // tab never loses work. The copy is dropped once it matches the saved post again.
  useEffect(() => {
    // The post is still loading: don't overwrite its autosave with empty fields.
    if (editSlug && !existingPost) return;
    const timer = window.setTimeout(() => {
      const base = fieldsFromPost(existingPost);
      const same = JSON.stringify(fields) === JSON.stringify(base);
      writeStored(draftKey(editSlug), same ? null : JSON.stringify(fields));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [fields, existingPost, editSlug]);

  const postInput: PostInput = useMemo(
    () => fieldsToPostInput(fields, existingPost?.slug),
    [fields, existingPost?.slug],
  );

  const wordCount = useMemo(() => {
    const clean = postInput.body.trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
  }, [postInput.body]);

  const readingMinutes = useMemo(
    () => estimateReadingTime(postInput.body),
    [postInput.body],
  );

  const resolvedCoverPreview = postInput.coverImage
    ? imagePreviewMap[postInput.coverImage] ?? postInput.coverImage
    : undefined;

  // Inserts at the editor caret, or appends when the editor is not mounted (preview mode).
  const insertAtCursor = (snippet: string) => {
    if (editorRef.current) {
      editorRef.current.insert(snippet);
    } else {
      setFields((prev) => ({ ...prev, body: `${prev.body}\n${snippet}` }));
    }
  };

  const handleUploadImage = async (file: File, mode: 'inline' | 'cover') => {
    setUploadingImage(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await uploadImageAsset(file, session);
      setImagePreviewMap((prev) => ({
        ...prev,
        [uploaded.publicPath]: uploaded.previewUrl,
      }));

      if (mode === 'cover') {
        setFields((prev) => ({ ...prev, coverImage: uploaded.publicPath }));
        setNotice('Cover image attached.');
      } else {
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        insertAtCursor(`\n![${alt}](${uploaded.publicPath})\n`);
        setNotice('Image inserted.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveDraft = useCallback(() => {
    if (!postInput.title || postInput.title === 'untitled-note') {
      setError('Add a title before saving.');
      return;
    }
    setError(null);
    const saved = saveLocalPost(postInput);
    writeStored(draftKey(editSlug), null);
    setNotice('Draft saved locally.');
    if (!editSlug) {
      navigate(`/admin/edit/${saved.slug}`, { replace: true });
    }
  }, [postInput, editSlug, navigate]);

  const handlePublish = async () => {
    if (!postInput.title || postInput.title === 'untitled-note') {
      setError('Add a title before publishing.');
      return;
    }

    if (session.mode !== 'github') {
      const saved = saveLocalPost(postInput);
      writeStored(draftKey(editSlug), null);
      setError(null);
      setNotice('Saved to your blog on this device.');
      if (!editSlug) {
        navigate(`/admin/edit/${saved.slug}`, { replace: true });
      }
      return;
    }

    setPublishing(true);
    setError(null);
    setNotice(null);
    setPublishResult(null);

    try {
      const result = await publishPostToGitHub(
        postInput,
        session,
        existingPost?.source === 'repo' ? existingPost.repoPath : undefined,
      );
      deleteLocalPost(postInput.slug || slugify(postInput.title));
      writeStored(draftKey(editSlug), null);
      setPublishResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSaveDraft]);

  const githubWebUrl = useMemo(
    () => buildGitHubNewFileUrl(postInput, session),
    [postInput, session],
  );

  const toolButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-50 cursor-pointer';

  return (
    <AdminShell session={session}>
      <div className="flex min-h-[calc(100vh-64px)] flex-col">
        {/* Studio Toolbar */}
        <div className="sticky top-16 z-20 border-b border-rule bg-paper/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-5 py-2.5 sm:px-8">
            <div className="flex flex-wrap items-center gap-1">
              <Link
                to="/admin"
                aria-label="Back to entries"
                title="Back to entries"
                className={toolButtonClass}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>

              <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />

              <input
                ref={inlineImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadImage(file, 'inline');
                  e.target.value = '';
                }}
              />
              <input
                ref={coverImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadImage(file, 'cover');
                  e.target.value = '';
                }}
              />

              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => inlineImageInputRef.current?.click()}
                aria-label="Insert image"
                title="Insert image"
                className={toolButtonClass}
              >
                {uploadingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => coverImageInputRef.current?.click()}
                aria-label="Attach cover image"
                title="Attach cover image"
                className={toolButtonClass}
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertAtCursor('\n```ts\n\n```\n')}
                aria-label="Insert code block"
                title="Insert code block"
                className={toolButtonClass}
              >
                <Code2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => insertAtCursor('\n> ')}
                aria-label="Insert quote"
                title="Insert quote"
                className={toolButtonClass}
              >
                <Quote className="h-4 w-4" />
              </button>

              <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />

              <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium transition-colors cursor-pointer ${
                    showDetails
                      ? 'bg-surface text-ink border border-rule-strong'
                      : 'text-ink-2 hover:bg-surface hover:text-ink'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Details</span>
                </button>

              {session.mode !== 'github' && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadPostMarkdown(postInput)}
                    aria-label="Download Markdown file"
                    title="Download Markdown file"
                    className={toolButtonClass}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <a
                    href={githubWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open file on GitHub"
                    title="Open file on GitHub"
                    className={toolButtonClass}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={vimEnabled}
                onClick={() => setVimEnabled((v) => !v)}
                title={vimEnabled ? 'Vim keys on (hjkl, V + d, ysiw", :w)' : 'Turn on Vim keys'}
                className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full px-2.5 font-mono text-[13.5px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
              >
                <span>Vim</span>
                <span className="vim-switch" data-on={vimEnabled} aria-hidden="true">
                  <span />
                </span>
              </button>

              <span className="hidden font-mono text-[13.5px] text-ink-2 tabular-nums md:inline">
                {wordCount} {wordCount === 1 ? 'word' : 'words'} · {readingMinutes} min
              </span>

              <div className="relative inline-flex rounded-full border border-rule bg-surface p-0.5">
                <span
                  aria-hidden="true"
                  className="segmented-pill"
                  style={{
                    transform: `translate3d(${viewPill.left}px, 0, 0)`,
                    width: `${viewPill.width}px`,
                    opacity: viewPill.ready ? 1 : 0,
                  }}
                />
                {(
                  [
                    { id: 'write', label: 'Write', icon: PenLine },
                    { id: 'split', label: 'Split', icon: Columns2 },
                    { id: 'preview', label: 'Preview', icon: Eye },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    ref={(node) => {
                      viewTabRefs.current[id] = node;
                    }}
                    type="button"
                    onClick={() => setViewMode(id)}
                    aria-label={label}
                    aria-pressed={viewMode === id}
                    title={label}
                    className={`relative z-10 inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px] font-medium transition-colors duration-200 cursor-pointer ${
                      viewMode === id ? 'text-paper' : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">{label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSaveDraft}
                title="Save draft (⌘S)"
                className="btn-secondary min-h-[38px] px-4 text-[14px]"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span>
              </button>

              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublish()}
                className="btn-primary min-h-[38px] px-4.5 text-[14px]"
              >
                {publishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                <span>{session.mode === 'github' ? 'Publish' : 'Post locally'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Non-jumping floating status toast */}
        <div
          aria-live="polite"
          className={`toast-surface fixed bottom-5 right-5 z-40 max-w-[420px] rounded-[12px] border border-rule-strong bg-card px-4 py-3 text-[13px] ${
            error || notice || publishResult
              ? 'translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none translate-y-2 scale-[0.98] opacity-0'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {error && <span className="font-medium text-danger">{error}</span>}
              {notice && (
                <span className="inline-flex items-center gap-1.5 font-medium text-success">
                  <Check className="h-3.5 w-3.5" />
                  {notice}
                </span>
              )}
              {publishResult && (
                <>
                  <span className="inline-flex items-center gap-1.5 font-medium text-success">
                    <Check className="h-3.5 w-3.5" />
                    Published to GitHub
                  </span>
                  <a
                    href={publishResult.commitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="editorial-link text-[13.5px] text-ink"
                  >
                    <span>Commit</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={publishResult.actionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="editorial-link text-[13.5px] text-ink"
                  >
                    <span>Deploy</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotice(null);
                setPublishResult(null);
              }}
              aria-label="Dismiss message"
              className="text-ink-2 transition-colors hover:text-ink cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Main Writing & Preview Split */}
        <div
          className={`mx-auto grid w-full max-w-[1280px] flex-1 ${
            viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* Write Pane */}
          {viewMode !== 'preview' && (
            <div
              className={`flex flex-col bg-surface/50 ${
                viewMode === 'split' ? 'border-b border-rule lg:border-b-0 lg:border-r' : ''
              }`}
            >
                <div
                  className={`mx-auto flex w-full flex-1 flex-col px-6 py-9 sm:px-10 sm:py-11 ${
                    viewMode === 'write' ? 'max-w-[740px]' : ''
                  }`}
                >
                  {/* Monumental Title */}
                  <input
                    type="text"
                    value={fields.title}
                    onChange={(e) => setFields((prev) => ({ ...prev, title: e.target.value }))}
                    onKeyDown={(e) => {
                      // Enter moves on to the summary, like Notion.
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        summaryInputRef.current?.focus();
                      }
                    }}
                    placeholder="Title your post..."
                    aria-label="Entry title"
                    className="font-display w-full bg-transparent text-[clamp(1.65rem,3vw,2.15rem)] font-semibold leading-[1.2] text-ink placeholder:text-ink-3 focus:outline-none"
                  />

                  {/* Subtitle */}
                  <input
                    type="text"
                    value={fields.summary}
                    onChange={(e) => setFields((prev) => ({ ...prev, summary: e.target.value }))}
                    ref={summaryInputRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        editorRef.current?.focus();
                      }
                    }}
                    placeholder="Short summary or opening thought (optional)..."
                    aria-label="Entry summary"
                    className="mt-3.5 w-full bg-transparent text-[16.5px] leading-[1.55] text-ink-2 placeholder:text-ink-3 focus:outline-none"
                  />

                  {/* Collapsible Details */}
                  <div className="collapse-grid" data-open={showDetails}>
                    <div className="collapse-inner">
                      <div className="mt-6 grid grid-cols-1 gap-3.5 rounded-[10px] border border-rule bg-card p-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="meta-date"
                            className="block text-[13.5px] font-medium text-ink-2"
                          >
                            Date
                          </label>
                          <input
                            id="meta-date"
                            type="date"
                            value={fields.date}
                            onChange={(e) =>
                              setFields((prev) => ({ ...prev, date: e.target.value }))
                            }
                            className="mt-1.5 w-full rounded-[6px] border border-rule bg-paper px-3 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="meta-tags"
                            className="block text-[13.5px] font-medium text-ink-2"
                          >
                            Tags (comma-separated)
                          </label>
                          <input
                            id="meta-tags"
                            type="text"
                            value={fields.tagsText}
                            onChange={(e) =>
                              setFields((prev) => ({ ...prev, tagsText: e.target.value }))
                            }
                            placeholder="Notes, Essays, Ideas"
                            className="mt-1.5 w-full rounded-[6px] border border-rule bg-paper px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label
                            htmlFor="meta-snippet"
                            className="block text-[13.5px] font-medium text-ink-2"
                          >
                            Highlight snippet (optional)
                          </label>
                          <input
                            id="meta-snippet"
                            type="text"
                            value={fields.snippet}
                            onChange={(e) =>
                              setFields((prev) => ({ ...prev, snippet: e.target.value }))
                            }
                            placeholder="Single-line code or quote shown on the lead entry"
                            className="mt-1.5 w-full rounded-[6px] border border-rule bg-paper px-3 py-2 font-mono text-[13px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1 sm:col-span-2">
                          <label className="inline-flex items-center gap-2 text-[13px] font-medium text-ink cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fields.featured}
                              onChange={(e) =>
                                setFields((prev) => ({ ...prev, featured: e.target.checked }))
                              }
                              className="h-4 w-4 accent-[var(--color-accent)]"
                            />
                            <span>Feature as lead post on home page</span>
                          </label>

                          {fields.coverImage && (
                            <button
                              type="button"
                              onClick={() => setFields((prev) => ({ ...prev, coverImage: '' }))}
                              className="text-[13.5px] font-medium text-danger hover:underline cursor-pointer"
                            >
                              Remove cover
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Body: live-preview Markdown editor with `/` commands and optional Vim keys */}
                  <div className="mt-6 flex flex-1 flex-col border-t border-rule pt-6">
                    <NotionMarkdownEditor
                      ref={editorRef}
                      value={fields.body}
                      onChange={(next) => setFields((prev) => ({ ...prev, body: next }))}
                      onPasteImage={(file) => void handleUploadImage(file, 'inline')}
                      onDropImage={(file) => void handleUploadImage(file, 'inline')}
                      onRequestImageUpload={() => inlineImageInputRef.current?.click()}
                      onSave={handleSaveDraft}
                      vimEnabled={vimEnabled}
                      imagePreviewMap={imagePreviewMap}
                    />
                  </div>
                </div>
            </div>
          )}

          {/* Live Preview Pane */}
          {viewMode !== 'write' && (
            <div className="overflow-y-auto bg-paper px-6 py-9 sm:px-10 sm:py-11">
              <div className="mx-auto max-w-[66ch]">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[13px] text-ink-2 tabular-nums">
                  <span>{formatDateDisplay(postInput.date)}</span>
                  <span aria-hidden="true" className="text-ink-3">/</span>
                  <span>{readingMinutes} min read</span>
                </div>

                <h1 className="font-display mt-4 text-[clamp(1.75rem,3.4vw,2.35rem)] font-semibold leading-[1.2] text-ink">
                  {postInput.title || 'Untitled post'}
                </h1>

                {postInput.summary && (
                  <p className="mt-4 text-[17.5px] leading-[1.6] text-ink-2">
                    {postInput.summary}
                  </p>
                )}

                {postInput.tags.length > 0 && (
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {postInput.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-rule bg-surface px-3 py-0.5 font-mono text-[13px] text-ink-2"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}

                {resolvedCoverPreview && (
                  <div className="mt-8 overflow-hidden rounded-[10px] border border-rule bg-surface">
                    <img
                      src={resolvedCoverPreview}
                      alt=""
                      className="max-h-[380px] w-full object-cover"
                    />
                  </div>
                )}

                <div className="mt-9 border-t border-rule pt-9">
                  {postInput.body.trim() ? (
                    <MarkdownRenderer
                      markdown={postInput.body}
                      imagePreviewMap={imagePreviewMap}
                    />
                  ) : (
                    <p className="text-[15px] italic text-ink-3">
                      Your formatted preview will appear here as you write.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
