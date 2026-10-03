'use strict';
// Leak check of a reviewer run (cards, section 5): the reviewer must not see the future of the
// snapshot. Exit 0: clean. Exit 1: leak (the run is invalid). Exit 2: usage or unreadable input.
//
//   node tests/bench/revision/leak-check.js --file <transcript|output> --case <snapshot id|code> --work <work dir>
//        [--root <dir>]... [--leak <leak.json>] [--allow-tools Read,Grep,Glob] [--cwd <dir>]
//
// Signs of a leak, all reported:
//   tool     a tool other than the allowed read tools was used (Bash could reach git history)
//   path     a Read/Grep/Glob path falls outside the snapshot root(s)
//   outside  the reviewer's own text names an absolute path outside the roots
//   hash     the full or abbreviated hash (>= 7 chars) of a fix commit appears anywhere
//   text     the subject of a fix commit, a fix test title or a distinctive fix test line appears
// The transcript may be stream-json (one event per line, or a JSON array) or plain text.
const fs = require('node:fs');
const path = require('node:path');
const { loadCases, snapshotCode, parseArgs } = require('./lib');

const DEFAULT_TOOLS = ['Read', 'Grep', 'Glob'];

function normPath(p, cwd) {
  let q = String(p).replace(/\\/g, '/');
  const msys = /^\/([a-zA-Z])\/(.*)$/.exec(q);
  if (msys) q = `${msys[1]}:/${msys[2]}`;
  if (!/^([a-zA-Z]:)?\//.test(q)) q = `${cwd.replace(/\\/g, '/')}/${q}`;
  q = path.posix.normalize(q);
  if (/^[a-zA-Z]:/.test(q)) q = q[0].toLowerCase() + q.slice(1);
  return q.replace(/\/+$/, '').toLowerCase();
}

const isAbs = (p) => /^([a-zA-Z]:)?[\\/]/.test(p);

function inside(p, roots) {
  return roots.some((r) => p === r || p.startsWith(`${r}/`));
}

// Collect tool_use blocks and text from any mix of stream-json events and plain lines.
function parseTranscript(raw) {
  const toolUses = [];
  const texts = []; // all string content, for hash and text scans
  const own = []; // text written by the reviewer (assistant text blocks and plain lines)
  const walk = (v, role) => {
    if (Array.isArray(v)) { v.forEach((x) => walk(x, role)); return; }
    if (v && typeof v === 'object') {
      if (v.type === 'tool_use' && typeof v.name === 'string') toolUses.push({ name: v.name, input: v.input || {} });
      const r = v.type === 'assistant' ? 'assistant' : (v.type === 'user' || v.type === 'system') ? 'other' : role;
      if (v.type === 'text' && typeof v.text === 'string' && role === 'assistant') own.push(v.text);
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === 'string') {
          texts.push(x);
          if (role === 'assistant' && (k === 'text' || k === 'thinking')) own.push(x);
        } else walk(x, r);
      }
    }
  };
  let whole = null;
  try { whole = JSON.parse(raw); } catch { whole = null; }
  if (whole !== null && typeof whole === 'object') walk(whole, 'plain');
  else {
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let obj = null;
      if (t.startsWith('{') || t.startsWith('[')) { try { obj = JSON.parse(t); } catch { obj = null; } }
      if (obj !== null) walk(obj, 'plain');
      else { texts.push(line); own.push(line); }
    }
  }
  return { toolUses, text: texts.join('\n'), own: own.join('\n') };
}

const collapse = (s) => s.replace(/\s+/g, ' ');

function checkLeak({ raw, roots, leak, allowTools = DEFAULT_TOOLS, cwd }) {
  const base = cwd || roots[0];
  const normRoots = roots.map((r) => normPath(r, base));
  const { toolUses, text, own } = parseTranscript(raw);
  const leaks = [];
  const allow = new Set(allowTools);

  for (const t of toolUses) {
    if (!allow.has(t.name)) { leaks.push({ kind: 'tool', detail: `uso de ${t.name}` }); continue; }
    const cands = [];
    for (const k of ['file_path', 'path', 'notebook_path']) if (typeof t.input[k] === 'string') cands.push(t.input[k]);
    if (t.name === 'Glob' && typeof t.input.pattern === 'string' && isAbs(t.input.pattern)) cands.push(t.input.pattern.split(/[*?{[]/)[0]);
    for (const c of cands) {
      const n = normPath(c, base);
      if (!inside(n, normRoots)) leaks.push({ kind: 'path', detail: `${t.name} ${c.slice(0, 200)}` });
    }
  }

  const abs = /[A-Za-z]:[\\/][^\s"'`)\]>,;]+|\/(?:home|Users|tmp|var|mnt|c|d)\/[^\s"'`)\]>,;]+/g;
  for (const m of own.match(abs) || []) {
    const n = normPath(m, base);
    if (!inside(n, normRoots)) leaks.push({ kind: 'outside', detail: m.slice(0, 200) });
  }

  if (leak) {
    const hashes = (leak.hashes || []).map((h) => h.toLowerCase());
    for (const tok of new Set((text.toLowerCase().match(/\b[0-9a-f]{7,40}\b/g) || []))) {
      if (hashes.some((h) => h.startsWith(tok))) leaks.push({ kind: 'hash', detail: tok });
    }
    const flat = collapse(text);
    for (const s of leak.strings || []) {
      if (flat.includes(collapse(s.text))) leaks.push({ kind: 'text', detail: `${s.kind} de ${s.defect}: ${s.text.slice(0, 120)}` });
    }
  }
  return { ok: leaks.length === 0, leaks, toolCalls: toolUses.length };
}

function main(argv) {
  const a = parseArgs(argv, ['root']);
  if (!a.file || (!a.case && !a.root)) {
    process.stderr.write('uso: node leak-check.js --file <transcript> --case <id|code> --work <dir> [--root <dir>]... [--leak <file>] [--allow-tools Read,Grep,Glob] [--cwd <dir>]\n');
    return 2;
  }
  let roots = a.root ? a.root.map((r) => path.resolve(r)) : [];
  let leakFile = a.leak;
  if (a.case) {
    if (!a.work && !roots.length) { process.stderr.write('--case pide --work <dir> (o --root)\n'); return 2; }
    const known = loadCases().snapshots.find((s) => s.id === a.case);
    const code = known ? snapshotCode(known.id) : a.case;
    if (a.work) {
      if (!roots.length) roots = [path.resolve(a.work, 'snapshots', code)];
      if (!leakFile) leakFile = path.resolve(a.work, 'snapshots', '_meta', `${code}.leak.json`);
    }
  }
  let raw;
  let leak = null;
  try {
    raw = fs.readFileSync(a.file, 'utf8');
    if (leakFile) leak = JSON.parse(fs.readFileSync(leakFile, 'utf8'));
  } catch (e) {
    process.stderr.write(`leak-check: ${e.message}\n`);
    return 2;
  }
  if (!leak) process.stderr.write('leak-check: aviso, sin material de fuga (--leak): solo se revisan herramientas y rutas\n');
  const r = checkLeak({ raw, roots, leak, allowTools: a['allow-tools'] ? String(a['allow-tools']).split(',') : DEFAULT_TOOLS, cwd: a.cwd });
  process.stdout.write(`${JSON.stringify({ ok: r.ok, toolCalls: r.toolCalls, leaks: r.leaks })}\n`);
  return r.ok ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { checkLeak, parseTranscript, normPath };
