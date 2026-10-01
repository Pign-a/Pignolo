'use strict';
// scope-gate (spec §8.3, R-7, R-14): dentro de un plan, nada llega a main/master sin la
// tarjeta de alcance aprobada. Es un piso, no reemplaza la confirmación de la guardia.
// Falla cerrado dentro de un plan (registro, run.json o rama ilegibles, comando que no se
// parsea) y calla fuera de él. Hasta el prefiltro de texto no se carga nada de git.
const fs = require('node:fs');
const path = require('node:path');
const { projectState, readRun } = require('./project');
const { gitRun, isGitFailure } = require('./git');

const { GIT_RE, VERB_RE } = require('./hook-fastpath'); // el prefiltro es una sola constante (Task 12)
const MAIN = /^(main|master)$/;
// Ramas y etiquetas que llevan un plan: int/<p>, queue/<p>, task/<p>/..., cp/<p>/<n> y contract/<p>/...
// Sin distinguir mayusculas: git en Windows resuelve `INT/P1` como `int/p1` (G19); el slug se baja a minusculas.
const PLAN_BRANCH = /(?:^|[^A-Za-z0-9_-])(?:(?:int|queue)\/([a-z0-9][a-z0-9-]{0,63})(?![a-z0-9-])|(?:task|cp|contract)\/(?!daily\/)([a-z0-9][a-z0-9-]{0,63})\/)/gi;
const PLAN_REF_PREFIXES = ['refs/heads/int', 'refs/heads/queue', 'refs/heads/task', 'refs/tags/cp', 'refs/tags/contract'];
const MAIN_REFS = ['refs/heads/main', 'refs/heads/master', 'refs/remotes/*/main', 'refs/remotes/*/master'];
const RESOLVE_TIMEOUT_MS = 1000; // por llamada de git al resolver una ref
const RESOLVE_TOTAL_MS = 2500; // todo el resolver comparte este plazo (el del hook es 3 s)
const BRANCH_TIMEOUT_MS = 1000;
// merge --abort y similares no mueven nada.
const NO_MOVE = ['abort', 'continue', 'quit', 'skip'];

const stripHeads = (r) => String(r).replace(/^\+/, '').replace(/^refs\/heads\//, '');
const isMainRef = (r) => MAIN.test(stripHeads(r));
const unknownText = (r) => /[$`%]/.test(r);

function planOfBranch(b) {
  if (typeof b !== 'string') return null;
  const m = /^(?:int|queue)\/([a-z0-9][a-z0-9-]{0,63})$/i.exec(b) || /^(?:task|cp|contract)\/(?!daily\/)([a-z0-9][a-z0-9-]{0,63})\//i.exec(b);
  return m ? m[1].toLowerCase() : null;
}

function planBranchesIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(PLAN_BRANCH)) out.add((m[1] || m[2]).toLowerCase());
  return out;
}

// Lo que un comando de git que mueve algo a main trae como ref: los posicionales (sin el
// remoto de push/fetch/pull), los valores de las opciones (`--onto x`, `--onto=x`) y, de un
// refspec `src:dst` o un rango `a..b`, el lado que se lleva.
function refTexts(c) {
  const out = new Set();
  const skipRemote = ['push', 'fetch', 'pull'].includes(c.sub) ? 1 : 0;
  const add = (t) => {
    let r = String(t).replace(/^\+/, '');
    if (!r || r.startsWith('-')) return;
    const colon = r.lastIndexOf(':');
    if (colon >= 0 && !/^[A-Za-z]:[\\/]/.test(r)) r = r.slice(0, colon) || r.slice(colon + 1);
    const dots = r.lastIndexOf('..');
    if (dots >= 0) r = r.slice(dots + 2).replace(/^\./, '') || 'HEAD';
    if (r) out.add(r);
  };
  c.positionals.slice(skipRemote).forEach(add);
  for (const a of c.args || []) {
    if (a.startsWith('--') && a.includes('=')) add(a.slice(a.indexOf('=') + 1));
    else if (!a.startsWith('-')) add(a);
  }
  return [...out];
}

// Plan de una ref completa (refs/heads/int/p, refs/tags/cp/p/3...).
const planOfFullRef = (r) => planOfBranch(String(r).replace(/^refs\/(?:heads|tags)\//, ''));

// Resuelve con git que planes lleva cada ref de un comando que mueve algo a main: todas las refs se
// resuelven a commit de una vez (`cat-file --batch-check`; FETCH_HEAD linea por linea), y si un commit no
// esta ya en main ni en un main remoto, los planes son las ramas/etiquetas de plan que lo contienen
// (--contains) o cuya punta trae (--merged) y no estan en main. Plazo de 1 s por llamada y 2,5 s en total;
// un git que no responde lanza (quien llama niega).
function makeResolver({ cwd, run }) {
  const t0 = Date.now();
  const g = (args, opts = {}) => {
    const left = RESOLVE_TOTAL_MS - (Date.now() - t0);
    if (left <= 0) throw new Error(`se agoto el plazo de ${RESOLVE_TOTAL_MS} ms`);
    return run(args, cwd, { ...opts, timeout: Math.min(RESOLVE_TIMEOUT_MS, left) });
  };
  // null: git corrio y dijo que no (ref desconocida); cualquier otro fallo (plazo, git ausente) lanza
  const tryG = (args) => { try { return g(args); } catch (e) { if (isGitFailure(e)) return null; throw e; } };
  const lines = (out) => String(out || '').split(/\r?\n/).filter(Boolean);
  const mainRefs = new Set(['refs/heads/main', 'refs/heads/master']);
  const isMainRef = (r) => mainRefs.has(r) || /^refs\/remotes\/[^/]+\/(?:main|master)$/.test(r);
  let mainRef;
  const mainName = () => {
    if (mainRef === undefined) mainRef = ['refs/heads/main', 'refs/heads/master'].find((r) => tryG(['rev-parse', '--verify', '--quiet', r])) || null;
    return mainRef;
  };
  const bySha = new Map();
  const plansOfCommit = (sha) => {
    if (bySha.has(sha)) return bySha.get(sha);
    const out = new Set();
    bySha.set(sha, out);
    const containing = lines(g(['for-each-ref', '--format=%(refname)', `--contains=${sha}`, ...MAIN_REFS, ...PLAN_REF_PREFIXES]));
    if (containing.some(isMainRef)) return out; // ya esta en main
    const main = mainName();
    const merged = lines(g(['for-each-ref', '--format=%(refname)', `--merged=${sha}`, ...(main ? [`--no-merged=${main}`] : []), ...PLAN_REF_PREFIXES]));
    for (const r of [...containing, ...merged]) { const p = planOfFullRef(r); if (p) out.add(p); }
    return out;
  };
  const fetchHeadShas = () => {
    const file = tryG(['rev-parse', '--git-path', 'FETCH_HEAD']);
    let text = '';
    try { text = fs.readFileSync(path.resolve(cwd, file || ''), 'utf8'); } catch (_) { return []; }
    return lines(text).filter((l) => !/\bnot-for-merge\b/.test(l)).map((l) => l.split(/\s/)[0]).filter((x) => /^[0-9a-f]{40,64}$/.test(x));
  };
  return {
    anyPlanRef: () => lines(g(['for-each-ref', '--count=1', '--format=%(refname)', ...PLAN_REF_PREFIXES])).length > 0,
    // texts -> Set de planes que llevan
    plansOf(texts) {
      const shas = new Set();
      const plain = [];
      for (const t of texts) {
        if (t === 'FETCH_HEAD') { const f = fetchHeadShas(); if (f.length) { f.forEach((s) => shas.add(s)); continue; } }
        plain.push(t);
      }
      if (plain.length) {
        const out = g(['cat-file', '--batch-check'], { input: `${plain.map((t) => `${t}^{commit}`).join('\n')}\n` });
        for (const l of lines(out)) { const m = /^([0-9a-f]{40,64}) commit\b/.exec(l); if (m) shas.add(m[1]); }
      }
      const planSet = new Set();
      for (const sha of shas) for (const p of plansOfCommit(sha)) planSet.add(p);
      return planSet;
    },
  };
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
  const resolver = makeResolver({ cwd, run: deps.gitRun || gitRun });
  // Sin contexto de plan en el texto ni en disco, solo importa si existe alguna rama de plan: un sha, FETCH_HEAD
  // u otra ref pueden llevarla sin nombrarla (G19). Sin ramas de plan no hay nada que cuidar.
  if (!hasPlansDir && !runPlan && !flowPlan && !named.size) {
    try { if (!resolver.anyPlanRef()) return null; } catch (e) {
      if (isGitFailure(e)) return null; // no es un repo: no hay planes
      return deny(`no se pudo comprobar con git si hay ramas de plan (${e.message})`, [], 'reintenta el comando; si git no responde, revisa el repo');
    }
  }

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
        // reset a una ref que no es HEAD~n: un sha, ORIG_HEAD... puede llevar el plan (se resuelve despues)
        if (c.positionals.some((p) => !/^(?:HEAD|@)(?:[~^]\d*)*$/.test(p)) && currentIsMain(c)) hits.push(c);
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

  // 6. Planes relevantes: los que llevan los comandos que mueven algo a main (por nombre o resueltos con git,
  // cada comando del compuesto por separado). Solo si ninguno nombra un plan vale el plan del flujo y el de la
  // rama actual (p. ej. `git push origin HEAD:main`).
  const relevant = new Set();
  try {
    // Una ref que nombra un plan por texto (int/<p>, cp/<p>/<n>...) ya dice cual es; las demas (sha, FETCH_HEAD,
    // etiquetas ajenas, ramas) se resuelven con git.
    const toResolve = new Set();
    const take = (r) => { const named = planBranchesIn(r); if (named.size) named.forEach((p) => relevant.add(p)); else toResolve.add(r); };
    for (const c of hits) refTexts(c).forEach(take);
    // `git fetch . int/b && git merge FETCH_HEAD`: el FETCH_HEAD de la linea todavia no existe al decidir
    if (toResolve.has('FETCH_HEAD')) for (const c of cmds) if (c.sub === 'fetch') refTexts(c).forEach(take);
    if (toResolve.size) for (const p of resolver.plansOf([...toResolve])) relevant.add(p);
  } catch (e) {
    return deny(`no se pudo resolver con git que lleva el comando (${e.message})`, [], 'reintenta el comando; si git no responde, revisa el repo antes de mergear a main');
  }
  if (!relevant.size) {
    if (runPlan) relevant.add(runPlan);
    const cur = planOfBranch(branch());
    if (cur) relevant.add(cur);
  }
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
