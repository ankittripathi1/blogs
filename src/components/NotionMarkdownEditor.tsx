import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Compartment, Prec } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder as placeholderExt,
} from '@codemirror/view';
import { getCM, vim, Vim } from '@replit/codemirror-vim';
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
import { indentLines, insertLink, replaceRange, togglePrefix, toggleWrap } from './editor/commands';
import { livePreview, refreshImages } from './editor/livePreview';
import { vimSurround } from './editor/vimSurround';

/** Imperative handle the editor page uses for toolbar buttons and image uploads. */
export interface MarkdownEditorHandle {
  /** Replaces the selection with `text` and focuses the editor. */
  insert: (text: string) => void;
  focus: () => void;
}

interface NotionMarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  onPasteImage: (file: File) => void;
  onDropImage: (file: File) => void;
  onRequestImageUpload: () => void;
  /** Vim keys on or off. The page owns the switch so it can sit in the toolbar. */
  vimEnabled: boolean;
  /** Called by Vim's `:w`. */
  onSave?: () => void;
  /** Uploaded image paths mapped to local preview URLs, so new images show before deploy. */
  imagePreviewMap?: Record<string, string>;
  ref?: Ref<MarkdownEditorHandle>;
  placeholder?: string;
}

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  badge: string;
  icon: LucideIcon;
  /** Text that replaces the "/query". Omitted for the image command. */
  snippet?: string;
  /** Caret position inside `snippet`. Defaults to the end. */
  caret?: number;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', label: 'Heading 1', description: 'Large section heading', keywords: ['h1', 'heading', 'title'], badge: '#', icon: Heading1, snippet: '# ' },
  { id: 'h2', label: 'Heading 2', description: 'Section, shows in the post index', keywords: ['h2', 'heading', 'section'], badge: '##', icon: Heading2, snippet: '## ' },
  { id: 'h3', label: 'Heading 3', description: 'Sub-section heading', keywords: ['h3', 'heading', 'sub'], badge: '###', icon: Heading3, snippet: '### ' },
  { id: 'bullet', label: 'Bulleted list', description: 'Simple bullet list', keywords: ['ul', 'bullet', 'list'], badge: '-', icon: List, snippet: '- ' },
  { id: 'numbered', label: 'Numbered list', description: 'Ordered step list', keywords: ['ol', 'number', 'ordered', 'list'], badge: '1.', icon: ListOrdered, snippet: '1. ' },
  { id: 'todo', label: 'To-do list', description: 'Checkbox you can tick', keywords: ['todo', 'check', 'task', 'checkbox'], badge: '[ ]', icon: CheckSquare, snippet: '- [ ] ' },
  { id: 'quote', label: 'Quote', description: 'Callout or blockquote', keywords: ['quote', 'blockquote', 'callout'], badge: '>', icon: Quote, snippet: '> ' },
  { id: 'code', label: 'Code block', description: 'Highlighted code snippet', keywords: ['code', 'snippet', 'pre', 'fence'], badge: '```', icon: Code2, snippet: '```ts\n\n```', caret: 6 },
  { id: 'inline', label: 'Inline code', description: 'Monospace code span', keywords: ['inline', 'code', 'mono'], badge: '` `', icon: Code, snippet: '``', caret: 1 },
  { id: 'image', label: 'Image', description: 'Upload or insert an image', keywords: ['image', 'img', 'photo', 'picture', 'upload'], badge: 'img', icon: ImagePlus },
  { id: 'table', label: 'Table', description: 'Two-column table', keywords: ['table', 'grid', 'columns'], badge: '| |', icon: Table, snippet: '| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |', caret: 2 },
  { id: 'divider', label: 'Divider', description: 'Horizontal rule', keywords: ['divider', 'hr', 'line', 'rule'], badge: '---', icon: Minus, snippet: '---\n' },
];

const MENU_WIDTH = 288;
const MENU_MAX_HEIGHT = 320;

function inVimNormalMode(view: EditorView) {
  const state = getCM(view)?.state.vim;
  return Boolean(state && !state.insertMode);
}

interface MenuState {
  open: boolean;
  query: string;
  /** Position of the "/" that opened the menu. */
  from: number;
  top: number;
  left: number;
  above: boolean;
}

const CLOSED_MENU: MenuState = { open: false, query: '', from: 0, top: 0, left: 0, above: false };

// `:w` saves the post. Vim ex commands are global, so it calls whichever editor set it last.
let saveFromVim: (() => void) | undefined;
Vim.defineEx('write', 'w', () => saveFromVim?.());
// `:wq` and `:x` also just save: there is nothing to quit in a browser tab.
Vim.defineEx('wq', 'wq', () => saveFromVim?.());
Vim.defineEx('xit', 'x', () => saveFromVim?.());

/**
 * Markdown editor with live preview, `/` commands, a selection toolbar and an optional Vim mode.
 * The value stays plain Markdown, so posts keep the same file format.
 */
export function NotionMarkdownEditor({
  value,
  onChange,
  onPasteImage,
  onDropImage,
  onRequestImageUpload,
  onSave,
  vimEnabled,
  imagePreviewMap,
  ref,
  placeholder = "Type '/' for commands, or just start writing...",
}: NotionMarkdownEditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const vimCompartment = useRef(new Compartment()).current;

  const [menu, setMenu] = useState<MenuState>(CLOSED_MENU);
  const [menuIndex, setMenuIndex] = useState(0);
  const [bubble, setBubble] = useState({ open: false, top: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  const filtered = useMemo(() => {
    const q = menu.query.toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.startsWith(q)),
    );
  }, [menu.query]);

  // CodeMirror keymaps are created once, so they read the latest values through this ref.
  const live = useRef({ menu, menuIndex, filtered, onChange, onPasteImage, onDropImage, onRequestImageUpload, onSave });
  live.current = { menu, menuIndex, filtered, onChange, onPasteImage, onDropImage, onRequestImageUpload, onSave };
  saveFromVim = onSave;

  // Image paths in the doc -> URLs. Read through a ref so the editor never needs rebuilding.
  const imageMap = useRef(imagePreviewMap);
  imageMap.current = imagePreviewMap;
  useEffect(() => {
    viewRef.current?.dispatch({ effects: refreshImages.of(null) });
  }, [imagePreviewMap]);

  // The "/" stays closed after Esc until the user types again.
  const dismissed = useRef(false);

  useEffect(() => setMenuIndex(0), [menu.query, menu.open]);

  const runCommand = (cmd: SlashCommand) => {
    const view = viewRef.current;
    if (!view) return;
    const { from } = live.current.menu;
    const to = view.state.selection.main.head;
    setMenu(CLOSED_MENU);
    if (!cmd.snippet) {
      replaceRange(view, from, to, '');
      live.current.onRequestImageUpload();
      return;
    }
    replaceRange(view, from, to, cmd.snippet, cmd.caret);
  };
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  // Create the CodeMirror view once.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const wrapper = wrapperRef.current;
    if (!host || !wrapper) return;

    const updateMenu = (view: EditorView, docChanged: boolean) => {
      if (docChanged) dismissed.current = false;
      const sel = view.state.selection.main;
      const lineObj = view.state.doc.lineAt(sel.head);
      const before = view.state.sliceDoc(lineObj.from, sel.head);
      const match = sel.empty && !dismissed.current && !inVimNormalMode(view)
        ? before.match(/(?:^|\s)\/([a-zA-Z0-9-]*)$/)
        : null;
      if (!match) {
        setMenu((m) => (m.open ? CLOSED_MENU : m));
        return;
      }
      const coords = view.coordsAtPos(sel.head);
      if (!coords) return;
      const box = wrapper.getBoundingClientRect();
      const above = coords.bottom + MENU_MAX_HEIGHT + 16 > window.innerHeight && coords.top > MENU_MAX_HEIGHT + 16;
      setMenu({
        open: true,
        query: match[1],
        from: sel.head - match[1].length - 1,
        top: above ? coords.top - box.top - 6 : coords.bottom - box.top + 6,
        left: Math.min(Math.max(0, coords.left - box.left - 4), Math.max(0, box.width - MENU_WIDTH)),
        above,
      });
    };

    const updateBubble = (view: EditorView) => {
      const sel = view.state.selection.main;
      if (sel.empty || !view.hasFocus) {
        setBubble((b) => (b.open ? { ...b, open: false } : b));
        return;
      }
      const start = view.coordsAtPos(sel.from);
      if (!start) return;
      const box = wrapper.getBoundingClientRect();
      setBubble({
        open: true,
        top: start.top - box.top - 44,
        left: Math.min(Math.max(0, start.left - box.left), Math.max(0, box.width - 236)),
      });
    };

    // Moves the active row in the / menu. Returns false when the menu is closed so the key
    // keeps its normal meaning.
    const moveMenu = (step: 1 | -1) => () => {
      const { menu: m, filtered: f } = live.current;
      if (!m.open || !f.length) return false;
      setMenuIndex((i) => (i + step + f.length) % f.length);
      return true;
    };

    const menuKeys = Prec.highest(
      keymap.of([
        { key: 'ArrowDown', run: moveMenu(1) },
        { key: 'ArrowUp', run: moveMenu(-1) },
        // Ctrl+N / Ctrl+P, like menus in Vim and the terminal. `mac` keeps it Ctrl, not Cmd.
        { key: 'Ctrl-n', mac: 'Ctrl-n', run: moveMenu(1) },
        { key: 'Ctrl-p', mac: 'Ctrl-p', run: moveMenu(-1) },
        ...['Enter', 'Tab'].map((key) => ({
          key,
          run: () => {
            const { menu: m, filtered: f, menuIndex: i } = live.current;
            if (!m.open || !f[i]) return false;
            runCommandRef.current(f[i]);
            return true;
          },
        })),
        {
          key: 'Escape',
          run: () => {
            if (!live.current.menu.open) return false;
            dismissed.current = true;
            setMenu(CLOSED_MENU);
            return true;
          },
        },
      ]),
    );

    const view = new EditorView({
      parent: host,
      doc: value,
      extensions: [
        menuKeys,
        vimCompartment.of(vimEnabled ? [vimSurround(), vim({ status: true })] : []),
        keymap.of([
          { key: 'Mod-b', run: (v) => toggleWrap(v, '**', '**', 'bold text') },
          { key: 'Mod-i', run: (v) => toggleWrap(v, '*', '*', 'italic text') },
          { key: 'Mod-e', run: (v) => toggleWrap(v, '`', '`', 'code') },
          { key: 'Mod-Shift-s', run: (v) => toggleWrap(v, '~~', '~~', 'strikethrough') },
          { key: 'Mod-k', run: insertLink },
          { key: 'Tab', run: (v) => indentLines(v, 1) },
          { key: 'Shift-Tab', run: (v) => indentLines(v, -1) },
        ]),
        history(),
        drawSelection(),
        // Code fence languages load on demand, only when a post uses them.
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        livePreview((src) => {
          const mapped = imageMap.current?.[src];
          if (mapped) return mapped;
          return src.startsWith('./') ? `${import.meta.env.BASE_URL}${src.slice(2)}` : src;
        }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        placeholderExt(placeholder),
        EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Entry body' }),
        // Typing a marker over selected text wraps it instead of replacing it.
        EditorView.inputHandler.of((v, from, to, text) => {
          const pairs: Record<string, [string, string]> = {
            '*': ['*', '*'], '_': ['_', '_'], '`': ['`', '`'], '~': ['~~', '~~'],
            '"': ['"', '"'], '(': ['(', ')'], '[': ['[', ']'],
          };
          if (from === to || !pairs[text] || v.state.selection.ranges.length > 1) return false;
          return toggleWrap(v, ...pairs[text]);
        }),
        EditorView.domEventHandlers({
          paste(e) {
            const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
            if (!file) return false;
            e.preventDefault();
            live.current.onPasteImage(file);
            return true;
          },
          drop(e) {
            setDragging(false);
            const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
            if (!file) return false;
            e.preventDefault();
            live.current.onDropImage(file);
            return true;
          },
          dragover(e) {
            if (e.dataTransfer?.types.includes('Files')) setDragging(true);
            return false;
          },
          dragleave() {
            setDragging(false);
            return false;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) live.current.onChange(u.state.doc.toString());
          if (u.docChanged || u.selectionSet || u.focusChanged) {
            updateMenu(u.view, u.docChanged);
            updateBubble(u.view);
          }
        }),
      ],
    });
    viewRef.current = view;

    // Vim mode changes (i, Esc) don't touch the doc or selection, so re-check the menu then.
    const cm = getCM(view);
    const onModeChange = () => updateMenu(view, false);
    cm?.on('vim-mode-change', onModeChange);

    return () => {
      cm?.off('vim-mode-change', onModeChange);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the editor in sync when the parent swaps in another post.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  // Turn Vim on or off without recreating the editor. Skips the first run: the editor was
  // just built with the right setting, and focusing it on page load would be surprising.
  const vimMounted = useRef(false);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!vimMounted.current) {
      vimMounted.current = true;
      return;
    }
    view.dispatch({
      effects: vimCompartment.reconfigure(vimEnabled ? [vimSurround(), vim({ status: true })] : []),
    });
    view.focus();
  }, [vimEnabled, vimCompartment]);

  useImperativeHandle(ref, () => ({
    insert(text) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      replaceRange(view, from, to, text);
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

  // Close the menu and bubble when clicking outside the editor.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setMenu((m) => (m.open ? CLOSED_MENU : m));
      setBubble((b) => (b.open ? { ...b, open: false } : b));
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Keep the active row visible while moving with the arrow keys.
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [highlight, setHighlight] = useState({ top: 0, height: 0 });
  useLayoutEffect(() => {
    const list = listRef.current;
    const item = itemRefs.current[menuIndex];
    if (!menu.open || !list || !item) return;
    setHighlight({ top: item.offsetTop, height: item.offsetHeight });
    const pad = 6;
    if (item.offsetTop < list.scrollTop + pad) {
      list.scrollTo({ top: item.offsetTop - pad, behavior: 'smooth' });
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight - pad) {
      list.scrollTo({ top: item.offsetTop + item.offsetHeight - list.clientHeight + pad, behavior: 'smooth' });
    }
  }, [menuIndex, menu.open, filtered]);

  // Reset scroll each time the menu opens.
  useLayoutEffect(() => {
    if (menu.open && listRef.current) listRef.current.scrollTop = 0;
  }, [menu.open]);

  const format = (fn: (v: EditorView) => void) => () => {
    const view = viewRef.current;
    if (view) fn(view);
  };

  const bubbleActions = [
    { label: 'Bold (⌘B)', icon: Bold, run: format((v) => toggleWrap(v, '**')) },
    { label: 'Italic (⌘I)', icon: Italic, run: format((v) => toggleWrap(v, '*')) },
    { label: 'Inline code (⌘E)', icon: Code, run: format((v) => toggleWrap(v, '`')) },
    { label: 'Strikethrough (⌘⇧S)', icon: Strikethrough, run: format((v) => toggleWrap(v, '~~')) },
    { label: 'Quote', icon: Quote, run: format((v) => togglePrefix(v, '> ')) },
    { label: 'Link (⌘K)', icon: Link2, run: format(insertLink) },
  ];

  return (
    <div ref={wrapperRef} className="relative flex flex-1 flex-col">
      {/* Selection toolbar */}
      <div
        className="pointer-events-none absolute left-0 top-0 z-30"
        style={{ top: bubble.top, left: bubble.left }}
      >
        <div
          role="toolbar"
          aria-label="Text formatting"
          data-open={bubble.open && !menu.open}
          className="popover-pop pointer-events-auto flex items-center gap-0.5 rounded-[10px] border border-rule-strong bg-card p-1"
        >
          {bubbleActions.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                run();
              }}
              aria-label={label}
              title={label}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* `/` command menu. The outer box jumps to the caret, the inner panel animates. */}
      <div
        className="pointer-events-none absolute z-30"
        style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
      >
        <div
          role="listbox"
          aria-label="Insert block"
          data-open={menu.open}
          data-above={menu.above}
          className={`popover-pop pointer-events-auto absolute left-0 w-full overflow-hidden rounded-[12px] border border-rule-strong bg-card ${
            menu.above ? 'bottom-0' : 'top-0'
          }`}
        >
          <div className="border-b border-rule px-3 py-2 font-mono text-[12px] text-ink-2">
            {menu.query ? `Blocks matching "${menu.query}"` : 'Insert block'}
          </div>
          <div
            ref={listRef}
            className="relative overflow-y-auto overscroll-contain p-1"
            style={{ maxHeight: MENU_MAX_HEIGHT - 36 }}
          >
            {filtered.length > 0 && (
              <span
                aria-hidden="true"
                className="menu-highlight"
                style={{ transform: `translate3d(0, ${highlight.top}px, 0)`, height: highlight.height }}
              />
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[13px] text-ink-2">No matching block</p>
            ) : (
              filtered.map((cmd, idx) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    ref={(node) => {
                      itemRefs.current[idx] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={idx === menuIndex}
                    onMouseMove={() => idx !== menuIndex && setMenuIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      runCommand(cmd);
                    }}
                    className="relative z-10 flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-rule bg-paper text-ink">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{cmd.label}</span>
                      <span className="block truncate text-[12.5px] text-ink-2">{cmd.description}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-ink-2">{cmd.badge}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div
        ref={hostRef}
        className={`md-editor flex flex-1 flex-col ${dragging ? 'md-editor-drop' : ''}`}
      />

      {/* Shortcut hints */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-3 font-mono text-[13px] text-ink-2">
        <span>/ blocks</span>
        <span># heading</span>
        <span>⌘B bold</span>
        <span>⌘I italic</span>
        <span>⌘K link</span>
        <span>Tab / ⇧Tab indent</span>
      </div>
    </div>
  );
}

