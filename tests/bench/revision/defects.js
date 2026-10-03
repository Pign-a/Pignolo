'use strict';
// Builds one defect card per known defect (card lentes-reales, section 4): id, case, the
// behaviour the fix's test checks, the code of that test, the files and line ranges of the
// defect in the case snapshot, and the known minors of the same commit. The grader (opus, new
// agent, no access to the cards of the experiments) receives these files, never the review text.
//
//   node tests/bench/revision/defects.js --out <dir> [--snapshots <dir>] [--repo <path>]
// Output: <dir>/<defect id>.json, <dir>/<defect id>.md and <dir>/_batches.json
const fs = require('node:fs');
const path = require('node:path');
const { git, loadCases, isTestPath, parseArgs, DEFAULT_REPO, snapshotCode } = require('./lib');

const NOISE = /(^|\/)(CHANGELOG\.md|plugin\.json)$/;

function fixFiles(repo, commit) {
  return git(repo, ['show', '--name-only', '--format=', commit]).split('\n').filter(Boolean)
    .filter((f) => !isTestPath(f) && !NOISE.test(f));
}

// Old-side hunk ranges (git show -U0) of a file; a pure addition takes 3 lines of context per side.
function hunks(repo, commit, file) {
  const out = [];
  for (const l of git(repo, ['show', '--format=', '-U0', commit, '--', file]).split('\n')) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+/.exec(l);
    if (!m) continue;
    const s = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    out.push(n === 0 ? [Math.max(1, s - 2), s + 3] : [s, s + n - 1]);
  }
  return out;
}

// Groups sorted line numbers into clusters (a gap over `gap` lines starts a new one).
function clusters(nums, gap = 20) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out = [];
  for (const n of s) {
    const last = out[out.length - 1];
    if (last && n - last[1] <= gap) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

// Maps the lines of the fix's old side to the snapshots of the defect through git blame: a line a
// snapshot's commit wrote keeps its original line number in that snapshot (exact). Lines written
// by other commits (the defect is an omission) keep their number at fix^ and are flagged approx,
// placed in the last snapshot that has the file.
function snapshotLines(repo, fix, file, snaps) {
  const owners = snaps.map((s) => ({ ...s, full: git(repo, ['rev-parse', s.commit]).trim() }));
  const exact = new Map(); // snapshot id -> { name, nums }
  const approx = [];
  for (const [a, b] of hunks(repo, fix, file)) {
    let blame;
    try { blame = git(repo, ['blame', '--porcelain', '-L', `${a},${b}`, `${fix}^`, '--', file]); } catch { continue; }
    let cur = null;
    for (const l of blame.split('\n')) {
      const h = /^([0-9a-f]{40}) (\d+) (\d+)/.exec(l);
      if (h) {
        cur = { sha: h[1], orig: Number(h[2]), final: Number(h[3]), name: file };
        const owner = owners.find((o) => o.full === cur.sha);
        if (owner) {
          if (!exact.has(owner.id)) exact.set(owner.id, { name: file, nums: [] });
          exact.get(owner.id).nums.push(cur.orig);
          cur.owner = owner.id;
        } else approx.push(cur.final);
      } else if (/^filename /.test(l) && cur && cur.owner) exact.get(cur.owner).name = l.slice(9);
    }
  }
  const out = [];
  for (const [snapshot, v] of exact) {
    for (const [lo, hi] of clusters(v.nums)) out.push({ file: v.name, snapshot, range: [Math.max(1, lo - 10), hi + 10], attributed: v.nums.length, approx: false });
  }
  if (approx.length) {
    const has = owners.filter((o) => { try { git(repo, ['cat-file', '-e', `${o.commit}:${file}`]); return true; } catch { return false; } });
    const target = has[has.length - 1];
    if (target) for (const [lo, hi] of clusters(approx)) out.push({ file, snapshot: target.id, range: [Math.max(1, lo - 10), hi + 10], attributed: 0, approx: true });
  }
  return out;
}

function testCode(repo, commit, file, prefix) {
  const text = git(repo, ['show', `${commit}:${file}`]);
  const lines = text.split('\n');
  const startRe = /^(?:test|it)\(\s*(['"`])(.*)\1\s*,/;
  for (let i = 0; i < lines.length; i += 1) {
    const m = startRe.exec(lines[i]);
    if (!m || !m[2].replace(/\\(.)/g, '$1').startsWith(prefix)) continue;
    let j = i;
    while (j < lines.length && !/^\}\);?\s*$/.test(lines[j])) j += 1;
    return { title: m[2].replace(/\\(.)/g, '$1'), code: lines.slice(i, j + 1).join('\n') };
  }
  return null;
}

function buildCards({ repo, cases, snapshotsDir }) {
  const lentesOf = (d) => cases.lentes.cases.filter((c) => c.defects.includes(d.id)).map((c) => c.id);
  const out = [];
  for (const d of cases.defects) {
    const testCommit = d.testFrom || d.fix;
    const tests = d.tests.map((t) => {
      const found = testCode(repo, testCommit, t.file, t.name);
      return { file: t.file, role: t.role, title: found ? found.title : null, code: found ? found.code : null };
    });
    const files = fixFiles(repo, d.fix);
    const lines = [];
    const snaps = d.introducedIn.map((id) => cases.snapshots.find((s) => s.id === id));
    for (const f of files.filter((x) => /\.(js|mjs|cjs)$/.test(x))) {
      for (const r of snapshotLines(repo, d.fix, f, snaps)) {
        let inTree = null;
        if (snapshotsDir) {
          const p = path.join(snapshotsDir, snapshotCode(r.snapshot), 'tree', r.file);
          inTree = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').length >= r.range[0] : false;
        }
        lines.push({ ...r, inTree });
      }
    }
    const snapSet = new Set(d.introducedIn);
    const minors = cases.minors.filter((m) => m.snapshots.some((s) => snapSet.has(s))).map((m) => ({ id: m.id, text: m.text }));
    out.push({
      id: d.id, plan: d.plan, outOfScope: d.outOfScope || null, distributed: Boolean(d.distributed),
      snapshots: d.introducedIn, lentesCases: lentesOf(d),
      fix: { commit: d.fix, subject: git(repo, ['log', '-1', '--format=%s', d.fix]).trim() },
      testCommit, tests, behaviour: d.behaviour, reviewLocation: d.reviewLocation, files, lines, minors,
    });
  }
  return out;
}

function cardMd(c) {
  const parts = [
    `# Defecto ${c.id}`,
    '',
    `- Plan: ${c.plan}${c.outOfScope ? ` (FUERA DE ALCANCE: ${c.outOfScope})` : ''}`,
    `- Casos de lentes-reales: ${c.lentesCases.join(', ') || '(ninguno)'}; introducido en: ${c.snapshots.join(', ')}${c.distributed ? ' (repartido entre varias tareas)' : ''}`,
    `- Arreglo: ${c.fix.commit} ${c.fix.subject}`,
    '',
    '## Conducta errónea observable',
    '',
    c.behaviour,
    '',
    `Ubicación según la revisión original: ${c.reviewLocation}`,
    '',
    '## Archivos y líneas en la instantánea (las que el arreglo cambia, ± 10)',
    '',
    ...(c.lines.length ? c.lines.map((l) => `- ${l.file} en la instantánea ${l.snapshot}: líneas ${l.range[0]}-${l.range[1]}${l.approx ? " (aproximado: líneas anteriores al commit del caso, defecto por omisión)" : ` (${l.attributed} líneas atribuidas por blame al commit del caso)`}`) : ['- (el arreglo no cambia código fuente)']),
    `- Archivos que cambia el arreglo: ${c.files.join(', ') || '(ninguno)'}`,
    '',
    '## Test del arreglo (falla sin el arreglo)',
    '',
    ...c.tests.flatMap((t) => [`Archivo: ${t.file} (${t.role})`, '', '```js', t.code || '(código no encontrado)', '```', '']),
    '## Menores conocidos del mismo commit (un hallazgo que empareja con uno de estos no es una falsa alarma)',
    '',
    ...(c.minors.length ? c.minors.map((m) => `- ${m.id}: ${m.text}`) : ['- (ninguno)']),
    '',
  ];
  return parts.join('\n');
}

function batches(cases, cards) {
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const minorsOf = (snaps) => cases.minors.filter((m) => m.snapshots.some((s) => snaps.has(s))).map((m) => m.id);
  const lentes = {};
  for (const c of cases.lentes.cases) lentes[c.id] = { snapshot: c.snapshot, kind: c.kind, defects: c.defects, minors: minorsOf(new Set([c.snapshot])) };
  const momento = {};
  for (const [batch, ids] of Object.entries(cases.momento.scope)) {
    const snaps = new Set(cases.momento.blocks.filter((b) => b.batch === batch).flatMap((b) => b.runs.map((r) => r.snapshot)));
    momento[batch] = { defects: ids, minors: minorsOf(snaps), outOfScope: cards.filter((c) => c.plan === (batch === 'ui' ? 'ui' : batch) && c.outOfScope).map((c) => c.id) };
  }
  void byId;
  return { lentes, momento };
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.out) {
    process.stderr.write('uso: node defects.js --out <dir> [--snapshots <dir>] [--repo <path>]\n');
    process.exit(2);
  }
  try {
    const cases = loadCases();
    const repo = a.repo ? path.resolve(a.repo) : DEFAULT_REPO;
    const cards = buildCards({ repo, cases, snapshotsDir: a.snapshots ? path.resolve(a.snapshots) : null });
    fs.mkdirSync(a.out, { recursive: true });
    for (const c of cards) {
      fs.writeFileSync(path.join(a.out, `${c.id}.json`), `${JSON.stringify(c, null, 2)}\n`);
      fs.writeFileSync(path.join(a.out, `${c.id}.md`), cardMd(c));
    }
    fs.writeFileSync(path.join(a.out, '_batches.json'), `${JSON.stringify(batches(cases, cards), null, 2)}\n`);
    for (const c of cards) process.stdout.write(`${c.id}\ttests ${c.tests.length} (${c.tests.filter((t) => !t.code).length} sin codigo)\tfiles ${c.files.length}\tlines ${c.lines.map((l) => `${l.file}:${l.range.join('-')}${l.inTree === false ? '!NOT-IN-TREE' : ''}`).join(',')}\n`);
  } catch (e) {
    process.stderr.write(`defects: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { buildCards, cardMd, testCode, snapshotLines, fixFiles, batches };
