'use strict';
// Fixture saneada de los 181 comandos que la guardia bloqueó en una sesión real (G71).
// `base` es lo que da el código al empezar la etapa 1; `expect` es lo que se espera hoy: cada tarjeta lo mueve
// para las filas que libera. `audit` es lo que midió la auditoría (con el disco real de aquella sesión).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('../plugins/pignolo/lib/git-guard');

const ROWS = JSON.parse(fs.readFileSync(path.join(__dirname, 'guard', 'medidos.json'), 'utf8'));
const verdict = (v) => (v.decision === 'allow' ? 'allow' : `block:${v.rule}`);
const run = (r) => evaluate(r.cmd, {
  shell: r.shell, mode: 'bypassPermissions', subagent: r.subagent, agentType: r.agentType, psTimeoutMs: 30000,
  statPath: (p) => ((r.files || []).includes(p) ? 'file' : null),
});

test('medidos.json: 181 filas, ids únicos y todos los campos', () => {
  assert.strictEqual(ROWS.length, 181);
  assert.strictEqual(new Set(ROWS.map((r) => r.id)).size, 181);
  ROWS.forEach((r, i) => {
    assert.strictEqual(r.id, `ev-${String(i).padStart(3, '0')}`);
    assert.ok(['bash', 'powershell'].includes(r.shell), r.id);
    assert.strictEqual(typeof r.cmd, 'string', r.id);
    for (const k of ['audit', 'base', 'expect']) assert.match(r[k], /^(allow|block:[A-Za-z0-9-]+)$/, `${r.id}.${k}`);
    if (r.files !== undefined) assert.ok(Array.isArray(r.files), r.id);
  });
});

test('medidos.json: cada fila da su `expect` con el código vigente', () => {
  const bad = ROWS.filter((r) => verdict(run(r)) !== r.expect).map((r) => `${r.id}: ${verdict(run(r))} != ${r.expect}`);
  assert.deepStrictEqual(bad, []);
});

test('medidos.json: base y auditoría difieren en <= 10 filas (el disco de la auditoría era el real)', () => {
  const blocked = ROWS.filter((r) => r.base !== 'allow').length;
  const diff = ROWS.filter((r) => r.base !== r.audit);
  console.log(`# base: ${blocked} bloqueadas, ${ROWS.length - blocked} permitidas; ${diff.length} difieren de la auditoría: ${diff.map((r) => r.id).join(' ')}`);
  assert.strictEqual(blocked + (ROWS.length - blocked), 181);
  assert.ok(diff.length <= 10, `difieren ${diff.length}`);
});

test('medidos.json: ninguna fila deja datos privados', () => {
  const generic = [
    /(?<![A-Za-z0-9_])[A-Za-z]:[\\/]/, // letra de unidad de Windows
    /[\\/](Users|home)[\\/][^\\/\s"']+/i, // carpeta de usuario de Windows, Linux o macOS
    /AppData/i,
    /\.claude[\\/]+jobs/i,
    /(?<![0-9a-f])[0-9a-f]{16,}(?![0-9a-f])/i, // hash largo
    /[\w.+-]+@[\w-]+\.[\w.-]+/, // correo
  ];
  const deny = [];
  const dl = path.join(__dirname, '..', 'local', 'guard', 'denylist.txt');
  if (fs.existsSync(dl)) deny.push(...fs.readFileSync(dl, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  else console.log('# sin local/guard/denylist.txt: solo las expresiones genéricas');
  const leaks = [];
  for (const r of ROWS) {
    for (const text of [r.cmd, ...(r.files || [])]) {
      generic.forEach((re, i) => { if (re.test(text)) leaks.push(`${r.id} genérica ${i}`); });
      for (const d of deny) if (text.toLowerCase().includes(d.toLowerCase())) leaks.push(`${r.id} denylist`);
    }
  }
  assert.deepStrictEqual(leaks, []);
});

test('costura statPath: archivo bloquea, null permite, y se usa aunque no haya cwd', () => {
  assert.strictEqual(evaluate('git checkout x.js', { statPath: () => 'file' }).rule, 'checkout-path');
  assert.strictEqual(evaluate('git checkout x.js', { statPath: () => 'dir' }).rule, 'checkout-path');
  assert.strictEqual(evaluate('git checkout x.js', { statPath: () => null }).decision, 'allow');
});
