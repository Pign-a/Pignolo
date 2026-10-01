// Approved visual decisions (spec §3.3, A-19, A-20): design/approved/<flow>/ holds one static
// HTML per screen plus manifest.json with the sha256 of each file. An approval is immutable:
// a change creates <flow>-v2 (-v3...). DESIGN.md "## Decisions" registers the path and the
// sha256 of the manifest; verify checks both before anything is implemented.
//
// checkScreens(dir, { allowFonts }) -> { files, problems }   screenProblems(html, { allowFonts, files }) -> [{ problem, href? }]
// saveApproved({ projectRoot, flow, from, date, leakValues })   (copies every screen without the Google Fonts <link>, R-19)
// decisionEntry({ path, manifestSha256, date, quote })   verifyApproved({ projectRoot, approvedPath })
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkLeaks } from './leak-check.mjs';
import { stripRemoteFonts } from './remote-fonts.mjs';
import { resourceProblems } from './remote-check.mjs';

const FLOW = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SCREEN = /^[a-z0-9][a-z0-9-]*\.html$/;
const BASE_HREF = /<base\b[^>]*\bhref\s*=/i;
const META_REFRESH = /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh/i;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

// Pure per-screen checks (shared with the canvas converter). allowFonts: the allowed Google Fonts <link>
// form (lib/remote-fonts.mjs) is not a remote resource; any other form or remote resource still is.
// files: the screens of the flow, to check the links between them (omit it to skip broken-link).
export function screenProblems(html, { allowFonts = false, files = null } = {}) {
  const out = [];
  const text = allowFonts ? stripRemoteFonts(html).html : html;
  if (!/<meta\s[^>]*charset\s*=\s*["']?utf-8/i.test(text)) out.push({ problem: 'no-charset' });
  // decided on the attributes and the CSS read like a browser reads them (lib/remote-check.mjs)
  const found = resourceProblems(text);
  if (/<script\b/i.test(text) || found.script) out.push({ problem: 'script' });
  if (found.remote || BASE_HREF.test(text) || META_REFRESH.test(text)) out.push({ problem: 'remote-resource' });
  if (files) {
    for (const m of text.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi)) {
      const href = m[1].trim().replace(/^(?:\.\/)+/, '');
      if (href === '' || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
      const target = href.split(/[?#]/)[0];
      if (href.startsWith('/') || !files.includes(target)) out.push({ problem: 'broken-link', href });
    }
  }
  return out;
}

export function checkScreens(dir, { allowFonts = false } = {}) {
  const problems = [];
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) problems.push({ file: ent.name, problem: 'subfolder' });
    else if (!ent.name.toLowerCase().endsWith('.html')) problems.push({ file: ent.name, problem: 'not-html' });
    else if (!SCREEN.test(ent.name)) problems.push({ file: ent.name, problem: 'bad-name' });
    else files.push(ent.name);
  }
  if (!files.length && !problems.length) problems.push({ file: '', problem: 'empty' });
  for (const f of files.sort()) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const p of screenProblems(html, { allowFonts, files })) problems.push({ file: f, ...p });
  }
  return { files, problems };
}

export function saveApproved({ projectRoot, flow, from, date, leakValues = [] }) {
  if (!FLOW.test(flow || '')) return { ok: false, problems: [{ file: '', problem: 'bad-flow-name' }] };
  // the origin may carry the allowed Google Fonts <link> (R-19); the copy never does
  const { files, problems } = checkScreens(from, { allowFonts: true });
  // leak check before saving as approved (spec §7.4); values are never echoed back
  for (const l of checkLeaks(from, leakValues).leaks) {
    const { file, kind, line } = l;
    problems.push(kind === 'path' ? { file, problem: 'leak', kind, match: l.match, line } : { file, problem: 'leak', kind, index: l.index, line });
  }
  if (problems.length) return { ok: false, problems };
  const base = path.join(projectRoot, 'design', 'approved');
  fs.mkdirSync(base, { recursive: true });
  let version = 1;
  let name = flow;
  while (fs.existsSync(path.join(base, name))) {
    version++;
    name = `${flow}-v${version}`;
  }
  const dir = path.join(base, name);
  fs.mkdirSync(dir); // not recursive: fails instead of writing into a folder that appeared meanwhile
  const entries = [];
  let fontsRemoved = 0;
  for (const f of files) {
    const stripped = stripRemoteFonts(fs.readFileSync(path.join(from, f), 'utf8'));
    fontsRemoved += stripped.removed;
    if (stripped.removed === 0) fs.copyFileSync(path.join(from, f), path.join(dir, f), fs.constants.COPYFILE_EXCL);
    else fs.writeFileSync(path.join(dir, f), stripped.html, { flag: 'wx' });
    // what is stored must have no remote resource at all (spec §3.3)
    if (screenProblems(fs.readFileSync(path.join(dir, f), 'utf8'), { allowFonts: false }).some((p) => p.problem === 'remote-resource')) {
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: false, problems: [{ file: f, problem: 'remote-resource' }] };
    }
    entries.push({ path: f, sha256: sha256(fs.readFileSync(path.join(dir, f))) });
  }
  const manifest = `${JSON.stringify({ flow, version, date, files: entries }, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest, { flag: 'wx' });
  return { ok: true, path: posix(path.relative(projectRoot, dir)), version, manifestSha256: sha256(fs.readFileSync(path.join(dir, 'manifest.json'))), fontsRemoved };
}

export function decisionEntry({ path: p, manifestSha256, date, quote }) {
  const q = String(quote).replace(/\s+/g, ' ').trim();
  return `- ${date} — approved \`${p}/\` (manifest sha256 \`${manifestSha256}\`): "${q}"`;
}

export function findDesignFile(projectRoot) {
  const name = fs.readdirSync(projectRoot).find((n) => n.toLowerCase() === 'design.md');
  return name ? path.join(projectRoot, name) : null;
}

export function manifestSha(projectRoot, approvedPath) {
  return sha256(fs.readFileSync(path.join(projectRoot, ...approvedPath.split('/'), 'manifest.json')));
}

export const APPROVED_PATH = /^design\/approved\/[a-z0-9][a-z0-9-]{0,63}$/;

// sha256 of the manifest that DESIGN.md registers for approvedPath (the last entry wins), or null.
export function registeredManifestSha(designText, approvedPath) {
  const escaped = approvedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entries = [...String(designText).matchAll(new RegExp(`\`${escaped}/\`[^\\n]*?sha256 \`([0-9a-f]{64})\``, 'g'))];
  return entries.length ? entries[entries.length - 1][1] : null;
}

export function verifyApproved({ projectRoot, approvedPath }) {
  const problems = [];
  const blocked = () => ({ status: 'BLOCKED', problems });
  if (!APPROVED_PATH.test(approvedPath || '')) {
    problems.push({ problem: 'bad-path' });
    return blocked();
  }
  const designFile = findDesignFile(projectRoot);
  if (!designFile) {
    problems.push({ problem: 'no-design-md' });
    return blocked();
  }
  const expected = registeredManifestSha(fs.readFileSync(designFile, 'utf8'), approvedPath);
  if (!expected) {
    problems.push({ problem: 'no-entry' });
    return blocked();
  }
  const dir = path.join(projectRoot, ...approvedPath.split('/'));
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch {
    problems.push({ problem: 'manifest-unreadable' });
    return blocked();
  }
  if (manifestSha(projectRoot, approvedPath) !== expected) problems.push({ problem: 'manifest-sha-mismatch' });
  const listed = new Set();
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
    listed.add(f.path);
    const file = path.join(dir, f.path);
    if (!fs.existsSync(file)) problems.push({ file: f.path, problem: 'missing-file' });
    else if (sha256(fs.readFileSync(file)) !== f.sha256) problems.push({ file: f.path, problem: 'file-changed' });
  }
  for (const ent of fs.readdirSync(dir)) {
    if (ent !== 'manifest.json' && !listed.has(ent)) problems.push({ file: ent, problem: 'extra-file' });
  }
  return problems.length ? blocked() : { status: 'ok', problems };
}
