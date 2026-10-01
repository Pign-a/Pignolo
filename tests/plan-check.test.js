'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');
const { checkPlan, toFindings } = require('../plugins/pignolo/lib/plan-check');

const CLI = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'plan-check.js');

// Un repo de prueba mínimo: { 'ruta': 'contenido' }.
function makeRoot(files) {
  const root = makeTempDir('plan-check-root-');
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

const plan = (...tasks) => tasks.map((t, i) => `### Task T${i + 1}: t\n\n${t}\n`).join('\n');
const refOf = (res, value) => res.refs.find((r) => r.value === value);

const BASE = {
  'lib/a.js': "'use strict';\nfunction foo(x) { return x; }\nfunction total({ cart, rate = 1 }) { return cart; }\nmodule.exports = { foo, total };\n",
  'scripts/x.js': '',
  'package.json': '{"scripts":{"lint":"node scripts/x.js"}}',
};

test('rutas: existe ok, inexistente falla, con la tarea donde aparece', () => {
  const res = checkPlan({ planText: plan('Toca `lib/a.js`.', 'Toca `lib/b.js`.'), root: makeRoot(BASE) });
  assert.deepStrictEqual([refOf(res, 'lib/a.js').ok, refOf(res, 'lib/a.js').task], [true, 'T1']);
  assert.deepStrictEqual([refOf(res, 'lib/b.js').ok, refOf(res, 'lib/b.js').task], [false, 'T2']);
  assert.strictEqual(refOf(res, 'lib/b.js').kind, 'path');
});

test('rutas que el propio plan crea no se marcan', () => {
  const res = checkPlan({
    planText: plan('**Files:** Create `lib/new.js`; Test `tests/new.test.js`.', 'Usa `lib/new.js`.'),
    root: makeRoot(BASE),
  });
  assert.ok(res.refs.length >= 2);
  assert.ok(res.refs.every((r) => r.ok), JSON.stringify(res.refs));
});

test('símbolos: definido ok, inventado falla, miembros y built-ins se ignoran', () => {
  const res = checkPlan({ planText: plan('Usa `foo(`, `bar(`, `it.skip(` y `expect(`.'), root: makeRoot(BASE) });
  assert.strictEqual(refOf(res, 'foo(').ok, true);
  assert.strictEqual(refOf(res, 'bar(').ok, false);
  assert.strictEqual(refOf(res, 'bar(').kind, 'symbol');
  assert.strictEqual(res.refs.length, 2);
});

test('símbolos que el plan produce no se marcan', () => {
  const res = checkPlan({
    planText: plan('Produce: `nuevo({ a })`.', 'Consume `nuevo({ a })`.'),
    root: makeRoot(BASE),
  });
  assert.ok(res.refs.every((r) => r.ok), JSON.stringify(res.refs));
});

test('firmas: un parámetro renombrado falla, los que coinciden pasan', () => {
  const res = checkPlan({
    planText: plan('Consume `total({ cart, rate })`.', 'Consume `total({ cart, taxRate })`.'),
    root: makeRoot(BASE),
  });
  assert.strictEqual(refOf(res, 'total({ cart, rate })').ok, true);
  const bad = refOf(res, 'total({ cart, taxRate })');
  assert.strictEqual(bad.ok, false);
  assert.match(bad.why, /taxRate/);
});

test('comandos: node con archivo inexistente y npm run inexistente fallan', () => {
  const res = checkPlan({
    planText: plan('Corré `node scripts/x.js`, `node scripts/y.js`, `npm run lint` y `npm run report`.'),
    root: makeRoot(BASE),
  });
  assert.strictEqual(refOf(res, 'node scripts/x.js').ok, true);
  assert.strictEqual(refOf(res, 'node scripts/y.js').ok, false);
  assert.strictEqual(refOf(res, 'npm run lint').ok, true);
  assert.strictEqual(refOf(res, 'npm run report').ok, false);
  assert.strictEqual(refOf(res, 'npm run report').kind, 'command');
});

test('bloques js: error de sintaxis falla, válido pasa, otros lenguajes se ignoran', () => {
  const res = checkPlan({
    planText: plan('```js\nconst a = 1;\n```\n\n```js\nconst = ;\n```\n\n```text\nno es js (\n```'),
    root: makeRoot(BASE),
  });
  assert.deepStrictEqual(res.blocks.map((b) => b.ok), [true, false]);
  assert.ok(res.blocks[1].error);
  assert.strictEqual(res.blocks[1].task, 'T1');
});

const TESTS = (body) => plan(`\`\`\`js\n// test: tests/t.test.js\n${body}\n\`\`\``);

test('runTests: un test que falla es rojo, uno que pasa no; el repo original queda intacto', () => {
  const root = makeRoot(BASE);
  const tmpDir = makeTempDir('plan-check-tmp-');
  const red = checkPlan({ planText: TESTS("require('node:test')('x', () => { throw new Error('rojo'); });"), root, runTests: true, tmpDir });
  assert.strictEqual(red.tests.length, 1);
  assert.deepStrictEqual([red.tests[0].file, red.tests[0].red, red.tests[0].task], ['tests/t.test.js', true, 'T1']);
  const green = checkPlan({ planText: TESTS("require('node:test')('x', () => {});"), root, runTests: true, tmpDir });
  assert.strictEqual(green.tests[0].red, false);
  assert.strictEqual(green.tests[0].exit, 0);
  assert.ok(!fs.existsSync(path.join(root, 'tests', 't.test.js')));
  assert.deepStrictEqual(fs.readdirSync(tmpDir), []); // la copia temporal se borra
});

test('sin runTests, tests es null', () => {
  const res = checkPlan({ planText: TESTS("require('node:test')('x', () => {});"), root: makeRoot(BASE) });
  assert.strictEqual(res.tests, null);
});

test('toFindings: cada problema sale como hallazgo con su tarea y palabras clave', () => {
  const root = makeRoot(BASE);
  const res = checkPlan({ planText: plan('Usa `bar(` y `lib/a.js`.'), root, runTests: true });
  const f = toFindings(res);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].task, 'T1');
  assert.ok(f[0].keywords.includes('bar'));
});

function cli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test('CLI: exit 0 sin problemas, 1 con problemas, 2 sin --plan; salida JSON', () => {
  const root = makeRoot(BASE);
  const dir = makeTempDir('plan-check-plans-');
  fs.writeFileSync(path.join(dir, 'ok.md'), plan('Toca `lib/a.js`.'));
  fs.writeFileSync(path.join(dir, 'bad.md'), plan('Toca `lib/zzz.js`.'));
  const ok = cli(['--plan', path.join(dir, 'ok.md'), '--root', root]);
  assert.strictEqual(ok.status, 0);
  assert.strictEqual(JSON.parse(ok.out).refs[0].ok, true);
  const bad = cli(['--plan', path.join(dir, 'bad.md'), '--root', root]);
  assert.strictEqual(bad.status, 1);
  assert.strictEqual(JSON.parse(bad.out).refs[0].ok, false);
  assert.strictEqual(cli([]).status, 2);
  assert.strictEqual(cli(['--plan', path.join(dir, 'nada.md')]).status, 2);
});

test('rutas: un prefijo omitido (lib/a.js por pkg/lib/a.js) cuenta; ramas y rutas sin extensión no se verifican', () => {
  const root = makeRoot({ 'pkg/lib/a.js': '' });
  const res = checkPlan({
    planText: plan('Toca `lib/a.js` en la rama `core/hito-4a` y en `scripts/sabotage`.', '**Files:** Create `pkg/lib/new.js`.', 'Usa `lib/new.js` y `lib/zzz.js`.'),
    root,
  });
  assert.strictEqual(refOf(res, 'lib/a.js').ok, true);
  assert.strictEqual(refOf(res, 'core/hito-4a'), undefined);
  assert.strictEqual(refOf(res, 'scripts/sabotage'), undefined);
  assert.strictEqual(refOf(res, 'lib/new.js').ok, true); // lo crea el plan con el prefijo
  assert.strictEqual(refOf(res, 'lib/zzz.js').ok, false);
});

test('símbolos: un mensaje de commit convencional no es un símbolo', () => {
  const res = checkPlan({ planText: plan('Commit `feat(tests): detectar cosas` y `fix(gate): otra`.'), root: makeRoot(BASE) });
  assert.deepStrictEqual(res.refs, []);
});

// Bloque Files de un plan en tarjetas: Create y Modify, una viñeta por ruta.
const FILES_PLAN = [
  '### Task T1: nuevo',
  '',
  '**Files:**',
  '- Create: `plugins/x/lib/nuevo.js`',
  '- Modify: `lib/a.js`',
  '- Test: `tests/nuevo.test.js`',
  '',
  'Implementa `nuevoFn({ a })` en `plugins/x/lib/nuevo.js` y llama a `foo(`.',
  '',
  '### Task T2: usa',
  '',
  '**Files:**',
  '- Modify: `plugins/x/lib/nuevo.js`',
  '- Modify: `lib/falta.js`',
  '',
  'Usa `nuevoFn({ a })` desde `lib/nuevo.js` y `tests/nuevo.test.js`.',
].join('\n');

test('Files: lo que la tarea marca Create (ruta y símbolo que define) no se reporta; Modify debe existir', () => {
  const res = checkPlan({ planText: FILES_PLAN, root: makeRoot(BASE) });
  const bad = res.refs.filter((r) => !r.ok).map((r) => r.value);
  assert.deepStrictEqual(bad, ['lib/falta.js'], JSON.stringify(res.refs));
  assert.strictEqual(refOf(res, 'nuevoFn({ a })').ok, true);
  assert.strictEqual(refOf(res, 'plugins/x/lib/nuevo.js').ok, true);
});

test('Files: Modify de una ruta inexistente que nadie crea falla aunque otra tarea cree un archivo parecido', () => {
  const text = '### Task T1: a\n\n**Files:**\n- Create: `lib/otro.js`\n- Modify: `lib/falta.js`\n';
  const res = checkPlan({ planText: text, root: makeRoot(BASE) });
  assert.strictEqual(refOf(res, 'lib/falta.js').ok, false);
  assert.strictEqual(refOf(res, 'lib/otro.js').ok, true);
});

test('sin bloque Files un símbolo inventado sigue marcándose', () => {
  const res = checkPlan({ planText: plan('Implementa `nuevoFn({ a })` en `lib/a.js`.'), root: makeRoot(BASE) });
  assert.strictEqual(refOf(res, 'nuevoFn({ a })').ok, false);
});

const { isCardPlan } = require('../plugins/pignolo/lib/plan-check');

test('isCardPlan: tarjeta de 3 líneas sí; prosa con bloques de código no; Task sin Files ni Interfaces no', () => {
  assert.strictEqual(isCardPlan('### Task 1: x\n\n**Files:**\n- Create: `lib/x.js`\n'), true);
  assert.strictEqual(isCardPlan('### Task 1: x\n**Interfaces:**\n- Produce: x()\n'), true);
  assert.strictEqual(isCardPlan('### Task 1: x\n\nHacé esto.\n\n```js\nconst a = 1;\n```\n'), false);
  assert.strictEqual(isCardPlan('# Plan\n\nSolo prosa con `lib/a.js` y **Files:** suelto.\n'), false);
  const far = `### Task 1: x\n${'texto\n'.repeat(70)}**Files:**\n- Create: a\n`;
  assert.strictEqual(isCardPlan(far), false, 'Files más allá de 60 líneas no cuenta');
});

test('CLI --require-cards: prosa sale con 2 y el aviso; una tarjeta sigue su curso', () => {
  const root = makeRoot(BASE);
  const dir = makeTempDir('plan-check-plans-');
  fs.writeFileSync(path.join(dir, 'prosa.md'), plan('Toca `lib/a.js`.'));
  fs.writeFileSync(path.join(dir, 'card.md'), '### Task T1: a\n\n**Files:**\n- Modify: `lib/a.js`\n');
  const r = spawnSync(process.execPath, [CLI, '--plan', path.join(dir, 'prosa.md'), '--root', root, '--require-cards'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /el plan no está en tarjetas \(Files\/Interfaces\): plan-check no aplica/);
  const ok = spawnSync(process.execPath, [CLI, '--plan', path.join(dir, 'card.md'), '--root', root, '--require-cards'], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, ok.stderr);
});

test('guarda de regresión: Create y Produce no se marcan como inexistentes', () => {
  const text = '### Task T1: a\n\n**Files:**\n- Create: `lib/x.js`\n\n**Interfaces:**\n- Produce: `x()`\n';
  const res = checkPlan({ planText: text, root: makeRoot(BASE) });
  assert.deepStrictEqual(res.refs.filter((r) => !r.ok), []);
});
