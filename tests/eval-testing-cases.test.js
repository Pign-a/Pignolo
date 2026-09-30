'use strict';
// Graders de las evals del hito 4b (test-writer, implementer, review-testability), sin gastar
// tokens, con los traces de forma real de tests/evals/traces.js: el informe bueno del
// subagente aprueba y el malo reprueba; el mismo informe escrito por la sesión principal
// reprueba; sin informe del subagente, "hubo informe" reprueba.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
const { ROLES } = require('../plugins/pignolo/lib/roles');
const { SUB, reportHead } = require('./evals/review-cases');
const { CASES, build } = require('./evals/testing-cases');
const { AGENT_ID, grade, dispatch, toolUse, agentResult, agentError, agentLaunched, run } = require('./evals/traces');

const out = makeTempDir('pignolo-evals-4b-');
build({ out, model: 'sonnet' });
const graders = (name) => fs.readdirSync(path.join(out, name, 'graders'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), ...parseFrontmatter(fs.readFileSync(path.join(out, name, 'graders', f), 'utf8')).data }))
  .filter((g) => g.type === 'regex');
const subTools = (list, parent) => (list || []).map((t) => toolUse(t.name, t.input, parent));

for (const c of CASES) {
  test(`eval ${c.name}: estructura, fixture y modelo`, () => {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(out, c.name, f)), f);
    const sh = fs.readFileSync(path.join(out, c.name, 'fixture.sh'), 'utf8');
    for (const content of Object.values(c.files)) assert.ok(sh.includes(content.replace(/\n$/, '')));
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.match(prompt, new RegExp(`subagent_type pignolo:${c.agent}, model ${c.modelFromFlag ? 'sonnet' : 'opus'}\\)`));
    assert.match(prompt, /run_in_background false/);
  });

  test(`eval ${c.name}: los graders leen solo lo que hizo el subagente`, () => {
    const gs = graders(c.name);
    const s = c.samples;
    const goodFiles = { ...c.files, ...(s.passFiles || {}) };
    const badFiles = { ...c.files, ...(s.failFiles || {}) };

    // (a) El informe bueno (con sus herramientas y archivos) aprueba todo; el malo reprueba alguno.
    const good = { trace: run(c, { report: s.pass, tools: subTools(s.passTools, AGENT_ID) }), files: goodFiles };
    for (const g of gs) assert.ok(grade(g, good), `${c.name}: ${g.name} reprueba el informe bueno`);
    const bad = { trace: run(c, { report: s.fail, tools: subTools(s.failTools, AGENT_ID) }), files: badFiles };
    assert.ok(gs.some((g) => !grade(g, bad)), `${c.name}: ningún grader reprueba el informe malo`);

    // (b) Lo bueno hecho por la sesión principal (sus herramientas y su texto) con el subagente
    // devolviendo un informe neutro: todo grader del trace que exige algo del subagente reprueba.
    const fromMain = { trace: run(c, { report: 'No report.', tools: subTools(s.passTools, null), main: s.pass }), files: goodFiles };
    for (const g of gs.filter((x) => x.target === 'trace' && x.match !== 'not_contains' && !['subagent-returned', 'single-dispatch'].includes(x.name))) {
      assert.ok(!grade(g, fromMain), `${c.name}: ${g.name} aprueba lo que hizo la sesión principal`);
    }

    // (c) Sin informe real del subagente, "hubo informe" y los de ausencia de texto reprueban.
    const returned = gs.find((g) => g.name === 'subagent-returned');
    assert.ok(returned, `${c.name}: falta subagent-returned`);
    const empties = {
      'sin tool_result del Agent': run(c, { report: null, main: s.pass }),
      'con un error del Agent': run(c, { report: null, main: s.pass, result: agentError('Agent type not found') }),
      'con el aviso de background': run(c, { report: null, main: s.pass, result: agentLaunched(c) }),
      'con un informe vacío': run(c, { report: '', main: s.pass }),
    };
    for (const [why, trace] of Object.entries(empties)) {
      for (const g of gs.filter((x) => x.name === 'subagent-returned' || x.name === 'no-blocking-finding')) {
        assert.ok(!grade(g, { trace, files: goodFiles }), `${c.name}: ${g.name} aprueba ${why}`);
      }
    }

    // (d) Dos despachos del mismo agente: single-dispatch reprueba.
    const twice = run(c, { report: s.pass, before: [dispatch(c, 'toolu_FIRST'), agentResult(c, s.fail, 'toolu_FIRST')] });
    assert.ok(!grade(gs.find((g) => g.name === 'single-dispatch'), { trace: twice, files: goodFiles }), `${c.name}: single-dispatch aprueba dos despachos`);

    // Todo grader del trace se ata al subagente: al tool_result de su Agent o a sus eventos (SUB).
    for (const g of gs.filter((x) => x.target === 'trace' && x.name !== 'single-dispatch')) {
      assert.ok(g.pattern.startsWith(reportHead(c.agent)) || g.pattern.startsWith(SUB), `${c.name}: ${g.name} no se ata al subagente`);
    }
  });
}

// Calibración de la etapa Windows (2026-09-30): sonnet escribió "Red is not verified." y el
// grader, que pedía la frase literal, lo reprobó. Regla de diseño: se califica la conducta (no
// afirmar un rojo que no corrió), no la redacción; nada parsea esa frase.
test('evals 4b: red-not-verified acepta la conducta con otras palabras y reprueba al que dice haber corrido', () => {
  for (const name of ['test-writer-requirement', 'test-writer-repro']) {
    const c = CASES.find((x) => x.name === name);
    const g = graders(name).find((x) => x.name === 'red-not-verified');
    const ok = (report) => grade(g, { trace: run(c, { report }), files: c.files });
    for (const said of ['Red not verified.', 'Red is not verified.', "I haven't run it.", 'I did not run the tests.']) {
      assert.ok(ok(`Wrote the test.\n${said}\nDONE`), `${name}: reprueba "${said}"`);
    }
    assert.ok(!ok('Wrote the test. I ran it and it fails as expected.\nDONE'), `${name}: aprueba a quien dice haber corrido el test`);
  }
});

test('evals 4b: los de ausencia de herramientas reprueban cuando el subagente sí la usó', () => {
  const cases = { 'test-writer-requirement': 'no-impl-read', 'implementer-old-test': 'no-test-write' };
  for (const [name, gname] of Object.entries(cases)) {
    const c = CASES.find((x) => x.name === name);
    const g = graders(name).find((x) => x.name === gname);
    const trace = run(c, { report: c.samples.pass, tools: subTools(c.samples.failTools, AGENT_ID) });
    assert.ok(!grade(g, { trace, files: c.files }), `${name}: ${gname} aprueba con la herramienta prohibida`);
  }
});

test('evals 4b: la cabecera Protects cuenta solo en las primeras 20 líneas', () => {
  const c = CASES.find((x) => x.name === 'test-writer-requirement');
  const g = graders(c.name).find((x) => x.name === 'protects-header');
  const body = c.samples.passFiles['tests/slug.test.js'];
  assert.ok(grade(g, { trace: [], files: { 'tests/slug.test.js': body } }));
  const late = `${'\n'.repeat(20)}${body}`;
  assert.ok(!grade(g, { trace: [], files: { 'tests/slug.test.js': late } }), 'aprueba Protects después de la línea 20');
  const other = body.replace('Protects: R1', 'Protects: R9');
  assert.ok(!grade(g, { trace: [], files: { 'tests/slug.test.js': other } }), 'aprueba otro id');
});

// Sonda de la etapa Windows (2026-09-30): el test-writer real importó con path.join y el
// grader, que solo aceptaba require('../src/slug'), lo reprobó con un test correcto.
test('evals 4b: wrote-test acepta require literal o con path.join, y exige el esperado del requisito', () => {
  const g = graders('test-writer-requirement').find((x) => x.name === 'wrote-test');
  const ok = (body) => grade(g, { trace: [], files: { 'tests/slug.test.js': body } });
  assert.ok(ok("const { slugify } = require('../src/slug');\nassert.equal(slugify('  Hola  Mundo '), 'hola-mundo');"));
  assert.ok(ok("const { slugify } = require(path.join(__dirname, '..', 'src', 'slug.js'));\nassert.equal(slugify('  Hola  Mundo '), 'hola-mundo');"));
  assert.ok(!ok("const { slugify } = require('../src/other');\nassert.equal(slugify('  Hola  Mundo '), 'hola-mundo');"), 'aprueba sin importar src/slug');
  assert.ok(!ok("const { slugify } = require('../src/slug');\nassert.equal(slugify('x'), 'x');"), 'aprueba sin el esperado del requisito');
});

test('evals 4b: el test decorativo con severidad CRITICAL o fuera de su archivo no cuenta como hallado', () => {
  const c = CASES.find((x) => x.name === 'review-testability-decorative');
  const g = graders(c.name).find((x) => x.name === 'finds-decorative-test');
  for (const soft of [c.samples.pass.replace('"BLOCKER"', '"CRITICAL"'), c.samples.pass.replace('tests/pages.test.js:10', 'src/pages.js:7')]) {
    assert.notStrictEqual(soft, c.samples.pass);
    assert.ok(!grade(g, { trace: run(c, { report: soft }), files: {} }), `aprueba ${soft.slice(0, 80)}`);
  }
});

test('evals 4b: test-writer sin Bash corre en Windows; todo agente con Bash lleva wsl2 y Bash en allowed_tools', () => {
  for (const c of CASES) {
    const bash = ROLES[c.agent].tools.includes('Bash');
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.strictEqual(c.tags.includes('wsl2'), bash, `${c.name}: etiqueta wsl2`);
    assert.strictEqual(c.tags.includes('windows'), !bash, `${c.name}: etiqueta windows`);
    assert.strictEqual(/^allowed_tools: \[[^\]]*\bBash\b/m.test(prompt), bash, `${c.name}: Bash en allowed_tools`);
  }
  assert.deepStrictEqual(CASES.filter((c) => c.tags.includes('windows')).map((c) => c.agent), ['test-writer', 'test-writer']);
});

test('evals 4b: ningún patrón lleva comillas simples (yaml-lite no desescapa las dobles y el runner sí)', () => {
  for (const c of CASES) for (const g of graders(c.name)) assert.ok(!g.pattern.includes("'"), `${c.name}: ${g.name}`);
});

test('evals 4b: --model cambia el test-writer y el implementer; review-testability queda en opus', () => {
  const op = makeTempDir('pignolo-evals-4b-opus-');
  build({ out: op, model: 'opus' });
  const model = (dir, name) => fs.readFileSync(path.join(dir, name, 'graders', 'model.md'), 'utf8');
  assert.match(model(op, 'test-writer-requirement'), /"model":"opus"/);
  assert.match(model(out, 'test-writer-requirement'), /"model":"sonnet"/);
  assert.match(model(out, 'implementer-old-test'), /"model":"sonnet"/);
  assert.match(model(out, 'review-testability-decorative'), /"model":"opus"/);
  assert.throws(() => build({ out: op, model: 'haiku' }), /--model/);
});

test('evals (hito 3): el brief del fixer no le pasa a node --test un directorio (en Node ≥ 22 falla)', () => {
  const fixer = require('./evals/review-cases').CASES.find((x) => x.name === 'fixer-confirmed-finding');
  assert.doesNotMatch(fixer.brief, /node --test tests\/(?:\s|$)/m);
});
