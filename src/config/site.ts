export interface SiteConfig {
  name: string;
  tagline: string;
  blogTitle: string;
  author: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  socials: {
    github: string;
    linkedin: string;
    twitter: string;
  };
}

function inferGitHubRepoFromLocation(): { owner?: string; repo?: string } {
  if (typeof window === 'undefined') return {};
  const { hostname, pathname } = window.location;
  if (hostname.endsWith('.github.io')) {
    const owner = hostname.replace(/\.github\.io$/, '');
    const firstSegment = pathname.split('/').filter(Boolean)[0];
    return {
      owner,
      repo: firstSegment || `${owner}.github.io`,
    };
  }
  return {};
}

const inferred = inferGitHubRepoFromLocation();

export const SITE_CONFIG: SiteConfig = {
  name: 'Daylog',
  tagline: 'Today I Learned — Engineering Notes',
  blogTitle: 'Today I learned',
  author: 'Ankit Tripathi',
  githubOwner: inferred.owner ?? 'ankittripathi1',
  githubRepo: inferred.repo ?? 'blogs',
  githubBranch: 'main',
  socials: {
    github: 'https://github.com/ankittripathi1',
    linkedin: 'https://www.linkedin.com/in/tripathiankit101/',
    twitter: 'https://x.com/AnkitTr31326247',
  },
};
