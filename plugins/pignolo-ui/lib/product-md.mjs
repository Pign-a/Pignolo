// PRODUCT.md (hito 4f): optional project file, next to DESIGN.md, that says who a screen is for.
// Own sections, 60 lines at most, tolerant reader: unknown titles and the text before the first
// title are ignored; a known section whose body is the single word `undecided` is a declared gap.
//
// validateProduct(text, { leakValues }) -> { status: 'ok'|'invalid', sections, missing, undecided, problems }
// extractContext(validated) -> bounded text pasted into the brief of each option and read by the auditor
// A leak problem carries the line and the kind, never the value found.
import { findLeaks } from './leak-check.mjs';

export const PRODUCT_SECTIONS = ['Audience', 'First look', 'Tone', 'Not wanted', 'Do not touch'];
export const MAX_LINES = 60;
export const SECTION_MAX = 480;
export const CONTEXT_MAX = 2400;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HEADING = /^(#{1,2})\s+(.*?)\s*#*\s*$/;

const canonical = (title) => PRODUCT_SECTIONS.find((s) => s.toLowerCase() === title.trim().toLowerCase()) ?? null;

export function validateProduct(text, { leakValues = [] } = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const problems = [];
  if (lines.length > MAX_LINES) problems.push({ problem: 'too-long', lines: lines.length, max: MAX_LINES });

  const sections = {};
  const seen = new Set();
  let current = null; // canonical name of the known section being read, null for unknown or none
  let body = [];
  let startLine = 0;
  const close = () => {
    if (current === null) return;
    const joined = body.join('\n').trim();
    if (!joined) problems.push({ problem: 'empty-section', section: current, line: startLine });
    sections[current] = joined;
  };
  lines.forEach((raw, i) => {
    const m = HEADING.exec(raw);
    if (m) {
      close();
      const name = m[1] === '##' ? canonical(m[2]) : null; // a `#` title is never a section
      current = name;
      body = [];
      startLine = i + 1;
      if (name) {
        if (seen.has(name)) problems.push({ problem: 'duplicate-section', section: name, line: i + 1 });
        seen.add(name);
      }
      return;
    }
    if (current !== null) body.push(raw);
  });
  close();

  // leaks over the whole file; the output names the line and the kind, never the value
  for (const l of findLeaks(lines.join('\n'), leakValues)) problems.push({ problem: 'leak', kind: l.kind, line: l.line });
  lines.forEach((raw, i) => { if (new RegExp(EMAIL.source).test(raw)) problems.push({ problem: 'leak', kind: 'email', line: i + 1 }); });

  const undecided = PRODUCT_SECTIONS.filter((s) => sections[s] !== undefined && sections[s].toLowerCase() === 'undecided');
  const missing = PRODUCT_SECTIONS.filter((s) => sections[s] === undefined);
  return { status: problems.length ? 'invalid' : 'ok', sections, missing, undecided, problems };
}

export function extractContext(validated) {
  if (!validated || validated.status !== 'ok') return '';
  const parts = [];
  for (const name of PRODUCT_SECTIONS) {
    const body = validated.sections[name];
    if (body === undefined || validated.undecided.includes(name)) continue;
    const cut = body.length > SECTION_MAX ? `${body.slice(0, SECTION_MAX - 1)}…` : body;
    parts.push(`## ${name}\n${cut}`);
  }
  const text = parts.join('\n\n');
  return text.length > CONTEXT_MAX ? `${text.slice(0, CONTEXT_MAX - 1)}…` : text;
}

export const PRODUCT_TEMPLATE = `${PRODUCT_SECTIONS.map((s) => `## ${s}\nundecided\n`).join('\n')}`;
