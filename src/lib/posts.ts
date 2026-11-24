import type { Post, PostInput } from '../types/post';
import {
  estimateReadingTime,
  getTodayIsoDate,
  parsePostDocument,
  serializePostToMarkdown,
  slugify,
} from './markdown';

const LOCAL_POSTS_STORAGE_KEY = 'daylog.local_posts.v1';

// Eagerly bundle all Markdown posts from /content/posts at build time
const rawRepoModules = import.meta.glob('../../content/posts/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function parseMarkdownPost(
  filePath: string,
  rawContent: string,
  extra?: { sha?: string; source?: 'repo' | 'local' },
): Post {
  const filename = filePath.split('/').pop() ?? 'note.md';
  const baseSlug = filename
    .replace(/\.md$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const filenameDate = filename.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];

  const parsed = parsePostDocument(rawContent, baseSlug);

  return {
    slug: baseSlug,
    filename,
    title: parsed.title,
    date: parsed.date || filenameDate || getTodayIsoDate(),
    project: parsed.project,
    tags: parsed.tags,
    summary: parsed.summary,
    snippet: parsed.snippet,
    coverImage: parsed.coverImage,
    featured: parsed.featured,
    body: parsed.body,
    readingTimeMinutes: estimateReadingTime(parsed.body),
    source: extra?.source ?? 'repo',
    repoPath: `content/posts/${filename}`,
    sha: extra?.sha,
  };
}

const REPO_POSTS: Post[] = Object.entries(rawRepoModules)
  .map(([path, raw]) => parseMarkdownPost(path, raw, { source: 'repo' }))
  .sort((a, b) => b.date.localeCompare(a.date));

export function getBundledRepoPosts(): Post[] {
  return REPO_POSTS;
}

export function getLocalPosts(): Post[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_POSTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Post[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      ...p,
      source: 'local',
      readingTimeMinutes: estimateReadingTime(p.body || ''),
    }));
  } catch {
    return [];
  }
}

export function getAllPosts(includeLocalDrafts = false): Post[] {
  const locals = includeLocalDrafts ? getLocalPosts() : [];
  const localSlugs = new Set(locals.map((p) => p.slug));
  const merged = [
    ...locals,
    ...REPO_POSTS.filter((p) => !localSlugs.has(p.slug)),
  ];
  return merged.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
  });
}

export function saveLocalPost(input: PostInput): Post {
  const slug = input.slug ? slugify(input.slug) : slugify(input.title);
  const date = input.date || getTodayIsoDate();
  const filename = `${date}-${slug}.md`;

  const post: Post = {
    slug,
    filename,
    title: input.title.trim(),
    date,
    project: input.project.trim() || 'General',
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
    summary: input.summary.trim() || input.title.trim(),
    snippet: input.snippet?.trim() || undefined,
    coverImage: input.coverImage?.trim() || undefined,
    featured: Boolean(input.featured),
    body: input.body,
    readingTimeMinutes: estimateReadingTime(input.body),
    source: 'local',
    repoPath: `content/posts/${filename}`,
    updatedAt: new Date().toISOString(),
  };

  const existing = getLocalPosts().filter((p) => p.slug !== slug);
  const next = [post, ...existing];
  window.localStorage.setItem(LOCAL_POSTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('daylog:posts-updated'));
  return post;
}

export function deleteLocalPost(slug: string): void {
  const next = getLocalPosts().filter((p) => p.slug !== slug);
  window.localStorage.setItem(LOCAL_POSTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('daylog:posts-updated'));
}

export function downloadPostMarkdown(input: PostInput): void {
  const slug = input.slug ? slugify(input.slug) : slugify(input.title);
  const date = input.date || getTodayIsoDate();
  const filename = `${date}-${slug}.md`;
  const content = serializePostToMarkdown(input);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
