#!/usr/bin/env node
'use strict';
// /pignolo:init (R-1 a R-4): detect (solo lectura), preview (sin escribir), apply (escribe solo los
// pasos aprobados) y verify. Lo opera solo el hilo principal (regla pignolo-init de la guardia).
// JSON por stdout; exit 0 ok, 1 fallo con `kind` (y `Alternativa:` en stderr), 2 uso incorrecto,
// 3 no se pudo dejar el estado consistente. Nunca commit, add ni push.
// `wizard-detect [--write]` arma el resumen del asistente de inicio del panel (solo lee el proyecto; con --write lo deja en .git/pignolo/); `choices --file <archivo>` valida las elecciones del asistente (no escribe nada).
// Uso: node init.js detect [--cwd <dir>] | wizard-detect [--cwd <dir>] [--write [--budget <ms>]] | choices --file <archivo> [--cwd <dir>] | preview --plan <archivo> [--cwd] | apply --plan <archivo> [--cwd] [--expect <stamp>] | verify [--cwd]
// `preview` devuelve un `stamp`; `apply --expect <stamp>` se niega (stale-preview) si el plan o el repo cambiaron desde el preview.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { mainRoot, projectRoot } = require('../lib/disabled');
const { gitRun, isRepo } = require('../lib/git');
const { projectState } = require('../lib/project');
const { readProjectConfig } = require('../lib/project-config');
const { detectProject } = require('../lib/init-detect');
const { seedCommand, SEED_ARGS } = require('../lib/init-seed');
const { renderProjectMd, mergeProjectMd, validatePiiPattern } = require('../lib/project-md');
const { parseFrontmatter, YamlLiteError } = require('../lib/yaml-lite');
const { locateAutoMemory } = require('../lib/auto-memory');
const { applyAutoMemoryOff, gitIgnoredStatus } = require('../lib/claude-settings');
const A = require('../lib/init-actions');
const { detectPlaces } = require('../lib/places-detect');
const { PLACE_KINDS, PLACE_DEFAULTS, RECOMMENDED_REFERENCE, resolvePlaces, samePath } = require('../lib/places');
const { proposeAdaptation, planAdaptation, applyAdaptation } = require('../lib/init-adapt');
const { applySkeleton } = require('../lib/init-skeleton');
const { blankProject, BLANK_STEPS } = require('../lib/init-blank');
const { buildSummary } = require('../lib/init-summary');
const WD = require('../lib/wizard-detect');
const IC = require('../lib/init-choices');
const SM = require('../lib/safe-move');
const RS = require('../lib/ref-scan');
const { PIGNOLO_IGNORED } = require('../lib/pignolo-gitignore');

const STEP_IDS = ['ignores', 'gitattributes', 'reflog', 'adapt', 'skeleton', 'project-md', 'security-md', 'auto-memory-off'];
const BLANK_MARKER = ['.pignolo', 'tmp', 'init-blank.json'];
const NEEDS = { 'project-md': ['piiPatterns'], 'security-md': ['channel'] };
const TEMPLATE = path.join(__dirname, '..', 'templates', 'SECURITY.md');

class Usage extends Error {}
class Fail extends Error {
  constructor(kind, message, alt) { super(message); this.kind = kind; this.alt = alt; }
}

function parse(argv) {
  const verb = argv[0];
  if (!['detect', 'wizard-detect', 'choices', 'preview', 'apply', 'verify'].includes(verb)) throw new Usage('uso: init.js detect|wizard-detect|choices|preview|apply|verify [--plan <archivo>] [--file <archivo>] [--write] [--budget <ms>] [--cwd <dir>] [--expect <stamp>]');
  const o = { verb };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--write') {
      if (verb !== 'wizard-detect') throw new Usage('--write solo vale con wizard-detect');
      o.write = true;
      continue;
    }
    if (!['--plan', '--cwd', '--expect', '--file', '--budget'].includes(a)) throw new Usage(`opción desconocida: ${a}`);
    i += 1;
    if (argv[i] === undefined) throw new Usage(`${a} necesita un valor`);
    o[a.slice(2)] = argv[i];
  }
  if (o.expect !== undefined && verb !== 'apply') throw new Usage('--expect solo vale con apply');
  if (o.budget !== undefined && (verb !== 'wizard-detect' || !o.write || !/^\d{1,6}$/.test(o.budget))) throw new Usage('--budget <ms> solo vale con wizard-detect --write y es un número de milisegundos');
  if (o.file !== undefined && verb !== 'choices') throw new Usage('--file solo vale con choices');
  if (verb === 'choices' && !o.file) throw new Usage('choices necesita --file <archivo>');
  if ((verb === 'preview' || verb === 'apply') && !o.plan) throw new Usage(`${verb} necesita --plan <archivo>`);
  return o;
}

function resolveRoot(cwd, run) {
  const main = mainRoot(cwd);
  let inRepo;
  try { inRepo = run ? run(['rev-parse', '--is-inside-work-tree'], main) === 'true' : isRepo(main); } catch (_) { inRepo = false; }
  if (!inRepo) throw new Fail('not-a-repo', `${main} no es un repositorio git`, 'corré `git init` primero y volvé a correr /pignolo:init');
  return main;
}

function readPlan(file) {
  let plan;
  try { plan = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Usage(`no se pudo leer el plan ${file}: ${e.message}`); }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.v !== 1 || !Array.isArray(plan.approved)) throw new Usage('el plan debe ser { v: 1, approved: [...], answers: {}, proposal: {} }');
  const unknown = plan.approved.filter((id) => !STEP_IDS.includes(id));
  if (unknown.length) throw new Usage(`paso desconocido en approved: ${unknown.join(', ')} (válidos: ${STEP_IDS.join(', ')})`);
  const answers = plan.answers || {};
  if (answers.public !== undefined && typeof answers.public !== 'boolean') throw new Usage('answers.public debe ser true o false');
  if (answers.places !== undefined && (!answers.places || typeof answers.places !== 'object' || Array.isArray(answers.places))) throw new Usage('answers.places debe ser un objeto { <tipo>: { decision, from?, force? } }');
  return { approved: plan.approved, answers, proposal: plan.proposal || {} };
}

const gitFor = (main) => (args, o) => gitRun(args, (typeof o === 'string' ? o : o && o.cwd) || main);

// {seed} en el on-done y el pre-merge solo si el runner tiene una opción verificada (R-7).
function seedAdjusted(det) {
  const out = { runner: det.seedPlan.runner, flag: null, plan: 'unused', reason: 'sin runner reconocido' };
  const gates = { ...det.gates };
  const first = (cmd) => cmd.split(' && ')[0];
  if (!gates['on-done'] || !out.runner) return { seedPlan: out, gates };
  const row = SEED_ARGS[out.runner];
  out.flag = row ? row.args : null;
  if (out.runner === 'pytest' && !det.runners.includes('pytest-randomly')) { out.reason = 'pytest-randomly no está declarado'; return { seedPlan: out, gates }; }
  const r = seedCommand(first(gates['on-done']), out.runner, { testScript: det.testScript || undefined });
  out.plan = r.seedPlan;
  out.reason = r.reason;
  if (r.seedPlan === 'applied') {
    for (const k of ['on-done', 'pre-merge']) {
      if (gates[k] && first(gates[k]) === first(gates['on-done'])) gates[k] = [r.command, ...gates[k].split(' && ').slice(1)].join(' && ');
    }
  }
  return { seedPlan: out, gates };
}

// Proyecto en blanco (D-1, 2026-10-02). Si no se puede leer la raíz no se adivina: falla cerrado.
function blankOf(main) {
  try { return blankProject({ root: main }); } catch (e) { throw new Fail('blank-unknown', `no se pudo saber si el proyecto está en blanco: ${e.message}`, 'revisá los permisos de la carpeta del proyecto y repetí'); }
}

function detect({ cwd, env, run }) {
  const main = resolveRoot(cwd, run);
  const git = run || gitFor(main);
  const detection = detectProject({ root: main, run: git });
  const adj = seedAdjusted(detection);
  detection.gates = adj.gates;
  detection.seedPlan = adj.seedPlan;
  const mem = locateAutoMemory({ main, env });
  let tracked = false;
  try { git(['ls-files', '--error-unmatch', '.pignolo/.gitignore'], main); tracked = true; } catch (_) { tracked = false; }
  const exists = (rel) => fs.existsSync(path.join(main, rel));
  const blank = blankOf(main);
  const places = detectPlaces({ root: main, run });
  const existing = {
    projectMd: exists('.pignolo/project.md'),
    claudeSettingsLocal: exists('.claude/settings.local.json'),
    securityMd: ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'].some(exists),
    gitattributes: exists('.gitattributes'),
    pignoloGitignoreTracked: tracked,
  };
  const memory = { found: mem.dir !== null, dir: mem.dir, files: mem.files, tried: mem.tried, notes: mem.notes };
  return {
    ok: true,
    root: main,
    blank: blank.blank,
    blankReason: blank.reason,
    blankFirstFile: blank.firstFile,
    detection,
    memory,
    existing,
    claudeSettingsIgnored: gitIgnoredStatus({ main, run: git }).ignored,
    places,
    summary: buildSummary({ blank: blank.blank, detection, existing, memory, places }),
    steps: STEP_IDS.filter((id) => !blank.blank || BLANK_STEPS.includes(id)).map((id) => ({ id, needsAnswer: NEEDS[id] || [] })),
  };
}

function projectMdStep({ main, env, proposal, answers, dry }) {
  const merged = { ...proposal };
  for (const k of ['piiPatterns', 'language', 'profile']) if (answers[k] !== undefined) merged[k] = answers[k];
  for (const p of merged.piiPatterns || []) {
    const v = validatePiiPattern(p);
    if (!v.ok) return { step: { id: 'project-md', status: 'refused', reason: v.refused, detail: v.reason, pattern: p }, conflicts: [] };
  }
  const file = path.join(main, '.pignolo', 'project.md');
  const refuse = (reason, detail) => ({ step: { id: 'project-md', status: 'refused', reason, ...(detail ? { detail } : {}) }, conflicts: [] });
  let existing = null;
  try { existing = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let text;
  let conflicts = [];
  let added;
  if (existing === null) {
    if (!Object.keys(merged).length) return { step: { id: 'project-md', status: 'refused', reason: 'no-proposal' }, conflicts };
    try { text = renderProjectMd(merged); } catch (e) { if (e.kind === 'unquotable') return refuse('unquotable', e.message); throw e; }
  } else {
    let r;
    try { r = mergeProjectMd(existing, merged); } catch (e) { if (e.kind === 'unquotable') return refuse('unquotable', e.message); throw e; }
    if (!r.ok) return { step: { id: 'project-md', status: 'refused', reason: r.refused, detail: r.reason }, conflicts };
    text = r.text;
    conflicts = r.conflicts;
    added = r.added;
    if (text === existing) return { step: { id: 'project-md', status: 'skipped', reason: 'already-set', ...(conflicts.length ? { conflicts: conflicts.length } : {}) }, conflicts };
  }
  // Red de seguridad (I-1): nunca se escribe (ni se promete en el preview) un resultado que el parser no lee.
  try { parseFrontmatter(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text); } catch (e) {
    if (e instanceof YamlLiteError) return { step: { id: 'project-md', status: 'refused', reason: 'invalid-result', detail: e.message }, conflicts };
    throw e;
  }
  if (dry) return { step: { id: 'project-md', status: 'would-do', file, ...(added ? { added } : {}) }, conflicts };
  let backup;
  if (existing !== null) backup = A.backupFile({ file, main, env });
  A.atomicWrite(file, text);
  return { step: { id: 'project-md', status: 'done', file, ...(backup ? { backup } : {}), ...(added ? { added } : {}) }, conflicts };
}

// Paso `adapt` (hito 8d): valida lo que ya hay y lo adopta, mueve o deja. No escribe project.md (lo escribe project-md con el mapa).
function adaptStep({ main, run, env, plan, dry }) {
  const detection = detectPlaces({ root: main, run });
  if (!detection.existing || proposeAdaptation({ detection, answers: plan.answers }).items.length === 0) {
    return { step: { id: 'adapt', status: 'skipped', reason: 'nothing-to-adapt' }, adaptPlan: null };
  }
  let config;
  try { config = readProjectConfig({ root: main }); } catch (e) { return { step: { id: 'adapt', status: 'refused', reason: 'invalid-config', detail: e.message }, adaptPlan: null }; }
  const adaptPlan = planAdaptation({ main, answers: plan.answers, config, detection, run });
  const step = applyAdaptation({ main, plan: adaptPlan, config, env, run, dry });
  return { step, adaptPlan };
}

// Paso `skeleton`: crea lo que no existe de las carpetas del mapa (resuelto con lo adoptado o movido por adapt).
function skeletonStep({ main, run, plan, adapt, dry }) {
  let cfg;
  try { cfg = readProjectConfig({ root: main }); } catch (e) { return { step: { id: 'skeleton', status: 'refused', reason: 'invalid-config', detail: e.message, created: [], skipped: [], refused: [], notes: [] }, resolved: null }; }
  const merged = { ...cfg, places: { ...cfg.places, ...((adapt && adapt.places) || {}) } };
  if (plan.answers.public === false && !merged.places.reference) merged.places.reference = RECOMMENDED_REFERENCE;
  const resolved = resolvePlaces(merged);
  // M-1: sin adapt (no aprobado o sin nada que adaptar) igual se respeta la carpeta existente: no se crea el default al lado.
  const left = adapt && Array.isArray(adapt.leftKinds) ? adapt.leftKinds : unansweredKinds({ main, run, declared: cfg.places || {} });
  const step = applySkeleton({
    root: main, places: resolved.places, answers: plan.answers, run, dry,
    leftKinds: left, willExist: adapt && dry ? adapt.willExist : [],
  });
  return { step, resolved, left };
}

// Tipos con una carpeta existente que no está en su lugar recomendado y que el mapa no declara.
function unansweredKinds({ main, run, declared }) {
  const det = detectPlaces({ root: main, run });
  const out = [];
  for (const kind of PLACE_KINDS) {
    if (declared[kind] !== undefined) continue;
    const cands = det.candidates.filter((c) => c.kind === kind);
    const rec = kind === 'reference' ? RECOMMENDED_REFERENCE : PLACE_DEFAULTS[kind];
    if (cands.length && !(cands.length === 1 && samePath(cands[0].path, rec))) out.push(kind);
  }
  return out;
}

// El mapa que escribe project-md: lo que adapt adoptó o movió y, si el esqueleto corrió, los lugares que tienen carpeta (sin los dejados ni los que se negaron).
function finalPlaces({ plan, adapt, skeleton }) {
  const out = { ...((adapt && adapt.places) || {}) };
  if (skeleton && skeleton.resolved) {
    const left = skeleton.left || [];
    const refused = skeleton.step.refused.map((r) => r.kind);
    for (const k of PLACE_KINDS) {
      const p = skeleton.resolved.places[k];
      if (!p.path || left.includes(k) || refused.includes(k)) continue;
      if (k === 'reference' && plan.answers.public !== false) continue;
      if (out[k] === undefined) out[k] = p.path;
    }
  }
  return out;
}

function runSteps({ cwd, env, run, plan, dry }) {
  const main = resolveRoot(cwd, run);
  const blank = blankOf(main).blank;
  const outside = plan.approved.filter((id) => !BLANK_STEPS.includes(id));
  if (blank && outside.length) throw new Fail('blank-project', `el proyecto está en blanco: solo se aprueban ${BLANK_STEPS.join(', ')} (pidió además ${outside.join(', ')})`, 'no hay nada que configurar todavía: aprobá solo esos pasos y volvé a correr /pignolo:init cuando haya código');
  const git = run || gitFor(main);
  const steps = [];
  const conflicts = [];
  const notes = [];
  let template = null;
  let adapt = null; // { step, adaptPlan }
  let skeleton = null; // { step, resolved }
  let adaptFailed = false;
  const readTemplate = () => { if (template === null) template = fs.readFileSync(TEMPLATE, 'utf8'); return template; };
  for (const id of STEP_IDS) {
    if (!plan.approved.includes(id)) { steps.push({ id, status: 'skipped', reason: 'not-approved' }); continue; }
    if (adaptFailed) { steps.push({ id, status: 'skipped', reason: 'adapt-failed' }); continue; }
    let step;
    try {
      if (id === 'ignores') step = A.applyIgnores({ root: main, run: git, dry });
      else if (id === 'gitattributes') step = A.applyGitattributes({ root: main, main, env, dry });
      else if (id === 'reflog') step = A.applyReflog({ root: main, run: git, dry });
      else if (id === 'adapt') {
        adapt = adaptStep({ main, run, env, plan, dry });
        step = adapt.step;
        if (step.status === 'refused') adaptFailed = true;
      } else if (id === 'skeleton') {
        skeleton = skeletonStep({ main, run, plan, adapt: adapt && adapt.step, dry });
        step = skeleton.step;
      } else if (id === 'project-md') {
        const places = finalPlaces({ plan, adapt: adapt && adapt.step, skeleton });
        const proposal = Object.keys(places).length ? { ...plan.proposal, places: { ...(plan.proposal.places || {}), ...places } } : plan.proposal;
        const r = projectMdStep({ main, env, proposal, answers: plan.answers, dry });
        step = r.step;
        conflicts.push(...r.conflicts);
      } else if (id === 'security-md') {
        step = A.applySecurityMd({ root: main, template: dry ? '' : readTemplate(), answers: plan.answers, dry });
      } else {
        step = applyAutoMemoryOff({ main, env, dry, run: git });
        if (step.notes && step.notes.includes('env-forces-on')) notes.push('CLAUDE_CODE_DISABLE_AUTO_MEMORY está en falso: gana sobre la clave del archivo y la auto-memoria seguirá activa');
      }
    } catch (e) {
      if (e && e.kind === 'bad-answer') throw new Usage(e.message);
      if (e && e.kind === 'scan-failed') {
        step = { id, status: 'refused', reason: 'scan-failed', detail: e.message };
        if (id === 'adapt') adaptFailed = true;
      } else step = { id, status: 'refused', reason: `unexpected: ${e.message}`, unexpected: true };
    }
    steps.push(step);
  }
  if (blank && !dry && steps.every((s) => s.status !== 'refused')) {
    // La marca (solo local, bajo tmp/ que .pignolo/.gitignore ya ignora) le dice a `next` que hay que volver a correr init cuando haya código.
    let ignoresTmp = false;
    try { ignoresTmp = fs.readFileSync(path.join(main, '.pignolo', '.gitignore'), 'utf8').split(/\r?\n/).includes('tmp/'); } catch (_) { ignoresTmp = false; }
    if (ignoresTmp) {
      try { A.atomicWrite(path.join(main, ...BLANK_MARKER), `${JSON.stringify({ v: 1, at: new Date().toISOString() })}\n`); } catch (e) { notes.push(`no se pudo dejar la marca del proyecto en blanco (${e.message})`); }
    }
  }
  const adaptDone = adapt && adapt.step && ['done', 'would-do'].includes(adapt.step.status);
  if (adaptDone && path.resolve(projectRoot(cwd)).toLowerCase() !== path.resolve(main).toLowerCase()) notes.push('estás en una worktree enlazada: init movió y escribió en el checkout principal; esta worktree conserva su layout viejo hasta que la actualices');
  const memStep = steps.find((s) => s.id === 'auto-memory-off');
  const ignored = gitIgnoredStatus({ main, run: git }).ignored;
  const wrote = memStep && ['done', 'would-do'].includes(memStep.status);
  if (wrote && memStep.excludeSkipped === 'tracked') notes.push(`.claude/settings.local.json está versionado en git: el paso ${dry ? 'lo dejará' : 'lo dejó'} modificado (\` M\`); revisá el diff antes de commitear`);
  else if (plan.approved.includes('auto-memory-off') && ignored === false && !(memStep && memStep.exclude === true)) notes.push('.claude/settings.local.json no está ignorado por git en este repo y init no pudo agregarlo a .git/info/exclude: no lo agregues al commit y, mientras esté sin seguimiento, el piso de riesgo (claude-config) sube el primer flujo a daily; ignoralo en tu excludes global o en .git/info/exclude');
  return { main, steps, conflicts, notes, adaptStamp: adapt && adapt.adaptPlan ? adapt.adaptPlan.stamp : null };
}

// Huella de lo que preview muestra: el plan aprobado y el resultado por paso. Apply --expect la recalcula.
function stampOf(plan, r) {
  const canon = JSON.stringify({ plan: { approved: plan.approved, answers: plan.answers, proposal: plan.proposal }, steps: r.steps, conflicts: r.conflicts, adapt: r.adaptStamp });
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 24);
}

function report(r, stamp) {
  const failed = r.steps.filter((s) => s.status === 'refused' && /^(write-failed|unexpected)/.test(s.reason || ''));
  const body = { ok: failed.length === 0, ...(stamp ? { stamp } : {}), steps: r.steps, conflicts: r.conflicts, notes: r.notes };
  // Un movimiento a medias (o fallido) en apply: se detiene, informa el registro y ofrece deshacer; los pasos siguientes no corrieron.
  const adapt = r.steps.find((s) => s.id === 'adapt');
  if (!stamp && adapt && adapt.status === 'refused') {
    const partial = adapt.kind === 'partial';
    const kind = adapt.kind || 'adapt-failed';
    return {
      body: { ...body, ok: false, kind, failed: ['adapt'], ...(adapt.record ? { record: adapt.record } : {}) },
      code: partial ? 3 : 1,
      alt: adapt.record ? `places.js undo --record "${adapt.record}" (deshace lo que se movió; si un programa tiene un archivo abierto, cerralo y reintentá)` : 'corregí la causa que indica el paso adapt y volvé a correr preview y apply',
    };
  }
  if (!failed.length) return { body, code: 0 };
  const half = failed.some((s) => s.unexpected);
  return { body: { ...body, kind: half ? 'inconsistent' : 'step-failed', failed: failed.map((s) => s.id) }, code: half ? 3 : 1, alt: half ? 'revisá `git status` y los respaldos en PIGNOLO_HOME/init-backup antes de repetir' : 'corregí la causa que indica el paso y repetí `init.js apply` (es idempotente)' };
}

// Lo que verify suma por el mapa (hito 8d): rutas del mapa que ya no existen, referencias manuales que quedan al último movimiento y local/ con versionados.
function placesVerify({ main, config, env, run }) {
  const notes = [];
  const fsx = fs;
  const declared = (config && config.places) || {};
  for (const [kind, rel] of Object.entries(declared)) {
    const g = SM.isLinkOrOutside(main, rel, fsx);
    if (g.bad) { notes.push(`places.${kind} (${rel}): ${g.reason === 'link-in-path' ? 'pasa por un enlace' : 'cae fuera del proyecto'}; corregilo en .pignolo/project.md`); continue; }
    let there = true;
    try { fsx.lstatSync(path.join(main, ...SM.norm(rel).split('/'))); } catch (_) { there = false; }
    if (!there) notes.push(`places.${kind}: la carpeta ${rel} no existe en el disco (el mapa apunta a algo que ya no está)`);
  }
  const priv = declared.private || 'local/';
  try {
    const tracked = SM.gitList(run || SM.makeRun(main), main, ['ls-files', '-z', '--', `:(icase,literal)${SM.norm(priv)}`]);
    if (tracked.length) notes.push(`${priv} tiene ${tracked.length} archivo(s) versionados: una carpeta privada no debería viajar con el repo (init no destrackea nada)`);
  } catch (_) { /* sin lista: no se avisa */ }
  // El último movimiento aplicado de este repo: ¿quedan referencias manuales a las rutas viejas?
  try {
    const dir = path.dirname(path.dirname(SM.recordPath({ main, env })));
    const stamps = fs.readdirSync(dir).sort().reverse();
    for (const s of stamps) {
      const file = path.join(dir, s, 'moves.json');
      if (!fs.existsSync(file)) continue;
      const rec = SM.readRecord(file);
      if (rec.status !== 'applied' && rec.status !== 'partial') break;
      const moves = rec.items.map((i) => ({ kind: i.kind, from: i.from, to: i.to }));
      const refs = RS.scanReferences({ main, moves, run });
      for (const r of refs.manual) notes.push(`queda una referencia a una ruta vieja: ${r.file}:${r.line} (${r.class}); arreglala a mano (${moves[r.move].from} -> ${moves[r.move].to})`);
      break;
    }
  } catch (_) { /* sin registros: no hay nada que revisar */ }
  return notes;
}

function verify({ cwd, env, run }) {
  const main = resolveRoot(cwd, run);
  const git = run || gitFor(main);
  let config = null;
  let configError = null;
  try { config = readProjectConfig({ root: main }); } catch (e) { configError = e.message; }
  const state = projectState({ cwd: main, env });
  const det = detectProject({ root: main, run: git });
  const notes = [];
  const runnerExcludes = [];
  for (const re of det.runnerExcludes) {
    if (!re.file || re.walksDotDirs === 'no') continue;
    let applied = false;
    try { applied = fs.readFileSync(path.join(main, re.file), 'utf8').includes('.pignolo'); } catch (_) { applied = false; }
    runnerExcludes.push({ runner: re.runner, applied });
    if (!applied) notes.push(`${re.runner}: la configuración no excluye .pignolo/ (agregá: ${re.snippet} en ${re.file}); lo aplica el humano`);
  }
  const adj = seedAdjusted(det);
  if (adj.seedPlan.plan !== 'applied') notes.push(`semilla no usada: ${adj.seedPlan.reason}`);
  const cfgGet = (k) => { try { return String(git(['config', '--local', '--get', k], main)).trim(); } catch (_) { return ''; } };
  const reflog = cfgGet('gc.reflogExpire') === 'never' && cfgGet('gc.reflogExpireUnreachable') === 'never';
  let ignoreText = '';
  try { ignoreText = fs.readFileSync(path.join(main, '.pignolo', '.gitignore'), 'utf8'); } catch (_) { ignoreText = ''; }
  const have = new Set(ignoreText.split(/\r?\n/).map((l) => l.trim()));
  const ignores = PIGNOLO_IGNORED.every((l) => have.has(l));
  const dirty = (rel) => { try { return String(git(['status', '--porcelain', '--', rel], main)).trim() !== ''; } catch (_) { return false; } };
  let tracked = false;
  try { git(['ls-files', '--error-unmatch', '.pignolo/.gitignore'], main); tracked = true; } catch (_) { tracked = false; }
  const trackedModified = tracked && dirty('.pignolo/.gitignore');
  let blank = false;
  try { blank = blankProject({ root: main }).blank; } catch (_) { blank = false; }
  // En un blanco el commit es el esqueleto (README de cada carpeta, nunca local/: es privada) y .gitattributes; fuera de un blanco, los tres archivos de init.
  const skeletonReadmes = [...Object.entries(PLACE_DEFAULTS).filter(([k]) => k !== 'private').map(([, v]) => v), RECOMMENDED_REFERENCE].map((v) => `${v.replace(/\/$/, '')}/README.md`);
  const candidates = blank ? ['.gitattributes', ...skeletonReadmes] : ['.pignolo/project.md', '.gitattributes', 'SECURITY.md'];
  const files = candidates.filter((f) => fs.existsSync(path.join(main, f)) && dirty(f));
  if (trackedModified) files.push('.pignolo/.gitignore');
  notes.push(...placesVerify({ main, config, env, run }));
  return {
    ok: configError === null,
    blank,
    ...(configError ? { configError } : {}),
    config: config ? { found: config.found, conservative: config.conservative, type: config.type, gates: config.gates, mutation: config.mutation } : null,
    active: state.active,
    warnings: config ? config.warnings : [],
    runnerExcludes, reflog, ignores, trackedModified, notes,
    nextCommit: { files, message: blank ? 'chore: esqueleto de pignolo (carpetas y .gitattributes)' : 'chore: activar pignolo (project.md, .gitattributes y SECURITY.md)' },
  };
}

// `choices --file`: valida las elecciones que el asistente del panel mandó (una línea JSON, ver lib/init-choices.js) contra la detección de
// ahora y devuelve lo que la skill necesita para armar el plan. NO escribe nada. Con una entrada mala o que ya no corresponde al proyecto
// dice `ok: false` y la skill sigue el flujo de siempre: no se adivina nada.
function choicesOf({ cwd, env, file }) {
  let line;
  try {
    const buf = fs.readFileSync(file);
    if (buf.length > 4096) return { ok: false, reason: 'too-long' };
    line = new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/\r?\n$/, '');
  } catch (e) { return { ok: false, reason: e instanceof TypeError ? 'not-utf8' : 'unreadable' }; }
  const parsed = IC.parseChoices(line);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const { choices } = parsed;
  const main = resolveRoot(cwd);
  const d = detect({ cwd, env });
  if (Boolean(choices.blank) !== Boolean(d.blank)) return { ok: false, reason: 'blank-mismatch' };
  const known = Object.keys(d.summary.recommendedPlaces || {});
  const stray = Object.keys(choices.places || {}).filter((k) => !known.includes(k));
  if (stray.length) return { ok: false, reason: `places-not-detected:${stray.join(',')}` };
  const { approved, answers, extras } = IC.toAnswers(choices, { summary: d.summary });
  const cmp = IC.compareId(choices, WD.buildWizardDetect({ main }).id);
  return { ok: true, approved, answers, extras, idSame: cmp.same, ...(cmp.note ? { note: cmp.note } : {}) };
}

function main(argv, env = process.env) {
  const o = parse(argv);
  const cwd = o.cwd || process.cwd();
  if (o.verb === 'detect') return { body: detect({ cwd, env }), code: 0 };
  if (o.verb === 'wizard-detect') {
    const main = resolveRoot(cwd);
    if (!o.write) return { body: WD.buildWizardDetect({ main }), code: 0 };
    // Con --write el único efecto es el archivo bajo <main>/.git/pignolo/ (nunca .pignolo/); `offer` es verdadero solo la primera vez.
    // Si no alcanza el plazo o falla, no queda archivo (se borra uno viejo) y sale 0: lo lanza el hook de arranque, que calla.
    try {
      const w = WD.writeFor(main, { budgetMs: o.budget === undefined ? 10000 : Number(o.budget) });
      return { body: w.path ? { ok: true, path: w.path, offer: w.offer } : { ok: true, skipped: w.skipped }, code: 0 };
    } catch (e) {
      WD.removeStale(main);
      return { body: { ok: true, skipped: 'failed', reason: e.message }, code: 0 };
    }
  }
  if (o.verb === 'choices') return { body: choicesOf({ cwd, env, file: o.file }), code: 0 };
  if (o.verb === 'verify') {
    const body = verify({ cwd, env });
    if (body.ok) return { body, code: 0 };
    return { body: { ...body, kind: 'invalid-config' }, code: 1, alt: 'corregí .pignolo/project.md según `configError` (o restaurá el respaldo de PIGNOLO_HOME/init-backup) y repetí verify' };
  }
  const plan = readPlan(o.plan);
  if (o.verb === 'apply' && plan.approved.includes('adapt') && o.expect === undefined) {
    throw new Usage('apply con adapt exige --expect <stamp> (el que dio preview): mover carpetas sin compararlas con la vista previa no se permite');
  }
  if (o.verb === 'preview') {
    const r = runSteps({ cwd, env, plan, dry: true });
    return report(r, stampOf(plan, r));
  }
  if (o.expect !== undefined) {
    // Una respuesta que dejó de ser válida porque el repo cambió (p. ej. un .js dentro de la carpeta a mover) también es una vista previa vieja.
    let now = null;
    try { now = stampOf(plan, runSteps({ cwd, env, plan, dry: true })); } catch (e) { if (!(e instanceof Usage)) throw e; }
    if (now !== o.expect) {
      return { body: { ok: false, kind: 'stale-preview', refused: 'stale-preview', reason: 'el plan o el repo cambiaron desde el preview: no se escribió nada' }, code: 1, alt: 'volvé a correr `init.js preview`, mostrale el resultado nuevo al humano y repetí apply con el stamp nuevo' };
    }
  }
  return report(runSteps({ cwd, env, plan, dry: false }));
}

module.exports = { main, detect, verify, runSteps, STEP_IDS, BLANK_STEPS };

if (require.main === module) {
  try {
    const r = main(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(r.body)}\n`);
    if (r.alt) process.stderr.write(`pignolo init: ${r.body.kind}\nAlternativa: ${r.alt}\n`);
    process.exitCode = r.code;
  } catch (e) {
    if (e instanceof Usage) {
      process.stderr.write(`pignolo init: ${e.message}\n`);
      process.exitCode = 2;
    } else if (e instanceof Fail) {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: e.kind, refused: e.kind, reason: e.message })}\n`);
      process.stderr.write(`pignolo init: ${e.message}\nAlternativa: ${e.alt}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${JSON.stringify({ ok: false, kind: 'inconsistent', reason: e.message })}\n`);
      process.stderr.write(`pignolo init: ${e.message}\nAlternativa: revisá el estado del repo con git status antes de repetir\n`);
      process.exitCode = 3;
    }
  }
}
