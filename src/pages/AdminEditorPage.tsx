import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
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
  FileCode2,
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
  parsePostDocument,
  serializePostToMarkdown,
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
import { NotionMarkdownEditor } from '../components/NotionMarkdownEditor';

interface AdminEditorPageProps {
  session: AdminSession;
  posts: Post[];
}

type ViewMode = 'write' | 'split' | 'preview';
type EditorMode = 'clean' | 'raw';

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

export function AdminEditorPage({ session, posts }: AdminEditorPageProps) {
  const { slug: editSlug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const existingPost = useMemo(
    () => (editSlug ? posts.find((p) => p.slug === editSlug) : undefined),
    [editSlug, posts],
  );

  const [fields, setFields] = useState<DraftFields>(() => fieldsFromPost(existingPost));
  const [editorMode, setEditorMode] = useState<EditorMode>('clean');
  const [rawText, setRawText] = useState<string>(() =>
    existingPost ? serializePostToMarkdown(existingPost) : '#TITLE: \n#DESCRIPTION: \n\n',
  );
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showDetails, setShowDetails] = useState(false);
  const [imagePreviewMap, setImagePreviewMap] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);

  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    if (existingPost) {
      setFields(fieldsFromPost(existingPost));
      setRawText(serializePostToMarkdown(existingPost));
    } else if (!editSlug) {
      setFields(fieldsFromPost(undefined));
      setRawText('#TITLE: \n#DESCRIPTION: \n\n');
    }
  }, [existingPost?.slug, editSlug]);

  const parsedRaw = useMemo(
    () => parsePostDocument(rawText, existingPost?.slug ?? 'untitled-note'),
    [rawText, existingPost?.slug],
  );

  const postInput: PostInput = useMemo(() => {
    if (editorMode === 'raw') {
      return {
        slug: existingPost?.slug ?? slugify(parsedRaw.title),
        title: parsedRaw.title === 'untitled-note' ? '' : parsedRaw.title,
        date: parsedRaw.date || getTodayIsoDate(),
        project: 'General',
        tags: parsedRaw.tags,
        summary: parsedRaw.summary,
        snippet: parsedRaw.snippet,
        coverImage: parsedRaw.coverImage,
        featured: parsedRaw.featured,
        body: parsedRaw.body,
      };
    }
    return fieldsToPostInput(fields, existingPost?.slug);
  }, [editorMode, parsedRaw, fields, existingPost?.slug]);

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

  const toggleEditorMode = () => {
    if (editorMode === 'clean') {
      setRawText(serializePostToMarkdown(fieldsToPostInput(fields, existingPost?.slug)));
      setEditorMode('raw');
    } else {
      const parsed = parsePostDocument(rawText, existingPost?.slug ?? 'untitled-note');
      setFields({
        title: parsed.title === 'untitled-note' ? '' : parsed.title,
        summary: parsed.summary,
        date: parsed.date || getTodayIsoDate(),
        tagsText: parsed.tags.join(', '),
        snippet: parsed.snippet ?? '',
        coverImage: parsed.coverImage ?? '',
        featured: parsed.featured,
        body: parsed.body,
      });
      setEditorMode('clean');
    }
  };

  const insertAtCursor = (snippet: string) => {
    const isRaw = editorMode === 'raw';
    const el = isRaw ? rawTextareaRef.current : bodyTextareaRef.current;
    const currentText = isRaw ? rawText : fields.body;

    const update = (next: string) => {
      if (isRaw) {
        setRawText(next);
      } else {
        setFields((prev) => ({ ...prev, body: next }));
      }
    };

    if (!el) {
      update(`${currentText}\n${snippet}`);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = currentText.slice(0, start) + snippet + currentText.slice(end);
    update(next);
    window.setTimeout(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (!e.shiftKey) {
      insertAtCursor('  ');
      return;
    }
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = rawText.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = rawText.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? rawText.length : lineEndIdx;
    const lines = rawText.slice(lineStart, lineEnd).split('\n');
    let removedFirst = 0;
    let removedTotal = 0;
    const outdented = lines
      .map((line, idx) => {
        if (line.startsWith('  ')) {
          if (idx === 0) removedFirst = 2;
          removedTotal += 2;
          return line.slice(2);
        }
        if (line.startsWith('\t') || line.startsWith(' ')) {
          if (idx === 0) removedFirst = 1;
          removedTotal += 1;
          return line.slice(1);
        }
        return line;
      })
      .join('\n');
    if (removedTotal === 0) return;
    const next = rawText.slice(0, lineStart) + outdented + rawText.slice(lineEnd);
    setRawText(next);
    window.requestAnimationFrame(() => {
      const nextStart = Math.max(lineStart, start - removedFirst);
      const nextEnd = Math.max(nextStart, end - removedTotal);
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    });
  };

  const setOrUpdateRawCoverDirective = (coverPath: string) => {
    setRawText((prev) => {
      if (/^#COVER\s*:/im.test(prev)) {
        return prev.replace(/^#COVER\s*:.*$/im, `#COVER: ${coverPath}`);
      }
      const lines = prev.split('\n');
      let insertIdx = 0;
      for (let i = 0; i < lines.length; i += 1) {
        if (
          /^#(TITLE|DESCRIPTION|SUMMARY|PROJECT|DATE|TAGS|SNIPPET|COVER|FEATURED)\s*:/i.test(
            lines[i].trim(),
          )
        ) {
          insertIdx = i + 1;
        } else if (lines[i].trim() !== '') {
          break;
        }
      }
      lines.splice(insertIdx, 0, `#COVER: ${coverPath}`);
      return lines.join('\n');
    });
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
        if (editorMode === 'raw') {
          setOrUpdateRawCoverDirective(uploaded.publicPath);
        } else {
          setFields((prev) => ({ ...prev, coverImage: uploaded.publicPath }));
        }
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

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    void handleUploadImage(file, 'inline');
  };

  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) {
      void handleUploadImage(file, 'inline');
    }
  };

  const handleSaveDraft = useCallback(() => {
    if (!postInput.title || postInput.title === 'untitled-note') {
      setError('Add a title before saving.');
      return;
    }
    setError(null);
    const saved = saveLocalPost(postInput);
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

              {editorMode === 'clean' && (
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors cursor-pointer ${
                    showDetails
                      ? 'bg-surface text-ink border border-rule-strong'
                      : 'text-ink-2 hover:bg-surface hover:text-ink'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Details</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleEditorMode}
                title={
                  editorMode === 'clean'
                    ? 'Switch to raw #TITLE: Markdown'
                    : 'Switch to clean editor'
                }
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors cursor-pointer ${
                  editorMode === 'raw'
                    ? 'bg-surface text-ink border border-rule-strong'
                    : 'text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {editorMode === 'raw' ? 'Raw' : 'Markdown'}
                </span>
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
              <span className="hidden font-mono text-[12px] text-ink-2 tabular-nums md:inline">
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
                    className={`relative z-10 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
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
                className="btn-secondary min-h-[34px] px-3.5 text-[13px]"
              >
                <Save className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Save</span>
              </button>

              <button
                type="button"
                disabled={publishing}
                onClick={() => void handlePublish()}
                className="btn-primary min-h-[34px] px-4 text-[13px]"
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
                    className="editorial-link text-[12.5px] text-ink"
                  >
                    <span>Commit</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={publishResult.actionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="editorial-link text-[12.5px] text-ink"
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
              {editorMode === 'raw' ? (
                <textarea
                  ref={rawTextareaRef}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  onPaste={handlePaste}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={handleDrop}
                  spellCheck
                  aria-label="Raw Markdown post"
                  className={`min-h-[calc(100vh-128px)] w-full flex-1 resize-none bg-transparent p-6 font-mono text-[14px] leading-[1.8] text-ink focus:outline-none sm:p-10 ${
                    isDraggingFile ? 'bg-surface ring-2 ring-inset ring-accent' : ''
                  }`}
                />
              ) : (
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
                    placeholder="Title your post..."
                    aria-label="Entry title"
                    className="font-display w-full bg-transparent text-[clamp(1.65rem,3vw,2.15rem)] font-semibold leading-[1.2] text-ink placeholder:text-ink-3 focus:outline-none"
                  />

                  {/* Subtitle */}
                  <input
                    type="text"
                    value={fields.summary}
                    onChange={(e) => setFields((prev) => ({ ...prev, summary: e.target.value }))}
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
                            className="block text-[12.5px] font-medium text-ink-2"
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
                            className="block text-[12.5px] font-medium text-ink-2"
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
                            className="block text-[12.5px] font-medium text-ink-2"
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
                              className="text-[12.5px] font-medium text-danger hover:underline cursor-pointer"
                            >
                              Remove cover
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Body Writing Area (Notion-style `/` commands, Shift+Tab, shortcuts & selection bar) */}
                  <div className="mt-6 flex flex-1 flex-col border-t border-rule pt-6">
                    <NotionMarkdownEditor
                      textareaRef={bodyTextareaRef}
                      value={fields.body}
                      onChange={(next) => setFields((prev) => ({ ...prev, body: next }))}
                      onPasteImage={(file) => void handleUploadImage(file, 'inline')}
                      onDropImage={(file) => void handleUploadImage(file, 'inline')}
                      onRequestImageUpload={() => inlineImageInputRef.current?.click()}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live Preview Pane */}
          {viewMode !== 'write' && (
            <div className="overflow-y-auto bg-paper px-6 py-9 sm:px-10 sm:py-11">
              <div className="mx-auto max-w-[66ch]">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[12px] text-ink-2 tabular-nums">
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
                        className="rounded-full border border-rule bg-surface px-3 py-0.5 font-mono text-[12px] text-ink-2"
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
