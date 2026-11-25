import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { StateEffect, type EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

// "Live preview" for Markdown, like Notion or Obsidian. The document stays plain Markdown,
// but `# Title` shows as a big heading, `**bold**` as bold, and so on. Markup is hidden
// until the caret enters that line (block syntax) or that span (inline syntax), so it can
// still be edited.

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-lp-bullet';
    el.textContent = '•';
    return el;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.checked;
    box.className = 'cm-lp-checkbox';
    box.setAttribute('aria-label', this.checked ? 'Mark as not done' : 'Mark as done');
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', () => {
      // `pos` is the "[" of "[ ]"; flip the character inside.
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-lp-hr';
    return el;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const img = document.createElement('img');
    img.className = 'cm-lp-image';
    // The image changes the line height once it loads, so ask the editor to re-measure.
    img.addEventListener('load', () => view.requestMeasure());
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    return img;
  }
}

/** Turns an image path from the doc into a URL the browser can load. */
export type ImageResolver = (src: string) => string;

/** Dispatch this when the image resolver starts returning new URLs (e.g. after an upload). */
export const refreshImages = StateEffect.define<null>();

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const line = (cls: string) => Decoration.line({ class: cls });

function touches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

function lineTouched(state: EditorState, pos: number) {
  const l = state.doc.lineAt(pos);
  return touches(state, l.from, l.to);
}

// Hide a mark plus one following space, e.g. "## " or "> ".
function hideWithSpace(state: EditorState, from: number, to: number, out: Range<Decoration>[]) {
  const end = state.sliceDoc(to, to + 1) === ' ' ? to + 1 : to;
  if (end > from) out.push(hidden.range(from, end));
}

function build(view: EditorView, resolveImage: ImageResolver): DecorationSet {
  const { state } = view;
  const out: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const name = node.name;

        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          const level = Math.min(3, Number(heading[1]));
          out.push(line(`cm-lp-h${level}`).range(state.doc.lineAt(node.from).from));
          if (!lineTouched(state, node.from)) {
            const mark = node.node.getChild('HeaderMark');
            if (mark && mark.from === node.from) hideWithSpace(state, mark.from, mark.to, out);
          }
          return;
        }

        switch (name) {
          case 'Emphasis':
          case 'StrongEmphasis':
          case 'Strikethrough':
          case 'InlineCode': {
            if (touches(state, node.from, node.to)) return;
            const markName =
              name === 'InlineCode' ? 'CodeMark' : name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark';
            for (const m of node.node.getChildren(markName)) out.push(hidden.range(m.from, m.to));
            return;
          }

          case 'Link': {
            if (touches(state, node.from, node.to)) return false;
            const marks = node.node.getChildren('LinkMark');
            // [text](url) has four marks; anything else (reference links) is left as is.
            if (marks.length === 4) {
              out.push(hidden.range(marks[0].from, marks[0].to));
              out.push(hidden.range(marks[1].from, node.to));
              out.push(Decoration.mark({ class: 'cm-lp-link' }).range(marks[0].to, marks[1].from));
            }
            return false;
          }

          case 'Image': {
            // Show the picture itself; the caret on the line brings back the Markdown.
            if (lineTouched(state, node.from)) return false;
            const url = node.node.getChild('URL');
            const marks = node.node.getChildren('LinkMark');
            if (!url || marks.length < 2) return false;
            const alt = state.sliceDoc(marks[0].to, marks[1].from);
            const src = resolveImage(state.sliceDoc(url.from, url.to));
            out.push(Decoration.replace({ widget: new ImageWidget(src, alt) }).range(node.from, node.to));
            return false;
          }

          case 'Blockquote': {
            for (let pos = node.from; pos <= node.to; ) {
              const l = state.doc.lineAt(pos);
              out.push(line('cm-lp-quote').range(l.from));
              pos = l.to + 1;
            }
            return;
          }

          case 'QuoteMark':
            if (!lineTouched(state, node.from)) hideWithSpace(state, node.from, node.to, out);
            return;

          case 'ListMark': {
            if (lineTouched(state, node.from)) return;
            const item = node.node.parent;
            const task = item?.getChild('Task');
            if (task) {
              hideWithSpace(state, node.from, node.to, out);
            } else if (item?.parent?.name === 'BulletList') {
              out.push(bullet.range(node.from, node.to));
            }
            return;
          }

          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to));
            if (checked) {
              const l = state.doc.lineAt(node.from);
              if (node.to < l.to) out.push(Decoration.mark({ class: 'cm-lp-done' }).range(node.to, l.to));
            }
            if (!lineTouched(state, node.from)) {
              out.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
            }
            return;
          }

          case 'HorizontalRule':
            if (!lineTouched(state, node.from)) out.push(rule.range(node.from, node.to));
            return;

          case 'FencedCode': {
            const first = state.doc.lineAt(node.from).number;
            const last = state.doc.lineAt(node.to).number;
            for (let n = first; n <= last; n += 1) {
              const cls = ['cm-lp-code', n === first && 'cm-lp-code-first', n === last && 'cm-lp-code-last']
                .filter(Boolean)
                .join(' ');
              out.push(line(cls).range(state.doc.line(n).from));
            }
            return false;
          }
        }
      },
    });
  }

  return Decoration.set(out, true);
}

const livePreviewPlugin = (resolveImage: ImageResolver) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, resolveImage);
      }
      update(u: ViewUpdate) {
        const refresh = u.transactions.some((t) => t.effects.some((e) => e.is(refreshImages)));
        if (refresh || u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
          this.decorations = build(u.view, resolveImage);
        }
      }
    },
    { decorations: (p) => p.decorations },
  );

// Inline styles come from the Markdown syntax tags; colors use the app's theme tokens.
const markdownStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '650', color: 'var(--color-ink)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--color-ink-2)' },
  { tag: tags.monospace, class: 'cm-lp-inline-code' },
  { tag: tags.heading, fontWeight: '650', color: 'var(--color-ink)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--color-ink-3)' },
  { tag: [tags.url, tags.labelName], color: 'var(--color-ink-3)' },
  { tag: tags.link, color: 'var(--color-ink)' },
  { tag: tags.quote, color: 'var(--color-ink-2)' },
  // Code inside fenced blocks, same colors as the published post.
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--code-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--code-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-fn)' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--code-type)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--code-attr)' },
]);

/** Live-preview extension. `resolveImage` maps image paths in the doc to loadable URLs. */
export function livePreview(resolveImage: ImageResolver) {
  return [livePreviewPlugin(resolveImage), syntaxHighlighting(markdownStyle)];
}
