// CSS walker for style rules (spec §5.5). Reads declarations with their selector, the
// at-rules that contain them and their file line. Braces and semicolons inside strings,
// comments and url(...) do not open blocks or cut declarations (same care as scanCss).
//
// walkCss(text, { lineOffset = 0 }) -> { rules, decls, keyframes }
//   decls[i]     { selector, atRules, property, value, important, line, inTokenBlock }
//   rules[i]     { selector, atRules, line, decls }
//   keyframes[i] { name, line, text }
// `line` is the local line plus lineOffset (for a <style> block that starts at file line L,
// pass lineOffset L - 1). Custom properties keep their case; other properties are lowercased.
// Steps inside @keyframes are rules/decls too (selector "from", "50%"; atRules has the
// @keyframes prelude); the @keyframes block itself is only listed in `keyframes`.
import { blankComments, isTokenBlock, lineIndex } from './token-sources.mjs';

const GROUPING = /^@(-\w+-)?(media|supports|container|layer|scope|starting-style|document)\b/i;
const KEYFRAMES = /^@(-\w+-)?keyframes\s+/i;

export function walkCss(text, { lineOffset = 0 } = {}) {
  const src = blankComments(String(text));
  const lineAt = lineIndex(src);
  const rules = [];
  const decls = [];
  const keyframes = [];
  const stack = [];
  let seg = 0;
  let paren = 0;
  let quote = null;

  const lineOf = (offset) => lineAt(offset) + lineOffset;

  const decl = (start, end) => {
    if (!stack.length) return;
    const raw = src.slice(start, end);
    const m = /^(\s*)(-{0,2}[A-Za-z_][\w-]*)\s*:([\s\S]*)$/.exec(raw);
    if (!m) return;
    const holder = [...stack].reverse().find((b) => !b.grouping);
    if (!holder) return;
    let value = m[3].replace(/\s+/g, ' ').trim();
    const imp = /\s*!\s*important$/i.exec(value);
    if (imp) value = value.slice(0, imp.index).trim();
    const property = m[2].startsWith('--') ? m[2] : m[2].toLowerCase();
    const d = {
      selector: holder.selector,
      atRules: stack.filter((b) => b.selector.startsWith('@') && b !== holder).map((b) => b.selector),
      property,
      value,
      important: Boolean(imp),
      line: lineOf(start + m[1].length),
      inTokenBlock: isTokenBlock(holder.selector),
    };
    decls.push(d);
    if (holder.rule) holder.rule.decls.push(d);
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote || c === '\n') quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(') { paren++; continue; }
    if (c === ')') { if (paren > 0) paren--; continue; }
    if (paren > 0) continue;
    if (c === '{') {
      const rawPrelude = src.slice(seg, i);
      const lead = rawPrelude.length - rawPrelude.trimStart().length;
      const selector = rawPrelude.replace(/\s+/g, ' ').trim();
      const isAt = selector.startsWith('@');
      const block = {
        selector,
        start: seg + lead,
        grouping: isAt && GROUPING.test(selector),
        keyframes: isAt && KEYFRAMES.test(selector),
        rule: null,
      };
      if (!block.grouping && !block.keyframes) {
        const atRules = stack.filter((b) => b.selector.startsWith('@')).map((b) => b.selector);
        block.rule = { selector, atRules, line: lineOf(block.start), decls: [] };
        rules.push(block.rule);
      }
      stack.push(block);
      seg = i + 1;
    } else if (c === ';') {
      decl(seg, i);
      seg = i + 1;
    } else if (c === '}') {
      decl(seg, i);
      const b = stack.pop();
      if (b && b.keyframes) {
        keyframes.push({ name: b.selector.replace(KEYFRAMES, '').trim(), line: lineOf(b.start), text: src.slice(b.start, i + 1) });
      }
      seg = i + 1;
    }
  }
  return { rules, decls, keyframes };
}
