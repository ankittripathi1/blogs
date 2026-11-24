import { useEffect, useMemo, useRef } from 'react';
import { renderMarkdownToHtml } from '../lib/markdown';

interface MarkdownRendererProps {
  markdown: string;
  imagePreviewMap?: Record<string, string>;
  className?: string;
}

export function MarkdownRenderer({
  markdown,
  imagePreviewMap,
  className = '',
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => renderMarkdownToHtml(markdown, imagePreviewMap),
    [markdown, imagePreviewMap],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('[data-copy-code]');
      if (!button) return;

      const encoded = button.getAttribute('data-copy-code') ?? '';
      const rawCode = decodeURIComponent(encoded);
      try {
        await navigator.clipboard.writeText(rawCode);
        const original = button.textContent;
        button.textContent = 'Copied';
        button.setAttribute('data-copied', 'true');
        window.setTimeout(() => {
          button.textContent = original || 'Copy';
          button.removeAttribute('data-copied');
        }, 1600);
      } catch {
        button.textContent = 'Failed';
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`prose-til ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
