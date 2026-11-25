import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { getAllPosts, getBundledRepoPosts, getLocalPosts } from './lib/posts';
import { loadAdminSession } from './lib/github';
import type { AdminSession, Post } from './types/post';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SearchModal } from './components/SearchModal';
import { HomePage } from './pages/HomePage';
import { PostPage } from './pages/PostPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminEditorPage } from './pages/AdminEditorPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function AppShell() {
  const location = useLocation();
  const [session, setSession] = useState<AdminSession | null>(() => loadAdminSession());
  const [liveRepoPosts, setLiveRepoPosts] = useState<Post[] | null>(null);
  const [localTick, setLocalTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const refreshSession = () => setSession(loadAdminSession());
    const refreshPosts = () => setLocalTick((n) => n + 1);
    const onStorage = () => {
      refreshSession();
      refreshPosts();
    };

    window.addEventListener('daylog:session-updated', refreshSession);
    window.addEventListener('daylog:posts-updated', refreshPosts);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('daylog:session-updated', refreshSession);
      window.removeEventListener('daylog:posts-updated', refreshPosts);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const publicPosts = useMemo(() => {
    void localTick;
    if (session) {
      const locals = getLocalPosts();
      const repoList = liveRepoPosts ?? getBundledRepoPosts();
      const localSlugs = new Set(locals.map((p) => p.slug));
      return [...locals, ...repoList.filter((p) => !localSlugs.has(p.slug))].sort((a, b) =>
        b.date.localeCompare(a.date),
      );
    }
    return getAllPosts(false);
  }, [session, liveRepoPosts, localTick]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const requireAdmin = (element: React.ReactElement) =>
    session ? element : <AdminLoginPage onAuthenticated={setSession} />;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <ScrollToTop />
      <Navbar session={session} onOpenSearch={() => setSearchOpen(true)} />
      <main id="main-content" className="flex-1">
        <div key={location.pathname} className="page-transition">
          <Routes location={location}>
            {/* Public Blog Side */}
            <Route path="/" element={<HomePage posts={publicPosts} session={session} />} />
            <Route
              path="/post/:slug"
              element={<PostPage posts={publicPosts} session={session} />}
            />

            {/* Admin & Writing Studio */}
            <Route
              path="/admin"
              element={requireAdmin(
                <AdminDashboardPage
                  session={session!}
                  bundledPosts={getBundledRepoPosts()}
                  section="posts"
                  onLiveRepoPosts={setLiveRepoPosts}
                />,
              )}
            />
            <Route
              path="/admin/media"
              element={requireAdmin(
                <AdminDashboardPage
                  session={session!}
                  bundledPosts={getBundledRepoPosts()}
                  section="media"
                  onLiveRepoPosts={setLiveRepoPosts}
                />,
              )}
            />
            <Route
              path="/admin/new"
              element={requireAdmin(
                <AdminEditorPage session={session!} posts={publicPosts} />,
              )}
            />
            <Route
              path="/admin/edit/:slug"
              element={requireAdmin(
                <AdminEditorPage session={session!} posts={publicPosts} />,
              )}
            />

            {/* Fallback */}
            <Route path="*" element={<HomePage posts={publicPosts} session={session} />} />
          </Routes>
        </div>
      </main>
      <Footer session={session} />
      <SearchModal
        open={searchOpen}
        posts={publicPosts}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
