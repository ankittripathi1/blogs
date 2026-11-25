import { EditorSelection, Prec, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { getCM, Vim } from '@replit/codemirror-vim';

// vim-surround for the CodeMirror Vim mode:
//   ys{motion}{char}  surround (ysiw" , ysaw) , ys$* , yss` , ystx]  ...)
//   ds{char}          delete surrounding pair
//   cs{old}{new}      change surrounding pair
//   S{char}           surround the visual selection
// The Vim package has no hook for "operator + motion + extra key", so this runs as a
// key handler in front of Vim. Keys it does not want are replayed to Vim untouched.

// Opening brackets add inner spaces, closing ones don't (same as vim-surround).
const PAIRS: Record<string, [string, string]> = {
  '(': ['( ', ' )'],
  ')': ['(', ')'],
  b: ['(', ')'],
  '[': ['[ ', ' ]'],
  ']': ['[', ']'],
  '{': ['{ ', ' }'],
  '}': ['{', '}'],
  B: ['{', '}'],
  '<': ['<', '>'],
  '>': ['<', '>'],
  '~': ['~~', '~~'],
};

function pairFor(ch: string): [string, string] | null {
  if (PAIRS[ch]) return PAIRS[ch];
  return ch.length === 1 && /[^\w\s]/.test(ch) ? [ch, ch] : null;
}

// Bare delimiters to search for when deleting/changing.
function bare(ch: string): [string, string] | null {
  const p = pairFor(ch);
  return p ? [p[0].trim(), p[1].trim()] : null;
}

type Range = { from: number; to: number };

const isWord = (c: string) => /\w/.test(c);
const isBlank = (c: string) => c === ' ' || c === '\t';

/** Finds the pair of `open`/`close` around `pos`. Brackets nest; symmetric marks stay on one line. */
function findPair(doc: Text, pos: number, open: string, close: string): Range | null {
  if (open === close) {
    const line = doc.lineAt(pos);
    const text = line.text;
    const at = pos - line.from;
    const left = text.lastIndexOf(open, text.startsWith(open, at) ? at - 1 : at);
    if (left === -1) return null;
    const right = text.indexOf(close, Math.max(at, left + open.length));
    if (right === -1) return null;
    return { from: line.from + left, to: line.from + right + close.length };
  }
  const text = doc.toString();
  let depth = 0;
  let left = -1;
  for (let i = text.startsWith(close, pos) ? pos - 1 : pos; i >= 0; i -= 1) {
    if (text.startsWith(close, i) && i !== pos) depth += 1;
    else if (text.startsWith(open, i)) {
      if (depth === 0) {
        left = i;
        break;
      }
      depth -= 1;
    }
  }
  if (left === -1) return null;
  depth = 0;
  for (let i = left + open.length; i < text.length; i += 1) {
    if (text.startsWith(open, i)) depth += 1;
    else if (text.startsWith(close, i)) {
      if (depth === 0) return { from: left, to: i + close.length };
      depth -= 1;
    }
  }
  return null;
}

/**
 * Parses the motion typed after `ys` into a document range.
 * Returns 'partial' while more keys are needed and null when the keys are not supported.
 */
function motionRange(doc: Text, pos: number, keys: string): Range | 'partial' | null {
  const line = doc.lineAt(pos);
  const text = line.text;
  const at = pos - line.from;
  const abs = (a: number, b: number) => ({ from: line.from + a, to: line.from + b });
  const firstNonBlank = text.length - text.trimStart().length;

  const head = keys[0];
  if (keys === 's') return abs(firstNonBlank, text.trimEnd().length);
  if (keys === '$') return abs(at, text.length);
  if (keys === '0') return abs(0, at);
  if (keys === '^') return abs(Math.min(firstNonBlank, at), Math.max(firstNonBlank, at));

  if (head === 'w' || head === 'W' || head === 'e' || head === 'E') {
    const inWord = head === head.toLowerCase() ? isWord : (c: string) => !isBlank(c);
    let end = at;
    if (inWord(text[end] ?? ' ')) while (end < text.length && inWord(text[end])) end += 1;
    else if (head === 'e' || head === 'E') {
      while (end < text.length && !inWord(text[end])) end += 1;
      while (end < text.length && inWord(text[end])) end += 1;
    } else end += 1;
    return abs(at, end);
  }

  if (head === 't' || head === 'f') {
    if (keys.length < 2) return 'partial';
    const found = text.indexOf(keys[1], at + 1);
    if (found === -1) return null;
    return abs(at, head === 't' ? found : found + 1);
  }

  if (head === 'i' || head === 'a') {
    if (keys.length < 2) return 'partial';
    const obj = keys[1];
    if (obj === 'w' || obj === 'W') {
      const match = obj === 'w' ? isWord : (c: string) => !isBlank(c);
      const cls = (c: string) => (isBlank(c) ? 0 : match(c) ? 1 : 2);
      const kind = cls(text[at] ?? ' ');
      let start = at;
      let end = at;
      while (start > 0 && cls(text[start - 1]) === kind) start -= 1;
      while (end < text.length && cls(text[end]) === kind) end += 1;
      if (head === 'a') while (end < text.length && isBlank(text[end])) end += 1;
      return abs(start, end);
    }
    const pair = bare(obj);
    if (!pair) return null;
    const found = findPair(doc, pos, pair[0], pair[1]);
    if (!found) return null;
    return head === 'a' ? found : { from: found.from + pair[0].length, to: found.to - pair[1].length };
  }

  return null;
}

// vim-surround leaves trailing spaces outside the new pair.
function trimEnd(doc: Text, r: Range): Range {
  let to = r.to;
  while (to > r.from && isBlank(doc.sliceString(to - 1, to))) to -= 1;
  return { from: r.from, to };
}

function surround(view: EditorView, r: Range, ch: string) {
  const pair = pairFor(ch);
  if (!pair) return;
  view.dispatch({
    changes: [
      { from: r.from, insert: pair[0] },
      { from: r.to, insert: pair[1] },
    ],
    selection: EditorSelection.cursor(r.from),
    userEvent: 'input.surround',
  });
}

function changeSurround(view: EditorView, oldCh: string, newCh: string | null) {
  const pair = bare(oldCh);
  if (!pair) return;
  const { doc } = view.state;
  const pos = view.state.selection.main.head;
  const found = findPair(doc, pos, pair[0], pair[1]);
  if (!found) return;
  let innerFrom = found.from + pair[0].length;
  let innerTo = found.to - pair[1].length;
  // ds( also removes the inner padding that ys( added.
  if ('([{'.includes(oldCh)) {
    if (doc.sliceString(innerFrom, innerFrom + 1) === ' ') innerFrom += 1;
    if (innerTo > innerFrom && doc.sliceString(innerTo - 1, innerTo) === ' ') innerTo -= 1;
  }
  const next = newCh ? pairFor(newCh) : ['', ''];
  if (!next) return;
  view.dispatch({
    changes: [
      { from: found.from, to: innerFrom, insert: next[0] },
      { from: innerTo, to: found.to, insert: next[1] },
    ],
    selection: EditorSelection.cursor(found.from),
    userEvent: 'input.surround',
  });
}

type Pending =
  | { kind: 'op'; op: 'y' | 'd' | 'c' }
  | { kind: 'ys'; keys: string }
  | { kind: 'wrap'; range: Range }
  | { kind: 'visual'; range: Range }
  | { kind: 'ds' }
  | { kind: 'cs' }
  | { kind: 'cs-new'; old: string };

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/** Extension that adds the surround keys. Include it next to `vim()`. */
export function vimSurround() {
  let pending: Pending | null = null;

  return Prec.highest(
    EditorView.domEventHandlers({
      keydown(e, view) {
        const cm = getCM(view);
        const vim = cm?.state.vim;
        if (!cm || !vim || vim.insertMode || MODIFIER_KEYS.has(e.key)) return false;
        if (e.metaKey || e.ctrlKey || e.altKey) {
          pending = null;
          return false;
        }

        const key = e.key;
        const consume = () => {
          e.preventDefault();
          return true;
        };
        const input = vim.inputState;
        const idle =
          !input.operator && input.keyBuffer.length === 0 && input.prefixRepeat.length === 0 && !input.registerName;

        if (!pending) {
          if (vim.visualMode && key === 'S') {
            const sel = view.state.selection.main;
            pending = { kind: 'visual', range: { from: sel.from, to: sel.to } };
            return consume();
          }
          if (!vim.visualMode && idle && (key === 'y' || key === 'd' || key === 'c')) {
            pending = { kind: 'op', op: key };
            return consume();
          }
          return false;
        }

        const state = pending;
        pending = null;
        if (key === 'Escape') {
          if (state.kind === 'visual') return false;
          return consume();
        }

        switch (state.kind) {
          case 'op':
            if (key === 's') {
              pending = state.op === 'y' ? { kind: 'ys', keys: '' } : state.op === 'd' ? { kind: 'ds' } : { kind: 'cs' };
              return consume();
            }
            // Not a surround: give Vim the operator, then let this key through as usual.
            Vim.handleKey(cm, state.op, 'user');
            return false;

          case 'ys': {
            const keys = state.keys + key;
            const head = view.state.selection.main.head;
            const r = motionRange(view.state.doc, head, keys);
            if (r === 'partial') pending = { kind: 'ys', keys };
            else if (r) pending = { kind: 'wrap', range: trimEnd(view.state.doc, r) };
            return consume();
          }

          case 'wrap':
            surround(view, state.range, key);
            return consume();

          case 'visual':
            Vim.handleKey(cm, '<Esc>', 'user');
            surround(view, state.range, key);
            return consume();

          case 'ds':
            changeSurround(view, key, null);
            return consume();

          case 'cs':
            pending = { kind: 'cs-new', old: key };
            return consume();

          case 'cs-new':
            changeSurround(view, state.old, key);
            return consume();
        }
      },
    }),
  );
}
