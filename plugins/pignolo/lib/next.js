'use strict';
// `next` (spec §10.3, R-10): la próxima acción derivada del estado del proyecto. SOLO
// LECTURA: no crea archivos, no restaura sabotajes (recoverAll con restore: false), no
// llama a run.js; de git lee solo `status --porcelain`. Redactado como hechos, no como
// imperativos. Una sola acción; un estado ilegible nunca se lee como "sin flujo".
const fs = require('node:fs');
const { mainRoot } = require('./disabled');
const { readRun } = require('./project');
const { readCounter } = require('./handback-counter');
const { recoverAll } = require('./sabotage');
const ps = require('./plan-state');
const { gitRun } = require('./git');

const STAGE_ACTION = {
  spec: 'escribir la lista de afirmaciones clave',
  claims: 'verificar cada afirmación y resolverla',
  'spec-review': 'correr el `spec-reviewer` y guardar la tarjeta',
  'plan-written': 'auditar el plan',
  executing: 'la siguiente tarea sin cerrar',
  validating: 'correr el `validator` sobre la tanda',
  'final-review': 'la revisión final',
};

function stageAction(stage, card) {
  if (stage === 'scope-card') {
    if (card === 'approved') return 'escribir el plan';
    if (card === 'changed') return 'presentar la tarjeta de nuevo al humano porque cambió después de aprobarla';
    if (card === 'none') return 'guardar la tarjeta de alcance';
    return 'pedirle al humano la aprobación de la tarjeta';
  }
  if (stage === 'audited') {
    return card === 'approved'
      ? 'pasar a la etapa executing y ejecutar las tareas'
      : 'ejecutar las tareas (sin aprobación de la tarjeta, solo las que `plan.js runnable` permite)';
  }
  return STAGE_ACTION[stage];
}

function planFacts(main) {
  const readable = [];
  const unreadable = [];
  // En main el registro no existe en disco (viaja en la rama del plan): se lee con git show.
  for (const name of ps.listPlans(main, { git: true })) {
    const r = ps.readPlan({ main, plan: name, git: true });
    if (r.ok) readable.push(r.plan);
    else unreadable.push(name);
  }
  const open = readable.filter((p) => p.stage !== 'closed')
    .sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0) || (a.plan < b.plan ? -1 : 1));
  return { open, unreadable };
}

function deriveNext({ cwd = process.cwd(), env = process.env, now = Date.now() } = {}) {
  const main = mainRoot(cwd);
  const facts = [];
  const done = (kind, text, extra = []) => ({ kind, text, facts: [text, ...extra, ...facts] });

  // 1. Sabotaje interrumpido (nada se restaura).
  let rec = null;
  try { rec = recoverAll({ cwd, env, restore: false }); } catch (e) { facts.push(`No se pudo revisar si quedó un sabotaje interrumpido (${e.message}).`); }
  if (rec) {
    for (const e of rec.errors) facts.push(`No se pudo leer un candado de sabotaje (${e.message}).`);
    if (rec.pending.length) {
      const p = rec.pending[0];
      return done('sabotage-pending', `Hay un sabotaje interrumpido en ${p.worktree} (archivos: ${p.files.join(', ')}); la próxima acción registrada es restaurarlo con \`sabotage.js --recover\`.`);
    }
  }

  // 2. El marcador del flujo.
  const st = readRun(main, now);
  if (st.malformed) {
    return done('run-malformed', `El marcador del flujo (${st.file}) está ilegible; la próxima acción registrada es limpiarlo con \`run.js end\` o \`run.js start --replace\`.`);
  }
  const run = st.run || null;
  const task = run && run.task;
  if (task) {
    const c = readCounter(env, main, task.id);
    if (c.blocked) {
      return done('task-blocked', `La tarea ${task.id} está BLOCKED en el handback-gate tras ${c.count} intentos (último motivo: ${c.lastReason}); la próxima acción registrada es escalarla al humano.`);
    }
    if (st.expired) {
      return done('flow-expired-task', `El flujo ${run.flow} venció el ${run.expires} con la tarea ${task.id} sin cerrar; la próxima acción registrada es renovarlo (\`run.js renew\`) y revisar \`run.js status\`.`);
    }
    if (st.running) {
      const extra = [];
      if (fs.existsSync(task.worktree)) {
        try {
          const dirty = gitRun(['--no-optional-locks', 'status', '--porcelain'], task.worktree, { timeout: 3000 }).split('\n').filter(Boolean).length;
          extra.push(`La tarea ${task.id} tiene ${dirty} archivo(s) sin commitear en ${task.worktree}.`);
        } catch (_) { /* sin git: sin el dato */ }
      }
      return done('task-in-progress', `La tarea ${task.id} del flujo ${run.flow} está en curso en ${task.worktree}; la próxima acción registrada es cerrarla (DONE al handback-gate) o seguir con sus archivos.`, extra);
    }
  }

  // 3. El plan sin cerrar más reciente.
  const { open, unreadable } = planFacts(main);
  for (const name of unreadable) facts.push(`El registro del plan ${name} está ilegible; la próxima acción registrada es revisar \`plan.js status --plan ${name}\` o restaurarlo desde git.`);
  if (open.length) {
    const p = open[0];
    const card = ps.scopeCardState({ main, plan: p.plan, git: true });
    const extra = [];
    if (p.scopeCard && p.scopeCard.sha256) extra.push(`La tarjeta de alcance del plan ${p.plan} está en estado ${card}.`);
    return done(`plan-${p.stage}`, `El plan ${p.plan} está en la etapa ${p.stage}; la próxima acción registrada es ${stageAction(p.stage, card)}.`, extra);
  }
  if (unreadable.length) {
    return { kind: 'plan-unreadable', text: facts[facts.length - unreadable.length], facts: [...facts] };
  }
  if (facts.length) return { kind: 'sabotage-unknown', text: facts[0], facts: [...facts] };
  return { kind: 'nothing', text: '', facts: [] };
}

module.exports = { deriveNext };
