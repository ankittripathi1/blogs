import { Marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import http from 'highlight.js/lib/languages/http';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import type { PostInput } from '../types/post';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('http', http);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/['"`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'untitled-note'
  );
}

export function estimateReadingTime(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, ' code ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/[#*_`>\-\[\]()]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 210));
}

export function formatDateDisplay(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return isoDate;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Splits an ISO date into the parts a calendar page shows.
export function getDateParts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'long' }),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    year: date.getFullYear(),
    isSunday: date.getDay() === 0,
  };
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}

export interface ParsedPostDocument {
  title: string;
  summary: string;
  date: string;
  project: string;
  tags: string[];
  snippet?: string;
  coverImage?: string;
  featured: boolean;
  body: string;
}

const DIRECTIVE_REGEX =
  /^#(TITLE|DESCRIPTION|SUMMARY|PROJECT|DATE|TAGS|SNIPPET|COVER|COVER_IMAGE|FEATURED)\s*:\s*(.*)$/i;

function parseYamlFrontmatter(raw: string): {
  data: Record<string, string | string[] | boolean>;
  body: string;
} {
  const endIdx = raw.indexOf('\n---\n', 4);
  if (endIdx === -1) return { data: {}, body: raw.trim() };

  const fmBlock = raw.slice(4, endIdx);
  const body = raw.slice(endIdx + 5).trim();
  const data: Record<string, string | string[] | boolean> = {};

  const lines = fmBlock.split('\n');
  let activeArrayKey: string | null = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (activeArrayKey && /^\s+-\s+/.test(line)) {
      const item = unquote(line.replace(/^\s+-\s+/, ''));
      const existing = data[activeArrayKey];
      if (Array.isArray(existing)) existing.push(item);
      continue;
    }

    activeArrayKey = null;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();

    if (rawVal === '') {
      data[key] = [];
      activeArrayKey = key;
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      data[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s))
        .filter(Boolean);
    } else if (rawVal === 'true' || rawVal === 'false') {
      data[key] = rawVal === 'true';
    } else {
      data[key] = unquote(rawVal);
    }
  }

  return { data, body };
}

/**
 * Parses either our ultra-simple directive syntax (#TITLE:, #DESCRIPTION:, #PROJECT:, etc.)
 * OR traditional YAML frontmatter (--- ... ---) for full compatibility.
 */
export function parsePostDocument(raw: string, fallbackSlug = 'untitled-note'): ParsedPostDocument {
  const normalized = raw.replace(/\r\n/g, '\n');

  if (normalized.startsWith('---\n')) {
    const { data, body } = parseYamlFrontmatter(normalized);
    const title = typeof data.title === 'string' && data.title ? data.title : fallbackSlug;
    const summary =
      typeof data.description === 'string' && data.description
        ? data.description
        : typeof data.summary === 'string' && data.summary
          ? data.summary
          : firstParagraphSummary(body);
    const date = typeof data.date === 'string' && data.date ? data.date : getTodayIsoDate();
    const project = typeof data.project === 'string' && data.project ? data.project : 'General';
    const tags = Array.isArray(data.tags)
      ? data.tags
      : typeof data.tags === 'string'
        ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
    const snippet = typeof data.snippet === 'string' ? data.snippet : undefined;
    const coverImage =
      typeof data.coverImage === 'string'
        ? data.coverImage
        : typeof data.cover === 'string'
          ? data.cover
          : undefined;
    return {
      title,
      summary,
      date,
      project,
      tags,
      snippet,
      coverImage,
      featured: data.featured === true,
      body,
    };
  }

  // Simple #TITLE: / #DESCRIPTION: directive format
  const lines = normalized.split('\n');
  let title = '';
  let description = '';
  let project = '';
  let date = '';
  let tags: string[] = [];
  let snippet: string | undefined;
  let coverImage: string | undefined;
  let featured = false;

  let bodyStartIdx = 0;
  let sawAnyDirective = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      bodyStartIdx = i + 1;
      continue;
    }

    const match = trimmed.match(DIRECTIVE_REGEX);
    if (match) {
      sawAnyDirective = true;
      const key = match[1].toUpperCase();
      const val = match[2].trim();

      switch (key) {
        case 'TITLE':
          title = val;
          break;
        case 'DESCRIPTION':
        case 'SUMMARY':
          description = val;
          break;
        case 'PROJECT':
          project = val;
          break;
        case 'DATE':
          date = val;
          break;
        case 'TAGS':
          tags = val
            .split(',')
            .map((t) => t.replace(/^#/, '').trim())
            .filter(Boolean);
          break;
        case 'SNIPPET':
          snippet = val || undefined;
          break;
        case 'COVER':
        case 'COVER_IMAGE':
          coverImage = val || undefined;
          break;
        case 'FEATURED':
          featured = val.toLowerCase() === 'true' || val.toLowerCase() === 'yes';
          break;
      }
      bodyStartIdx = i + 1;
      continue;
    }

    // First non-directive, non-empty line marks the start of the Markdown body
    bodyStartIdx = i;
    break;
  }

  const body = (sawAnyDirective ? lines.slice(bodyStartIdx) : lines).join('\n').trim();

  // If #TITLE wasn't provided, fall back to a leading `# Heading` if present
  if (!title) {
    const h1Match = body.match(/^#\s+(.+)$/m);
    title = h1Match ? h1Match[1].trim() : fallbackSlug;
  }

  return {
    title,
    summary: description || firstParagraphSummary(body),
    date: date || getTodayIsoDate(),
    project: project || 'General',
    tags,
    snippet,
    coverImage,
    featured,
    body,
  };
}

function firstParagraphSummary(body: string): string {
  const line = body
    .split('\n')
    .find(
      (l) =>
        l.trim() &&
        !l.trim().startsWith('#') &&
        !l.trim().startsWith('```') &&
        !l.trim().startsWith('!['),
    );
  return line ? line.replace(/[*_`[\]()]/g, '').trim().slice(0, 170) : '';
}

/**
 * Serializes a post into the clean, human-first #TITLE: / #DESCRIPTION: file format.
 */
export function serializePostToMarkdown(post: PostInput): string {
  const lines: string[] = [
    `#TITLE: ${post.title.trim()}`,
    `#DESCRIPTION: ${(post.summary || post.title).trim()}`,
  ];

  if (post.project && post.project.trim() && post.project.trim() !== 'General') {
    lines.push(`#PROJECT: ${post.project.trim()}`);
  }
  if (post.date && post.date.trim()) {
    lines.push(`#DATE: ${post.date.trim()}`);
  }

  const cleanTags = post.tags.map((t) => t.trim()).filter(Boolean);
  if (cleanTags.length > 0) {
    lines.push(`#TAGS: ${cleanTags.join(', ')}`);
  }

  if (post.snippet && post.snippet.trim()) {
    lines.push(`#SNIPPET: ${post.snippet.trim()}`);
  }

  if (post.coverImage && post.coverImage.trim()) {
    lines.push(`#COVER: ${post.coverImage.trim()}`);
  }

  if (post.featured) {
    lines.push('#FEATURED: true');
  }

  lines.push('', post.body.trim(), '');
  return lines.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdownToHtml(
  markdown: string,
  imagePreviewMap?: Record<string, string>,
): string {
  const markedInstance = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      code({ text, lang }) {
        const normalizedLang = (lang || '').trim().toLowerCase();
        let highlighted: string;
        let displayLang = normalizedLang || 'text';

        if (normalizedLang && hljs.getLanguage(normalizedLang)) {
          highlighted = hljs.highlight(text, { language: normalizedLang }).value;
        } else {
          const auto = hljs.highlightAuto(text);
          highlighted = auto.value;
          if (!normalizedLang && auto.language) {
            displayLang = auto.language;
          }
        }

        const encodedRaw = encodeURIComponent(text);
        return `
          <div class="til-code-block group">
            <div class="til-code-header">
              <span class="til-code-lang">${escapeHtml(displayLang)}</span>
              <button type="button" class="til-copy-btn" data-copy-code="${encodedRaw}" aria-label="Copy code">
                Copy
              </button>
            </div>
            <pre><code class="hljs language-${escapeHtml(displayLang)}">${highlighted}</code></pre>
          </div>
        `;
      },
      image({ href, title, text }) {
        const rawHref = href || '';
        const resolvedHref = imagePreviewMap?.[rawHref] ?? rawHref;
        const altAttr = escapeHtml(text || '');
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        const caption = text
          ? `<figcaption class="til-img-caption">${escapeHtml(text)}</figcaption>`
          : '';
        return `
          <figure class="til-figure">
            <img src="${escapeHtml(resolvedHref)}" alt="${altAttr}"${titleAttr} loading="lazy" />
            ${caption}
          </figure>
        `;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safeHref = href || '#';
        const isExternal = /^https?:\/\//i.test(safeHref);
        const attrs = isExternal
          ? ' target="_blank" rel="noopener noreferrer"'
          : '';
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(safeHref)}"${titleAttr}${attrs}>${text}</a>`;
      },
    },
  });

  return markedInstance.parse(markdown) as string;
}
