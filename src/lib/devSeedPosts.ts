import type { Post } from '../types/post';
import { estimateReadingTime } from './markdown';

interface SeedSpec {
  slug: string;
  date: string;
  title: string;
  summary: string;
  tags: string[];
  coverImage?: string;
  body: string;
}

const RAW_SEEDS: SeedSpec[] = [
  {
    slug: 'designing-interfaces-that-stay-out-of-the-way',
    date: '2026-11-23',
    title: 'Designing Interfaces That Stay Out of the Way',
    summary:
      'Why the best tools feel quiet at first glance, how restraint sharpens hierarchy, and why every extra border or badge taxes the reader more than we expect.',
    tags: ['Design', 'Typography', 'Craft'],
    coverImage:
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1400&q=80',
    body: `Most software gets worse not because someone chose a bad color, but because ten reasonable additions piled up over six months without anyone removing a single line.

## The Cost of Visual Noise

Every box, pill, badge, and divider asks the reader to spend a tiny slice of attention deciding whether it matters. One badge is harmless. Twelve badges turn a calm list into a dashboard nobody wants to read.

> Good design is as much about what you refuse to put on the screen as what you choose to polish.

### Measuring Attention Honestly

When reviewing a screen, try hiding one element at a time and asking if the user actually lost information:

- Does the border clarify a boundary, or would whitespace do the same job?
- Does the icon explain the label, or just repeat it?
- Does the animation explain where something came from, or just delay the click?

## Typography Does the Heavy Lifting

When you strip away cards-inside-cards, type hierarchy carries the entire page. Tight tracking on headlines, a comfortable measure around 65 characters, and tabular numerals for dates create structure without drawing a single extra rectangle.

![Minimalist architectural workspace in natural light](https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80)

## Motion With a Job

Motion should confirm an action, connect two states spatially, or prevent a sudden layout jump. A smooth \`cubic-bezier(0.22, 1, 0.36, 1)\` curve feels natural because it starts immediately and settles without bouncing.

\`\`\`css
:root {
  --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
}

.panel {
  transition: transform 240ms var(--ease-smooth), opacity 180ms ease;
}
\`\`\`

## Keeping It Simple Over Time

The hardest part of minimalism isn't the first version — it's version twelve. Treat every new control like it has to pay rent in pixels and cognitive load.`,
  },
  {
    slug: 'postgres-partial-unique-indexes-for-soft-deletes',
    date: '2026-11-21',
    title: 'Using Partial Unique Indexes in PostgreSQL for Soft-Deleted Users',
    summary:
      'A standard UNIQUE constraint on email breaks account re-registration after soft deletion. Partial unique indexes solve this cleanly at the database layer without fragile app-level checks.',
    tags: ['PostgreSQL', 'Databases', 'Backend'],
    coverImage:
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1400&q=80',
    body: `Soft deletes (\`deleted_at TIMESTAMPTZ\`) keep audit trails and foreign keys intact when a user closes their account, but they immediately collide with naive \`UNIQUE\` constraints.

## Why Naive Uniqueness Breaks

If \`alex@example.com\` deletes their account and signs up again a month later, a plain \`UNIQUE (email)\` constraint rejects the insert with a duplicate key error even though the old row is inactive.

## The Partial Unique Index Fix

PostgreSQL lets you attach a \`WHERE\` predicate directly to a unique index so uniqueness is enforced only across active rows:

\`\`\`sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX users_email_active_idx
  ON users (lower(email))
  WHERE deleted_at IS NULL;
\`\`\`

### Normalizing Case at Storage Level

Indexing \`lower(email)\` guarantees \`Alex@Example.com\` and \`alex@example.com\` can never coexist as two active accounts, regardless of which service writes to the table.

## Handling Upserts With ON CONFLICT

When running upserts against a partial unique index, repeat the exact \`WHERE\` predicate in your conflict target so Postgres can match the index:

\`\`\`sql
INSERT INTO users (email, name)
VALUES ('alex@example.com', 'Alex')
ON CONFLICT (lower(email)) WHERE deleted_at IS NULL
DO UPDATE SET name = EXCLUDED.name;
\`\`\`

## Summary Table

| Approach | Enforces Active Uniqueness | Allows Re-Signup | Safe Under Concurrency |
| --- | --- | --- | --- |
| App-level SELECT check | Partial | Yes | No (race conditions) |
| Plain UNIQUE(email) | Yes | No | Yes |
| Partial UNIQUE index | Yes | Yes | Yes |`,
  },
  {
    slug: 'jwt-refresh-token-rotation-and-reuse-detection',
    date: '2026-11-18',
    title: 'Refresh Token Rotation and Reuse Detection in Auth Flows',
    summary:
      'Rotating refresh tokens on every use and revoking the entire token family on reuse turns stolen long-lived sessions into immediately detectable events.',
    tags: ['Security', 'Auth', 'Node.js'],
    body: `Short-lived access tokens limit blast radius, but a long-lived refresh token sitting in a cookie is still a high-value target if it ever leaks.

## How Token Families Work

Every login creates a \`family_id\`. Each time the client refreshes, the server issues a new refresh token in the same family and marks the previous token as \`used\`.

### The Normal Path

1. Client sends refresh token \`T1\`.
2. Server verifies \`T1\` is active, marks \`T1\` used, and returns \`T2\`.
3. Subsequent refreshes use \`T2\`, never \`T1\`.

## Detecting Theft Automatically

If an attacker steals \`T1\` and tries to redeem it after the legitimate user already rotated to \`T2\`, the server sees a **used token presented again**.

\`\`\`ts
if (storedToken.usedAt !== null) {
  await db.refreshTokens.revokeFamily(storedToken.familyId);
  throw new UnauthorizedError('Token reuse detected — session revoked');
}
\`\`\`

> Rotation alone isn't enough; revoking the entire family on reuse is what actually closes the window.

## Edge Cases With Parallel Tabs

Two browser tabs can occasionally trigger \`/refresh\` at the exact same millisecond. A 5-second grace window on the immediate parent token prevents false-positive logouts while still catching real replay attacks.`,
  },
  {
    slug: 'why-http-only-samesite-cookies-beat-localstorage',
    date: '2026-11-15',
    title: 'Why HttpOnly + SameSite Cookies Beat localStorage for Session Tokens',
    summary:
      'Keeping auth tokens out of JavaScript reach protects against XSS exfiltration while SameSite=Lax neutralizes most cross-site request forgery vectors.',
    tags: ['Security', 'HTTP', 'Web'],
    coverImage:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=80',
    body: `Putting a JWT in \`localStorage\` is tempting because it takes two lines of frontend code. The tradeoff is that every third-party script or XSS bug on your origin can read it in one line.

## The XSS Exposure Problem

\`localStorage\` is synchronous, global, and readable by any JavaScript executing on the page. Once an attacker runs \`localStorage.getItem("token")\`, the session is gone silently.

## Hardening With Cookie Attributes

Setting the right cookie flags lets the browser handle transport automatically without exposing the secret to \`document.cookie\`:

\`\`\`http
Set-Cookie: sid=opaque_random_id; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
\`\`\`

### What Each Flag Guarantees

- **HttpOnly** — Blocks JavaScript access completely.
- **Secure** — Transmits only over HTTPS.
- **SameSite=Lax** — Stops cross-site \`POST\` requests from carrying the cookie automatically.

## Key Takeaway

Reserve \`localStorage\` for harmless UI preferences like theme mode or sidebar state — never for credentials.`,
  },
  {
    slug: 'writing-notes-to-think-clearly',
    date: '2026-11-12',
    title: 'Why Writing Short Notes Beats Bookmarking Articles',
    summary:
      'Bookmarks feel productive but rarely stick. Writing three paragraphs in your own words forces you to spot the gaps in your understanding immediately.',
    tags: ['Writing', 'Learning'],
    coverImage:
      'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=80',
    body: `I used to have four hundred browser bookmarks organized into neat folders I never opened again. Switching to short written notes changed how much I actually retained.

## The Illusion of Saving a Link

Clicking bookmark feels like learning, because you know where the answer lives. Six months later, you don't remember the mental model — only that a link exists somewhere.

![Open notebook and pen on a quiet desk](https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1400&q=80)

## The Ten-Minute Rule

Right after fixing a tricky bug or finishing a chapter, spend ten minutes writing down:

1. What surprised you.
2. The smallest working example.
3. The caveat you'd forget next month.

## Future You Is the Real Audience

You don't need to write comprehensive guides. Even a 200-word note written in plain language becomes a searchable record you'll thank yourself for later.`,
  },
  {
    slug: 'why-disable-x-powered-by-in-express',
    date: '2026-11-09',
    title: 'Why You Should Always Set app.disable("x-powered-by") in Express',
    summary:
      'Removing the default X-Powered-By header prevents passive framework fingerprinting and stops automated scanners from trivially identifying your Express stack.',
    tags: ['Express', 'Node.js', 'Security'],
    body: `By default, Express attaches \`X-Powered-By: Express\` to every outgoing HTTP response. It adds zero value to clients while handing recon scanners your exact framework.

## One Line at Startup

\`\`\`ts
import express from 'express';

const app = express();
app.disable('x-powered-by');
\`\`\`

## Verifying With curl

Run \`curl -I\` against any local endpoint before and after:

\`\`\`bash
curl -I http://localhost:4000/api/health
\`\`\`

## Pairing With Helmet

Even if you already use \`helmet()\`, keeping \`app.disable("x-powered-by")\` explicitly right under \`express()\` guarantees the header stays off if middleware order ever changes.`,
  },
  {
    slug: 'building-fast-keyboard-first-search-in-the-browser',
    date: '2026-11-05',
    title: 'Building Fast Keyboard-First Search Without a Backend',
    summary:
      'For personal sites with dozens or hundreds of Markdown posts, client-side filtering with keyboard navigation feels instant and removes an entire infrastructure layer.',
    tags: ['Frontend', 'Performance', 'UX'],
    coverImage:
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1400&q=80',
    body: `You rarely need a hosted search cluster for a personal blog. A few hundred kilobytes of text filters in under a millisecond right inside the browser.

## Why Instant Beats Fancy

When a reader presses \`⌘K\`, latency matters more than fuzzy scoring algorithms. Zero network round-trips means results update on the exact frame the key lands.

## Keyboard Navigation Essentials

A good command palette only needs four keys to feel native:

- \`⌘K\` / \`Ctrl+K\` to open or close from anywhere
- \`↑\` and \`↓\` to move selection without touching the mouse
- \`Enter\` to open the highlighted item
- \`Escape\` to dismiss cleanly

\`\`\`ts
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
  e.preventDefault();
  setOpen((prev) => !prev);
}
\`\`\`

## Keeping It Lean

Bundle only what you need, avoid heavy index serialization until you cross thousands of documents, and keep the input focused automatically on open.`,
  },
  {
    slug: 'choosing-calm-light-mode-colors-that-dont-hurt-your-eyes',
    date: '2026-11-01',
    title: 'Choosing Calm Light-Mode Colors That Don’t Hurt Your Eyes',
    summary:
      'Pure #FFFFFF backgrounds with pure #000000 text create harsh glare on modern OLED screens. Warm off-white grounds and soft charcoal ink make long reading effortless.',
    tags: ['Color', 'Design', 'CSS'],
    coverImage:
      'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1400&q=80',
    body: `Many developers default to dark mode purely because most light modes feel like staring into a flashlight. The fix isn't abandoning light mode — it's lowering luminance contrast slightly and warming the ground.

## Paper Instead of Pure White

Real books are never bright blue-white. Shifting the ground to a warm matte linen (\`#f5f3ee\`) with soft graphite ink (\`#1c1b18\`) keeps contrast above 13:1 while eliminating screen halation.

## Matching Code Blocks to the Ground

A pitch-black code block dropped onto soft cream paper punches a visual hole in the page. Toning light-mode code blocks into a warm stone surface (\`#ece8df\`) keeps reading rhythm uninterrupted.

### Smooth Theme Crossfades

Applying a temporary transition class on \`<html>\` during a theme toggle lets surfaces, hairlines, and text crossfade cleanly without adding permanent transition overhead during scroll.`,
  },
  {
    slug: 'git-worktrees-for-parallel-feature-branches',
    date: '2026-10-27',
    title: 'Using Git Worktrees Instead of Stashing Half-Finished Work',
    summary:
      'Git worktrees let you check out multiple branches into separate folders sharing one repository, making urgent bugfixes and PR reviews completely frictionless.',
    tags: ['Git', 'Workflow', 'CLI'],
    body: `Every time you run \`git stash\`, switch branches, fix a bug, and \`git stash pop\`, you risk losing context or breaking your local dev server.

## Creating a Second Working Directory

\`\`\`bash
git worktree add ../blogs-hotfix -b fix/routing main
\`\`\`

Now \`../blogs-hotfix\` has its own clean checkout, its own \`node_modules\`, and zero interference with your current work.

## Cleaning Up When Done

\`\`\`bash
git worktree remove ../blogs-hotfix
\`\`\`

Once you get used to worktrees, \`git stash\` almost disappears from your daily workflow.`,
  },
  {
    slug: 'zero-backend-publishing-with-github-pages',
    date: '2026-10-22',
    title: 'Zero-Backend Personal Publishing With Markdown and GitHub Pages',
    summary:
      'Storing posts as plain Markdown files in Git means you own every word forever, get automatic deploys via GitHub Actions, and never pay for a database or CMS.',
    tags: ['GitHub Pages', 'Markdown', 'Static Sites'],
    coverImage:
      'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1400&q=80',
    body: `Platforms come and go, export formats break, and monthly hosting bills creep up. Plain Markdown files in a Git repository outlive every CMS.

## Why Plain Files Win

- Every post is readable in any text editor twenty years from now.
- Git history acts as free version control and backup.
- Static builds serve globally in milliseconds with zero server maintenance.

## Clean URLs on Static Hosting

Single-page apps on GitHub Pages can avoid ugly \`/#/\` hashes by copying \`dist/index.html\` to \`dist/404.html\` during the build so direct links to \`/blogs/post/slug\` or \`/blogs/admin\` boot the router seamlessly.

\`\`\`json
{
  "scripts": {
    "build": "tsc -b && vite build && cp dist/index.html dist/404.html"
  }
}
\`\`\`

## Own Your Archive

When your writing lives in plain files you control, redesigning the frontend takes an afternoon and never requires migrating a single database row.`,
  },
];

export function getDevSeedPosts(): Post[] {
  return RAW_SEEDS.map((seed) => ({
    slug: seed.slug,
    filename: `${seed.date}-${seed.slug}.md`,
    title: seed.title,
    date: seed.date,
    project: 'General',
    tags: seed.tags,
    summary: seed.summary,
    coverImage: seed.coverImage,
    featured: false,
    body: seed.body,
    readingTimeMinutes: estimateReadingTime(seed.body),
    source: 'repo',
    repoPath: `content/posts/${seed.date}-${seed.slug}.md`,
  }));
}
