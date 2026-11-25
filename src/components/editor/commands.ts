import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// Markdown editing commands used by the editor keymap, the selection bubble and the slash menu.
// Each one acts on the main selection and dispatches a single undoable transaction.

/** Wraps the selection in `before`/`after`, or unwraps it if it is already wrapped. */
export function toggleWrap(view: EditorView, before: string, after = before, placeholder = '') {
  const { state } = view;
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);

  // Markers sit just outside the selection: remove them.
  if (
    state.sliceDoc(from - before.length, from) === before &&
    state.sliceDoc(to, to + after.length) === after
  ) {
    view.dispatch({
      changes: [
        { from: from - before.length, to: from },
        { from: to, to: to + after.length },
      ],
      selection: EditorSelection.range(from - before.length, to - before.length),
      userEvent: 'input.format',
    });
    return true;
  }

  // Markers are inside the selection: remove them.
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: EditorSelection.range(from, from + inner.length),
      userEvent: 'input.format',
    });
    return true;
  }

  const content = selected || placeholder;
  view.dispatch({
    changes: { from, to, insert: before + content + after },
    selection: EditorSelection.range(from + before.length, from + before.length + content.length),
    userEvent: 'input.format',
  });
  return true;
}

/** Turns the selection into `[text](https://)` and selects the URL so it can be typed over. */
export function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to) || 'link text';
  const url = 'https://';
  const urlStart = from + text.length + 3;
  view.dispatch({
    changes: { from, to, insert: `[${text}](${url})` },
    selection: EditorSelection.range(urlStart, urlStart + url.length),
    userEvent: 'input.format',
  });
  return true;
}

/** Adds `prefix` to every selected line, or removes it if all lines already have it. */
export function togglePrefix(view: EditorView, prefix: string) {
  const { state } = view;
  const lines = selectedLines(state);
  const all = lines.every((l) => l.text.startsWith(prefix));
  const changes: ChangeSpec[] = lines.map((l) =>
    all ? { from: l.from, to: l.from + prefix.length } : { from: l.from, insert: prefix },
  );
  view.dispatch({ changes, userEvent: 'input.format' });
  return true;
}

/** Replaces `from..to` with `text` and puts the caret `caret` chars into the inserted text. */
export function replaceRange(view: EditorView, from: number, to: number, text: string, caret = text.length) {
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(from + caret),
    userEvent: 'input',
    scrollIntoView: true,
  });
  view.focus();
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)/;

function selectedLines(state: EditorState) {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  const lines = [];
  for (let n = first; n <= last; n += 1) lines.push(state.doc.line(n));
  return lines;
}

function leadingSpaces(text: string) {
  return text.length - text.trimStart().length;
}

// Width of one nesting step for a list line. Markdown nests a child under the content
// column of its parent, so "- " needs 2 spaces but "1. " needs 3.
function listStep(state: EditorState, lineNumber: number, indent: number, dir: 1 | -1): number | null {
  for (let n = lineNumber - 1; n >= 1; n -= 1) {
    const text = state.doc.line(n).text;
    if (!text.trim()) continue;
    const m = text.match(LIST_ITEM);
    if (!m) return null;
    const parentIndent = m[1].length;
    if (dir === 1 && parentIndent <= indent) {
      const step = parentIndent + m[2].length + m[3].length - indent;
      return step > 0 ? step : null;
    }
    if (dir === -1 && parentIndent < indent) return indent - parentIndent;
  }
  return null;
}

function inCodeBlock(state: EditorState, pos: number) {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent!) {
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true;
    if (!node.parent) break;
  }
  return false;
}

/**
 * Tab / Shift+Tab. Indents whole lines, so the preview shows the same nesting.
 * Inside a code block a plain caret Tab just inserts two spaces.
 */
export function indentLines(view: EditorView, dir: 1 | -1) {
  const { state } = view;
  const main = state.selection.main;
  if (dir === 1 && main.empty && inCodeBlock(state, main.head)) {
    view.dispatch(state.replaceSelection('  '));
    return true;
  }

  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(state)) {
    if (!line.text.trim() && !main.empty) continue;
    const indent = leadingSpaces(line.text);
    const isList = LIST_ITEM.test(line.text);
    const step = (isList && listStep(state, line.number, indent, dir)) || 2;
    if (dir === 1) {
      changes.push({ from: line.from, insert: ' '.repeat(step) });
      // A new nested numbered list starts at 1, like Notion.
      const num = line.text.match(/^\s*(\d+)[.)]\s/);
      if (num && num[1] !== '1') {
        changes.push({ from: line.from + indent, to: line.from + indent + num[1].length, insert: '1' });
      }
    } else if (indent > 0) {
      changes.push({ from: line.from, to: line.from + Math.min(indent, step) });
    }
  }
  if (!changes.length) return true;
  // Map the selection forward so a caret at the line start ends up after the new indent.
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
    userEvent: dir === 1 ? 'input.indent' : 'delete.dedent',
  });
  return true;
}
