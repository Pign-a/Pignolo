// brief.md (hito 4f): the brief of one screen, kept inside the approved version. Own format,
// 60 lines at most: `## Screen` (free, optional), `## First look` (required: what shows without
// scrolling and where the main action is), `## Do not touch` (required: what stays; `nothing` is
// valid) and an optional line `Register: product` or `Register: brand` that applies to this flow only.
//
// validateBrief(text, { leakValues }) -> { status, firstLook, doNotTouch, register, problems }
// problems: missing-first-look | empty-first-look | missing-do-not-touch | empty-do-not-touch |
//           bad-register | too-long | leak (line and kind, never the value)
import { findLeaks } from './leak-check.mjs';
import { splitFrontmatter } from './design-doc.mjs';
import { parseYaml } from './yaml-subset.mjs';

export const BRIEF_MAX_LINES = 60;
export const REGISTERS = ['product', 'brand'];

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const HEADING = /^(#{1,2})\s+(.*?)\s*#*\s*$/;
const REGISTER_LINE = /^Register:\s*(.*?)\s*$/;

export function validateBrief(text, { leakValues = [] } = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const problems = [];
  if (lines.length > BRIEF_MAX_LINES) problems.push({ problem: 'too-long', lines: lines.length, max: BRIEF_MAX_LINES });

  const bodies = Object.create(null);
  let register = null;
  let current = null;
  lines.forEach((raw, i) => {
    const h = HEADING.exec(raw);
    if (h) {
      current = h[1] === '##' ? h[2].trim().toLowerCase() : null;
      if (current !== null && bodies[current] === undefined) bodies[current] = [];
      return;
    }
    const r = REGISTER_LINE.exec(raw);
    if (r) {
      if (REGISTERS.includes(r[1])) register = r[1];
      else problems.push({ problem: 'bad-register', line: i + 1 });
      return;
    }
    if (current !== null) bodies[current].push(raw);
  });

  const read = (title, missing, empty) => {
    if (bodies[title] === undefined) { problems.push({ problem: missing }); return ''; }
    const body = bodies[title].join('\n').trim();
    if (!body) problems.push({ problem: empty });
    return body;
  };
  const firstLook = read('first look', 'missing-first-look', 'empty-first-look');
  const doNotTouch = read('do not touch', 'missing-do-not-touch', 'empty-do-not-touch');

  for (const l of findLeaks(lines.join('\n'), leakValues)) problems.push({ problem: 'leak', kind: l.kind, line: l.line });
  lines.forEach((raw, i) => { if (EMAIL.test(raw)) problems.push({ problem: 'leak', kind: 'email', line: i + 1 }); });

  return { status: problems.length ? 'invalid' : 'ok', firstLook, doNotTouch, register, problems };
}

// The register DESIGN.md declares (pignolo.register), or null: the default a brief's `Register:` line overrides.
export function designRegister(designText) {
  const fm = splitFrontmatter(designText);
  if (!fm.ok) return null;
  const parsed = parseYaml(fm.yaml);
  if (!parsed.supported || !parsed.value || typeof parsed.value !== 'object') return null;
  const value = parsed.value.pignolo && typeof parsed.value.pignolo === 'object' ? parsed.value.pignolo.register : null;
  return REGISTERS.includes(value) ? value : null;
}
