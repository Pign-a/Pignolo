'use strict';
// scope-gate (spec §8.3, R-7, R-14): dentro de un plan, nada llega a main/master sin la
// tarjeta de alcance aprobada. Es un piso, no reemplaza la confirmación de la guardia.
// Falla cerrado dentro de un plan (registro, run.json o rama ilegibles, comando que no se
// parsea) y calla fuera de él. Hasta el prefiltro de texto no se carga nada de git.
const fs = require('node:fs');
const path = require('node:path');
const { projectState, readRun } = require('./project');

const { GIT_RE, VERB_RE } = require('./hook-fastpath'); // el prefiltro es una sola constante (Task 12)
const MAIN = /^(main|master)$/;
const PLAN_BRANCH = /(?:^|[^A-Za-z0-9_-])(?:(?:int|queue)\/([a-z0-9][a-z0-9-]{0,63})(?![a-z0-9-])|task\/(?!daily\/)([a-z0-9][a-z0-9-]{0,63})\/)/g;
const BRANCH_TIMEOUT_MS = 1000;
// merge --abort y similares no mueven nada.
const NO_MOVE = ['abort', 'continue', 'quit', 'skip'];

const stripHeads = (r) => String(r).replace(/^\+/, '').replace(/^refs\/heads\//, '');
const isMainRef = (r) => MAIN.test(stripHeads(r));
const unknownText = (r) => /[$`%]/.test(r);

function planOfBranch(b) {
  if (typeof b !== 'string') return null;
  const m = /^(?:int|queue)\/([a-z0-9][a-z0-9-]{0,63})$/.exec(b) || /^task\/(?!daily\/)([a-z0-9][a-z0-9-]{0,63})\//.exec(b);
  return m ? m[1] : null;
}

function planBranchesIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(PLAN_BRANCH)) out.add(m[1] || m[2]);
  return out;
}

const deny = (reason, plans, alternative) => ({ reason, plans, alternative });
const APPROVE_ALT = 'mostrale la tarjeta al humano y registrá su aprobación con `plan.js scope-card approve`';

// decide({ command, cwd, env, shell, deps }) -> null | { reason, plans, alternative }
// deps (solo tests): currentBranch(cwd, { timeout }), psTimeoutMs.
function decide({ command, cwd = process.cwd(), env = process.env, shell = 'bash', deps = {} } = {}) {
  // 1. Proyecto activo y sin /pignolo:off.
  const proj = projectState({ cwd, env });
  if (!proj.active) return null;
  const main = proj.main;

  // 2. Contexto de plan.
  const st = readRun(main);
  const run = st.run || null;
  const hasPlansDir = fs.existsSync(path.join(main, '.pignolo', 'state', 'plans'));
  const runPlan = run && run.plan ? run.plan : null;
  const flowPlan = Boolean(run && run.flow === 'plan');

  // 3. Prefiltro de texto (el mismo que usa el launcher).
  if (typeof command !== 'string' || !GIT_RE.test(command) || !VERB_RE.test(command)) return null;
  // El registro viaja en la rama del plan: en main la carpeta no existe. Nombrar int/<p>,
  // queue/<p> o task/<p>/ en el comando también activa la regla 2 (el registro se lee de la rama).
  const named = planBranchesIn(command);
  if (!hasPlansDir && !runPlan && !flowPlan && !named.size) return null;

  // 4. El parser de la guardia.
  const { gitCommands } = require('./git-guard');
  const cmds = gitCommands(command, { shell, cwd, psTimeoutMs: deps.psTimeoutMs });
  if (cmds === null) {
    return deny('el comando no se pudo analizar dentro de un plan (unparseable)', [], 'reescribilo en una forma simple y literal (un `git` por paso, sin variables en el subcomando)');
  }

  // 5. Verbos mirados y su destino.
  const readBranch = deps.currentBranch || require('./git').currentBranch;
  let branchCache;
  const branch = () => {
    if (branchCache === undefined) {
      try { branchCache = readBranch(cwd, { timeout: BRANCH_TIMEOUT_MS }) || null; } catch (_) { branchCache = null; }
    }
    return branchCache;
  };
  // Rama ilegible o detached cuenta como main; un cd o -C previo, también (el cwd del hook
  // es el de la sesión y el cd aún no corrió).
  const currentIsMain = (c) => c.onMain || c.cwdChanged || (() => { const b = branch(); return b === null || MAIN.test(b); })();
  const branchNames = (c) => c.positionals.filter((p) => planBranchesIn(p).size);
  const longIs = (c, name) => c.longs.some((l) => l.length > 0 && name.startsWith(l));

  const hits = [];
  for (const c of cmds) {
    if (!c.sub) continue;
    switch (c.sub) {
      case 'rebase':
        if (NO_MOVE.some((n) => longIs(c, n))) break;
        // `rebase <upstream> <branch>` deja la rama nombrada como la actual y la mueve.
        if (c.positionals.length >= 2) {
          if (unknownText(c.positionals[1]) || isMainRef(c.positionals[1])) hits.push(c);
          break;
        }
        if (currentIsMain(c)) hits.push(c);
        break;
      case 'pull': {
        if (NO_MOVE.some((n) => longIs(c, n))) break;
        // `pull . x:main` es un fetch hacia main (misma regla que fetch).
        const intoMain = c.positionals.slice(1).some((r) => {
          if (unknownText(r)) return true;
          const colon = r.lastIndexOf(':');
          return colon >= 0 && isMainRef(r.slice(colon + 1));
        });
        if (intoMain || currentIsMain(c)) hits.push(c);
        break;
      }
      case 'merge': case 'cherry-pick':
        if (NO_MOVE.some((n) => longIs(c, n))) break;
        if (currentIsMain(c)) hits.push(c);
        break;
      case 'checkout': case 'switch': {
        // -B / -C / --force-create <rama> reapunta la rama nombrada (main) al destino.
        const a = c.args || [];
        const forced = a.some((x, i) => {
          if (/^-[BC]./.test(x)) return isMainRef(x.slice(2));
          if (/^--force-create=/.test(x)) return isMainRef(x.slice(x.indexOf('=') + 1));
          const flag = x === '-B' || x === '-C' || (x.startsWith('--') && x.length > 2 && '--force-create'.startsWith(x));
          return flag && a[i + 1] !== undefined && (isMainRef(a[i + 1]) || unknownText(a[i + 1]));
        });
        if (forced) hits.push(c);
        break;
      }
      case 'reset':
        if (branchNames(c).length && currentIsMain(c)) hits.push(c);
        break;
      case 'push': {
        const refspecs = c.positionals.slice(1);
        if (c.longs.some((l) => 'all'.startsWith(l) || 'mirror'.startsWith(l)) || !refspecs.length) {
          if (currentIsMain(c)) hits.push(c);
          break;
        }
        const lands = refspecs.some((r) => {
          if (unknownText(r)) return true;
          const colon = r.lastIndexOf(':');
          const dst = colon >= 0 ? r.slice(colon + 1) : r;
          if (dst === 'HEAD') return currentIsMain(c);
          return isMainRef(dst);
        });
        if (lands) hits.push(c);
        break;
      }
      case 'fetch': {
        const lands = c.positionals.slice(1).some((r) => {
          if (unknownText(r)) return true;
          const colon = r.lastIndexOf(':');
          return colon >= 0 && isMainRef(r.slice(colon + 1));
        });
        if (lands) hits.push(c);
        break;
      }
      case 'branch': {
        // -m/-M/-c/-C (--move/--copy): el último posicional es el nombre nuevo.
        const moves = ['m', 'M', 'c', 'C'].some((k) => c.shorts.includes(k)) || longIs(c, 'move') || longIs(c, 'copy');
        if (moves) {
          const dst = c.positionals[c.positionals.length - 1];
          if (dst && (isMainRef(dst) || unknownText(dst))) hits.push(c);
          break;
        }
        if ((c.shorts.includes('f') || longIs(c, 'force')) && c.positionals[0] && isMainRef(c.positionals[0])) hits.push(c);
        break;
      }
      case 'update-ref':
        if (c.positionals[0] && /^refs\/heads\/(main|master)$/.test(c.positionals[0])) hits.push(c);
        break;
      default:
        break; // lo que no se mira se declara y lo fija un test
    }
  }
  if (!hits.length) return null;

  // run.json ilegible dentro de un plan: falla cerrado.
  if (st.malformed) {
    return deny(`el marcador del flujo (${st.file}) está ilegible y un comando apunta a main dentro de un plan (unreadable-run)`, [],
      'arreglalo o limpialo con `run.js end` o `run.js start --replace` y reintentá');
  }

  // 6. Planes relevantes.
  const relevant = new Set(named);
  if (runPlan) relevant.add(runPlan);
  const cur = planOfBranch(branch());
  if (cur) relevant.add(cur);
  if (!relevant.size) {
    return flowPlan
      ? deny('hay un flujo plan en curso pero no hay un plan registrado para este comando (no-plan)', [], 'registrá el plan con `plan.js new` o cerrá el flujo con `run.js end`')
      : null; // un daily suelto no se toca
  }

  // 7. Cada plan relevante: registro legible y tarjeta aprobada.
  const ps = require('./plan-state');
  const strict = flowPlan || Boolean(runPlan);
  for (const name of [...relevant].sort()) {
    const r = ps.readPlan({ main, plan: name, git: true });
    if (!r.ok) {
      if (r.missing) {
        if (strict) return deny(`el plan ${name} no está registrado (unregistered)`, [name], `registralo con \`plan.js new --plan ${name}\` o cerrá el flujo con \`run.js end\``);
        continue;
      }
      return deny(`el registro del plan ${name} está ilegible (unreadable): ${r.error || ''}`.trim(), [name], 'restauralo desde git o revisá `plan.js status`; no se mergea a main con el registro roto');
    }
    const card = ps.scopeCardState({ main, plan: name, git: true });
    if (card !== 'approved') {
      const alt = card === 'changed' ? 'la tarjeta cambió después de aprobarla: presentala de nuevo al humano y registrá la nueva aprobación con `plan.js scope-card approve`' : APPROVE_ALT;
      return deny(`el plan ${name} no tiene la tarjeta de alcance aprobada (estado ${card}); nada llega a main sin ella`, [name], alt);
    }
  }
  return null;
}

module.exports = { decide, GIT_RE, VERB_RE, planOfBranch };
