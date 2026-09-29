'use strict';
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { readState } = require('../../lib/disabled');
const { backupRefs, shadowState } = require('../../lib/git-backup');
const { CANARIES } = require('../../lib/git-guard');

const LAUNCHER = path.join(__dirname, '..', 'launcher.js');
const SEEDER = path.join(__dirname, '..', '..', 'scripts', 'shadow-seed.js');
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
  if (input.source === 'status') {
    const hooks = st.guardOff ? 'apagados' : (st.hooksOff ? 'apagados con /pignolo:off' : 'encendidos');
    lines.push(`pignolo: hooks ${hooks}; guardia de git ${st.guardOff ? 'APAGADA' : 'activa'}; canario ${canaryOk ? 'OK' : `FALLÓ (${down.join(', ')})`}${sh ? `; repo sombra ${sh.state}` : ''}.`);
  }

  if (!lines.length) return { exit: 0, stdout: '' };
  const msg = lines.join('\n');
  return { exit: 0, stdout: JSON.stringify({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } }) };
};
