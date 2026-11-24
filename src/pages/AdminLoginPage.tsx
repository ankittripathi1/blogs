import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { SITE_CONFIG } from '../config/site';
import { createLocalPreviewSession, verifyGitHubSession } from '../lib/github';
import type { AdminSession } from '../types/post';
import { BrandMark } from '../components/Navbar';
import { ThemeToggle } from '../components/ThemeToggle';

interface AdminLoginPageProps {
  onAuthenticated: (session: AdminSession) => void;
}

const fieldClass =
  'mt-2 w-full rounded-[8px] border border-rule-strong bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none';

export function AdminLoginPage({ onAuthenticated }: AdminLoginPageProps) {
  const [owner, setOwner] = useState(SITE_CONFIG.githubOwner);
  const [repo, setRepo] = useState(SITE_CONFIG.githubRepo);
  const [branch, setBranch] = useState(SITE_CONFIG.githubBranch);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await verifyGitHubSession({ owner, repo, branch, token });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="studio-stage flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-14">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="group editorial-link text-[13.5px] font-medium">
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span>Back to blog</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="rounded-[12px] border border-rule-strong bg-card p-7 sm:p-9">
          <div className="flex items-center gap-2 text-ink">
            <BrandMark className="h-5 w-5" />
            <span className="text-[16.5px] font-semibold tracking-[-0.02em]">{SITE_CONFIG.name}</span>
          </div>

          <h1 className="font-display mt-5 text-[26px] font-semibold leading-[1.2] text-ink">
            Sign in to write
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-[1.65] text-ink-2">
            There is no default password. Connect a GitHub token to commit posts straight to your
            repository, or start writing locally without signing in.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="github-token"
                className="block text-[13.5px] font-medium text-ink"
              >
                GitHub personal access token
              </label>
              <input
                id="github-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_..."
                autoComplete="current-password"
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                className={`${fieldClass} font-mono text-[13.5px]`}
              />
            </div>

            {error && (
              <p id="login-error" role="alert" className="text-[13.5px] text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary min-h-[44px] w-full"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Connect GitHub</span>
            </button>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowSetup((v) => !v)}
                aria-expanded={showSetup}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink cursor-pointer"
              >
                <span>Repository settings</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-150 ${
                    showSetup ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <div className="collapse-grid" data-open={showSetup}>
                <div className="collapse-inner">
                  <div className="mt-4 space-y-3.5 border-t border-rule pt-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor="gh-owner" className="block text-[12.5px] text-ink-2">
                          Owner
                        </label>
                        <input
                          id="gh-owner"
                          type="text"
                          value={owner}
                          onChange={(e) => setOwner(e.target.value)}
                          required
                          className="mt-1 w-full rounded-[6px] border border-rule bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="gh-repo" className="block text-[12.5px] text-ink-2">
                          Repository
                        </label>
                        <input
                          id="gh-repo"
                          type="text"
                          value={repo}
                          onChange={(e) => setRepo(e.target.value)}
                          required
                          className="mt-1 w-full rounded-[6px] border border-rule bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="gh-branch" className="block text-[12.5px] text-ink-2">
                          Branch
                        </label>
                        <input
                          id="gh-branch"
                          type="text"
                          value={branch}
                          onChange={(e) => setBranch(e.target.value)}
                          required
                          className="mt-1 w-full rounded-[6px] border border-rule bg-paper px-2.5 py-2 text-[13.5px] text-ink focus:border-ink focus:outline-none"
                        />
                      </div>
                    </div>
                    <a
                      href="https://github.com/settings/personal-access-tokens/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                    >
                      <span>Create fine-grained token (Contents: read &amp; write)</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-7 border-t border-rule pt-6">
            <button
              type="button"
              onClick={() => onAuthenticated(createLocalPreviewSession())}
              className="btn-secondary min-h-[44px] w-full"
            >
              Continue in local mode
            </button>
            <p className="mt-2.5 text-center text-[12.5px] leading-[1.55] text-ink-2">
              No token or password required. Entries save in this browser and can be exported as
              Markdown anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
