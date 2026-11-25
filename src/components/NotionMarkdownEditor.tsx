import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import {
  Bold,
  CheckSquare,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table,
  type LucideIcon,
} from 'lucide-react';

interface NotionMarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  onPasteImage: (file: File) => void;
  onDropImage: (file: File) => void;
  onRequestImageUpload: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
}

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  badge: string;
  icon: LucideIcon;
  action: 'insert' | 'image';
  prefix?: string;
  snippet?: string;
  cursorOffset?: number;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large section heading',
    keywords: ['h1', 'heading', 'title', '#'],
    badge: '#',
    icon: Heading1,
    action: 'insert',
    prefix: '# ',
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Main section (appears in post index)',
    keywords: ['h2', 'heading', 'section', '##'],
    badge: '##',
    icon: Heading2,
    action: 'insert',
    prefix: '## ',
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Sub-section heading',
    keywords: ['h3', 'heading', 'sub', '###'],
    badge: '###',
    icon: Heading3,
    action: 'insert',
    prefix: '### ',
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    description: 'Simple bullet list',
    keywords: ['ul', 'bullet', 'list', '-'],
    badge: '-',
    icon: List,
    action: 'insert',
    prefix: '- ',
  },
  {
    id: 'numbered',
    label: 'Numbered list',
    description: 'Ordered step list',
    keywords: ['ol', 'number', 'ordered', 'list', '1.'],
    badge: '1.',
    icon: ListOrdered,
    action: 'insert',
    prefix: '1. ',
  },
  {
    id: 'checklist',
    label: 'To-do list',
    description: 'Markdown task checkbox',
    keywords: ['todo', 'check', 'task', 'checkbox'],
    badge: '[ ]',
    icon: CheckSquare,
    action: 'insert',
    prefix: '- [ ] ',
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Callout or blockquote',
    keywords: ['quote', 'blockquote', 'callout', '>'],
    badge: '>',
    icon: Quote,
    action: 'insert',
    prefix: '> ',
  },
  {
    id: 'codeblock',
    label: 'Code block',
    description: 'Syntax-highlighted code snippet',
    keywords: ['code', 'snippet', 'ts', 'js', 'pre', '```'],
    badge: '```',
    icon: Code2,
    action: 'insert',
    snippet: '```ts\n\n```',
    cursorOffset: 6,
  },
  {
    id: 'inline-code',
    label: 'Inline code',
    description: 'Monospace code span',
    keywords: ['inline', 'code', 'mono', '`'],
    badge: '` `',
    icon: Code,
    action: 'insert',
    snippet: '``',
    cursorOffset: 1,
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload or insert an image',
    keywords: ['image', 'img', 'photo', 'picture', 'upload'],
    badge: 'img',
    icon: ImagePlus,
    action: 'image',
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Two-column Markdown table',
    keywords: ['table', 'grid', 'columns'],
    badge: '| |',
    icon: Table,
    action: 'insert',
    snippet: '| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |',
    cursorOffset: 2,
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal section rule',
    keywords: ['divider', 'hr', 'line', 'rule', '---'],
    badge: '---',
    icon: Minus,
    action: 'insert',
    snippet: '---\n\n',
    cursorOffset: 5,
  },
];

// Measure pixel coordinates of a character index inside a textarea relative to the textarea's top-left.
function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number; lineHeight: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const props = [
    'direction',
    'boxSizing',
    'width',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
  ] as const;

  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  for (const prop of props) {
    mirror.style[prop] = style[prop];
  }

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(position, position + 1) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 26;
  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;

  document.body.removeChild(mirror);
  return { top, left, lineHeight };
}

export function NotionMarkdownEditor({
  value,
  onChange,
  onPasteImage,
  onDropImage,
  onRequestImageUpload,
  textareaRef: externalRef,
  placeholder = "Type '/' for commands, or start writing...",
}: NotionMarkdownEditorProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Slash command menu state
  const [slashMenu, setSlashMenu] = useState<{
    open: boolean;
    query: string;
    triggerStart: number;
    top: number;
    left: number;
  }>({
    open: false,
    query: '',
    triggerStart: 0,
    top: 0,
    left: 0,
  });
  const [slashIndex, setSlashIndex] = useState(0);

  // Selection floating formatting toolbar state
  const [bubble, setBubble] = useState<{
    open: boolean;
    top: number;
    left: number;
  }>({
    open: false,
    top: 0,
    left: 0,
  });

  const filteredCommands = useMemo(() => {
    const q = slashMenu.query.trim().toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.keywords.some((k) => k.includes(q)),
    );
  }, [slashMenu.query]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashMenu.query, slashMenu.open]);

  const setValueAndSelection = useCallback(
    (nextValue: string, selStart: number, selEnd = selStart) => {
      onChange(nextValue);
      window.requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(selStart, selEnd);
      });
    },
    [onChange, textareaRef],
  );

  // Wrap or unwrap selected text with Markdown delimiters (e.g. **, *, `, ~~)
  const toggleInlineFormat = useCallback(
    (before: string, after = before, placeholderText = '') => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);

      // If already wrapped right outside selection, unwrap cleanly
      const pre = value.slice(Math.max(0, start - before.length), start);
      const post = value.slice(end, end + after.length);
      if (pre === before && post === after) {
        const next =
          value.slice(0, start - before.length) +
          selected +
          value.slice(end + after.length);
        setValueAndSelection(next, start - before.length, end - before.length);
        setBubble((prev) => ({ ...prev, open: false }));
        return;
      }

      // If selection itself starts/ends with markers, unwrap
      if (
        selected.length >= before.length + after.length &&
        selected.startsWith(before) &&
        selected.endsWith(after)
      ) {
        const inner = selected.slice(before.length, selected.length - after.length);
        const next = value.slice(0, start) + inner + value.slice(end);
        setValueAndSelection(next, start, start + inner.length);
        setBubble((prev) => ({ ...prev, open: false }));
        return;
      }

      const content = selected || placeholderText;
      const next = value.slice(0, start) + before + content + after + value.slice(end);
      setValueAndSelection(
        next,
        start + before.length,
        start + before.length + content.length,
      );
      setBubble((prev) => ({ ...prev, open: false }));
    },
    [value, setValueAndSelection, textareaRef],
  );

  const insertLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || 'link text';
    const url = 'https://';
    const inserted = `[${selected}](${url})`;
    const next = value.slice(0, start) + inserted + value.slice(end);
    const urlStart = start + selected.length + 3;
    setValueAndSelection(next, urlStart, urlStart + url.length);
    setBubble((prev) => ({ ...prev, open: false }));
  }, [value, setValueAndSelection, textareaRef]);

  const prefixSelectedLines = useCallback(
    (prefix: string) => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEndIdx = value.indexOf('\n', end);
      const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      const block = value.slice(lineStart, lineEnd);
      const lines = block.split('\n');
      const allPrefixed = lines.every((l) => l.startsWith(prefix));
      const updated = lines
        .map((l) => (allPrefixed ? l.slice(prefix.length) : `${prefix}${l}`))
        .join('\n');
      const next = value.slice(0, lineStart) + updated + value.slice(lineEnd);
      setValueAndSelection(next, lineStart, lineStart + updated.length);
      setBubble((prev) => ({ ...prev, open: false }));
    },
    [value, setValueAndSelection, textareaRef],
  );

  // Detect `/` slash command trigger at caret
  const updateSlashState = useCallback(
    (text: string, caret: number) => {
      const el = textareaRef.current;
      if (!el) return;

      const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
      const lineBeforeCaret = text.slice(lineStart, caret);
      const match = lineBeforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9-]*)$/);

      if (!match) {
        setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
        return;
      }

      const query = match[1];
      const triggerStart = caret - query.length - 1;
      const coords = getCaretCoordinates(el, caret);
      const menuWidth = 264;
      const maxLeft = Math.max(8, el.clientWidth - menuWidth - 8);

      setSlashMenu({
        open: true,
        query,
        triggerStart,
        top: Math.max(8, coords.top + coords.lineHeight + 6),
        left: Math.min(Math.max(8, coords.left), maxLeft),
      });
    },
    [textareaRef],
  );

  // Detect text selection for floating formatting bubble
  const updateSelectionBubble = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    if (end - start <= 0) {
      setBubble((prev) => (prev.open ? { ...prev, open: false } : prev));
      return;
    }

    const coords = getCaretCoordinates(el, start);
    const bubbleWidth = 236;
    const maxLeft = Math.max(8, el.clientWidth - bubbleWidth - 8);
    setBubble({
      open: true,
      top: Math.max(4, coords.top - 46),
      left: Math.min(Math.max(8, coords.left), maxLeft),
    });
  }, [textareaRef]);

  const executeSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = el.selectionStart;
      const beforeTrigger = value.slice(0, slashMenu.triggerStart);
      const afterCaret = value.slice(caret);

      setSlashMenu((prev) => ({ ...prev, open: false }));

      if (cmd.action === 'image') {
        const cleaned = beforeTrigger + afterCaret;
        setValueAndSelection(cleaned, beforeTrigger.length);
        onRequestImageUpload();
        return;
      }

      if (cmd.prefix) {
        const next = beforeTrigger + cmd.prefix + afterCaret;
        setValueAndSelection(next, beforeTrigger.length + cmd.prefix.length);
        return;
      }

      if (cmd.snippet) {
        const next = beforeTrigger + cmd.snippet + afterCaret;
        const offset = cmd.cursorOffset ?? cmd.snippet.length;
        setValueAndSelection(next, beforeTrigger.length + offset);
      }
    },
    [value, slashMenu.triggerStart, setValueAndSelection, onRequestImageUpload, textareaRef],
  );

  // Close popovers when clicking outside
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
        setBubble((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    // 1. Slash command navigation
    if (slashMenu.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) =>
          filteredCommands.length > 0 ? (i + 1) % filteredCommands.length : 0,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) =>
          filteredCommands.length > 0
            ? (i - 1 + filteredCommands.length) % filteredCommands.length
            : 0,
        );
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filteredCommands[slashIndex]) {
        e.preventDefault();
        executeSlashCommand(filteredCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu((prev) => ({ ...prev, open: false }));
        return;
      }
    }

    // 2. Tab & Shift+Tab (indent / outdent single line or multi-line selection)
    if (e.key === 'Tab') {
      e.preventDefault();
      const indent = '  ';
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const hasMultiLineSelection = start !== end && value.slice(start, end).includes('\n');

      if (e.shiftKey) {
        const lineEndIdx = value.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');

        let removedFirst = 0;
        let removedTotal = 0;
        const outdented = lines
          .map((line, idx) => {
            if (line.startsWith('  ')) {
              if (idx === 0) removedFirst = 2;
              removedTotal += 2;
              return line.slice(2);
            }
            if (line.startsWith('\t') || line.startsWith(' ')) {
              if (idx === 0) removedFirst = 1;
              removedTotal += 1;
              return line.slice(1);
            }
            return line;
          })
          .join('\n');

        if (removedTotal === 0) return;

        const next = value.slice(0, lineStart) + outdented + value.slice(lineEnd);
        const nextStart = Math.max(lineStart, start - removedFirst);
        const nextEnd = Math.max(nextStart, end - removedTotal);
        setValueAndSelection(next, nextStart, nextEnd);
        return;
      }

      if (hasMultiLineSelection) {
        const lineEndIdx = value.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const indented = lines.map((line) => `${indent}${line}`).join('\n');
        const next = value.slice(0, lineStart) + indented + value.slice(lineEnd);
        setValueAndSelection(next, start + indent.length, end + indent.length * lines.length);
        return;
      }

      // Single caret or single-line selection: insert 2 spaces at caret (or indent list item cleanly)
      const currentLine = value.slice(lineStart, start);
      if (/^\s*([-*+]|\d+\.)\s+$/.test(currentLine) && start === end) {
        const next = value.slice(0, lineStart) + indent + value.slice(lineStart);
        setValueAndSelection(next, start + indent.length);
        return;
      }

      const next = value.slice(0, start) + indent + value.slice(end);
      setValueAndSelection(next, start + indent.length);
      return;
    }

    // 3. Smart Enter: continue bullet, numbered, checklist, or quote lines
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && start === end) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const line = value.slice(lineStart, start);

      // Checklist: `- [ ] item` or `- [x] item`
      const checkMatch = line.match(/^(\s*-\s+\[[ xX]\]\s+)(.*)$/);
      if (checkMatch) {
        e.preventDefault();
        if (!checkMatch[2].trim()) {
          // Exit empty checklist item
          const next = value.slice(0, lineStart) + value.slice(start);
          setValueAndSelection(next, lineStart);
        } else {
          const prefix = checkMatch[1].replace(/\[[xX]\]/, '[ ]');
          const next = value.slice(0, start) + '\n' + prefix + value.slice(end);
          setValueAndSelection(next, start + 1 + prefix.length);
        }
        return;
      }

      // Bullet list: `- item` or `* item`
      const bulletMatch = line.match(/^(\s*[-*]\s+)(.*)$/);
      if (bulletMatch) {
        e.preventDefault();
        if (!bulletMatch[2].trim()) {
          const next = value.slice(0, lineStart) + value.slice(start);
          setValueAndSelection(next, lineStart);
        } else {
          const next = value.slice(0, start) + '\n' + bulletMatch[1] + value.slice(end);
          setValueAndSelection(next, start + 1 + bulletMatch[1].length);
        }
        return;
      }

      // Numbered list: `1. item`
      const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
      if (numMatch) {
        e.preventDefault();
        if (!numMatch[3].trim()) {
          const next = value.slice(0, lineStart) + value.slice(start);
          setValueAndSelection(next, lineStart);
        } else {
          const nextNum = `${numMatch[1]}${Number(numMatch[2]) + 1}. `;
          const next = value.slice(0, start) + '\n' + nextNum + value.slice(end);
          setValueAndSelection(next, start + 1 + nextNum.length);
        }
        return;
      }

      // Blockquote: `> text`
      const quoteMatch = line.match(/^(\s*>\s+)(.*)$/);
      if (quoteMatch) {
        e.preventDefault();
        if (!quoteMatch[2].trim()) {
          const next = value.slice(0, lineStart) + value.slice(start);
          setValueAndSelection(next, lineStart);
        } else {
          const next = value.slice(0, start) + '\n' + quoteMatch[1] + value.slice(end);
          setValueAndSelection(next, start + 1 + quoteMatch[1].length);
        }
        return;
      }
    }

    // 4. Keyboard formatting shortcuts (Cmd/Ctrl + B, I, E, K, Shift+S)
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        toggleInlineFormat('**', '**', 'bold text');
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        toggleInlineFormat('*', '*', 'italic text');
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        toggleInlineFormat('`', '`', 'code');
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        insertLink();
        return;
      }
      if (e.shiftKey && key === 's') {
        e.preventDefault();
        toggleInlineFormat('~~', '~~', 'strikethrough');
        return;
      }
    }

    // 5. Smart wrap when text is selected and user types `, *, ~, ", (, [
    if (start !== end && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const pairMap: Record<string, [string, string]> = {
        '`': ['`', '`'],
        '*': ['*', '*'],
        '~': ['~~', '~~'],
        '"': ['"', '"'],
        '(': ['(', ')'],
        '[': ['[', ']'],
      };
      const pair = pairMap[e.key];
      if (pair) {
        e.preventDefault();
        toggleInlineFormat(pair[0], pair[1]);
      }
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    onPasteImage(file);
  };

  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) {
      onDropImage(file);
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex flex-1 flex-col">
      {/* Floating Notion-style Selection Bubble Toolbar */}
      <div
        role="toolbar"
        aria-label="Text formatting"
        style={{
          transform: `translate3d(${bubble.left}px, ${bubble.top}px, 0)`,
        }}
        className={`toast-surface absolute left-0 top-0 z-30 flex items-center gap-0.5 rounded-[10px] border border-rule-strong bg-card p-1 ${
          bubble.open && !slashMenu.open
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
      >
        {[
          { label: 'Bold (⌘B)', icon: Bold, onClick: () => toggleInlineFormat('**') },
          { label: 'Italic (⌘I)', icon: Italic, onClick: () => toggleInlineFormat('*') },
          { label: 'Inline code (⌘E)', icon: Code, onClick: () => toggleInlineFormat('`') },
          {
            label: 'Strikethrough (⌘⇧S)',
            icon: Strikethrough,
            onClick: () => toggleInlineFormat('~~'),
          },
          { label: 'Quote', icon: Quote, onClick: () => prefixSelectedLines('> ') },
          { label: 'Link (⌘K)', icon: Link2, onClick: insertLink },
        ].map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onClick();
            }}
            aria-label={label}
            title={label}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-2 transition-colors hover:bg-surface hover:text-ink cursor-pointer"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* Notion-style `/` Slash Command Menu */}
      <div
        role="listbox"
        aria-label="Insert block"
        style={{
          transform: `translate3d(${slashMenu.left}px, ${slashMenu.top}px, 0)`,
        }}
        className={`toast-surface absolute left-0 top-0 z-30 w-[264px] overflow-hidden rounded-[12px] border border-rule-strong bg-card ${
          slashMenu.open
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="border-b border-rule px-3 py-2 font-mono text-[11px] text-ink-3">
          {slashMenu.query ? `Blocks matching "/${slashMenu.query}"` : 'Insert block'}
        </div>
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filteredCommands.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-ink-2">No matching command</p>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const active = idx === slashIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setSlashIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    executeSlashCommand(cmd);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors duration-150 cursor-pointer ${
                    active ? 'bg-surface text-ink' : 'text-ink-2 hover:bg-surface/60'
                  }`}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-rule bg-paper text-ink">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">
                      {cmd.label}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-2">
                      {cmd.description}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">
                    {cmd.badge}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Writing Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateSlashState(e.target.value, e.target.selectionStart);
          setBubble((prev) => (prev.open ? { ...prev, open: false } : prev));
        }}
        onKeyDown={handleKeyDown}
        onSelect={updateSelectionBubble}
        onClick={(e) => {
          updateSlashState(e.currentTarget.value, e.currentTarget.selectionStart);
          updateSelectionBubble();
        }}
        onPaste={handlePaste}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDrop}
        spellCheck
        placeholder={placeholder}
        aria-label="Entry body"
        className={`min-h-[460px] w-full flex-1 resize-none bg-transparent text-[15.5px] leading-[1.82] text-ink-body placeholder:text-ink-3 focus:outline-none ${
          isDraggingFile ? 'rounded-[8px] bg-surface p-3 ring-2 ring-accent' : ''
        }`}
      />

      {/* Subtle shortcut hint footer */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-3 font-mono text-[11.5px] text-ink-3">
        <span>/ commands</span>
        <span>⌘B bold</span>
        <span>⌘I italic</span>
        <span>⌘E code</span>
        <span>⌘K link</span>
        <span>Tab / ⇧Tab indent</span>
      </div>
    </div>
  );
}
