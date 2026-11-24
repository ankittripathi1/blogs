import { SITE_CONFIG } from '../config/site';
import type { AdminSession, Post, PostInput, RepoMediaItem } from '../types/post';
import { getTodayIsoDate, serializePostToMarkdown, slugify } from './markdown';
import { parseMarkdownPost } from './posts';

const ADMIN_SESSION_KEY = 'daylog.admin_session.v1';

export function loadAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed || !parsed.mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('daylog:session-updated'));
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
  window.dispatchEvent(new Event('daylog:session-updated'));
}

export function createLocalPreviewSession(): AdminSession {
  const session: AdminSession = {
    mode: 'local',
    owner: SITE_CONFIG.githubOwner,
    repo: SITE_CONFIG.githubRepo,
    branch: SITE_CONFIG.githubBranch,
    token: '',
    user: {
      login: SITE_CONFIG.githubOwner,
      name: SITE_CONFIG.author,
      avatarUrl: '',
    },
    signedInAt: new Date().toISOString(),
  };
  saveAdminSession(session);
  return session;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(base64: string): string {
  const clean = base64.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function fileToRawBase64(file: File): Promise<string> {
  return fileToDataUrl(file).then((dataUrl) => {
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  });
}

export async function verifyGitHubSession(params: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}): Promise<AdminSession> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = params.branch.trim() || 'main';
  const token = params.token.trim();

  if (!owner || !repo) {
    throw new Error('Please enter your GitHub username and repository name.');
  }
  if (!token) {
    throw new Error('Please enter your GitHub Personal Access Token.');
  }

  const headers = ghHeaders(token);

  // 1. Verify token identity
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    throw new Error(
      userRes.status === 401
        ? 'Invalid or expired GitHub token. Please check your token and try again.'
        : `GitHub authentication failed (${userRes.status}).`,
    );
  }
  const userJson = (await userRes.json()) as {
    login: string;
    name?: string;
    avatar_url?: string;
  };

  // 2. Verify repository access & write permission
  const repoRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers },
  );
  if (!repoRes.ok) {
    throw new Error(
      repoRes.status === 404
        ? `Repository "${owner}/${repo}" not found or your token does not have access to it.`
        : `Could not verify repository access (${repoRes.status}).`,
    );
  }

  const repoJson = (await repoRes.json()) as {
    permissions?: { push?: boolean; admin?: boolean };
  };

  if (repoJson.permissions && !repoJson.permissions.push && !repoJson.permissions.admin) {
    throw new Error(
      `Signed in as @${userJson.login}, but this token lacks write (Contents: Read & Write) permission on ${owner}/${repo}.`,
    );
  }

  const session: AdminSession = {
    mode: 'github',
    owner,
    repo,
    branch,
    token,
    user: {
      login: userJson.login,
      name: userJson.name || userJson.login,
      avatarUrl: userJson.avatar_url || '',
    },
    signedInAt: new Date().toISOString(),
  };

  saveAdminSession(session);
  return session;
}

export function getPostRepoPath(post: PostInput): string {
  const slug = post.slug ? slugify(post.slug) : slugify(post.title);
  const date = post.date || getTodayIsoDate();
  return `content/posts/${date}-${slug}.md`;
}

export function buildGitHubNewFileUrl(
  post: PostInput,
  settings: Pick<AdminSession, 'owner' | 'repo' | 'branch'>,
): string {
  const filePath = getPostRepoPath(post);
  const markdown = serializePostToMarkdown(post);
  const params = new URLSearchParams({
    filename: filePath,
    value: markdown,
    message: `til: ${post.title}`,
  });
  return `https://github.com/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/new/${encodeURIComponent(settings.branch)}?${params.toString()}`;
}

export interface PublishResult {
  commitUrl: string;
  fileUrl: string;
  filePath: string;
  actionsUrl: string;
}

export async function publishPostToGitHub(
  post: PostInput,
  session: AdminSession,
  existingRepoPath?: string,
): Promise<PublishResult> {
  if (session.mode !== 'github' || !session.token) {
    throw new Error('Sign in with a GitHub token to publish directly to your repository.');
  }

  const { owner, repo, branch, token } = session;
  const filePath = existingRepoPath || getPostRepoPath(post);
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`;
  const headers = ghHeaders(token);

  let existingSha: string | undefined;
  const checkRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, {
    method: 'GET',
    headers,
  });

  if (checkRes.ok) {
    const existingData = (await checkRes.json()) as { sha?: string };
    existingSha = existingData.sha;
  } else if (checkRes.status !== 404) {
    const errJson = (await checkRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(errJson.message || `GitHub API returned ${checkRes.status}`);
  }

  const markdown = serializePostToMarkdown(post);
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `${existingSha ? 'Update' : 'Add'} post: ${post.title}`,
      content: utf8ToBase64(markdown),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  const resultJson = (await putRes.json().catch(() => ({}))) as {
    message?: string;
    commit?: { html_url?: string };
    content?: { html_url?: string };
  };

  if (!putRes.ok) {
    throw new Error(resultJson.message || `Failed to publish (${putRes.status})`);
  }

  return {
    commitUrl:
      resultJson.commit?.html_url ?? `https://github.com/${owner}/${repo}/commits/${branch}`,
    fileUrl:
      resultJson.content?.html_url ?? `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`,
    filePath,
    actionsUrl: `https://github.com/${owner}/${repo}/actions`,
  };
}

export async function deletePostFromGitHub(
  filePath: string,
  session: AdminSession,
): Promise<void> {
  if (session.mode !== 'github' || !session.token) {
    throw new Error('Sign in with GitHub to delete published posts.');
  }

  const { owner, repo, branch, token } = session;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`;
  const headers = ghHeaders(token);

  const checkRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!checkRes.ok) {
    throw new Error(`Could not find ${filePath} on GitHub (${checkRes.status}).`);
  }
  const fileData = (await checkRes.json()) as { sha: string };

  const delRes = await fetch(apiUrl, {
    method: 'DELETE',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Delete post: ${filePath.split('/').pop()}`,
      sha: fileData.sha,
      branch,
    }),
  });

  if (!delRes.ok) {
    const err = (await delRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Failed to delete post (${delRes.status}).`);
  }
}

export async function fetchRepoPostsFromGitHub(session: AdminSession): Promise<Post[]> {
  if (session.mode !== 'github' || !session.token) return [];
  const { owner, repo, branch, token } = session;
  const headers = ghHeaders(token);

  const listUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/content/posts?ref=${encodeURIComponent(branch)}`;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) {
    if (listRes.status === 404) return [];
    throw new Error(`Could not list posts from GitHub (${listRes.status}).`);
  }

  const entries = (await listRes.json()) as Array<{
    name: string;
    path: string;
    sha: string;
    type: string;
    url: string;
  }>;

  const mdFiles = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md'));

  const fetched = await Promise.all(
    mdFiles.map(async (file) => {
      const res = await fetch(file.url, { headers });
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: string; sha: string };
      if (!json.content) return null;
      const raw = base64ToUtf8(json.content);
      return parseMarkdownPost(file.path, raw, { sha: json.sha, source: 'repo' });
    }),
  );

  return fetched
    .filter((p): p is Post => p !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface UploadedImageResult {
  filename: string;
  repoPath: string;
  publicPath: string;
  previewUrl: string;
  uploadedToGitHub: boolean;
}

export async function uploadImageAsset(
  file: File,
  session: AdminSession,
): Promise<UploadedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, WebP, GIF, or SVG).');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image must be smaller than 8 MB.');
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseName = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 36);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const filename = `${stamp}-${baseName}.${ext || 'png'}`;
  const repoPath = `public/images/${filename}`;
  const publicPath = `./images/${filename}`;
  const previewUrl = await fileToDataUrl(file);

  // In local preview mode, keep instant data URL preview
  if (session.mode !== 'github' || !session.token) {
    return {
      filename,
      repoPath,
      publicPath: previewUrl,
      previewUrl,
      uploadedToGitHub: false,
    };
  }

  const rawBase64 = await fileToRawBase64(file);
  const { owner, repo, branch, token } = session;
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${repoPath}`;

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      ...ghHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Add image: ${filename}`,
      content: rawBase64,
      branch,
    }),
  });

  if (!putRes.ok) {
    const err = (await putRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || `Image upload failed (${putRes.status}).`);
  }

  return {
    filename,
    repoPath,
    publicPath,
    previewUrl,
    uploadedToGitHub: true,
  };
}

export async function listRepoImages(session: AdminSession): Promise<RepoMediaItem[]> {
  if (session.mode !== 'github' || !session.token) return [];
  const { owner, repo, branch, token } = session;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/public/images?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Could not list media files (${res.status}).`);
  }
  const items = (await res.json()) as Array<{
    name: string;
    path: string;
    download_url: string;
    sha: string;
    size: number;
    type: string;
  }>;

  return items
    .filter((i) => i.type === 'file' && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(i.name))
    .map((i) => ({
      name: i.name,
      path: i.path,
      publicPath: `./images/${i.name}`,
      downloadUrl: i.download_url,
      sha: i.sha,
      size: i.size,
    }))
    .reverse();
}
