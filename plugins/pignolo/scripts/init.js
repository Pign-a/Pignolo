#!/usr/bin/env node
'use strict';
// /pignolo:init (R-1 a R-4): detect (solo lectura), preview (sin escribir), apply (escribe solo los
// pasos aprobados) y verify. Lo opera solo el hilo principal (regla pignolo-init de la guardia).
// JSON por stdout; exit 0 ok, 1 fallo con `kind` (y `Alternativa:` en stderr), 2 uso incorrecto,
// 3 no se pudo dejar el estado consistente. Nunca commit, add ni push.
// Uso: node init.js detect [--cwd <dir>] | preview --plan <archivo> [--cwd] | apply --plan <archivo> [--cwd] [--expect <stamp>] | verify [--cwd]
// `preview` devuelve un `stamp`; `apply --expect <stamp>` se niega (stale-preview) si el plan o el repo cambiaron desde el preview.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { mainRoot } = require('../lib/disabled');
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
const { PIGNOLO_IGNORED } = require('../lib/pignolo-gitignore');

const STEP_IDS = ['ignores', 'gitattributes', 'reflog', 'project-md', 'security-md', 'auto-memory-off'];
const NEEDS = { 'project-md': ['piiPatterns'], 'security-md': ['channel'] };
const TEMPLATE = path.join(__dirname, '..', 'templates', 'SECURITY.md');

class Usage extends Error {}
class Fail extends Error {
  constructor(kind, message, alt) { super(message); this.kind = kind; this.alt = alt; }
}

function parse(argv) {
  const verb = argv[0];
  if (!['detect', 'preview', 'apply', 'verify'].includes(verb)) throw new Usage('uso: init.js detect|preview|apply|verify [--plan <archivo>] [--cwd <dir>] [--expect <stamp>]');
  const o = { verb };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (!['--plan', '--cwd', '--expect'].includes(a)) throw new Usage(`opción desconocida: ${a}`);
    i += 1;
    if (argv[i] === undefined) throw new Usage(`${a} necesita un valor`);
    o[a.slice(2)] = argv[i];
  }
  if (o.expect !== undefined && verb !== 'apply') throw new Usage('--expect solo vale con apply');
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
  return { approved: plan.approved, answers: plan.answers || {}, proposal: plan.proposal || {} };
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
  return {
    ok: true,
    root: main,
    detection,
    memory: { found: mem.dir !== null, dir: mem.dir, files: mem.files, tried: mem.tried, notes: mem.notes },
    existing: {
      projectMd: exists('.pignolo/project.md'),
      claudeSettingsLocal: exists('.claude/settings.local.json'),
      securityMd: ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'].some(exists),
      gitattributes: exists('.gitattributes'),
      pignoloGitignoreTracked: tracked,
    },
    claudeSettingsIgnored: gitIgnoredStatus({ main, run: git }).ignored,
    places: detectPlaces({ root: main, run }),
    steps: STEP_IDS.map((id) => ({ id, needsAnswer: NEEDS[id] || [] })),
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

function runSteps({ cwd, env, run, plan, dry }) {
  const main = resolveRoot(cwd, run);
  const git = run || gitFor(main);
  const steps = [];
  const conflicts = [];
  const notes = [];
  let template = null;
  const readTemplate = () => { if (template === null) template = fs.readFileSync(TEMPLATE, 'utf8'); return template; };
  for (const id of STEP_IDS) {
    if (!plan.approved.includes(id)) { steps.push({ id, status: 'skipped', reason: 'not-approved' }); continue; }
    let step;
    try {
      if (id === 'ignores') step = A.applyIgnores({ root: main, run: git, dry });
      else if (id === 'gitattributes') step = A.applyGitattributes({ root: main, main, env, dry });
      else if (id === 'reflog') step = A.applyReflog({ root: main, run: git, dry });
      else if (id === 'project-md') {
        const r = projectMdStep({ main, env, proposal: plan.proposal, answers: plan.answers, dry });
        step = r.step;
        conflicts.push(...r.conflicts);
      } else if (id === 'security-md') {
        step = A.applySecurityMd({ root: main, template: dry ? '' : readTemplate(), answers: plan.answers, dry });
      } else {
        step = applyAutoMemoryOff({ main, env, dry, run: git });
        if (step.notes && step.notes.includes('env-forces-on')) notes.push('CLAUDE_CODE_DISABLE_AUTO_MEMORY está en falso: gana sobre la clave del archivo y la auto-memoria seguirá activa');
      }
    } catch (e) {
      step = { id, status: 'refused', reason: `unexpected: ${e.message}`, unexpected: true };
    }
    steps.push(step);
  }
  const memStep = steps.find((s) => s.id === 'auto-memory-off');
  const ignored = gitIgnoredStatus({ main, run: git }).ignored;
  const wrote = memStep && ['done', 'would-do'].includes(memStep.status);
  if (wrote && memStep.excludeSkipped === 'tracked') notes.push(`.claude/settings.local.json está versionado en git: el paso ${dry ? 'lo dejará' : 'lo dejó'} modificado (\` M\`); revisá el diff antes de commitear`);
  else if (plan.approved.includes('auto-memory-off') && ignored === false && !(memStep && memStep.exclude === true)) notes.push('.claude/settings.local.json no está ignorado por git en este repo y init no pudo agregarlo a .git/info/exclude: no lo agregues al commit y, mientras esté sin seguimiento, el piso de riesgo (claude-config) sube el primer flujo a daily; ignoralo en tu excludes global o en .git/info/exclude');
  return { main, steps, conflicts, notes };
}

// Huella de lo que preview muestra: el plan aprobado y el resultado por paso. Apply --expect la recalcula.
function stampOf(plan, r) {
  const canon = JSON.stringify({ plan: { approved: plan.approved, answers: plan.answers, proposal: plan.proposal }, steps: r.steps, conflicts: r.conflicts });
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 24);
}

function report(r, stamp) {
  const failed = r.steps.filter((s) => s.status === 'refused' && /^(write-failed|unexpected)/.test(s.reason || ''));
  const body = { ok: failed.length === 0, ...(stamp ? { stamp } : {}), steps: r.steps, conflicts: r.conflicts, notes: r.notes };
  if (!failed.length) return { body, code: 0 };
  const half = failed.some((s) => s.unexpected);
  return { body: { ...body, kind: half ? 'inconsistent' : 'step-failed', failed: failed.map((s) => s.id) }, code: half ? 3 : 1, alt: half ? 'revisá `git status` y los respaldos en PIGNOLO_HOME/init-backup antes de repetir' : 'corregí la causa que indica el paso y repetí `init.js apply` (es idempotente)' };
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
  const files = ['.pignolo/project.md', '.gitattributes', 'SECURITY.md'].filter((f) => fs.existsSync(path.join(main, f)) && dirty(f));
  if (trackedModified) files.push('.pignolo/.gitignore');
  return {
    ok: configError === null,
    ...(configError ? { configError } : {}),
    config: config ? { found: config.found, conservative: config.conservative, type: config.type, gates: config.gates, mutation: config.mutation } : null,
    active: state.active,
    warnings: config ? config.warnings : [],
    runnerExcludes, reflog, ignores, trackedModified, notes,
    nextCommit: { files, message: 'chore: activar pignolo (project.md, .gitattributes y SECURITY.md)' },
  };
}

function main(argv, env = process.env) {
  const o = parse(argv);
  const cwd = o.cwd || process.cwd();
  if (o.verb === 'detect') return { body: detect({ cwd, env }), code: 0 };
  if (o.verb === 'verify') {
    const body = verify({ cwd, env });
    if (body.ok) return { body, code: 0 };
    return { body: { ...body, kind: 'invalid-config' }, code: 1, alt: 'corregí .pignolo/project.md según `configError` (o restaurá el respaldo de PIGNOLO_HOME/init-backup) y repetí verify' };
  }
  const plan = readPlan(o.plan);
  if (o.verb === 'preview') {
    const r = runSteps({ cwd, env, plan, dry: true });
    return report(r, stampOf(plan, r));
  }
  if (o.expect !== undefined) {
    const now = stampOf(plan, runSteps({ cwd, env, plan, dry: true }));
    if (now !== o.expect) {
      return { body: { ok: false, kind: 'stale-preview', refused: 'stale-preview', reason: 'el plan o el repo cambiaron desde el preview: no se escribió nada' }, code: 1, alt: 'volvé a correr `init.js preview`, mostrale el resultado nuevo al humano y repetí apply con el stamp nuevo' };
    }
  }
  return report(runSteps({ cwd, env, plan, dry: false }));
}

module.exports = { main, detect, verify, runSteps, STEP_IDS };

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
