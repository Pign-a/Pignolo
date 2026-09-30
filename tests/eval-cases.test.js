'use strict';
// Graders de las evals del hito 3b, sin gastar tokens. Cada grader corre contra traces con la
// forma REAL de Claude Code 2.1.285 (tests/fixtures/evals/probe2-review-reliability-defect.jsonl,
// la sonda 2 recortada y sin rutas personales): el informe final del subagente NO sale como
// evento `assistant` con parent, sino como el `tool_result` que la sesión principal recibe
// por su `tool_use` de Agent. Se prueba que (a) el informe bueno del subagente aprueba y el malo
// reprueba; (b) el mismo informe bueno escrito por la sesión principal reprueba; (c) sin
// tool_result del Agent, los graders de ausencia reprueban; (d) la sonda 2 real aprueba.
// Los traces y `grade` (el texto como lo arma el runner 2.1.285) viven en tests/evals/traces.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
const { ROLES } = require('../plugins/pignolo/lib/roles');
const evals = require('./evals/review-cases');

const { CASES, build, SUB } = evals;
const { REAL, AGENT_ID, grade, dispatch, toolUse, agentResult, mainSays, agentError, agentLaunched, run } = require('./evals/traces');
// Graders de ausencia: aprueban solo si el subagente devolvió un informe SIN lo prohibido.
const ABSENT = ['no-blocking-finding', 'keeps-true-claim'];

const out = makeTempDir('pignolo-evals-');
build({ out, reviewerModel: 'opus' });
const graders = (name) => fs.readdirSync(path.join(out, name, 'graders'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), ...parseFrontmatter(fs.readFileSync(path.join(out, name, 'graders', f), 'utf8')).data }))
  .filter((g) => g.type === 'regex');

for (const c of CASES) {
  test(`eval ${c.name}: estructura y fixture`, () => {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(out, c.name, f)), f);
    const sh = fs.readFileSync(path.join(out, c.name, 'fixture.sh'), 'utf8');
    for (const content of Object.values(c.files)) assert.ok(sh.includes(content.replace(/\n$/, '')));
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.match(prompt, new RegExp(`subagent_type pignolo:${c.agent}`));
    assert.match(prompt, /run_in_background false/);
    assert.ok(fs.existsSync(path.join(out, c.name, 'graders', 'dispatched.md')));
  });

  test(`eval ${c.name}: los graders leen solo lo que devolvió el subagente (forma real 2.1.285)`, () => {
    const gs = graders(c.name);
    const onTrace = gs.filter((g) => g.target === 'trace');
    assert.ok(onTrace.length > 0);
    const subTools = c.agent === 'fixer'
      ? [toolUse('Edit', { file_path: '/w/src/pages.js', old_string: 'start + size - 1', new_string: 'start + size' }, AGENT_ID),
        toolUse('Bash', { command: 'node --test tests/' }, AGENT_ID)]
      : [];
    const mainTools = subTools.map((e) => ({ ...e, parent_tool_use_id: null }));
    const fixed = { 'src/pages.js': c.files['src/pages.js'] && c.files['src/pages.js'].replace('start + size - 1);', 'start + size);'), 'tests/pages.test.js': c.files['tests/pages.test.js'] };

    // (a) El informe bueno del subagente aprueba todo; el malo reprueba alguno.
    const good = { trace: run(c, { report: c.samples.pass, tools: subTools }), files: fixed };
    for (const g of gs) assert.ok(grade(g, good), `${c.name}: ${g.name} reprueba el informe bueno del subagente`);
    const bad = { trace: run(c, { report: c.samples.fail }), files: c.files };
    assert.ok(gs.some((g) => !grade(g, bad)), `${c.name}: ningún grader reprueba el informe malo`);

    // (b) El mismo informe bueno (y las mismas herramientas) escrito por la sesión principal en
    // su propio assistant, con el subagente devolviendo el informe malo: todo grader que exige
    // algo del subagente reprueba.
    const fromMain = { trace: run(c, { report: c.samples.fail, tools: mainTools, main: c.samples.pass }), files: fixed };
    for (const g of onTrace.filter((x) => !ABSENT.includes(x.name) && !['subagent-returned', 'single-dispatch'].includes(x.name))) {
      assert.ok(!grade(g, fromMain), `${c.name}: ${g.name} aprueba el informe bueno escrito por la sesión principal`);
    }

    // (c) Sin informe real del subagente (aunque la sesión principal escriba el informe bueno),
    // los graders de ausencia y el de "hubo informe" reprueban: no aprueban en vacío. Sin
    // tool_result del Agent, con un error de la herramienta, con el aviso de background o con un
    // informe vacío.
    assert.ok(gs.some((g) => g.name === 'subagent-returned'), `${c.name}: falta el grader subagent-returned`);
    const empties = {
      'sin tool_result del Agent': run(c, { report: null, tools: subTools, main: c.samples.pass }),
      'con un error del Agent': run(c, { report: null, tools: subTools, main: c.samples.pass, result: agentError('Agent type not found') }),
      'con el aviso de background': run(c, { report: null, main: c.samples.pass, result: agentLaunched(c) }),
      'con un informe vacío': run(c, { report: '', tools: subTools, main: c.samples.pass }),
    };
    for (const [why, trace] of Object.entries(empties)) {
      for (const g of onTrace.filter((x) => ABSENT.includes(x.name) || x.name === 'subagent-returned')) {
        assert.ok(!grade(g, { trace, files: fixed }), `${c.name}: ${g.name} aprueba ${why}`);
      }
    }

    // Un informe de OTRO subagente (otro subagent_type) no cuenta.
    const other = { ...c, agent: c.agent === 'refuter' ? 'fixer' : 'refuter' };
    const wrongAgent = { trace: run(c, { report: null }).slice(0, -2).concat([agentResult(other, c.samples.pass), mainSays('RELAYED')]), files: fixed };
    wrongAgent.trace[0].message.content[0].input.subagent_type = `pignolo:${other.agent}`;
    for (const g of onTrace.filter((x) => !/^subagent-(edited|ran)/.test(x.name) && x.name !== 'single-dispatch')) {
      assert.ok(!grade(g, wrongAgent), `${c.name}: ${g.name} aprueba el informe de pignolo:${other.agent}`);
    }

    // Dos despachos, primero OTRO agente y después el del caso: cada grader elige el tool_result
    // del agente del caso (el del otro no suma ni resta).
    const otherFirst = (mine, theirs) => {
      const d = dispatch(other, 'toolu_OTHER');
      return run(c, { report: mine, tools: subTools, before: [d, agentResult(other, theirs, 'toolu_OTHER')] });
    };
    const text = onTrace.filter((x) => !/^subagent-(edited|ran)/.test(x.name) && x.name !== 'single-dispatch');
    for (const g of text) assert.ok(grade(g, { trace: otherFirst(c.samples.pass, c.samples.fail), files: fixed }), `${c.name}: ${g.name} no elige el informe del agente del caso (despachado segundo)`);
    for (const g of text.filter((x) => !grade(x, bad))) {
      assert.ok(!grade(g, { trace: otherFirst(c.samples.fail, c.samples.pass), files: fixed }), `${c.name}: ${g.name} toma el informe bueno del otro agente`);
    }

    // Dos despachos del mismo agente: single-dispatch reprueba (si no, aprobaría el mejor).
    assert.ok(gs.some((g) => g.name === 'single-dispatch'), `${c.name}: falta el grader single-dispatch`);
    const twice = run(c, { report: c.samples.pass, tools: subTools, before: [dispatch(c, 'toolu_FIRST'), agentResult(c, c.samples.fail, 'toolu_FIRST')] });
    assert.ok(!grade(gs.find((g) => g.name === 'single-dispatch'), { trace: twice, files: fixed }), `${c.name}: single-dispatch aprueba dos despachos`);
  });
}

test('eval: el trace real de la sonda 2 (review-reliability-defect) aprueba finds-planted-defect y subagent-returned', () => {
  const gs = graders('review-reliability-defect');
  const real = { trace: REAL, files: {} };
  for (const n of ['finds-planted-defect', 'subagent-returned']) {
    const g = gs.find((x) => x.name === n);
    assert.ok(g, `falta el grader ${n}`);
    assert.ok(grade(g, real), `${n} reprueba la sonda 2 real (el revisor halló src/pages.js:7 BLOCKER)`);
  }
  // El mismo trace real, leído como caso limpio de la misma lente: el BLOCKER lo reprueba.
  const clean = graders('review-reliability-clean');
  for (const n of ['verdict-approve', 'no-blocking-finding']) {
    assert.ok(!grade(clean.find((x) => x.name === n), real), `${n} aprueba un informe con BLOCKER y REQUEST_CHANGES`);
  }
});

test('eval: la palabra final es la última línea del informe (tolera énfasis, backticks y "Final word:")', () => {
  const clean = CASES.find((x) => x.name === 'review-reliability-clean');
  const approve = graders(clean.name).find((x) => x.name === 'verdict-approve');
  const body = clean.samples.pass.replace(/APPROVE$/, '');
  const verdictOf = (tail) => grade(approve, { trace: run(clean, { report: `${body}${tail}` }), files: {} });
  for (const ok of ['APPROVE', '**APPROVE**', '`APPROVE`', '*APPROVE*', 'Final word: APPROVE', 'Final word: `APPROVE`', '**Final word: APPROVE**', 'APPROVE\n\n']) {
    assert.ok(verdictOf(ok), `verdict-approve reprueba ${JSON.stringify(ok)}`);
  }
  for (const no of ['APPROVE\n\nREQUEST_CHANGES', 'APPROVE\nmore notes', 'APPROVED', 'I would APPROVE', 'NOT APPROVE', '**APPROVE** with notes']) {
    assert.ok(!verdictOf(no), `verdict-approve aprueba ${JSON.stringify(no)}`);
  }
  const fixer = CASES.find((x) => x.name === 'fixer-confirmed-finding');
  const done = graders(fixer.name).find((x) => x.name === 'done');
  const doneOf = (report) => grade(done, { trace: run(fixer, { report }), files: {} });
  assert.ok(doneOf('RED: x\nGREEN: y\n`DONE`'));
  assert.ok(doneOf('RED: x\nGREEN: y\nFinal word: **DONE**'));
  assert.ok(!doneOf('RED: x\nDONE\nmore notes'));
  assert.ok(!doneOf('DONE\n\nBLOCKED'));
});

test('eval: la ubicación plantada con severidad SUGGESTION no aprueba finds-planted-defect', () => {
  for (const name of ['review-reliability-defect', 'judge-a-defect']) {
    const c = CASES.find((x) => x.name === name);
    const g = graders(name).find((x) => x.name === 'finds-planted-defect');
    const soft = c.samples.pass.replace(/"severity": "(BLOCKER|CRITICAL)"/, '"severity": "SUGGESTION"');
    assert.notStrictEqual(soft, c.samples.pass);
    assert.ok(!grade(g, { trace: run(c, { report: soft }), files: {} }), `${name}: finds-planted-defect aprueba con SUGGESTION`);
  }
});

test('eval: todo grader sobre el trace exige el tool_result del Agent del caso o un evento del subagente (SUB)', () => {
  assert.strictEqual(typeof evals.reportHead, 'function');
  for (const c of CASES) {
    for (const g of graders(c.name).filter((x) => x.target === 'trace' && x.name !== 'single-dispatch')) {
      assert.ok(g.pattern.startsWith(evals.reportHead(c.agent)) || g.pattern.startsWith(SUB), `${c.name}: ${g.name} no se ata al subagente`);
    }
  }
});

test('evals: todo agente con Bash (lib/roles.js) lleva la etiqueta wsl2 y Bash en allowed_tools (§15)', () => {
  for (const c of CASES) {
    const bash = ROLES[c.agent].tools.includes('Bash');
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.strictEqual(c.tags.includes('wsl2'), bash, `${c.name}: etiqueta wsl2`);
    assert.strictEqual(/^allowed_tools: \[[^\]]*\bBash\b/m.test(prompt), bash, `${c.name}: Bash en allowed_tools`);
  }
});

test('evals: 14 casos (8 lentes, 4 jueces, refuter, fixer) y la rama sonnet solo cambia el modelo de los revisores', () => {
  assert.strictEqual(CASES.length, 14);
  const son = makeTempDir('pignolo-evals-sonnet-');
  build({ out: son, reviewerModel: 'sonnet' });
  const p = fs.readFileSync(path.join(son, 'review-risk-defect', 'prompt.md'), 'utf8');
  assert.match(p, /model sonnet/);
  assert.match(fs.readFileSync(path.join(son, 'review-risk-defect', 'graders', 'model.md'), 'utf8'), /"model":"sonnet"/);
  assert.doesNotMatch(fs.readFileSync(path.join(son, 'fixer-confirmed-finding', 'prompt.md'), 'utf8'), /model (opus|sonnet)\)/);
});

test('evals: el diff limpio de la lente risk es neutro (renombra la regex; no mete la entrada en un mensaje)', () => {
  const c = CASES.find((x) => x.name === 'review-risk-clean');
  const src = c.files['src/report.js'];
  assert.doesNotMatch(src, /\$\{name\}/);
  assert.match(src, /^const SAFE_NAME = \/\^\[a-z0-9-\]\+\\.txt\$\/;$/m);
  assert.match(src, /if \(!SAFE_NAME\.test\(name\)\) throw new Error\('nombre inválido'\);/);
});
