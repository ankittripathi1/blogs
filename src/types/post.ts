export interface Post {
  slug: string;
  filename: string;
  title: string;
  date: string; // YYYY-MM-DD
  project: string;
  tags: string[];
  summary: string;
  snippet?: string;
  coverImage?: string;
  featured?: boolean;
  body: string;
  readingTimeMinutes: number;
  source: 'repo' | 'local';
  repoPath?: string;
  sha?: string;
  updatedAt?: string;
}

export interface PostInput {
  slug?: string;
  title: string;
  date: string;
  project: string;
  tags: string[];
  summary: string;
  snippet?: string;
  coverImage?: string;
  featured?: boolean;
  body: string;
}

export interface GitHubUserInfo {
  login: string;
  name: string;
  avatarUrl: string;
}

export interface AdminSession {
  mode: 'github' | 'local';
  owner: string;
  repo: string;
  branch: string;
  token: string;
  user?: GitHubUserInfo;
  signedInAt: string;
}

export interface RepoMediaItem {
  name: string;
  path: string;
  publicPath: string;
  downloadUrl: string;
  sha: string;
  size: number;
}
