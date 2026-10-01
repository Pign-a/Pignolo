'use strict';
// Configuración local de Claude Code del proyecto: desactivar la auto-memoria (R-16, §10.5).
// Edita SOLO la clave AUTO_MEMORY_KEY de <main>/.claude/settings.local.json; el resto del JSON, su
// orden y su sangría se conservan. Respaldo fuera del repo, escritura atómica (temp + rename).
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gitRun } = require('./git');
const { backupFile } = require('./init-actions');

// Un único punto de corrección si la verificación en una sesión real (tests/manual/hito-8.md punto 5) lo cambia.
const AUTO_MEMORY_KEY = 'autoMemoryEnabled';

const settingsLocalPath = (main) => path.join(main, '.claude', 'settings.local.json');
const forcedOn = (env) => ['0', 'false'].includes(String((env || {}).CLAUDE_CODE_DISABLE_AUTO_MEMORY || '').toLowerCase());

function readState(file, fs) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return { exists: false, data: {}, bom: false, indent: '  ' };
    throw e;
  }
  const bom = raw.charCodeAt(0) === 0xFEFF;
  const text = bom ? raw.slice(1) : raw;
  let data;
  try { data = JSON.parse(text); } catch (e) { return { exists: true, refused: 'invalid-json', reason: e.message }; }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { exists: true, refused: 'not-an-object', reason: 'el JSON no es un objeto' };
  const m = /^[ \t]+(?=\S)/m.exec(text);
  return { exists: true, data, bom, indent: m ? m[0] : '  ' };
}

function planAutoMemoryOff({ main, env = process.env, fs = nodeFs } = {}) {
  const file = settingsLocalPath(main);
  const notes = forcedOn(env) ? ['env-forces-on'] : [];
  const st = readState(file, fs);
  if (st.refused) return { file, exists: true, current: undefined, change: 'refused', reason: st.refused, notes };
  const current = st.data[AUTO_MEMORY_KEY];
  return { file, exists: st.exists, current, change: current === false ? 'none' : 'set', notes };
}

function applyAutoMemoryOff({ main, now = new Date(), env = process.env, fs = nodeFs, dry = false } = {}) {
  const id = 'auto-memory-off';
  const file = settingsLocalPath(main);
  const plan = planAutoMemoryOff({ main, env, fs });
  if (plan.change === 'refused') return { id, status: 'refused', reason: plan.reason, notes: plan.notes };
  if (plan.change === 'none') return { id, status: 'skipped', reason: 'already-set', notes: plan.notes };
  if (dry) return { id, status: 'would-do', notes: plan.notes };
  const st = readState(file, fs);
  const next = { ...st.data, [AUTO_MEMORY_KEY]: false };
  const text = `${st.bom ? '﻿' : ''}${JSON.stringify(next, null, st.indent)}\n`;
  let backup;
  if (st.exists) backup = backupFile({ file, main, env, now });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } catch (e) {
    return { id, status: 'refused', reason: `write-failed: ${e.message}`, ...(backup ? { backup } : {}), notes: plan.notes };
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* ya no existe */ }
  }
  return { id, status: 'done', ...(backup ? { backup } : {}), notes: plan.notes };
}

// Informativo: el ignore de settings.local.json depende del excludes global de la persona (C-04).
function gitIgnoredStatus({ main, run = (args, cwd) => gitRun(args, cwd) } = {}) {
  try {
    run(['check-ignore', '-q', '.claude/settings.local.json'], main);
    return { ignored: true };
  } catch (e) {
    return { ignored: e && e.status === 1 ? false : 'unknown' };
  }
}

module.exports = { AUTO_MEMORY_KEY, settingsLocalPath, planAutoMemoryOff, applyAutoMemoryOff, gitIgnoredStatus };
