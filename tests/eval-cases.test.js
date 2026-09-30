'use strict';
// Graders de las evals del hito 3b, sin gastar tokens. Cada grader corre contra traces con la
// forma REAL de Claude Code 2.1.285 (tests/fixtures/evals/probe2-review-reliability-defect.jsonl,
// la sonda 2 recortada y sin rutas personales): el informe final del subagente NO sale como
// evento `assistant` con parent, sino como el `tool_result` que la sesión principal recibe
// por su `tool_use` de Agent. Se prueba que (a) el informe bueno del subagente aprueba y el malo
// reprueba; (b) el mismo informe bueno escrito por la sesión principal reprueba; (c) sin
// tool_result del Agent, los graders de ausencia reprueban; (d) la sonda 2 real aprueba.
// El texto que ve un grader `regex` con `target: trace` se arma como en el runner 2.1.285:
// cada evento re-serializado con JSON.stringify, unidos por "\n", y UNA sola RegExp sobre todo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
const { ROLES } = require('../plugins/pignolo/lib/roles');
const evals = require('./evals/review-cases');

const { CASES, build, SUB } = evals;
const REAL = fs.readFileSync(path.join(__dirname, 'fixtures', 'evals', 'probe2-review-reliability-defect.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
// Graders de ausencia: aprueban solo si el subagente devolvió un informe SIN lo prohibido.
const ABSENT = ['no-blocking-finding', 'keeps-true-claim'];

function grade(g, { trace, files }) {
  const text = typeof g.target === 'object' ? files[g.target.path] : trace.map((e) => JSON.stringify(e)).join('\n');
  if (text === undefined) return false;
  const hit = new RegExp(g.pattern, g.flags || '').test(text);
  return g.match === 'not_contains' ? !hit : hit;
}

// ---- traces con la forma real ----
const clone = (x) => JSON.parse(JSON.stringify(x));
const find = (pred) => clone(REAL.find(pred));
const AGENT_ID = 'toolu_016xwg6uHqSSNnzN3tFRyruo';
const isResult = (e) => e.type === 'user' && e.parent_tool_use_id === null
  && Array.isArray(e.message.content) && e.message.content.some((b) => b.type === 'tool_result' && b.tool_use_id === AGENT_ID);
const REAL_RESULT_TEXT = REAL.find(isResult).message.content[0].content[0].text;
const FRAME_HEAD = REAL_RESULT_TEXT.slice(0, REAL_RESULT_TEXT.indexOf('The report follows:\n') + 'The report follows:\n'.length);
const FRAME_TAIL = REAL_RESULT_TEXT.slice(REAL_RESULT_TEXT.indexOf('\nagentId: '));

function dispatch(c) {
  const e = find((x) => x.type === 'assistant' && x.parent_tool_use_id === null && x.message.content[0].type === 'tool_use');
  const input = e.message.content[0].input;
  input.subagent_type = `pignolo:${c.agent}`;
  input.prompt = c.brief;
  if (!c.reviewer) delete input.model;
  return e;
}
function subEvents(c) {
  // Brief del subagente y sus herramientas reales (Read, Grep), con el tipo del caso.
  const out = REAL.filter((x) => x.parent_tool_use_id === AGENT_ID).map(clone);
  for (const e of out) e.subagent_type = `pignolo:${c.agent}`;
  out[0].message.content[0].text = c.brief;
  return out;
}
function toolUse(name, input, parent) {
  const e = find((x) => x.type === 'assistant' && x.parent_tool_use_id === AGENT_ID);
  e.message.content = [{ type: 'tool_use', id: `toolu_${name}`, name, input, caller: { type: 'direct' } }];
  e.parent_tool_use_id = parent;
  return e;
}
function agentResult(c, report) {
  // El tool_result de la sesión principal, con el marco y la sangría que pone el harness.
  const e = find(isResult);
  const framed = `${FRAME_HEAD}${report.split('\n').map((l) => `  ${l}`).join('\n')}${FRAME_TAIL}`;
  e.message.content[0].content[0].text = framed;
  e.tool_use_result.prompt = c.brief;
  e.tool_use_result.agentType = `pignolo:${c.agent}`;
  e.tool_use_result.content[0].text = report;
  return e;
}
function notification(report) {
  const e = find((x) => x.type === 'system' && x.subtype === 'task_notification');
  e.summary = report;
  return e;
}
function mainSays(text) {
  const e = find((x) => x.type === 'assistant' && x.parent_tool_use_id === null && x.message.content[0].type === 'text');
  e.message.content[0].text = text;
  return e;
}
const RESULT_EVENT = find((x) => x.type === 'result');

// Una corrida: la sesión principal despacha, el subagente trabaja (tools, con su parent) y
// devuelve `report` (null: no hay tool_result del Agent); la principal contesta `main`.
function run(c, { report, tools = [], main = 'RELAYED' }) {
  return [
    dispatch(c), ...subEvents(c), ...tools,
    ...(report === null ? [] : [notification(report), agentResult(c, report)]),
    mainSays(main), RESULT_EVENT,
  ];
}

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
    for (const g of onTrace.filter((x) => !ABSENT.includes(x.name) && x.name !== 'subagent-returned')) {
      assert.ok(!grade(g, fromMain), `${c.name}: ${g.name} aprueba el informe bueno escrito por la sesión principal`);
    }

    // (c) Sin tool_result del Agent (aunque la sesión principal escriba el informe bueno), los
    // graders de ausencia y el de "hubo informe" reprueban: no aprueban en vacío.
    assert.ok(gs.some((g) => g.name === 'subagent-returned'), `${c.name}: falta el grader subagent-returned`);
    const silent = { trace: run(c, { report: null, tools: subTools, main: c.samples.pass }), files: fixed };
    for (const g of onTrace.filter((x) => ABSENT.includes(x.name) || x.name === 'subagent-returned')) {
      assert.ok(!grade(g, silent), `${c.name}: ${g.name} aprueba sin tool_result del Agent`);
    }

    // Un informe de OTRO subagente (otro subagent_type) no cuenta.
    const other = { ...c, agent: c.agent === 'refuter' ? 'fixer' : 'refuter' };
    const wrongAgent = { trace: run(c, { report: null }).slice(0, -2).concat([agentResult(other, c.samples.pass), mainSays('RELAYED')]), files: fixed };
    wrongAgent.trace[0].message.content[0].input.subagent_type = `pignolo:${other.agent}`;
    for (const g of onTrace.filter((x) => !/^subagent-(edited|ran)/.test(x.name))) {
      assert.ok(!grade(g, wrongAgent), `${c.name}: ${g.name} aprueba el informe de pignolo:${other.agent}`);
    }
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

test('eval: todo grader sobre el trace exige el tool_result del Agent del caso o un evento del subagente (SUB)', () => {
  assert.strictEqual(typeof evals.reportHead, 'function');
  for (const c of CASES) {
    for (const g of graders(c.name).filter((x) => x.target === 'trace')) {
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
