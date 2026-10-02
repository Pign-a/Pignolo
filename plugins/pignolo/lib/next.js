'use strict';
// `next` (spec §10.3, R-10): la próxima acción derivada del estado del proyecto. SOLO
// LECTURA: no crea archivos, no restaura sabotajes (recoverAll con restore: false), no
// llama a run.js; de git lee solo `status --porcelain`. Redactado como hechos, no como
// imperativos. Una sola acción; un estado ilegible nunca se lee como "sin flujo".
const fs = require('node:fs');
const path = require('node:path');
const { mainRoot } = require('./disabled');
const { readRun, taskList } = require('./project');
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

// Cola de integración (hito 7a, Task 10; spec §15 `next`: "ola cortada, `queue/` con conflicto"). Solo lectura: archivos de
// <main>/.pignolo/tmp/queue/, la worktree de la cola (_queue/<plan>) y, de git, `rev-parse` y `diff --name-only`.
const QUEUE_TMP = ['.pignolo', 'tmp', 'queue'];
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } };

function queuePlans(main) {
  const names = new Set();
  const tmp = path.join(main, ...QUEUE_TMP);
  try { for (const f of fs.readdirSync(tmp)) { const m = /^(.+)\.(?:lock|last\.json)$/.exec(f); if (m) names.add(m[1]); } } catch (_) { /* sin carpeta */ }
  try { for (const d of fs.readdirSync(path.join(main, '.pignolo', 'worktrees', '_queue'), { withFileTypes: true })) if (d.isDirectory()) names.add(d.name); } catch (_) { /* sin carpeta */ }
  return [...names].sort();
}

// queue-conflict (un merge cortado en la worktree de la cola, o last.json en `conflict`) gana a queue-busy-dead (lock de
// un pid que ya no existe; un pid vivo con deadline futuro no cuenta aunque el archivo sea viejo, R-8).
// Un `last.json` en conflict ya no vale si el plan se cerró o si la rama de la tarea se movió desde el conflicto (se rebaseó) o
// ya no existe (M10). Sin `taskSha` (registros viejos) solo cuenta el plan cerrado.
function conflictStale(main, plan, last) {
  try {
    const r = ps.readPlan({ main, plan, git: true });
    if (r.ok && r.plan.stage === 'closed') return true;
  } catch (_) { /* sin plan legible: no se descarta */ }
  if (typeof last.taskSha === 'string' && typeof last.task === 'string') {
    try {
      const sha = String(gitRun(['--no-optional-locks', 'rev-parse', '--verify', '--quiet', `refs/heads/${last.task}^{commit}`], main, { timeout: 3000 })).trim();
      return sha !== last.taskSha;
    } catch (_) { return true; } // la rama ya no existe
  }
  return false;
}

function queueState(main) {
  const plans = queuePlans(main);
  for (const plan of plans) {
    const wt = path.join(main, '.pignolo', 'worktrees', '_queue', plan);
    const last = readJson(path.join(main, ...QUEUE_TMP, `${plan}.last.json`));
    let files = [];
    let cut = false;
    if (fs.existsSync(wt)) {
      try {
        gitRun(['--no-optional-locks', 'rev-parse', '-q', '--verify', 'MERGE_HEAD'], wt, { timeout: 3000 });
        cut = true;
        files = gitRun(['--no-optional-locks', 'diff', '--name-only', '--diff-filter=U'], wt, { timeout: 3000 }).split(/\r?\n/).filter(Boolean);
      } catch (_) { /* sin merge en curso (rev-parse sale 1) o sin git */ }
    }
    if (cut || (last && last.status === 'conflict' && !conflictStale(main, plan, last))) {
      return { kind: 'queue-conflict', plan, task: (last && last.task) || 'la tarea en curso', files: files.length ? files : ((last && last.conflicts) || []) };
    }
  }
  for (const plan of plans) {
    const lock = readJson(path.join(main, ...QUEUE_TMP, `${plan}.lock`));
    if (lock && Number.isInteger(lock.pid) && !pidAlive(lock.pid)) return { kind: 'queue-busy-dead', plan };
  }
  return null;
}

// Todos los planes con su etapa (hito 7a, Task 16, R-16): del más reciente al más antiguo por `created`; un registro ilegible
// sale como { plan, unreadable: true } (después de los legibles) y no corta la lista. Solo lectura; sirve a `plan.js list`,
// a los hechos de `next` y al campo `plans` de scripts/next.js.
function planList(main) {
  const readable = [];
  const unreadable = [];
  for (const name of ps.listPlans(main, { git: true })) {
    let r;
    try { r = ps.readPlan({ main, plan: name, git: true }); } catch (_) { r = { ok: false }; }
    if (!r.ok) { unreadable.push({ plan: name, unreadable: true }); continue; }
    let card = 'none';
    try { card = ps.scopeCardState({ main, plan: name, git: true }); } catch (_) { card = 'none'; }
    readable.push({ plan: name, stage: r.plan.stage, card, created: r.plan.created });
  }
  readable.sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0) || (a.plan < b.plan ? -1 : 1));
  return [...readable.map(({ plan, stage, card }) => ({ plan, stage, card })), ...unreadable];
}

const OTHER_PLANS_SHOWN = 8;

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
  const tasks = run ? taskList(run) : [];
  const task = tasks[0] || null;
  const ids = tasks.map((t) => t.id).join(', ');
  const taskWord = tasks.length > 1 ? `las tareas ${ids}` : `la tarea ${ids}`;
  for (const t of tasks) {
    const c = readCounter(env, main, t.id);
    if (c.blocked) {
      return done('task-blocked', `La tarea ${t.id} está BLOCKED en el handback-gate tras ${c.count} intentos (último motivo: ${c.lastReason}); la próxima acción registrada es escalarla al humano.`);
    }
  }
  // Cola de integración y olas (hito 7a): después de task-blocked, antes de flow-expired-task.
  let q = null;
  try { q = queueState(main); } catch (e) { facts.push(`No se pudo revisar la cola de integración (${e.message}).`); }
  if (q && q.kind === 'queue-conflict') {
    return done('queue-conflict', `La cola de ${q.plan} quedó con un conflicto de lógica en ${q.task} (${q.files.join(', ') || 'archivos sin listar'}); la próxima acción registrada es devolver la tarea a su rama para rebasarla y registrarlo como falla del plan.`);
  }
  if (q && q.kind === 'queue-busy-dead') {
    return done('queue-busy-dead', `El lock de la cola de ${q.plan} es de un proceso que ya no existe; la próxima acción registrada es correr \`queue.js status\` y retomar la entrada.`);
  }
  if (tasks.length >= 2) {
    const accepted = tasks.filter((t) => readCounter(env, main, t.id).accepted).map((t) => t.id);
    const pending = tasks.filter((t) => !accepted.includes(t.id)).map((t) => t.id);
    if (accepted.length && pending.length) {
      return done('wave-partial', `La ola tiene ${tasks.length} tareas; ${accepted.join(', ')} aceptadas y ${pending.join(', ')} pendientes; la próxima acción registrada es esperar o revisar \`run.js status\`.`);
    }
  }
  if (task) {
    if (st.expired) {
      return done('flow-expired-task', `El flujo ${run.flow} venció el ${run.expires} con ${taskWord} sin cerrar; la próxima acción registrada es renovarlo (\`run.js renew\`) y revisar \`run.js status\`.`);
    }
    if (st.running) {
      const extra = [];
      for (const t of tasks) {
        if (!fs.existsSync(t.worktree)) continue;
        try {
          const dirty = gitRun(['--no-optional-locks', 'status', '--porcelain'], t.worktree, { timeout: 3000 }).split('\n').filter(Boolean).length;
          extra.push(`La tarea ${t.id} tiene ${dirty} archivo(s) sin commitear en ${t.worktree}.`);
        } catch (_) { /* sin git: sin el dato */ }
      }
      if (tasks.length > 1) {
        return done('task-in-progress', `Las tareas ${ids} del flujo ${run.flow} están en curso (${tasks.map((t) => t.worktree).join('; ')}); la próxima acción registrada es cerrarlas (DONE al handback-gate) o seguir con sus archivos.`, extra);
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
    // Los otros planes sin cerrar (R-16): una línea cada uno, sin imperativo; los cerrados no se listan.
    const others = open.slice(1);
    for (const o of others.slice(0, OTHER_PLANS_SHOWN)) extra.push(`Plan ${o.plan}: etapa ${o.stage}.`);
    if (others.length > OTHER_PLANS_SHOWN) extra.push(`Hay ${others.length - OTHER_PLANS_SHOWN} planes más (plan.js list).`);
    return done(`plan-${p.stage}`, `El plan ${p.plan} está en la etapa ${p.stage}; la próxima acción registrada es ${stageAction(p.stage, card)}.`, extra);
  }
  if (unreadable.length) {
    return { kind: 'plan-unreadable', text: facts[facts.length - unreadable.length], facts: [...facts] };
  }
  if (facts.length) return { kind: 'sabotage-unknown', text: facts[0], facts: [...facts] };
  return { kind: 'nothing', text: '', facts: [] };
}

module.exports = { deriveNext, planList };
