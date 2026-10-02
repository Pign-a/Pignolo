'use strict';
// Builds the frozen snapshots of the revision benchmarks (card section 5): a folder outside every
// repository with
//   tree/                 `git archive <commit>` unpacked: no .git, no later history
//   brief/diff.patch      `git diff <parent>..<commit>` of the non-test source files
//   brief/files.txt       `git diff --numstat <parent>..<commit>` of every file
//   brief/task-card.md    the commit message and, when a plan names those files, its task section
// The folder name is a neutral code (see lib.js snapshotCode). Metadata and the leak material used
// by leak-check.js go to <out>/_meta/<code>.json and <out>/_meta/<code>.leak.json, outside the
// folder the reviewer may read.
//
//   node tests/bench/revision/snapshot.js --all --out <dir> [--repo <path>]
//   node tests/bench/revision/snapshot.js --id <snapshot id> --out <dir>
//   node tests/bench/revision/snapshot.js --commit <sha> --parent <sha> --dir <dir>   (raw, no card)
const fs = require('node:fs');
const path = require('node:path');
const { git, loadCases, snapshotCode, isSourcePath, isTestPath, parseArgs, DEFAULT_REPO, snapshotById } = require('./lib');

// ---- minimal tar extractor (git archive output: ustar + pax headers). No external tar: GNU tar
// reads "C:/x" as a remote host and bsdtar differs, so the extraction is done here.
function parsePax(buf) {
  const rec = {};
  let i = 0;
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i);
    if (sp < 0) break;
    const len = Number(buf.toString('utf8', i, sp));
    if (!len) break;
    const line = buf.toString('utf8', sp + 1, i + len - 1);
    const eq = line.indexOf('=');
    if (eq > 0) rec[line.slice(0, eq)] = line.slice(eq + 1);
    i += len;
  }
  return rec;
}

function cstr(buf, from, to) {
  const s = buf.subarray(from, to);
  const z = s.indexOf(0);
  return s.toString('utf8', 0, z < 0 ? s.length : z);
}

function* tarEntries(buf) {
  let off = 0;
  let pending = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    let name = cstr(h, 0, 100);
    const size = parseInt(cstr(h, 124, 136).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 0x30);
    const link = cstr(h, 157, 257);
    const prefix = cstr(h, 345, 500);
    if (prefix) name = `${prefix}/${name}`;
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'g') continue;
    if (type === 'x') { pending = parsePax(body); continue; }
    const entry = { name: (pending && pending.path) || name, type, link: (pending && pending.linkpath) || link, body };
    pending = null;
    yield entry;
  }
}

function extractTar(buf, dest) {
  const root = path.resolve(dest);
  const skipped = [];
  let files = 0;
  for (const e of tarEntries(buf)) {
    const target = path.resolve(root, e.name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`entrada fuera del destino: ${e.name}`);
    if (e.type === '5') { fs.mkdirSync(target, { recursive: true }); continue; }
    if (e.type === '0' || e.type === '\0' || e.type === '7') {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.body);
      files += 1;
    } else skipped.push(`${e.name} (${e.type === '2' ? `symlink -> ${e.link}` : `tipo ${e.type}`})`);
  }
  return { files, skipped };
}

// ---- task card
const TRAILERS = /^(Claude-Session|Co-Authored-By):.*$/gim;
function commitMessage(repo, commit) {
  return git(repo, ['log', '-1', '--format=%B', commit]).replace(TRAILERS, '').replace(/\n{3,}/g, '\n\n').trim();
}

function planText(repo, cases, planKey, commit) {
  const p = cases.plans[planKey];
  if (!p) throw new Error(`plan desconocido: ${planKey}`);
  const at = p.from === 'tree' ? commit : p.from;
  try {
    return git(repo, ['show', `${at}:${p.file}`]);
  } catch (e) {
    throw new Error(`no se pudo leer ${p.file} en ${at}: ${e.message}`);
  }
}

// Sections `## Task N` / `### Task N: ...` up to the next heading of the same or higher level.
function planSections(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,4})\s+Task\s+(\d+[a-z]?)\b/.exec(lines[i]);
    if (!m) continue;
    const depth = m[1].length;
    let j = i + 1;
    while (j < lines.length) {
      const h = /^(#{1,6})\s/.exec(lines[j]);
      if (h && h[1].length <= depth) break;
      j += 1;
    }
    out.push({ n: m[2], heading: lines[i], text: lines.slice(i, j).join('\n').trimEnd() });
  }
  return out;
}

const pluginRel = (f) => f.replace(/^plugins\/[^/]+\//, '');
// A section "names" a file when its heading (first choice) or body contains the path relative to
// the plugin or the repo path.
function sectionsNaming(sections, files) {
  const names = files.flatMap((f) => [f, pluginRel(f)]);
  const inHeading = sections.filter((s) => names.some((n) => s.heading.includes(n)));
  if (inHeading.length) return inHeading;
  return sections.filter((s) => names.some((n) => s.text.includes(n)));
}

function changedSourceFiles(repo, parent, commit) {
  return git(repo, ['diff', '--numstat', `${parent}..${commit}`]).split('\n').filter(Boolean)
    .map((l) => l.split('\t')[2]).filter((f) => f && isSourcePath(f));
}

function buildCard(repo, cases, snap) {
  const card = snap.card;
  const parts = [];
  if (card.mode === 'task') {
    parts.push(`# Task card\n\nCommit message of the task (${snap.commit}):\n\n${commitMessage(repo, snap.commit)}`);
    if (card.plan) {
      const text = planText(repo, cases, card.plan, snap.commit);
      const sections = planSections(text);
      const chosen = card.tasks
        ? card.tasks.map((n) => sections.find((s) => s.n === n)).filter(Boolean)
        : sectionsNaming(sections, changedSourceFiles(repo, snap.parent, snap.commit));
      if (card.tasks && chosen.length !== card.tasks.length) throw new Error(`falta una seccion de tarea ${card.tasks} en el plan ${card.plan}`);
      if (chosen.length) parts.push(`## Task section of the plan (${cases.plans[card.plan].file})\n\n${chosen.map((s) => s.text).join('\n\n')}`);
      else parts.push('(No plan section names the files of this change.)');
    }
  } else if (card.mode === 'plan') {
    parts.push(`# Plan (whole document)\n\n${planText(repo, cases, card.plan, snap.commit)}`);
  } else if (card.mode === 'plans') {
    for (const p of card.parts) {
      parts.push(`# ${p.label}\n\n${p.message ? commitMessage(repo, p.message) : planText(repo, cases, p.plan, snap.commit)}`);
    }
  } else throw new Error(`modo de tarjeta desconocido: ${card.mode}`);
  return `${parts.join('\n\n---\n\n')}\n`;
}

// ---- snapshot
function buildSnapshot({ repo = DEFAULT_REPO, commit, parent, dir, cardText = '' }) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'tree'))) throw new Error(`ya existe ${path.join(dir, 'tree')}: no se pisa una instantanea`);
  const tar = git(repo, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'archive', '--format=tar', commit], { buffer: true });
  const { files, skipped } = extractTar(tar, path.join(dir, 'tree'));
  fs.mkdirSync(path.join(dir, 'brief'), { recursive: true });
  const numstat = git(repo, ['diff', '--numstat', `${parent}..${commit}`]);
  fs.writeFileSync(path.join(dir, 'brief', 'files.txt'), numstat);
  const rows = numstat.split('\n').filter(Boolean).map((l) => l.split('\t'));
  const src = rows.filter((r) => isSourcePath(r[2]));
  const patch = src.length ? git(repo, ['diff', `${parent}..${commit}`, '--', ...src.map((r) => r[2])]) : '';
  fs.writeFileSync(path.join(dir, 'brief', 'diff.patch'), patch);
  fs.writeFileSync(path.join(dir, 'brief', 'task-card.md'), cardText);
  const sum = (rs) => rs.reduce((a, r) => a + (Number(r[0]) || 0), 0);
  return {
    files, skipped, filesChanged: rows.length, sourceAdded: sum(src), testAdded: sum(rows.filter((r) => isTestPath(r[2]))),
    sourceFiles: src.map((r) => r[2]), hasGitDir: fs.existsSync(path.join(dir, 'tree', '.git')),
  };
}

// ---- leak material: what only exists in the future of every snapshot
function walkText(dir) {
  const parts = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && fs.statSync(p).size < 2_000_000) {
        const buf = fs.readFileSync(p);
        if (!buf.includes(0)) parts.push(buf.toString('utf8'));
      }
    }
  }
  return parts.join('\n');
}

// What only exists in the future of a snapshot: the candidates whose text is not already in its tree.
function leakMaterial(cand, treeDir) {
  const treeText = treeDir ? walkText(treeDir) : '';
  return { hashes: cand.hashes, strings: cand.strings.filter((s) => !treeText.includes(s.text)) };
}

// Candidate leak strings and hashes, computed once from git (the fix commits and their tests).
function leakCandidates(repo, cases) {
  const hashes = new Set();
  const strings = [];
  const seen = new Set();
  const add = (text, kind, defect) => {
    const t = text.trim();
    if (t.length < 25 || seen.has(t)) return;
    seen.add(t);
    strings.push({ text: t, kind, defect });
  };
  for (const d of cases.defects) {
    for (const c of new Set([d.fix, d.testFrom].filter(Boolean))) {
      const full = git(repo, ['rev-parse', c]).trim();
      hashes.add(full);
      const subject = git(repo, ['log', '-1', '--format=%s', c]).trim();
      add(subject, 'commit-message', d.id);
      const after = subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '');
      add(after, 'commit-message', d.id);
    }
    const testCommit = d.testFrom || d.fix;
    for (const t of d.tests) {
      const diff = git(repo, ['show', '--format=', '-U0', testCommit, '--', t.file]).split('\n');
      for (const l of diff) {
        if (!/^\+(?!\+\+)/.test(l)) continue;
        const body = l.slice(1);
        const title = /^\s*(?:test|it|describe)\(\s*(['"`])(.+)\1/.exec(body);
        if (title) add(title[2], 'test-title', d.id);
        else if (body.trim().length >= 40 && !/^\s*(import\b|(const|let|var)\s.*=\s*require\(|\}\s*from\s)/.test(body)) add(body, 'test-line', d.id);
      }
    }
  }
  return { hashes: [...hashes], strings };
}

function writeAll({ repo, out, only, leakOnly = false }) {
  const cases = loadCases();
  const meta = [];
  const used = new Map();
  const cand = leakCandidates(repo, cases);
  for (const snap of cases.snapshots) {
    if (only && snap.id !== only) continue;
    const code = snapshotCode(snap.id);
    if (used.has(code)) throw new Error(`colision de codigo: ${snap.id} y ${used.get(code)}`);
    used.set(code, snap.id);
    const dir = path.join(out, code);
    fs.mkdirSync(path.join(out, '_meta'), { recursive: true });
    let info;
    if (leakOnly) {
      // Recompute only the leak material of an existing snapshot (its tree is not touched).
      info = JSON.parse(fs.readFileSync(path.join(out, '_meta', `${code}.json`), 'utf8'));
    } else {
      info = buildSnapshot({ repo, commit: snap.commit, parent: snap.parent, dir, cardText: buildCard(repo, cases, snap) });
    }
    const m = { id: snap.id, code, commit: snap.commit, parent: snap.parent, ...info };
    if (!leakOnly) fs.writeFileSync(path.join(out, '_meta', `${code}.json`), `${JSON.stringify(m, null, 2)}\n`);
    fs.writeFileSync(path.join(out, '_meta', `${code}.leak.json`), `${JSON.stringify(leakMaterial(cand, path.join(dir, 'tree')), null, 2)}\n`);
    meta.push(m);
    process.stdout.write(`${snap.id}\t${code}\t${snap.commit}..${snap.parent}\tsrc+${info.sourceAdded}\tfiles ${info.files}\tskipped ${info.skipped.length}\n`);
  }
  fs.mkdirSync(path.join(out, '_meta'), { recursive: true });
  const mapFile = path.join(out, '_meta', 'map.json');
  const prev = fs.existsSync(mapFile) && only ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
  for (const m of meta) prev[m.id] = m.code;
  fs.writeFileSync(mapFile, `${JSON.stringify(prev, null, 2)}\n`);
  return meta;
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const repo = a.repo ? path.resolve(a.repo) : DEFAULT_REPO;
  try {
    if (a.commit && a.parent && a.dir) {
      const info = buildSnapshot({ repo, commit: a.commit, parent: a.parent, dir: path.resolve(a.dir), cardText: a.card ? fs.readFileSync(a.card, 'utf8') : '' });
      process.stdout.write(`${JSON.stringify(info)}\n`);
    } else if ((a.all || a.id) && a.out) {
      if (a.id) snapshotById(loadCases(), a.id);
      writeAll({ repo, out: path.resolve(a.out), only: a.id, leakOnly: Boolean(a["leak-only"]) });
    } else {
      process.stderr.write('uso: node snapshot.js --all --out <dir> | --id <id> --out <dir> | --commit <sha> --parent <sha> --dir <dir> [--card <file>]\n');
      process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`snapshot: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { extractTar, tarEntries, buildSnapshot, buildCard, leakCandidates, leakMaterial, planSections, sectionsNaming, commitMessage, writeAll };
