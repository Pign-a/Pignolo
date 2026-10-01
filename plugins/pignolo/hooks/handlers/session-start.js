'use strict';
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { readState, mainRoot } = require('../../lib/disabled');
const { readRun } = require('../../lib/project');
const { gitRun } = require('../../lib/git');
const { KINDS, readEntries } = require('../../lib/state-store');
const { buildHot, HOT_LIMIT } = require('../../lib/context-budget');
const { backupRefs, shadowState } = require('../../lib/git-backup');
const { CANARIES } = require('../../lib/git-guard');
const { recoverAll } = require('../../lib/sabotage');
const { deriveNext } = require('../../lib/next');

const LAUNCHER = path.join(__dirname, '..', 'launcher.js');
const SEEDER = path.join(__dirname, '..', '..', 'scripts', 'shadow-seed.js');
const SABOTAGE_CLI = path.join(__dirname, '..', '..', 'scripts', 'sabotage.js');
const CANARY_MARK = /pignolo bloqueó/;
const FAMILY_LABEL = {
  catastrophic: 'catastrófico',
  'git-destructive': 'git destructivo',
  'non-literal': 'ejecución no literal',
  'powershell-ast': 'PowerShell por AST',
  'protected-write': 'Edit/Write protegido',
};

// Canario (spec §8.4): un comando plantado por familia (CANARIES de git-guard), cada
// uno de punta a punta por el launcher real. Exige exit 2 Y el mensaje propio de
// pignolo: un launcher que sale con 2 porque no encuentra el handler también
// devuelve 2, y eso es una guardia caída. Devuelve las familias caídas.
// `handlers` reemplaza handlers por nombre (solo tests).
// Límite declarado: no detecta si hooks.json dejó de registrar la guardia (checklist manual).
function canaryDown(env, cwd, handlers = {}) {
  const down = [];
  for (const c of CANARIES) {
    const res = spawnSync(process.execPath, [LAUNCHER, handlers[c.handler] || c.handler], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd, ...c.payload }),
      encoding: 'utf8',
      env: { ...env, PIGNOLO_CANARY: '1', PIGNOLO_DISABLED: '' },
      timeout: 8000,
      windowsHide: true,
    });
    if (!(res.status === 2 && CANARY_MARK.test(res.stderr || ''))) down.push(FAMILY_LABEL[c.family] || c.family);
  }
  return down;
}

// Siembra del repo sombra en segundo plano (spec §11.6): SessionStart no espera.
function spawnSeeder(env, cwd, sessionId) {
  const args = [SEEDER, '--cwd', cwd];
  if (sessionId) args.push('--session', String(sessionId));
  const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function shadowLines(sh) {
  if (!sh) return [];
  if (sh.state === 'absent') return ['pignolo: sembrando el repo sombra en segundo plano (primera vez en este repo). Hasta que termine, las instantáneas quedan dentro del repo y no sobreviven a borrar .git.'];
  if (sh.state === 'error') return [`⚠ pignolo: la última siembra del repo sombra falló (${sh.error}). Se reintenta ahora; mientras tanto las instantáneas quedan dentro del repo y no sobreviven a borrar .git.`];
  return (sh.warnings || []).map((w) => `⚠ pignolo: ${w}`);
}

exports.run = (input, ctx = {}) => {
  const env = { ...process.env, ...(ctx.env || {}) };
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const st = readState({ env, cwd });
  const lines = [];

  const handlers = { ...(ctx.canaryHandler ? { guard: ctx.canaryHandler } : {}), ...(ctx.canaryHandlers || {}) };
  const down = canaryDown(env, cwd, handlers);
  const canaryOk = down.length === 0;
  if (!canaryOk) {
    lines.push(`⚠ pignolo: la guardia NO bloqueó el comando de prueba de: ${down.join(', ')}. Está caída en esas familias: no confíes en ella hasta revisarla (/pignolo:status).`);
  }
  if (st.guardOff) {
    lines.push('⚠ pignolo: PIGNOLO_DISABLED=1 — la guardia de git y los respaldos están APAGADOS en esta sesión.');
  } else if (st.hooksOff) {
    lines.push('pignolo: apagado con /pignolo:off. La guardia de git y los respaldos siguen activos.');
  }
  if ((input.source === 'startup' || input.source === 'fork') && !st.guardOff) {
    try {
      // Callado en el éxito (spec §8.3); la copia fuera del repo la hace la siembra.
      backupRefs({ cwd, env, outside: false });
    } catch (e) {
      lines.push(`pignolo: no se pudo respaldar las refs (${e.message}).`);
    }
  }
  if (!st.guardOff) {
    // Sabotaje interrumpido (spec §11.6): sin candado no lanza git; callado si no hubo nada.
    // Con /pignolo:off no restaura (decisión del autor, 2026-09-30): solo avisa.
    try {
      const rec = recoverAll({ cwd, env, restore: !st.hooksOff });
      for (const r of rec.recovered) lines.push(`pignolo restauró ${r.files.length} archivos que un sabotaje interrumpido dejó rotos en ${r.worktree} (${r.files.join(', ')}).`);
      for (const p of rec.pending) lines.push(`⚠ pignolo: quedó un sabotaje interrumpido en ${p.worktree} (${p.files.join(', ')}) y no se restauró porque pignolo está apagado con /pignolo:off. Corré: node "${SABOTAGE_CLI}" --recover --cwd "${p.worktree}"`);
      for (const b of rec.busy) lines.push(`⚠ pignolo: hay un sabotaje en curso en ${b.worktree} (pid ${b.pid}); no se tocó. Si no hay ninguno corriendo, en 30 s el candado queda viejo: corré node "${SABOTAGE_CLI}" --recover --cwd "${b.worktree}"`);
      for (const e of rec.errors) lines.push(`⚠ pignolo: no se pudo recuperar un sabotaje interrumpido (${e.message}).`);
    } catch (e) {
      lines.push(`⚠ pignolo: no se pudo revisar si quedó un sabotaje interrumpido (${e.message}).`);
    }
  }
  let sh = null;
  if (!st.guardOff) {
    try {
      sh = shadowState({ cwd, env });
      if (sh && input.source !== 'status') {
        lines.push(...shadowLines(sh));
        spawnSeeder(env, cwd, input.session_id);
      }
    } catch (e) {
      lines.push(`⚠ pignolo: no se pudo lanzar la siembra del repo sombra (${e.message}).`);
    }
  }
  // Próxima acción derivada del estado (R-10 del hito 5): solo si hay algo en curso. El sabotaje
  // interrumpido ya lo informó el bloque de arriba.
  let nextText = '';
  if (!st.hooksOff) {
    try {
      const n = deriveNext({ cwd, env });
      if (n && n.kind !== 'nothing' && n.text && !String(n.kind).startsWith('sabotage')) nextText = n.text;
    } catch (e) {
      lines.push(`⚠ pignolo: no se pudo derivar la próxima acción (${e.message}).`);
    }
  }
  // Ramas ya unidas para limpiar (hito 7a, D-7-5): una línea solo si hay algo; presupuesto propio de 1,5 s y, al vencer, silencio.
  // Sin proyecto activo o con /pignolo:off, nada.
  if (!st.hooksOff && input.source !== 'status') {
    try {
      const { projectState } = require('../../lib/project');
      const proj = projectState({ cwd, env });
      if (proj.active) {
        const line = require('../../lib/branch-cleanup').noticeLine({ main: proj.main, opts: ctx.cleanupOpts, budgetMs: ctx.cleanupBudgetMs });
        if (line) lines.push(line);
      }
    } catch (_) { /* callado: es un aviso, no un requisito */ }
  }
  if (input.source === 'status') {
    // /pignolo:status muestra lo de siempre (systemMessage), sin el nivel caliente.
    if (nextText) lines.push(nextText);
    const hooks = st.guardOff ? 'apagados' : (st.hooksOff ? 'apagados con /pignolo:off' : 'encendidos');
    lines.push(`pignolo: hooks ${hooks}; guardia de git ${st.guardOff ? 'APAGADA' : 'activa'}; canario ${canaryOk ? 'OK' : `FALLÓ (${down.join(', ')})`}${sh ? `; repo sombra ${sh.state}` : ''}.`);
  }

  const msg = lines.join('\n');
  // Nivel caliente (R-3, R-4 del hito 6): solo en additionalContext, nunca en systemMessage, y
  // con el tope repartido con los avisos (avisos + nivel caliente <= HOT_LIMIT).
  let hot = '';
  if (!st.hooksOff && input.source !== 'status') {
    const limit = HOT_LIMIT - (msg ? msg.length + 2 : 0);
    if (limit > 0) {
      try { hot = hotContext({ cwd, nextText, limit }); } catch (e) {
        hot = `⚠ pignolo: no se pudo armar el estado del proyecto (${e.message}).`.slice(0, limit);
      }
    }
  }

  if (!msg && !hot) return { exit: 0, stdout: '' };
  const additionalContext = [msg, hot].filter(Boolean).join('\n\n');
  const out = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } };
  return { exit: 0, stdout: JSON.stringify(msg ? { systemMessage: msg, ...out } : out) };
};

// Rama del checkout principal (el estado vive ahí, spec §10.1): la misma desde un worktree,
// un subdirectorio o el principal (F13). Plazo corto; si git falla, sin línea de rama.
function mainBranch(main) {
  try {
    const b = String(gitRun(['-C', main, 'rev-parse', '--abbrev-ref', 'HEAD'], main, { timeout: 1000 })).trim();
    return b || '';
  } catch (_) { return ''; }
}

// El nivel caliente leído del checkout principal: entradas de .pignolo/state/, flujo de
// run.json (uno ilegible cuenta como sin flujo, R-12) y el texto de next. Callado ('') si no
// hay entradas, ni flujo, ni next, ni entradas ilegibles.
function hotContext({ cwd, nextText, limit }) {
  const main = mainRoot(cwd);
  const r = readRun(main);
  const flow = r.running && r.run ? { flow: r.run.flow, task: r.run.task } : null;
  const entries = [];
  let bad = 0;
  for (const kind of KINDS) {
    const got = readEntries({ main, kind });
    entries.push(...got.entries);
    bad += got.errors.length;
  }
  if (!entries.length && !flow && !nextText && !bad) return '';
  const badLine = bad ? `${bad} entradas de estado ilegibles (ver INDEX.md y .pignolo/state/).` : '';
  const room = badLine ? limit - badLine.length - 1 : limit;
  if (room <= 0) return badLine.slice(0, limit);
  const { text } = buildHot({ branch: mainBranch(main), nextText, flow, entries }, { limit: room });
  return badLine ? `${text}\n${badLine}` : text;
}
