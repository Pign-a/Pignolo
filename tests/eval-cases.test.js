'use strict';
// Graders de las evals del hito 3b, sin gastar tokens: cada grader se corre contra un trace
// sintético (eventos stream-json) y debe aprobar la salida buena del SUBAGENTE, reprobar la
// mala y reprobar la misma salida buena si viene de la sesión principal (defecto de las
// evals del hito 2: el grader miraba la sesión principal).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
const { ROLES } = require('../plugins/pignolo/lib/roles');
const { CASES, build, SUB } = require('./evals/review-cases');

const event = (text, parent) => JSON.stringify({
  type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, parent_tool_use_id: parent, session_id: 's',
});
const toolEvent = (name, input, parent) => JSON.stringify({
  type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_x', name, input }] }, parent_tool_use_id: parent, session_id: 's',
});
const brief = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: 'toolu_p', session_id: 's' });

function grade(g, { trace, files }) {
  const text = typeof g.target === 'object' ? files[g.target.path] : trace;
  const hit = new RegExp(g.pattern, g.flags || '').test(text);
  return g.match === 'not_contains' ? !hit : hit;
}

const out = makeTempDir('pignolo-evals-');
build({ out, reviewerModel: 'opus' });
const graders = (name) => fs.readdirSync(path.join(out, name, 'graders'))
  .map((f) => parseFrontmatter(fs.readFileSync(path.join(out, name, 'graders', f), 'utf8')).data)
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

  test(`eval ${c.name}: los graders ven al subagente y no a la sesión principal`, () => {
    const gs = graders(c.name);
    assert.ok(gs.length > 0);
    // Traces: el brief del subagente siempre está (parent no nulo, tipo user) y no debe bastar.
    const tools = c.agent === 'fixer'
      ? [toolEvent('Edit', { file_path: '/w/src/pages.js' }, 'toolu_p'), toolEvent('Bash', { command: 'node --test tests/' }, 'toolu_p')]
      : [];
    const fixed = { 'src/pages.js': c.files['src/pages.js'] && c.files['src/pages.js'].replace('start + size - 1);', 'start + size);'), 'tests/pages.test.js': c.files['tests/pages.test.js'] };
    const good = { trace: [brief(c.brief), ...tools, event(c.samples.pass, 'toolu_p')].join('\n'), files: fixed };
    const bad = { trace: [brief(c.brief), event(c.samples.fail, 'toolu_p')].join('\n'), files: c.files };
    // La misma salida buena (herramientas incluidas) y los mismos archivos corregidos, pero
    // desde la sesión principal: solo cambia parent_tool_use_id.
    const mainTools = tools.map((t) => t.replace('"parent_tool_use_id":"toolu_p"', '"parent_tool_use_id":null'));
    const fromMain = { trace: [brief(c.brief), ...mainTools, event(c.samples.pass, null)].join('\n'), files: fixed };
    for (const g of gs) assert.ok(grade(g, good), `${c.name}: el grader ${g.pattern} reprueba la salida buena`);
    assert.ok(gs.some((g) => !grade(g, bad)), `${c.name}: ningún grader reprueba la salida mala`);
    for (const g of gs.filter((x) => x.target === 'trace')) {
      assert.ok(g.pattern.startsWith(SUB), `${c.name}: el grader ${g.pattern} sobre el trace no exige un evento del subagente`);
      if (g.match !== 'not_contains') assert.ok(!grade(g, fromMain), `${c.name}: el grader ${g.pattern} aprueba la salida buena desde la sesión principal`);
    }
  });
}

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

test('evals: el grader de ubicación acepta un rango archivo:A-B que contiene la línea plantada y rechaza el que no', () => {
  const defects = CASES.filter((c) => c.name.endsWith('-defect') && c.agent !== 'refuter');
  assert.strictEqual(defects.length, 6);
  for (const c of defects) {
    const loc = /"location": "([^"]+):(\d+)"/.exec(c.samples.pass);
    const [, file, line] = [null, loc[1], Number(loc[2])];
    const withLocation = (location) => {
      const text = c.samples.pass.replace(loc[0], `"location": "${location}"`);
      return { trace: [brief(c.brief), event(text, 'toolu_p')].join('\n'), files: c.files };
    };
    const gs = [parseFrontmatter(fs.readFileSync(path.join(out, c.name, 'graders', 'finds-planted-defect.md'), 'utf8')).data];
    assert.strictEqual(gs.length, 1, c.name);
    assert.ok(grade(gs[0], withLocation(`${file}:${line}`)), `${c.name}: línea exacta`);
    assert.ok(grade(gs[0], withLocation(`${file}:${line - 1}-${line + 2}`)), `${c.name}: rango que la contiene`);
    assert.ok(grade(gs[0], withLocation(`${file}:1-${line}`)), `${c.name}: rango que termina en ella`);
    assert.ok(!grade(gs[0], withLocation(`${file}:${line + 1}-${line + 4}`)), `${c.name}: rango que no la contiene`);
    assert.ok(!grade(gs[0], withLocation(`${file}:1-${line - 1}`)), `${c.name}: rango que termina antes`);
    assert.ok(!grade(gs[0], withLocation(`src/other.js:${line - 1}-${line + 2}`)), `${c.name}: otro archivo`);
  }
});
