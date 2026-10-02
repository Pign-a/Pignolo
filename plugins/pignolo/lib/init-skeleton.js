'use strict';
// Paso `skeleton` de /pignolo:init (hito 8d, Task 5; R-5, R-6): crea la carpeta de cada tipo que no existe, con un README corto,
// y nunca toca lo que ya hay ni sale del proyecto. Todo archivo nuevo se crea con flag `wx`; toda ruta pasa por `isLinkOrOutside`.
// `local/` (tipo `private`) es privada: lleva su propio `.gitignore` con `*`. Sin `.gitkeep`.
const nodeFs = require('node:fs');
const path = require('node:path');
const { PLACE_KINDS, RECOMMENDED_REFERENCE, validatePlacePath } = require('./places');
const SM = require('./safe-move');

const { isLinkOrOutside, gitList, makeRun, norm, fold } = SM;
const TEMPLATES = path.join(__dirname, '..', 'templates', 'places');
const abs = (root, rel) => path.join(root, ...norm(rel).split('/'));
const GITIGNORE_TEXT = '*\n';

class Refuse extends Error {
  constructor(reason, files) { super(reason); this.reason = reason; this.files = files; }
}

// Primer componente cuyo nombre en el disco difiere en mayúsculas del pedido.
function caseClash(root, rel, fs) {
  if (process.platform === 'linux') return null;
  const parts = norm(rel).split('/');
  for (let i = 0; i < parts.length; i += 1) {
    let names;
    try { names = fs.readdirSync(path.join(root, ...parts.slice(0, i))); } catch (_) { return null; }
    if (names.includes(parts[i])) continue;
    const other = names.find((n) => n.toLowerCase() === parts[i].toLowerCase());
    if (other) return `${parts.slice(0, i).concat(other).join('/')} (en el disco) vs ${parts.slice(0, i + 1).join('/')}`;
    return null;
  }
  return null;
}

const kindOf = (fs, file) => { try { return fs.lstatSync(file).isDirectory() ? 'dir' : 'other'; } catch (_) { return null; } };

function applySkeleton({ root, places, answers = {}, leftKinds = [], willExist = [], run, dry = false, fs = nodeFs } = {}) {
  const git = run || makeRun(root);
  const step = { id: 'skeleton', status: 'skipped', created: [], skipped: [], refused: [], notes: [] };
  const hidden = [];
  const exists = (rel) => willExist.some((w) => fold(norm(w)) === fold(norm(rel)));

  const readme = (kind) => nodeFs.readFileSync(path.join(TEMPLATES, `${kind}.md`), 'utf8');

  // Crea los componentes que faltan de `rel` (uno por uno, cada uno revisado antes) y devuelve los que creó.
  const makeDirs = (rel) => {
    const parts = norm(rel).split('/');
    for (let i = 1; i <= parts.length; i += 1) {
      const sub = parts.slice(0, i).join('/');
      const g = isLinkOrOutside(root, sub, fs);
      if (g.bad) throw new Refuse(g.reason, [g.at]);
      if (kindOf(fs, abs(root, sub)) !== null) continue;
      try { fs.mkdirSync(abs(root, sub)); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
  };
  const writeNew = (rel, text) => {
    const g = isLinkOrOutside(root, rel, fs);
    if (g.bad) throw new Refuse(g.reason, [g.at]);
    try { fs.writeFileSync(abs(root, rel), text, { flag: 'wx' }); } catch (e) {
      if (e.code === 'EEXIST') { step.skipped.push({ path: rel, reason: 'exists' }); return false; }
      throw e;
    }
    return true;
  };

  const handle = (kind, relRaw) => {
    const v = validatePlacePath(relRaw);
    if (!v.ok) throw new Refuse(`invalid-path:${v.reason}`);
    const rel = v.path.replace(/\/$/, '');
    const g = isLinkOrOutside(root, rel, fs);
    if (g.bad) throw new Refuse(g.reason, [g.at]);
    const isPrivate = kind === 'private';
    // Lo versionado se mira sin distinguir mayúsculas y antes que el disco: `Local/x` versionado no aparece con `local/` (medido).
    const tracked = isPrivate ? gitList(git, root, ['ls-files', '-z', '--', `:(icase,literal)${rel}`]) : [];
    if (tracked.length) throw new Refuse('tracked-files', tracked);
    const clash = caseClash(root, rel, fs);
    if (clash) throw new Refuse('case-collision', [clash]);
    const present = kindOf(fs, abs(root, rel));
    if (present === 'other') throw new Refuse('not-a-dir', [rel]);
    const folder = `${rel}/`;

    if (!isPrivate) {
      if (present === 'dir' || exists(folder)) { step.skipped.push({ path: folder, reason: 'exists' }); return; }
      if (dry) { step.created.push(folder, `${rel}/README.md`); return; }
      makeDirs(rel);
      step.created.push(folder);
      if (writeNew(`${rel}/README.md`, readme(kind))) step.created.push(`${rel}/README.md`);
      return;
    }

    // private (R-6): crear, adoptar o dejar; nunca mover.
    const gi = `${rel}/.gitignore`;
    if (present !== 'dir' && !exists(folder)) {
      if (dry) { step.created.push(folder, gi, `${rel}/README.md`); return; }
      makeDirs(rel);
      step.created.push(folder);
      if (writeNew(gi, GITIGNORE_TEXT)) step.created.push(gi);
      if (writeNew(`${rel}/README.md`, readme(kind))) step.created.push(`${rel}/README.md`);
      return;
    }
    if (present !== 'dir') { step.skipped.push({ path: folder, reason: 'exists' }); return; }
    let giText = null;
    try { giText = fs.readFileSync(abs(root, gi), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (giText !== null) {
      if (giText === GITIGNORE_TEXT) { step.skipped.push({ path: gi, reason: 'exists' }); return; }
      throw new Refuse('gitignore-exists', [gi]);
    }
    let ignored = false;
    try { git(['check-ignore', '-q', '--', `${rel}/.probe`], root); ignored = true; } catch (e) {
      if (!(e && e.status === 1)) throw new Refuse('scan-failed', [e.message]);
    }
    if (ignored) { step.skipped.push({ path: folder, reason: 'ignored-already' }); return; }
    for (const f of gitList(git, root, ['ls-files', '-z', '-o', '--exclude-standard', '--', `:(literal)${rel}`])) hidden.push(norm(f));
    if (dry) { step.created.push(gi); return; }
    if (writeNew(gi, GITIGNORE_TEXT)) step.created.push(gi);
  };

  for (const kind of PLACE_KINDS) {
    const p = places && places[kind];
    let rel = p && p.source !== 'undeclared' ? p.path : null;
    if (kind === 'reference') {
      if (answers.public !== false) {
        if (rel) step.notes.push('repo público o sin respuesta: el material del cliente no se versiona; usá local/ (reference no se crea)');
        else step.notes.push('repo público o sin respuesta: el material del cliente no se versiona; usá local/');
        continue;
      }
      if (!rel) rel = RECOMMENDED_REFERENCE;
    }
    if (!rel) continue;
    if (leftKinds.includes(kind)) { step.notes.push(`${kind}: hay una carpeta existente que se dejó; no se crea la carpeta por defecto al lado`); continue; }
    try {
      handle(kind, rel);
    } catch (e) {
      if (!(e instanceof Refuse)) throw e;
      step.refused.push({ kind, reason: e.reason, ...(e.files ? { files: e.files } : {}) });
    }
  }
  if (hidden.length) step.hidden = hidden;
  const wrote = step.created.length > 0;
  if (dry) step.status = wrote ? 'would-do' : (step.refused.length ? 'refused' : 'skipped');
  else step.status = wrote ? 'done' : (step.refused.length ? 'refused' : 'skipped');
  return step;
}

const skeletonPlan = (o) => applySkeleton({ ...o, dry: true });

module.exports = { applySkeleton, skeletonPlan, GITIGNORE_TEXT };
