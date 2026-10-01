'use strict';
// Olas y modo según el tipo de plan (lib/waves.js, scripts/waves.js). Puro y determinista.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const { parsePlanTasks, overlaps, planWaves, COST_HINT } = require('../plugins/pignolo/lib/waves');

const ROOT = path.join(__dirname, '..');
const T = (id, over = {}) => ({ id: String(id), title: `t${id}`, files: [`lib/f${id}.js`], depends: [], kind: 'judgment', contract: false, external: false, parallel: false, ...over });
const six = (over) => Array.from({ length: 6 }, (_, i) => T(i + 1, over));
const shape = (r) => r.waves.map((w) => [w.mode, w.tasks.join(',')]);

test('parsePlanTasks: el plan del hito 5 y una tarjeta sintética con Kind, Depends y compañía', () => {
  const real = parsePlanTasks(fs.readFileSync(path.join(ROOT, 'docs', 'plans', '2026-09-30-hito-5-modo-plan.md'), 'utf8'));
  assert.ok(real.length >= 10, 'los ### Task del plan real');
  const t1 = real.find((t) => t.id === '1');
  assert.deepStrictEqual(t1.files, ['plugins/pignolo/lib/plan-state.js', 'plugins/pignolo/lib/scope-card.js', 'tests/plan-state.test.js', 'tests/scope-card.test.js']);
  assert.strictEqual(t1.kind, 'unknown');
  assert.strictEqual(t1.parallel, false);

  const card = [
    '# Plan', '', '### Task 1: contrato', '', '**Files:**', '- Create: `lib/a.js`, `lib/b.js`', '- Modify: `lib/c.js` (`symbol`, `otro`)', '- Test: `tests/a.test.js`',
    '', '**Kind:** verified-code', '**Contract:** yes', '', '### Task 2: usa el contrato', '', '**Files:**', '- Create: `lib/d.js`', '',
    '**Kind:** judgment', '**Depends:** Task 1', '**Parallel:** yes', '**External:** yes', '', '## Otra sección', '', '### Task 3: sin campos', '**Files:**', '- Test: `tests/z.test.js`',
  ].join('\n');
  const t = parsePlanTasks(card);
  assert.deepStrictEqual(t.map((x) => x.id), ['1', '2', '3']);
  assert.deepStrictEqual(t[0].files, ['lib/a.js', 'lib/b.js', 'lib/c.js', 'tests/a.test.js'], 'los nombres de símbolo no son rutas');
  assert.strictEqual(t[0].kind, 'verified-code');
  assert.strictEqual(t[0].contract, true);
  assert.deepStrictEqual(t[1].depends, ['1']);
  assert.deepStrictEqual([t[1].kind, t[1].parallel, t[1].external, t[1].contract], ['judgment', true, true, false]);
  assert.deepStrictEqual([t[2].kind, t[2].parallel, t[2].depends], ['unknown', false, []]);

  assert.deepStrictEqual(parsePlanTasks('# Plan en prosa\n\nHacer cosas.\n\n## Paso 1\nMás cosas.\n'), []);
  assert.deepStrictEqual(parsePlanTasks('### Task 1: x\n\nHacer cosas sin tarjeta.\n\n### Task 2: y\n\nMás prosa.\n'), [], 'headings sin Files/Interfaces: plan en prosa');
  const multi = parsePlanTasks('### Task 4: x\n**Files:**\n- Create: `a.js`\n**Depends:** Task 2, Task 3\n');
  assert.deepStrictEqual(multi[0].depends, ['2', '3']);
});

test('overlaps: igualdad, directorio-prefijo y glob', () => {
  assert.strictEqual(overlaps(['lib/a.js'], ['lib/a.js']).length, 1);
  assert.strictEqual(overlaps(['lib/'], ['lib/a.js']).length, 1);
  assert.strictEqual(overlaps(['lib/a.js'], ['lib/']).length, 1);
  assert.strictEqual(overlaps(['lib/a.js'], ['lib/b.js']).length, 0);
  assert.strictEqual(overlaps(['tests/*.test.js'], ['tests/x.test.js']).length, 1);
  assert.strictEqual(overlaps(['tests/x.test.js'], ['tests/*.test.js']).length, 1);
  assert.strictEqual(overlaps(['lib'], ['library/a.js']).length, 0, 'lib no es prefijo de library');
  assert.strictEqual(overlaps(['lib/sub'], ['lib/sub/a.js']).length, 1, 'directorio anclado sin barra final');
  assert.strictEqual(overlaps(['./lib\\a.js'], ['lib/a.js']).length, 1, 'rutas normalizadas');
});

test('seis judgment independientes con Parallel: yes -> por perfil; sin Parallel -> seis olas serial', () => {
  const par = six({ parallel: true });
  assert.deepStrictEqual(shape(planWaves({ tasks: par, profile: 'balanced' })), [['parallel', '1,2'], ['parallel', '3,4'], ['parallel', '5,6']]);
  assert.deepStrictEqual(shape(planWaves({ tasks: par, profile: 'max' })), [['parallel', '1,2,3'], ['parallel', '4,5,6']]);
  assert.deepStrictEqual(shape(planWaves({ tasks: par, profile: 'economy' })), [1, 2, 3, 4, 5, 6].map((n) => ['serial', String(n)]));
  const serial = planWaves({ tasks: six({ parallel: false }), profile: 'max' });
  assert.deepStrictEqual(shape(serial), [1, 2, 3, 4, 5, 6].map((n) => ['serial', String(n)]), 'sin Parallel nada va en paralelo, aunque sea independiente');
});

test('archivos en común, retrabajo y tarea sola fuerzan serial', () => {
  const four = [T(1, { parallel: true }), T(2, { parallel: true }), T(3, { parallel: true, files: ['lib/shared.js'] }), T(4, { parallel: true, files: ['lib/shared.js'] })];
  const r = planWaves({ tasks: four, profile: 'balanced' });
  assert.deepStrictEqual(shape(r), [['parallel', '1,2'], ['serial', '3'], ['serial', '4']]);
  assert.deepStrictEqual(r.notParallel.map((n) => n.task).sort(), ['3', '4']);
  const two = planWaves({ tasks: [T(1, { parallel: true }), T(2, { parallel: true })], profile: 'max', rework: 2 });
  assert.ok(two.waves.every((w) => w.mode !== 'parallel'), 'rework 2');
  assert.deepStrictEqual(two.notParallel.map((n) => n.why), ['retrabajo', 'retrabajo']);
  assert.deepStrictEqual(shape(planWaves({ tasks: [T(1, { parallel: true }), T(2, { parallel: true })], profile: 'max', rework: 1 })), [['parallel', '1,2']], 'rework 1 todavía admite paralelo');
  assert.deepStrictEqual(shape(planWaves({ tasks: [T(1, { parallel: true })], profile: 'max' })), [['serial', '1']], 'sola: no hay con quién');
});

test('verified-code y sin Kind van en serie; el costo serie es menor que el paralelo', () => {
  const v = [1, 2, 3].map((n) => T(n, { kind: 'verified-code', parallel: true }));
  const r = planWaves({ tasks: v, profile: 'max' });
  assert.deepStrictEqual(shape(r), [['serial', '1,2,3']], 'un solo ejecutor serial en el orden del plan');
  assert.ok(r.cost.serialTokens < r.cost.parallelTokens);
  assert.strictEqual(r.cost.serialTokens, 3 * COST_HINT.serialPerTask);
  assert.strictEqual(r.cost.plannedTokens, r.cost.serialTokens, 'todo en serie cuesta lo de serie');
  const unknown = planWaves({ tasks: [T(1, { kind: 'unknown', parallel: true }), T(2, { kind: 'unknown', parallel: true })], profile: 'max' });
  assert.deepStrictEqual(shape(unknown), [['serial', '1'], ['serial', '2']]);
});

test('contrato, contracts, serial-paths y external van solos; la ola 0 es de contrato', () => {
  const r = planWaves({ tasks: [T(1, { contract: true }), T(2, { parallel: true }), T(3, { parallel: true })], profile: 'max' });
  assert.deepStrictEqual(shape(r), [['contract', '1'], ['parallel', '2,3']]);
  assert.strictEqual(r.waves[0].n, 0);
  assert.match(r.waves[0].reasons.join(' '), /contrato/);
  const byGlob = planWaves({ tasks: [T(1, { files: ['api/schema.json'] }), T(2)], contracts: ['api/'] });
  assert.deepStrictEqual(shape(byGlob), [['contract', '1'], ['serial', '2']]);
  const sp = planWaves({ tasks: [T(1, { parallel: true, files: ['db/migrate.js'] }), T(2, { parallel: true }), T(3, { parallel: true })], profile: 'max', serialPaths: ['db/'] });
  assert.deepStrictEqual(shape(sp), [['serial', '1'], ['parallel', '2,3']]);
  const ext = planWaves({ tasks: [T(1, { external: true, parallel: true }), T(2, { parallel: true }), T(3, { parallel: true })], profile: 'max' });
  assert.deepStrictEqual(shape(ext), [['serial', '1'], ['parallel', '2,3']]);
});

test('depends en capas, ciclo con kind y determinismo', () => {
  const layered = planWaves({ tasks: [T(1), T(2, { depends: ['1'], parallel: true }), T(3, { depends: ['1'], parallel: true })], profile: 'max' });
  assert.deepStrictEqual(shape(layered), [['serial', '1'], ['parallel', '2,3']]);
  assert.throws(() => planWaves({ tasks: [T(1, { depends: ['2'] }), T(2, { depends: ['1'] })] }), (e) => e.kind === 'cycle');
  assert.throws(() => planWaves({ tasks: [T(1, { depends: ['9'] })] }), (e) => e.kind === 'unknown-dependency');
  const input = { tasks: six({ parallel: true }), profile: 'balanced' };
  assert.strictEqual(JSON.stringify(planWaves(input)), JSON.stringify(planWaves(input)));
});

test('CLI: JSON de planWaves, kind not-cards en un plan en prosa y cycle', () => {
  const dir = makeTempDir();
  const plan = path.join(dir, 'plan.md');
  const run = (file, extra = []) => {
    const r = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'waves.js'), '--plan-file', file, '--cwd', dir, ...extra], { encoding: 'utf8', timeout: 30000 });
    return { status: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
  };
  fs.writeFileSync(plan, '### Task 1: a\n**Files:**\n- Create: `lib/a.js`\n**Kind:** judgment\n**Parallel:** yes\n\n### Task 2: b\n**Files:**\n- Create: `lib/b.js`\n**Kind:** judgment\n**Parallel:** yes\n');
  const r = run(plan, ['--profile', 'max']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(r.out.waves.map((w) => w.mode), ['parallel']);
  assert.strictEqual(run(plan, ['--profile', 'zzz']).status, 2);
  const prose = path.join(dir, 'prose.md');
  fs.writeFileSync(prose, '# Plan\n\nHacer algo.\n');
  const p = run(prose);
  assert.strictEqual(p.status, 1);
  assert.strictEqual(p.out.kind, 'not-cards');
  assert.match(p.stderr, /Alternativa:/);
  const cyc = path.join(dir, 'cyc.md');
  fs.writeFileSync(cyc, '### Task 1: a\n**Files:**\n- Create: `a.js`\n**Depends:** Task 2\n\n### Task 2: b\n**Files:**\n- Create: `b.js`\n**Depends:** Task 1\n');
  const c = run(cyc);
  assert.strictEqual(c.status, 1);
  assert.strictEqual(c.out.kind, 'cycle');
});
