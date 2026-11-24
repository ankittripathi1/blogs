#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function slugify(str) {
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/['"`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'untitled-note'
  );
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const rl = readline.createInterface({ input, output });

try {
  console.log('\n✦ Daylog — New Post\n');
  const title = (await rl.question('#TITLE: ')).trim();
  if (!title) {
    console.error('Title is required.');
    process.exit(1);
  }
  const description = (await rl.question('#DESCRIPTION: ')).trim() || title;
  const project = (await rl.question('#PROJECT (optional, e.g. UMS): ')).trim();
  const tags = (await rl.question('#TAGS (optional, comma-separated): ')).trim();

  const date = todayIso();
  const slug = slugify(title);
  const filename = `${date}-${slug}.md`;
  const postsDir = path.resolve(process.cwd(), 'content/posts');
  fs.mkdirSync(postsDir, { recursive: true });
  const targetPath = path.join(postsDir, filename);

  const lines = [
    `#TITLE: ${title}`,
    `#DESCRIPTION: ${description}`,
    ...(project ? [`#PROJECT: ${project}`] : []),
    `#DATE: ${date}`,
    ...(tags ? [`#TAGS: ${tags}`] : []),
    '',
    'Write what you learned today here...',
    '',
  ];

  fs.writeFileSync(targetPath, lines.join('\n'), 'utf8');
  console.log(`\n✓ Created ${path.relative(process.cwd(), targetPath)}\n`);
} finally {
  rl.close();
}
