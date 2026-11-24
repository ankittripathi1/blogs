# Daylog design

A calm, minimalist personal writing space built with an asymmetrical editorial split, `Geist` + `Geist Mono` typography (from `design-taste-frontend`), dark obsidian and low-glare warm linen themes, gliding hover interactions, and smooth page transitions.

## Themes

### Dark (default)
- Ground `#0a0a0b`: deep obsidian.
- Surface `#141416`, Card `#18181b`: subtle elevated layers.
- Ink `#f3f1ec`, Body `#d4d1c9`, Muted `#8e8b83`: warm alabaster hierarchy.
- Accent `#e0633c`: muted vermilion for focus rings, reading progress, and drafts.

### Light (low-glare, eye-friendly)
- Ground `#f5f3ee`: warm matte silk paper (never harsh white).
- Surface `#eae6dd`, Card `#fbfaf7`: gentle stone elevation.
- Ink `#1c1b18`, Body `#33312c`, Muted `#6a665d`: soft graphite hierarchy.
- Accent `#b84b27`: warm terracotta.

## Type

- Geist: clean, precise neo-grotesk for headings, blog posts, and controls.
- Geist Mono: dates, code blocks, inline code, and raw Markdown.

## Motion

- Custom cubic-bezier curves (`--ease-smooth`, `--ease-tactile`, `--ease-silk`, `--ease-press`) drive route page transitions, gliding blog row highlights, sibling focus dimming, modal open/close transitions, and theme crossfades, with full `prefers-reduced-motion` support.

Tokens live in `src/styles/index.css`.
