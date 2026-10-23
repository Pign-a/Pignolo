// Blind-grading package: neutral labels, seeded shuffle, key kept outside the packs.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, check } from './config.mjs';

const LABELS = 'XYZWVUTSRQPONMLK'.split('');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, seed) {
  const a = [...list];
  const rnd = mulberry32(Number(seed) || 0);
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Drops the sections of a unified diff whose path starts with one of the prefixes.
export function filterPatch(patch, prefixes) {
  const parts = patch.split(/^(?=diff --git )/m);
  return parts.filter((p) => {
    const m = p.match(/^diff --git a\/(\S+) b\//);
    if (!m) return true;
    return !prefixes.some((x) => m[1] === x.replace(/\/$/, '') || m[1].startsWith(x.endsWith('/') ? x : `${x}/`));
  }).join('');
}

function countLines(patch) {
  let added = 0;
  let removed = 0;
  const files = new Set();
  for (const l of patch.split('\n')) {
    const m = l.match(/^diff --git a\/(\S+) b\//);
    if (m) files.add(m[1]);
    else if (l.startsWith('+') && !l.startsWith('+++')) added += 1;
    else if (l.startsWith('-') && !l.startsWith('---')) removed += 1;
  }
  return { filesChanged: files.size, linesAdded: added, linesRemoved: removed };
}

const GRADER_PROMPT = `# Grader instructions

You review one candidate change at a time. Each candidate is a folder \`pack-<k>\` with:

- \`diff.patch\`: the full change, as a unified diff against the starting commit.
- \`meta.json\`: a neutral label and size counts.

\`task-prompt.md\` (next to the packs) holds the request the candidate was asked to fulfil. You do not know how any candidate was produced, and you must not try to find out. Judge only what the diff shows.

## What to assess

1. Correctness against the task prompt: does the change do what was asked, and nothing else?
2. Regressions: does it break existing behavior, tests or contracts?
3. Security problems: injection, broken access checks, secrets, unsafe input handling.
4. Code quality: fit with the surrounding code, clarity, size, dead code, needless complexity.

A serious finding is only something that affects correctness, data or the requirements. Style preferences are not findings.

## Output

For each candidate, output exactly one JSON object and nothing else:

\`\`\`json
{ "label": "X", "serious_findings": ["one short sentence per finding, with file and line"], "correctness": 0, "quality": 0 }
\`\`\`

\`correctness\` and \`quality\` are integers from 0 to 5. Give an empty \`serious_findings\` list when there are none.
`;

export function blind(cfg, { task, reps, force = false, allowLeaks = false }) {
  const { taskDir } = runPaths(cfg, { task, arm: Object.keys(cfg.arms)[0], rep: 1 });
  const repList = [...new Set(reps.map(Number))].sort((a, b) => a - b);
  if (!repList.length || repList.some((r) => !Number.isInteger(r) || r < 1)) throw new Error('--reps necesita una lista de enteros, por ejemplo 1,2,3');
  const base = path.join(cfg.privateRoot, 'blind', task);
  if (fs.existsSync(base) && !force) throw new Error(`ya existe ${base}; usá --force para regenerar los paquetes (se rehacen desde las corridas)`);

  const runs = [];
  for (const arm of Object.keys(cfg.arms).sort()) {
    for (const rep of repList) {
      const { dir } = runPaths(cfg, { task, arm, rep });
      const pf = path.join(dir, 'changes.patch');
      if (!fs.existsSync(pf)) throw new Error(`falta ${pf}; corré accept para ${task}/${arm}/${rep}`);
      runs.push({ arm, rep, patch: filterPatch(fs.readFileSync(pf, 'utf8'), cfg.blindExcludePaths) });
    }
  }
  if (runs.length > LABELS.length) throw new Error('demasiadas corridas para etiquetar');

  const terms = [...Object.values(cfg.arms).map((a) => a.pluginName), ...(cfg.blindLeakTerms || [])].filter(Boolean);
  const leaks = [];
  for (const r of runs) {
    for (const t of terms) if (r.patch.toLowerCase().includes(t.toLowerCase())) leaks.push({ arm: r.arm, rep: r.rep, term: t });
  }
  if (leaks.length && !allowLeaks) {
    throw new Error(`el diff nombra el método y revelaría el brazo: ${leaks.map((l) => `${l.arm}/${l.rep} ("${l.term}")`).join(', ')}; limpialo o usá --allow-leaks`);
  }

  const order = shuffle(runs, cfg.seed);
  if (fs.existsSync(base)) {
    for (const e of fs.readdirSync(base)) {
      if (/^pack-\d+$/.test(e)) fs.rmSync(path.join(base, e), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(base, { recursive: true });
  const key = {};
  order.forEach((r, i) => {
    const label = LABELS[i];
    key[label] = { arm: r.arm, rep: r.rep };
    const pack = path.join(base, `pack-${i + 1}`);
    fs.mkdirSync(pack);
    fs.writeFileSync(path.join(pack, 'diff.patch'), r.patch);
    fs.writeFileSync(path.join(pack, 'meta.json'), JSON.stringify({ label, task, ...countLines(r.patch) }, null, 2));
  });
  fs.writeFileSync(path.join(base, 'key.json'), JSON.stringify(key, null, 2));
  fs.writeFileSync(path.join(base, 'grader-prompt.md'), GRADER_PROMPT);
  fs.copyFileSync(path.join(taskDir, 'prompt.md'), path.join(base, 'task-prompt.md'));
  return { packs: order.length, dir: base, leaks };
}

export function unblind(cfg, { task, input, force = false }) {
  check(cfg, { task, arm: Object.keys(cfg.arms)[0], rep: 1 });
  const keyFile = path.join(cfg.privateRoot, 'blind', task, 'key.json');
  if (!fs.existsSync(keyFile)) throw new Error(`falta ${keyFile}; corré blind primero`);
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  let items = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^﻿/, ''));
  if (!Array.isArray(items)) items = items.results || items.grades || [items];
  let grades = [];
  try { grades = JSON.parse(fs.readFileSync(cfg.gradesPath, 'utf8')); } catch { /* none yet */ }

  const added = items.map((it) => {
    const k = key[it.label];
    if (!k) throw new Error(`etiqueta desconocida: ${it.label}`);
    for (const f of ['correctness', 'quality']) {
      if (!Number.isFinite(it[f]) || it[f] < 0 || it[f] > 5) throw new Error(`${f} debe ser un número de 0 a 5 (etiqueta ${it.label})`);
    }
    if (!Array.isArray(it.serious_findings)) throw new Error(`serious_findings debe ser una lista (etiqueta ${it.label})`);
    return { task, arm: k.arm, rep: k.rep, label: it.label, correctness: it.correctness, quality: it.quality, serious_findings: it.serious_findings };
  });
  const same = (g, a) => g.task === a.task && g.arm === a.arm && g.rep === a.rep;
  for (const a of added) {
    if (grades.some((g) => same(g, a)) && !force) throw new Error(`ya hay nota para ${task}/${a.arm}/${a.rep}; usá --force para reemplazarla`);
  }
  grades = grades.filter((g) => !added.some((a) => same(g, a))).concat(added);
  fs.mkdirSync(path.dirname(cfg.gradesPath), { recursive: true });
  fs.writeFileSync(cfg.gradesPath, `${JSON.stringify(grades, null, 2)}\n`);
  return { graded: added.length };
}
