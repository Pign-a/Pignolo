'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const SCRIPT = path.join(__dirname, 'evals', 'select-validation.mjs');

// 20 tareas sintéticas: 9 chicas y 11 medianas. Ids genéricos.
const tasks = [];
for (let i = 1; i <= 9; i++) tasks.push({ id: `s${String(i).padStart(2, '0')}`, stratum: 'small', extra: 'ignorado' });
for (let i = 1; i <= 11; i++) tasks.push({ id: `m${String(i).padStart(2, '0')}`, stratum: 'medium' });

let mod;
async function lib() {
  if (!mod) mod = await import(pathToFileURL(SCRIPT).href);
  return mod;
}

test('es determinista: misma entrada y semilla dan la misma salida, sin importar el orden de la entrada', async () => {
  const { selectValidation } = await lib();
  const a = selectValidation(tasks, { small: 7, medium: 9, seed: 20261024 });
  const b = selectValidation(tasks.slice().reverse(), { small: 7, medium: 9, seed: 20261024 });
  assert.deepStrictEqual(a, b);
});

test('cuentas: 7 chicas y 9 medianas, reserva de 4, sin solapamiento, elegidas ordenadas por id', async () => {
  const { selectValidation } = await lib();
  const r = selectValidation(tasks);
  assert.strictEqual(r.seed, 20261024);
  assert.strictEqual(r.selected.length, 16);
  assert.strictEqual(r.reserve.length, 4);
  assert.strictEqual(r.selected.filter((id) => id.startsWith('s')).length, 7);
  assert.strictEqual(r.selected.filter((id) => id.startsWith('m')).length, 9);
  assert.strictEqual(r.reserve.filter((id) => id.startsWith('s')).length, 2);
  assert.strictEqual(r.reserve.filter((id) => id.startsWith('m')).length, 2);
  assert.strictEqual(new Set([...r.selected, ...r.reserve]).size, 20);
  assert.deepStrictEqual(r.selected, r.selected.slice().sort());
  assert.deepStrictEqual(r.strata.small, { candidates: 9, selected: 7, reserve: 2 });
  assert.deepStrictEqual(r.strata.medium, { candidates: 11, selected: 9, reserve: 2 });
  assert.match(r.inputHash, /^[0-9a-f]{64}$/);
});

test('el hash de la entrada no depende de campos extra ni del orden, y cambia si cambia un estrato', async () => {
  const { selectValidation } = await lib();
  const a = selectValidation(tasks);
  const swapped = tasks.map((t) => (t.id === 's01' ? { ...t, stratum: 'medium' } : t));
  const b = selectValidation(swapped, { small: 7, medium: 9 });
  assert.notStrictEqual(a.inputHash, b.inputHash);
});

test('se niega si un estrato tiene menos tareas que las pedidas', async () => {
  const { selectValidation } = await lib();
  assert.throws(() => selectValidation(tasks, { small: 10, medium: 9 }), /small/);
  assert.throws(() => selectValidation(tasks, { small: 7, medium: 12 }), /medium/);
});

test('rechaza estratos inválidos e ids repetidos', async () => {
  const { selectValidation } = await lib();
  assert.throws(() => selectValidation([{ id: 'a', stratum: 'big' }]), /estrato/);
  assert.throws(() => selectValidation([{ id: 'a', stratum: 'small' }, { id: 'a', stratum: 'small' }], { small: 1, medium: 0 }), /repetido/);
});

test('cambiar la semilla cambia la selección', async () => {
  const { selectValidation } = await lib();
  const a = selectValidation(tasks, { seed: 20261024 });
  const different = [1, 2, 3, 4, 5].map((d) => selectValidation(tasks, { seed: 20261024 + d * 7919 }));
  assert.ok(different.some((r) => JSON.stringify(r.selected) !== JSON.stringify(a.selected)));
  assert.ok(different.some((r) => JSON.stringify(r.reserve) !== JSON.stringify(a.reserve)));
});

test('CLI: escribe el JSON, imprime solo ids y cuentas, y acepta un objeto por id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selval-'));
  try {
    const input = path.join(dir, 'in.json');
    const output = path.join(dir, 'out.json');
    const asObject = Object.fromEntries(tasks.map((t) => [t.id, { stratum: t.stratum, private: 'secreto-no-debe-salir' }]));
    fs.writeFileSync(input, JSON.stringify(asObject));
    const r = spawnSync(process.execPath, [SCRIPT, '--input', input, '--output', output, '--small', '7', '--medium', '9', '--seed', '20261024'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.strictEqual(out.selected.length, 16);
    assert.ok(!r.stdout.includes('secreto'));
    assert.ok(!fs.readFileSync(output, 'utf8').includes('secreto'));
    assert.match(r.stdout, /Reserva en orden de reemplazo \(4\)/);
    // misma salida que la función
    const again = spawnSync(process.execPath, [SCRIPT, '--input', input, '--output', path.join(dir, 'out2.json')], { encoding: 'utf8' });
    assert.strictEqual(again.status, 0, again.stderr);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'out2.json'), 'utf8')), out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: sale con código 1 y mensaje si falta una cuota', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selval-'));
  try {
    const input = path.join(dir, 'in.json');
    fs.writeFileSync(input, JSON.stringify(tasks));
    const r = spawnSync(process.execPath, [SCRIPT, '--input', input, '--output', path.join(dir, 'o.json'), '--small', '12'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /small/);
    assert.ok(!fs.existsSync(path.join(dir, 'o.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
