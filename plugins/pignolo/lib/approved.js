'use strict';
// Aprobados visuales (R-12, A-19): design/approved/<flujo>/ con un HTML por pantalla y
// manifest.json = { flow, version, date, files: [{ path, sha256 }] }. Mismo formato que
// plugins/pignolo-ui/lib/approved.mjs: una carpeta guardada por uno verifica con el otro.
// Es inmutable: un cambio crea <flujo>-v2, -v3... y nunca escribe sobre una carpeta existente.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FLOW_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const APPROVED_PATH = /^design\/approved\/[a-z0-9][a-z0-9-]{0,63}$/;
const SCREEN_RE = /^[a-z0-9][a-z0-9-]*\.html$/;
const REMOTE_ATTR = /\b(?:src|href|srcset|poster|data|xlink:href|action)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const REMOTE_PROTO_ATTR = /\b(?:src|href|srcset|poster|data|xlink:href|action)\s*=\s*["']?\s*https?:/i;
const REMOTE_CSS = /url\(\s*["']?\s*(?:(?:[a-z][a-z0-9+.-]*:)?\/\/|https?:)|@import\s+["']\s*(?:(?:[a-z][a-z0-9+.-]*:)?\/\/|https?:)/i;
const ATTR_LINK = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

// Chequeos de una carpeta de pantallas (autocontenida). { files, problems }
function checkScreens(dir, piiPatterns = []) {
  const problems = [];
  const files = [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return { files, problems: [{ file: '', problem: `unreadable: ${e.code || e.message}` }] }; }
  for (const ent of ents) {
    if (ent.isDirectory()) problems.push({ file: ent.name, problem: 'subfolder' });
    else if (!ent.name.toLowerCase().endsWith('.html')) problems.push({ file: ent.name, problem: 'not-html' });
    else if (!SCREEN_RE.test(ent.name)) problems.push({ file: ent.name, problem: 'bad-name' });
    else files.push(ent.name);
  }
  if (!files.length && !problems.length) problems.push({ file: '', problem: 'empty' });
  const res = piiPatterns.map((p) => new RegExp(p));
  for (const f of files.sort()) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    if (REMOTE_ATTR.test(html) || REMOTE_PROTO_ATTR.test(html) || REMOTE_CSS.test(html)) problems.push({ file: f, problem: 'remote-resource' });
    for (const m of html.matchAll(ATTR_LINK)) {
      const href = (m[1] !== undefined ? m[1] : m[2]).trim();
      if (href === '' || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
      const target = href.split(/[?#]/)[0];
      const resolved = path.posix.normalize(target.replace(/^(?:\.\/)+/, ''));
      if (href.startsWith('/') || resolved.startsWith('..') || resolved.includes('/')) problems.push({ file: f, problem: 'link-outside-folder', href });
      else if (/\.html$/i.test(resolved) && !files.includes(resolved)) problems.push({ file: f, problem: 'broken-link', href });
    }
    // el dato nunca se repite en el informe: solo el archivo, el patrón y la línea
    html.split(/\r?\n/).forEach((line, i) => {
      for (const re of res) if (re.test(line)) problems.push({ file: f, problem: 'pii', pattern: re.source, line: i + 1 });
    });
  }
  return { files, problems };
}

function saveApproved({ projectRoot, flow, from, date, piiPatterns = [] }) {
  if (!FLOW_RE.test(flow || '')) return { ok: false, problems: [{ file: '', problem: 'bad-flow-name' }] };
  const { files, problems } = checkScreens(from, piiPatterns);
  if (problems.length) return { ok: false, problems };
  const base = path.join(projectRoot, 'design', 'approved');
  fs.mkdirSync(base, { recursive: true });
  let version = 1;
  let name = flow;
  while (fs.existsSync(path.join(base, name))) {
    version += 1;
    name = `${flow}-v${version}`;
  }
  const dir = path.join(base, name);
  fs.mkdirSync(dir); // sin recursive: falla en vez de escribir en una carpeta que apareció mientras tanto
  const entries = [];
  for (const f of files) {
    fs.copyFileSync(path.join(from, f), path.join(dir, f), fs.constants.COPYFILE_EXCL);
    entries.push({ path: f, sha256: sha256(fs.readFileSync(path.join(dir, f))) });
  }
  const manifest = `${JSON.stringify({ flow, version, date, files: entries }, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest, { flag: 'wx' });
  return { ok: true, path: posix(path.relative(projectRoot, dir)), version, manifestSha256: sha256(fs.readFileSync(path.join(dir, 'manifest.json'))) };
}

function manifestSha(projectRoot, approvedPath) {
  return sha256(fs.readFileSync(path.join(projectRoot, ...approvedPath.split('/'), 'manifest.json')));
}

// Sin expectedManifestSha solo se comprueba la coherencia interna (archivos contra manifest).
function verifyApproved({ projectRoot, approvedPath, expectedManifestSha }) {
  const problems = [];
  const done = () => ({ ok: problems.length === 0, problems });
  if (!APPROVED_PATH.test(approvedPath || '')) { problems.push({ problem: 'bad-path' }); return done(); }
  const dir = path.join(projectRoot, ...approvedPath.split('/'));
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch (_) {
    problems.push({ problem: 'manifest-unreadable' });
    return done();
  }
  if (expectedManifestSha && manifestSha(projectRoot, approvedPath) !== expectedManifestSha) problems.push({ problem: 'manifest-sha-mismatch' });
  const listed = new Set();
  for (const f of Array.isArray(manifest.files) ? manifest.files : []) {
    listed.add(f.path);
    const file = path.join(dir, String(f.path));
    if (!fs.existsSync(file)) problems.push({ file: f.path, problem: 'missing-file' });
    else if (sha256(fs.readFileSync(file)) !== f.sha256) problems.push({ file: f.path, problem: 'file-changed' });
  }
  for (const ent of fs.readdirSync(dir)) {
    if (ent !== 'manifest.json' && !listed.has(ent)) problems.push({ file: ent, problem: 'extra-file' });
  }
  return done();
}

const decisionsDir = (projectRoot) => path.join(projectRoot, '.pignolo', 'state', 'decisions');

// La misma línea que escribe decisionEntry de pignolo-ui, así una sola expresión la lee.
function decisionLine({ path: p, manifestSha256, date, quote }) {
  const q = String(quote).replace(/\s+/g, ' ').trim();
  return `- ${date} — approved \`${p}/\` (manifest sha256 \`${manifestSha256}\`): "${q}"`;
}

function recordDecision({ projectRoot, path: p, manifestSha256, quote, date }) {
  if (!APPROVED_PATH.test(p || '')) return { error: `ruta inválida: ${p}` };
  if (typeof quote !== 'string' || !quote.trim()) return { error: 'falta la cita literal del humano' };
  if (!/^[0-9a-f]{64}$/.test(manifestSha256 || '')) return { error: 'manifestSha256 inválido' };
  const flow = p.split('/').pop();
  const id = `${date}-${flow}`;
  const file = path.join(decisionsDir(projectRoot), `${id}.md`);
  const text = `---\nid: ${id}\nstatus: decided\nsource: human\nevidence: ${p}/manifest.json sha256 ${manifestSha256}\ncreated: ${date}\n---\n\n${decisionLine({ path: p, manifestSha256, date, quote })}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, text, { flag: 'wx' }); } catch (e) {
    return { error: e.code === 'EEXIST' ? `ya existe la decisión ${id}` : e.message };
  }
  return { id, file };
}

// sha256 del manifest registrado para approvedPath: primero .pignolo/state/decisions/*, si
// no `## Decisions` de DESIGN.md; el último gana. null si no hay.
function registeredSha(projectRoot, approvedPath) {
  const escaped = approvedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\`${escaped}/\`[^\\n]*?sha256 \`([0-9a-f]{64})\``, 'g');
  const last = (text) => { const m = [...String(text).matchAll(re)]; return m.length ? m[m.length - 1][1] : null; };
  let found = null;
  try {
    for (const n of fs.readdirSync(decisionsDir(projectRoot)).filter((x) => x.endsWith('.md')).sort()) {
      const s = last(fs.readFileSync(path.join(decisionsDir(projectRoot), n), 'utf8'));
      if (s) found = s;
    }
  } catch (_) { /* sin carpeta de decisiones */ }
  if (found) return found;
  try {
    const name = fs.readdirSync(projectRoot).find((n) => n.toLowerCase() === 'design.md');
    if (name) return last(fs.readFileSync(path.join(projectRoot, name), 'utf8'));
  } catch (_) { /* sin DESIGN.md */ }
  return null;
}

module.exports = { APPROVED_PATH, checkScreens, saveApproved, manifestSha, verifyApproved, recordDecision, registeredSha };
