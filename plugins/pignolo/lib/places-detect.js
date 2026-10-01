'use strict';
// Detección de lo que ya hay y de lo suelto o mal ubicado (hito 8d, Task 4; R-15, R-16, R-23).
// Solo lista y cuenta: no abre ningún documento. Todo recorrido es manual (walkTree) y no atraviesa enlaces.
const nodeFs = require('node:fs');
const path = require('node:path');
const { resolvePlaces, declaredPatternFor } = require('./places');
const SM = require('./safe-move');

const { isLinkOrOutside, walkTree, gitList, makeRun, isToolOwned, nonDocFile, norm, fold } = SM;

const CANDIDATES = Object.freeze({
  spec: Object.freeze(['docs/specs/', 'doc/specs/', 'specs/', 'docs/superpowers/specs/', 'openspec/specs/']),
  plan: Object.freeze(['docs/plans/', 'doc/plans/', 'plans/', 'docs/superpowers/plans/', 'openspec/changes/']),
  research: Object.freeze(['docs/research/', 'doc/research/', 'research/', 'docs/audits/', 'docs/notes/']),
  reference: Object.freeze(['docs/references/', 'references/', 'docs/client/', 'client/', 'briefs/']),
  design: Object.freeze(['design/', 'designs/']),
  private: Object.freeze(['local/', 'private/', '.private/']),
});

// R-16: clasificación solo por nombre (no hay regla de research ni lectura de contenido).
const NAME_RULES = Object.freeze([
  Object.freeze({ kind: 'spec', re: /^\d{4}-\d{2}-\d{2}-.+-design\.md$/ }),
  Object.freeze({ kind: 'plan', re: /^\d{4}-\d{2}-\d{2}-.+-plan\.md$/ }),
]);

const SENSITIVE = [/^\.env/i, /\.pem$/i, /\.key$/i, /\.p12$/i, /^id_rsa/i];

function classifyFile(rel) {
  const base = String(rel).replace(/\\/g, '/').split('/').pop();
  const rule = NAME_RULES.find((r) => r.re.test(base));
  return rule ? rule.kind : null;
}

// Nombre real en el disco de cada componente (insensible a mayúsculas donde el sistema lo es); null si no existe.
function realPath(root, rel, fs) {
  const parts = norm(rel).split('/');
  const out = [];
  let dir = root;
  for (const p of parts) {
    let names;
    try { names = fs.readdirSync(dir); } catch (_) { return null; }
    const name = names.includes(p) ? p : names.find((n) => fold(n) === fold(p));
    if (!name) return null;
    out.push(name);
    dir = path.join(dir, name);
  }
  return out.join('/');
}

function caseCollisions(root, fs) {
  let names = [];
  try { names = fs.readdirSync(root); } catch (_) { return []; }
  const groups = new Map();
  for (const n of names) {
    const k = n.toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(n);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => [...g].sort());
}

function hasCommits(run, root) {
  try { run(['rev-parse', '--verify', '--quiet', 'HEAD'], root); return true; } catch (_) { return false; }
}

function detectPlaces({ root, run, fs = nodeFs } = {}) {
  const git = run || makeRun(root);
  const candidates = [];
  for (const [kind, list] of Object.entries(CANDIDATES)) {
    for (const cand of list) {
      const real = realPath(root, cand, fs);
      if (!real) continue;
      if (isLinkOrOutside(root, real, fs).bad) continue;
      let st;
      try { st = fs.lstatSync(path.join(root, ...real.split('/'))); } catch (_) { continue; }
      if (!st.isDirectory()) continue;
      const w = walkTree(root, real, fs);
      const tracked = gitList(git, root, ['ls-files', '-z', '--', `:(literal)${real}`]).length;
      candidates.push({
        kind, path: `${real}/`, files: w.files.length, trackedFiles: tracked, containsNonDoc: w.files.some((f) => nonDocFile(f.path)),
        toolOwned: isToolOwned(root, real, fs), tooBig: w.tooBig, why: `carpeta existente (${cand})`,
      });
    }
  }
  const ambiguous = Object.keys(CANDIDATES).filter((k) => candidates.filter((c) => c.kind === k).length > 1);
  let others = [];
  try { others = fs.readdirSync(root).filter((n) => n !== '.git' && n !== '.pignolo'); } catch (_) { others = []; }
  const existing = hasCommits(git, root) || others.length > 0;
  return { candidates, ambiguous, caseCollisions: caseCollisions(root, fs), existing };
}

function findStray({ root, run, fs = nodeFs, config } = {}) {
  const git = run || makeRun(root);
  const stray = [];
  for (const f of gitList(git, root, ['ls-files', '-z', '-o', '--exclude-standard'])) {
    const rel = norm(f);
    if (rel.includes('/')) continue;
    if (isLinkOrOutside(root, rel, fs).bad) continue;
    if (SENSITIVE.some((re) => re.test(rel))) stray.push({ path: rel, severity: 'high', note: 'archivo sensible sin versionar y sin ignorar: agregalo al .gitignore (no se mueve)' });
    else stray.push({ path: rel, severity: 'info', note: 'archivo suelto en la raíz sin versionar ni ignorar (un Makefile o un vercel.json sin versionar pueden ser un falso positivo)' });
  }

  const misplaced = [];
  const resolved = resolvePlaces(config || {}).places;
  const declared = Object.values(resolved).filter((p) => p.source === 'declared' && p.path);
  if (declared.length) {
    const places = declared.map((p) => ({ kind: p.kind, dir: norm(p.path) }));
    for (const f of gitList(git, root, ['ls-files', '-z', '-c', '-o', '--exclude-standard'])) {
      const rel = norm(f);
      const kind = classifyFile(rel);
      if (!kind) continue;
      const place = places.find((p) => p.kind === kind);
      if (!place) continue;
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      if (fold(dir) === fold(place.dir)) continue;
      if (dir !== '' && !places.some((p) => fold(p.dir) === fold(dir))) continue; // solo la raíz o hijos directos de otro lugar declarado
      if (declaredPatternFor(config, rel)) continue;
      if (isLinkOrOutside(root, rel, fs).bad) continue;
      const to = `${place.dir}/${rel.split('/').pop()}`;
      let taken = false;
      try { fs.lstatSync(path.join(root, ...to.split('/'))); taken = true; } catch (_) { taken = false; }
      const entry = { path: rel, kind, expected: `${place.dir}/`, suggest: taken ? null : { from: rel, to } };
      if (taken) entry.reason = 'dest-exists';
      misplaced.push(entry);
    }
  }
  return { stray, misplaced };
}

module.exports = { CANDIDATES, NAME_RULES, detectPlaces, classifyFile, findStray };
