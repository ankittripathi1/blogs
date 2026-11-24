# Daylog — Today I Learned Blog + Admin Dashboard

A minimalist dark-editorial **Today I Learned (TIL)** blog with a **Public Blog** and a **GitHub-Authenticated Admin Dashboard**, designed to deploy directly on **GitHub Pages** with zero backend server.

## Two Sides

1. **Public Blog (`/#/`, `/#/post/:slug`)**
   - Clean reading-first blog with project filters (`UMS`, `Backend`, etc.), `⌘K` instant search, cover/inline images, and syntax-highlighted code blocks with copy buttons.
2. **Admin Dashboard (`/#/admin`)**
   - Sign in with a fine-grained GitHub Personal Access Token (`Contents: Read & Write` scoped only to this repo) — verified directly against GitHub's API.
   - Manage published posts & drafts (create, edit, delete), upload images (`public/images/`), drag/drop or `⌘V` paste screenshots right into your post, and publish directly to `main` (triggering automatic GitHub Pages deployment).

## Ultra-Simple Post Format

No bloated YAML required — just put `#TITLE:` and `#DESCRIPTION:` at the top of any `.md` file in `content/posts/`:

```markdown
#TITLE: Why You Should Always Set app.disable("x-powered-by") in Express
#DESCRIPTION: Removing X-Powered-By stops passive framework fingerprinting in UMS.
#PROJECT: UMS
#DATE: 2026-11-23
#TAGS: Express, Security
#SNIPPET: app.disable("x-powered-by");
#COVER: ./images/headers.png

Write your post in Markdown here...
```

Only `#TITLE:` and `#DESCRIPTION:` are needed — `#PROJECT:`, `#DATE:`, `#TAGS:`, `#SNIPPET:`, `#COVER:`, and `#FEATURED:` are all optional.

## Run Locally

```bash
npm install
npm run dev
```

Or scaffold a post via CLI:

```bash
npm run new
```

## Deploy to GitHub Pages

1. Push this repo to GitHub on `main`.
2. Go to **Repository Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Every commit (or publish from `/#/admin`) runs `.github/workflows/deploy.yml` and updates your live blog automatically.
