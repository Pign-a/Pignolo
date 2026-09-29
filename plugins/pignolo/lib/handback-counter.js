'use strict';
// Contador del handback-gate (uno por tarea): ~/.pignolo/handback/<counterKey>/<taskId>.json.
// counterKey sale sin git del directorio común que ya resuelve mainRoot (disabled.js).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pignoloHome } = require('./home');
const { gitCommon } = require('./disabled');

const initial = () => ({ count: 0, accepted: false, acceptedAgentId: null, blocked: false, lastReason: null, stopHookActive: [] });

function counterKey(cwd = process.cwd()) {
  const g = gitCommon(cwd);
  let dir = path.resolve(g ? g.common : cwd);
  if (process.platform === 'win32') dir = dir.toLowerCase();
  return crypto.createHash('sha256').update(dir).digest('hex').slice(0, 16);
}

function counterPath(env, cwd, taskId) {
  let id = String(taskId).replace(/[^A-Za-z0-9._-]/g, '_');
  if (id === '' || /^\.+$/.test(id)) id = '_';
  return path.join(pignoloHome(env), 'handback', counterKey(cwd), `${id}.json`);
}

function readCounter(env, cwd, taskId) {
  try {
    const o = JSON.parse(fs.readFileSync(counterPath(env, cwd, taskId), 'utf8'));
    if (o && typeof o === 'object' && !Array.isArray(o) && typeof o.count === 'number') return { ...initial(), ...o };
  } catch (_) { /* ausente o ilegible: valor inicial */ }
  return initial();
}

function writeCounter(env, cwd, taskId, counter) {
  const file = counterPath(env, cwd, taskId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(counter, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function clearCounter(env, cwd, taskId) {
  fs.rmSync(counterPath(env, cwd, taskId), { force: true });
}

module.exports = { counterKey, counterPath, readCounter, writeCounter, clearCounter };
