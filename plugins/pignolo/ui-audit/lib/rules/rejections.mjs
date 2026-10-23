// Rejections (spec §5.6, §4.1 floor).
//
// applyRejections(entries, design, fileCtxs) -> entries
//   Called by the runner after every rule and before `intentional`. `design` is ctx.design
//   (or null); the list lives in design.data.pignolo.rejections.
//   - `rule: X`: every `fail` of X becomes a floor (`floor: true`, reason `rejected R-nnn`).
//   - `pattern`: each match in a file ctx is a `fail` with id R-nnn and `floor: true`.
//     `value` is the source of a JavaScript regex (flags `iu`, at most 200 characters);
//     an invalid or longer one is `unverified`, never a silent pass.
export const RULES = [];

const MAX_PATTERN = 200;
const KINDS = new Set(['selector', 'property', 'text']);

function compile(value) {
  if (typeof value !== 'string' || value.length === 0) return { reason: 'invalid pattern (empty or not a string)' };
  if (value.length > MAX_PATTERN) return { reason: `invalid pattern (longer than ${MAX_PATTERN} characters)` };
  try {
    return { re: new RegExp(value, 'iu') };
  } catch (err) {
    return { reason: `invalid pattern (${String(err.message).slice(0, 80)})` };
  }
}

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

// Yields { line, selector?, key } for each thing of `kind` in the ctx that the regex matches.
function* matches(ctx, kind, re) {
  if (kind === 'selector') {
    for (const rule of ctx.css?.rules ?? []) {
      if (re.test(rule.selector)) yield { line: rule.line, selector: rule.selector, key: `selector|${squash(rule.selector)}` };
    }
  } else if (kind === 'property') {
    for (const d of ctx.css?.decls ?? []) {
      if (re.test(`${d.property}: ${d.value}`)) {
        yield { line: d.line, selector: d.selector, key: `${squash(d.selector)}|${d.property}|${squash(d.value)}` };
      }
    }
  } else if (ctx.markup) {
    for (const el of ctx.markup.elements) {
      const parts = el.textParts.filter((p) => !p.dynamic);
      const text = squash(parts.map((p) => p.text).join(' '));
      if (text && re.test(text)) yield { line: parts[0].line, key: `${el.tag}|${text.slice(0, 40)}` };
    }
  }
}

export function applyRejections(entries, design, fileCtxs) {
  const list = design?.data?.pignolo?.rejections;
  if (!Array.isArray(list) || list.length === 0) return entries;

  const byRule = new Map();
  const extra = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
    if (typeof item.rule === 'string') byRule.set(item.rule, item.id);
    const p = item.pattern;
    if (!p || typeof p !== 'object') continue;
    const base = { id: item.id, severity: 'bloquea' };
    if (!KINDS.has(p.kind)) {
      extra.push({ ...base, status: 'unverified', severity: 'alto', file: design.rel, key: `${item.id}|kind`, reason: 'invalid pattern (unknown kind)' });
      continue;
    }
    const { re, reason } = compile(p.value);
    if (!re) {
      extra.push({ ...base, status: 'unverified', severity: 'alto', file: design.rel, key: `${item.id}|invalid`, reason });
      continue;
    }
    for (const ctx of fileCtxs ?? []) {
      for (const m of matches(ctx, p.kind, re)) {
        extra.push({
          ...base,
          status: 'fail',
          floor: true,
          file: ctx.file,
          line: m.line,
          ...(m.selector ? { selector: m.selector } : {}),
          key: m.key,
          reason: `rejected ${item.id}: ${p.kind} matches /${p.value}/`,
        });
      }
    }
  }

  const marked = entries.map((e) => (e.status === 'fail' && byRule.has(e.id)
    ? { ...e, floor: true, reason: `rejected ${byRule.get(e.id)}` }
    : e));
  return [...marked, ...extra];
}
