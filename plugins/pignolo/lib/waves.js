'use strict';
// Olas y modo de ejecución según el tipo de plan (spec §11.4, hito 7a; G16, D-7-2, R-7).
// El modo por defecto es SERIAL (el paralelo cuesta ≈ 5× los tokens): solo corren en paralelo las tareas
// `judgment` que el plan marca con `**Parallel:** yes`, sin solape de archivos, con retrabajo previo <= 1 y en
// tandas de a lo sumo el tope del perfil. Solo lectura y determinista: la misma entrada da el mismo resultado.
const { PROFILE_PARAMS } = require('./roles');
const { matchAny, matchGlob } = require('./globs');
const { isCardPlan } = require('./plan-check');

// Órdenes de magnitud de G16 (145 mil / 7 serie; 780 mil / 8 paralelo). La skill lo dice al mostrarlos.
const COST_HINT = Object.freeze({ serialPerTask: 21000, parallelPerTask: 97000 });

const TASK_HEAD = /^###\s+Task\s+([^\s:]+)/;
const ANY_HEAD = /^#{1,3}\s/;
const FIELD_LINE = /^\s*\*\*([A-Za-z ]+):\*\*\s*(.*)$/;
const FILE_LINE = /^\s*[-*]\s*(?:Create|Modify|Test|Crear|Modificar)\b[^:]*:\s*(.*)$/;

const normPath = (p) => String(p).trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
const looksLikePath = (t) => t !== '' && !/\s/.test(t) && (t.includes('/') || /\.[A-Za-z0-9]+$/.test(t));

// Rutas de una línea `- Create: ...`: los textos entre comillas invertidas que parecen una ruta (los nombres de
// símbolos entre paréntesis no tienen `/` ni extensión); sin comillas invertidas, los tokens partidos por coma.
function pathsOf(rest) {
  const ticks = [...rest.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const tokens = ticks.length ? ticks : rest.split(',');
  return tokens.map(normPath).filter(looksLikePath);
}

function parsePlanTasks(planText) {
  const text = String(planText || '');
  if (!isCardPlan(text)) return [];
  const tasks = [];
  let cur = null;
  let inFiles = false;
  for (const line of text.split(/\r?\n/)) {
    const head = TASK_HEAD.exec(line);
    if (head) {
      cur = { id: head[1], title: line.replace(/^###\s+Task\s+[^\s:]+:?\s*/, '').trim(), files: [], depends: [], kind: 'unknown', contract: false, external: false, parallel: false };
      tasks.push(cur);
      inFiles = false;
      continue;
    }
    if (ANY_HEAD.test(line)) { cur = null; inFiles = false; continue; }
    if (!cur) continue;
    const field = FIELD_LINE.exec(line);
    if (field) {
      const name = field[1].trim().toLowerCase();
      const value = field[2].trim();
      inFiles = name === 'files';
      if (name === 'kind') cur.kind = value === 'verified-code' || value === 'judgment' ? value : 'unknown';
      else if (name === 'depends') cur.depends = [...value.matchAll(/(?:Task\s+)?(\d+[A-Za-z0-9-]*)/g)].map((m) => m[1]);
      else if (name === 'external') cur.external = /^yes\b/i.test(value);
      else if (name === 'contract') cur.contract = /^yes\b/i.test(value);
      else if (name === 'parallel') cur.parallel = /^yes\b/i.test(value);
      continue;
    }
    if (inFiles) {
      const f = FILE_LINE.exec(line);
      if (f) for (const p of pathsOf(f[1])) if (!cur.files.includes(p)) cur.files.push(p);
    }
  }
  return tasks;
}

// Pares de rutas que se pisan: iguales, una es directorio-prefijo de la otra, o un glob de una cubre a la otra.
function overlaps(a, b) {
  const out = [];
  const isPrefix = (dir, p) => p.startsWith(dir.endsWith('/') ? dir : `${dir}/`);
  for (const x of a.map(normPath)) {
    for (const y of b.map(normPath)) {
      if (x === y || isPrefix(x, y) || isPrefix(y, x) || matchGlob(x, y) || matchGlob(y, x)) out.push(`${x} ~ ${y}`);
    }
  }
  return out;
}

class WavesError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

function layersOf(tasks, done) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) for (const d of t.depends) if (!byId.has(d) && !done.has(d)) throw new WavesError('unknown-dependency', `la tarea ${t.id} depende de ${d}, que no está en el plan`);
  const left = new Set(tasks.map((t) => t.id));
  const placed = new Set(done);
  const layers = [];
  while (left.size) {
    const layer = tasks.filter((t) => left.has(t.id) && t.depends.every((d) => placed.has(d)));
    if (!layer.length) throw new WavesError('cycle', `ciclo en depends entre: ${[...left].join(', ')}`);
    for (const t of layer) { left.delete(t.id); }
    for (const t of layer) placed.add(t.id);
    layers.push(layer);
  }
  return layers;
}

function planWaves({ tasks, profile = 'balanced', contracts = [], serialPaths = [], rework = 0 } = {}) {
  const cap = (PROFILE_PARAMS[profile] || PROFILE_PARAMS.balanced).parallel;
  const waves = [];
  const notParallel = [];
  const wave = (mode, ids, reasons) => waves.push({ n: waves.length, mode, tasks: ids, reasons });
  const why = (task, reason) => { if (task.parallel) notParallel.push({ task: task.id, why: reason }); };
  const touches = (t, globs) => globs.length > 0 && t.files.some((f) => matchAny(globs, normPath(f)));

  // Ola 0: las tareas de contrato cuyas dependencias son todas de contrato; siempre serial.
  const isContract = (t) => t.contract || touches(t, contracts);
  const contractIds = new Set(tasks.filter(isContract).map((t) => t.id));
  const first = tasks.filter((t) => isContract(t) && t.depends.every((d) => contractIds.has(d)));
  const done = new Set();
  if (first.length) {
    const ordered = layersOf(first, new Set()).flat();
    for (const t of ordered) why(t, 'contrato');
    wave('contract', ordered.map((t) => t.id), ['produce un contrato o toca contracts: va primero y en serie']);
    for (const t of ordered) done.add(t.id);
  }

  const rest = tasks.filter((t) => !done.has(t.id));
  for (const layer of layersOf(rest, done)) {
    for (const t of layer.filter(isContract)) {
      why(t, 'contrato');
      wave('contract', [t.id], ['produce un contrato o toca contracts: va solo y en serie']);
    }
    const plain = layer.filter((t) => !isContract(t));
    const alone = [];
    const pool = [];
    for (const t of plain) {
      if (t.external) { why(t, 'external'); wave('serial', [t.id], ['toca un sistema externo real: va solo']); alone.push(t); } else if (touches(t, serialPaths)) { why(t, 'serial-paths'); wave('serial', [t.id], ['toca serial-paths: va solo']); alone.push(t); } else pool.push(t);
    }
    const verified = pool.filter((t) => t.kind === 'verified-code');
    if (verified.length) wave('serial', verified.map((t) => t.id), ['verified-code: un solo ejecutor en serie, en el orden del plan (G16)']);
    const judged = pool.filter((t) => t.kind !== 'verified-code');
    const par = judged.filter((t) => t.kind === 'judgment' && t.parallel);
    for (const t of judged.filter((x) => !par.includes(x))) wave('serial', [t.id], [t.kind === 'judgment' ? 'el plan no pide paralelo (Parallel: yes): serial por defecto' : 'sin Kind: serial por defecto']);
    if (rework > 1) {
      for (const t of par) { why(t, 'retrabajo'); wave('serial', [t.id], [`retrabajo previo ${rework} > 1: serial`]); }
    } else {
      const left = [...par];
      while (left.length) {
        const batch = [left.shift()];
        for (let i = 0; i < left.length && batch.length < cap;) {
          if (batch.every((b) => overlaps(b.files, left[i].files).length === 0)) batch.push(...left.splice(i, 1)); else i += 1;
        }
        if (batch.length > 1) wave('parallel', batch.map((t) => t.id), [`judgment con Parallel: yes, sin archivos en común, tanda de ${batch.length} (tope del perfil ${cap})`]);
        else {
          const reason = cap === 1 ? 'tope-perfil' : (par.length === 1 ? 'sin-pareja' : 'solapa-archivos');
          why(batch[0], reason);
          wave('serial', [batch[0].id], [reason === 'tope-perfil' ? 'el perfil admite 1 tarea a la vez: serial' : 'sin tarea con la que correr en paralelo: serial']);
        }
      }
    }
  }

  const n = tasks.length;
  const parallelTasks = waves.filter((w) => w.mode === 'parallel').reduce((s, w) => s + w.tasks.length, 0);
  return {
    waves,
    notParallel,
    cost: {
      serialTokens: n * COST_HINT.serialPerTask,
      parallelTokens: n * COST_HINT.parallelPerTask,
      plannedTokens: (n - parallelTasks) * COST_HINT.serialPerTask + parallelTasks * COST_HINT.parallelPerTask,
    },
  };
}

module.exports = { COST_HINT, WavesError, parsePlanTasks, overlaps, planWaves };
