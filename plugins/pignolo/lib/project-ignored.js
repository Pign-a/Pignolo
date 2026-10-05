'use strict';
// ¿Git ignora .pignolo/project.md? Si lo ignora, no viaja con el repo: las worktrees de las tareas salen de git y no lo tienen.
// `projectIgnored` solo lee (git check-ignore) y nunca lanza: un fallo es 'unknown'. `planFix`/`applyFix` cambian la regla que
// lo ignora, solo si vive en el .gitignore de la raíz del propio repo; otra (.git/info/exclude, un excludes global, el
// .gitignore de otra carpeta) se informa donde está y no se toca. Nunca commit ni add.
const fs = require('node:fs');
const path = require('node:path');
const { gitRun } = require('./git');
const { backupFile, atomicWrite } = require('./init-actions');

const BOM = '\xEF\xBB\xBF'; // el BOM de UTF-8 leído como latin1
const REL = '.pignolo/project.md';
const NEGATIONS = ['!.pignolo/project.md', '!.pignolo/.gitignore'];
const defaultRun = (args, cwd) => gitRun(args, cwd, { timeout: 3000 });

// { ignored: false } | { ignored: 'unknown' } | { ignored: true, source, line, pattern, where }
// where: 'root-gitignore' (editable) | 'other-gitignore' | 'git-info-exclude' | 'global'
function projectIgnored({ main, run = defaultRun } = {}) {
  let out;
  try { out = String(run(['check-ignore', '-v', '--', REL], main)); } catch (e) {
    if (e && e.status === 1) return { ignored: false };
    return { ignored: 'unknown' };
  }
  // <origen>:<línea>:<patrón><TAB><ruta> (sin -z: eso solo vale con --stdin).
  const m = /^(.*?):(\d+):([^\t]*)\t/.exec(out);
  if (!m) return { ignored: 'unknown' };
  const [, source, lineText, pattern] = m;
  if (pattern.startsWith('!')) return { ignored: false };
  const norm = source.replace(/\\/g, '/');
  let where = 'global';
  if (norm === '.gitignore') where = 'root-gitignore';
  else if (/(^|\/)\.git\/info\/exclude$/.test(norm)) where = 'git-info-exclude';
  else if (!path.isAbsolute(source) && !/^[A-Za-z]:/.test(source) && /(^|\/)\.gitignore$/.test(norm)) where = 'other-gitignore';
  return { ignored: true, source: norm, line: Number(lineText), pattern, where };
}

// La línea de aviso (o '' si no hay nada que avisar). Solo si project.md existe en el disco; nunca lanza.
function noticeLine({ main, run } = {}) {
  try {
    if (!fs.existsSync(path.join(main, '.pignolo', 'project.md'))) return '';
    const r = projectIgnored({ main, run });
    if (r.ignored !== true) return '';
    return 'pignolo: git ignora .pignolo/project.md, así que no viaja con el repo y las worktrees de las tareas no lo ven; corré /pignolo:init para corregir la regla.';
  } catch (_) { return ''; }
}

// Texto para el rechazo de una tarea cuya worktree no tiene project.md: la causa y el arreglo, o '' si no se sabe.
function whyMissing({ main, run = defaultRun } = {}) {
  try {
    if (!fs.existsSync(path.join(main, '.pignolo', 'project.md'))) return '';
    const r = projectIgnored({ main, run });
    if (r.ignored === true) return ` Causa: el .pignolo/project.md del checkout principal está ignorado por git (${r.source}:${r.line} \`${r.pattern}\`), por eso la worktree no lo tiene. Arreglo: corré /pignolo:init (cambia esa regla) y commiteá .pignolo/project.md.`;
    try { run(['ls-files', '--error-unmatch', '--', REL], main); } catch (e) {
      if (e && typeof e.status === 'number') return ' Causa: el .pignolo/project.md del checkout principal existe pero no está commiteado, por eso la worktree no lo tiene. Arreglo: commitealo.';
    }
  } catch (_) { /* sin explicación */ }
  return '';
}

const isDirRule = (pat) => /^\/?\.pignolo\/?$/.test(pat);

// Qué cambiar. { status: 'none' } | { status: 'unknown' } | { status: 'external', where, source, line, pattern }
// | { status: 'edit', file, source, line, pattern, replacement: [líneas], text (Buffer) }
// El archivo se maneja en bytes (latin1 ida y vuelta): lo que no se toca queda idéntico aunque no sea UTF-8.
function planFix({ main, run } = {}) {
  const r = projectIgnored({ main, run });
  if (r.ignored === false) return { status: 'none' };
  if (r.ignored === 'unknown') return { status: 'unknown' };
  if (r.where !== 'root-gitignore') return { status: 'external', where: r.where, source: r.source, line: r.line, pattern: r.pattern };
  const file = path.join(main, '.gitignore');
  let st;
  try { st = fs.lstatSync(file); } catch (_) { return { status: 'unknown' }; }
  if (st.isSymbolicLink() || !st.isFile()) return { status: 'external', where: 'link', source: r.source, line: r.line, pattern: r.pattern };
  const raw = fs.readFileSync(file).toString('latin1');
  const parts = raw.split('\n');
  const at = r.line - 1;
  const cr = parts[at] !== undefined && parts[at].endsWith('\r') ? '\r' : '';
  const current = parts[at] === undefined ? null : parts[at].replace(/\r$/, '').trim();
  if (current === null || current.replace(/^﻿/, '').replace(/^\xEF\xBB\xBF/, '') !== r.pattern.trim()) return { status: 'unknown' };
  let replacement;
  if (isDirRule(r.pattern.trim())) {
    const lead = r.pattern.trim().startsWith('/') ? '' : '**/';
    replacement = [`${lead}.pignolo/*`, ...NEGATIONS];
  } else {
    replacement = [r.pattern.trim(), ...NEGATIONS];
  }
  // Un BOM al principio del archivo (línea 1) se conserva delante de la primera línea nueva.
  const bom = at === 0 && parts[0].startsWith(BOM) ? BOM : '';
  const next = [...parts.slice(0, at), ...replacement.map((l, i) => `${i === 0 ? bom : ''}${l}${cr}`), ...parts.slice(at + 1)];
  return { status: 'edit', file, source: r.source, line: r.line, pattern: r.pattern, replacement, text: Buffer.from(next.join('\n'), 'latin1') };
}

const MAX_PASSES = 5;
const sameRule = (x, y) => x.ignored === true && y.ignored === true && x.source === y.source && x.line === y.line && x.pattern === y.pattern;

// Aplica el cambio y lo comprueba con git. Con la regla repetida (o escrita de dos maneras) repite hasta que git deje de nombrar una
// regla reescribible del .gitignore de la raíz (hasta MAX_PASSES pasadas). Si una pasada no avanza (la misma regla sigue ignorando: una
// que no se puede negar, como `**/.pignolo/`, `.*`, `*`) o git queda ignorando por una regla de otro archivo, deja el archivo como estaba
// y dice la regla. Un fallo a mitad de camino también lo deja como estaba.
function applyFix({ main, run, env = process.env, dry = false } = {}) {
  let p = planFix({ main, run });
  if (p.status !== 'edit') return p;
  const info = { file: p.file, line: p.line, replaced: p.pattern, with: p.replacement };
  if (dry) return { status: 'would-do', ...info };
  const original = fs.readFileSync(p.file);
  const backup = backupFile({ file: p.file, main, env });
  const refuse = (reason, rule, detail) => {
    atomicWrite(info.file, original);
    return { status: 'refused', reason, ...info, ...(rule ? { ruleSource: rule.source, ruleLine: rule.line, rulePattern: rule.pattern } : {}), backup, detail };
  };
  const why = (rule) => `${rule.source}:${rule.line} \`${rule.pattern}\``;
  let before = projectIgnored({ main, run });
  let passes = 0;
  try {
    for (;;) {
      atomicWrite(info.file, p.text);
      passes += 1;
      const after = projectIgnored({ main, run });
      if (after.ignored === 'unknown') return refuse('unverified', null, 'no se pudo comprobar con git el resultado del cambio; se dejó el archivo como estaba');
      if (after.ignored !== true) return { status: 'done', ...info, passes, backup };
      if (after.where !== 'root-gitignore') return refuse('other-rule', after, `tras el cambio git sigue ignorando project.md por otra regla (${why(after)}), que init no toca; se dejó el archivo como estaba`);
      if (sameRule(before, after)) return refuse('manual-rule', after, `la regla ${why(after)} ignora la carpeta entera y init no la reescribe; se dejó el archivo como estaba`);
      if (passes >= MAX_PASSES) return refuse('still-ignored', after, `tras ${passes} pasadas git sigue ignorando project.md (${why(after)}); se dejó el archivo como estaba`);
      before = after;
      p = planFix({ main, run });
      if (p.status !== 'edit') return refuse('still-ignored', after, `tras el cambio git sigue ignorando project.md (${why(after)}); se dejó el archivo como estaba`);
    }
  } catch (e) {
    try { atomicWrite(info.file, original); } catch (_) { /* el respaldo queda en backup */ }
    throw e;
  }
}

module.exports = { projectIgnored, noticeLine, whyMissing, planFix, applyFix, NEGATIONS };
