'use strict';
// Graders de las evals del debugger (hito 8b), sin gastar tokens, con los traces de forma real de
// tests/evals/traces.js: el informe bueno aprueba, el malo reprueba, lo hecho por la sesión
// principal reprueba, y cada grader tiene una muestra que tiene que rechazar (G10 y G11: ni uno que
// acepte lo incorrecto ni uno que rechace lo correcto). Además, los repos de los casos 1 y 2 fallan
// de verdad antes y pasan al aplicar el arreglo conocido: el rojo/verde del caso mismo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
const { ROLES } = require('../plugins/pignolo/lib/roles');
const { SUB, reportHead } = require('./evals/review-cases');
const { CASES, build, ALLOWED, RANGE_LINE, PARSE_LINE } = require('./evals/debugger-cases');
const { AGENT_ID, grade, dispatch, toolUse, agentResult, agentError, agentLaunched, run } = require('./evals/traces');

const out = makeTempDir('pignolo-evals-8b-');
build({ out });
const graders = (name) => fs.readdirSync(path.join(out, name, 'graders'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), ...parseFrontmatter(fs.readFileSync(path.join(out, name, 'graders', f), 'utf8')).data }))
  .filter((g) => g.type === 'regex');
const subTools = (list, parent) => (list || []).map((t) => toolUse(t.name, t.input, parent));
const caseOf = (name) => CASES.find((c) => c.name === name);
const gOf = (c, n) => graders(c.name).find((x) => x.name === n);
// Califica un informe (y herramientas y archivos) con todos los graders regex del caso.
const verdicts = (c, { report, tools, files }) => {
  const trace = run(c, { report, tools: subTools(tools, AGENT_ID) });
  return Object.fromEntries(graders(c.name).map((g) => [g.name, grade(g, { trace, files: files || c.files })]));
};
const failing = (v) => Object.keys(v).filter((k) => !v[k]);

test('evals debugger: son tres casos, con los nombres del plan', () => {
  assert.deepStrictEqual(CASES.map((c) => c.name), ['debugger-off-by-one', 'debugger-wrong-suspect', 'debugger-not-reproducible']);
});

for (const c of CASES) {
  test(`eval ${c.name}: estructura, fixture, opus, Bash y WSL2`, () => {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(out, c.name, f)), f);
    const sh = fs.readFileSync(path.join(out, c.name, 'fixture.sh'), 'utf8');
    for (const content of Object.values(c.files)) assert.ok(sh.includes(content.replace(/\n$/, '')));
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.match(prompt, /subagent_type pignolo:debugger, model opus\)/);
    assert.match(prompt, /run_in_background false/);
    assert.match(prompt, /^allowed_tools: \[[^\]]*\bBash\b/m);
    assert.match(fs.readFileSync(path.join(out, c.name, 'graders', 'model.md'), 'utf8'), /"model":"opus"/);
    assert.ok(ROLES.debugger.tools.includes('Bash'));
    assert.ok(c.tags.includes('wsl2') && c.tags.includes('agents') && c.tags.includes('debugger'));
    assert.deepStrictEqual(ALLOWED.includes('Bash'), true);
  });

  test(`eval ${c.name}: el informe bueno aprueba todo, el malo reprueba alguno y lo hecho por la sesión principal reprueba`, () => {
    const s = c.samples;
    const good = verdicts(c, { report: s.pass, tools: s.passTools });
    assert.deepStrictEqual(failing(good), [], `${c.name}: el informe bueno reprueba ${failing(good)}`);
    assert.ok(failing(verdicts(c, { report: s.fail, tools: s.passTools })).length > 0, 'ningún grader reprueba el informe malo');
    const fromMain = { trace: run(c, { report: 'No report.', tools: subTools(s.passTools, null), main: s.pass }), files: c.files };
    for (const g of graders(c.name).filter((x) => x.target === 'trace' && x.match !== 'not_contains' && !['subagent-returned', 'single-dispatch', 'no-offer', 'no-unmarked-cause'].includes(x.name))) {
      assert.ok(!grade(g, fromMain), `${c.name}: ${g.name} aprueba lo que hizo la sesión principal`);
    }
    const empties = {
      'sin tool_result del Agent': run(c, { report: null, main: s.pass }),
      'con un error del Agent': run(c, { report: null, main: s.pass, result: agentError('Agent type not found') }),
      'con el aviso de background': run(c, { report: null, main: s.pass, result: agentLaunched(c) }),
      'con un informe vacío': run(c, { report: '', main: s.pass }),
    };
    for (const [why, trace] of Object.entries(empties)) {
      for (const n of ['subagent-returned', 'no-offer', 'no-unmarked-cause']) {
        const g = gOf(c, n) || (n === 'subagent-returned' ? graders(c.name).find((x) => x.name === n) : null);
        if (g) assert.ok(!grade(g, { trace, files: c.files }), `${c.name}: ${n} aprueba ${why}`);
      }
    }
    const twice = run(c, { report: s.pass, before: [dispatch(c, 'toolu_FIRST'), agentResult(c, s.fail, 'toolu_FIRST')] });
    assert.ok(!grade(graders(c.name).find((g) => g.name === 'single-dispatch'), { trace: twice, files: c.files }), 'single-dispatch aprueba dos despachos');
    for (const g of graders(c.name).filter((x) => x.target === 'trace' && x.name !== 'single-dispatch')) {
      assert.ok(g.pattern.startsWith(reportHead('debugger')) || g.pattern.startsWith(SUB), `${c.name}: ${g.name} no se ata al subagente`);
    }
  });

  test(`eval ${c.name}: cada grader tiene su muestra de rechazo y la reprueba; ninguno nombra un grader inexistente`, () => {
    const gs = graders(c.name).filter((g) => !['subagent-returned', 'single-dispatch', 'dispatched', 'model'].includes(g.name));
    for (const g of gs) {
      const isFile = typeof g.target === 'object';
      if (isFile) {
        const files = { ...c.files, ...(c.files_rejects || {})[g.name] };
        assert.ok((c.files_rejects || {})[g.name], `${c.name}: ${g.name} no tiene muestra en files_rejects`);
        assert.ok(!grade(g, { trace: run(c, { report: c.samples.pass }), files }), `${c.name}: ${g.name} aprueba su archivo alterado`);
      } else {
        const r = c.rejects[g.name];
        assert.ok(r !== undefined, `${c.name}: ${g.name} no tiene muestra de rechazo`);
        const { report, tools } = typeof r === 'string' ? { report: r, tools: c.samples.passTools } : r;
        assert.ok(!grade(g, { trace: run(c, { report, tools: subTools(tools, AGENT_ID) }), files: c.files }), `${c.name}: ${g.name} aprueba su muestra de rechazo`);
      }
    }
    const names = gs.map((g) => g.name);
    for (const n of [...Object.keys(c.rejects), ...Object.keys(c.files_rejects || {})]) assert.ok(names.includes(n), `muestra de un grader inexistente: ${n}`);
  });
}

// ---- (a) causa con ruta:línea, tolerancia de ±2 ----
test('off-by-one: la causa en la línea plantada aprueba; ±2 aprueba; ±3 o otra línea reprueba; sin salida citada reprueba', () => {
  const c = caseOf('debugger-off-by-one');
  const g = gOf(c, 'cause-at-line');
  const ok = (cite) => grade(g, { trace: run(c, { report: c.samples.pass.replace(`src/range.js:${RANGE_LINE}`, cite) }), files: c.files });
  assert.ok(ok(`src/range.js:${RANGE_LINE}`));
  for (const d of [-2, -1, 1, 2]) assert.ok(ok(`src/range.js:${RANGE_LINE + d}`), `±${d}`);
  for (const d of [-3, 3, 24]) assert.ok(!ok(`src/range.js:${RANGE_LINE + d}`), `${d} no es tolerable (rojo: tolerancia infinita)`);
  assert.ok(!ok('src/range.js:30'));
  assert.ok(!ok(`src/range.js:${RANGE_LINE}0`), 'la línea 60 no es la 6 (límite de dígito)');
  // Otras redacciones correctas (G10).
  assert.ok(ok(`src/range.js:${RANGE_LINE - 1}-${RANGE_LINE + 1}`), 'rango de líneas');
  assert.ok(ok(`\`src/range.js\`:${RANGE_LINE}`), 'ruta entre comillas de código');
  assert.ok(ok(`src/range.js line ${RANGE_LINE}`), 'line N');
  assert.ok(ok(`src/range.js, lines ${RANGE_LINE}`), 'lines N');
  assert.ok(ok(`src/range.js#L${RANGE_LINE}`), '#LN');
  assert.ok(!ok(`tests/range.test.js:${RANGE_LINE}`), 'otro archivo');
  const noOutput = c.samples.pass.replace(/Evidence:[\s\S]*?Hypotheses/, 'Evidence: the test fails.\nHypotheses').replace('[ 1, 2, 3, 4 ]', 'four items');
  assert.ok(!grade(gOf(c, 'evidence-output'), { trace: run(c, { report: noOutput }), files: c.files }), 'sin bloque de salida citado debe reprobar (b)');
  // Una salida de test en otra forma sigue contando como evidencia (G10).
  const tap = c.samples.pass.replace(/Evidence:[\s\S]*?Hypotheses/, 'Evidence:\nnot ok 1 - range is half-open\nHypotheses').replace('[ 1, 2, 3, 4 ]', 'four items');
  assert.ok(grade(gOf(c, 'evidence-output'), { trace: run(c, { report: tap }), files: c.files }), 'salida TAP rechazada');
});

// ---- wrong-suspect: las dos mitades del criterio ----
test('wrong-suspect: confirmar src/cache.js reprueba; parse.js sin descartar la sospecha reprueba; las dos cosas aprueban', () => {
  const c = caseOf('debugger-wrong-suspect');
  const all = (report) => failing(verdicts(c, { report, tools: c.samples.passTools }));
  assert.deepStrictEqual(all(c.samples.pass), []);
  assert.ok(all(c.samples.fail).includes('cause-in-parse'), 'confirmar cache.js debe reprobar la causa');
  const keepsSuspect = c.samples.pass.replace(/Hypotheses ruled out:.*/, 'The cache in src/cache.js stores the NaN.');
  assert.ok(!keepsSuspect.includes('is not the cause'));
  assert.deepStrictEqual(all(keepsSuspect), ['rules-out-suspect'], 'la mitad del criterio debe reprobar solo rules-out-suspect');
  const noParse = c.samples.pass.replace(`src/parse.js:${PARSE_LINE}`, 'the parsing helper');
  assert.deepStrictEqual(all(noParse), ['cause-in-parse']);
  // Otras redacciones de descartar la sospecha (G10).
  for (const text of ['I ruled out src/cache.js: it just replays what parseAmount returned.', 'src/cache.js is correct; the NaN comes from parse.', 'src/cache.js is innocent here.', 'The suspicion about src/cache.js did not hold.']) {
    const v = all(c.samples.pass.replace(/Hypotheses ruled out:.*/, text));
    if (text.startsWith('The suspicion')) assert.deepStrictEqual(v, ['rules-out-suspect'], 'una frase sin señal de descarte no debe pasar');
    else assert.deepStrictEqual(v, [], text);
  }
  // Un descarte lejano (otra oración, más de 150 caracteres) del sospechoso no cuenta.
  const far = c.samples.pass.replace(/Hypotheses ruled out:.*/, `The cache in src/cache.js stores the NaN.${' x'.repeat(100)} The parser is not the cause.`);
  assert.deepStrictEqual(all(far), ['rules-out-suspect']);
});

// ---- not-reproducible: G10 donde parsea una máquina ----
test('not-reproducible: causa afirmada con DONE reprueba; con la marca y BLOCKED aprueba; causa sin marca con NEEDS_CONTEXT reprueba', () => {
  const c = caseOf('debugger-not-reproducible');
  const all = (report) => failing(verdicts(c, { report, tools: c.samples.passTools }));
  assert.deepStrictEqual(all(c.samples.pass), []);
  assert.ok(all(c.samples.fail).length > 0);
  const marked = c.samples.pass.replace(/NEEDS_CONTEXT$/, 'BLOCKED');
  assert.deepStrictEqual(all(marked), [], 'con "hypothesis — not verified" y BLOCKED debe pasar');
  const unmarked = c.samples.pass.replace(/^Root cause:.*$/m, 'Root cause: src/expiry.js:4 caches the clock at module load.\nThe failure does not reproduce here.');
  assert.notStrictEqual(unmarked, c.samples.pass);
  assert.deepStrictEqual(all(unmarked), ['no-unmarked-cause'], 'causa sin marca con NEEDS_CONTEXT debe reprobar');
  assert.ok(all(unmarked.replace(/NEEDS_CONTEXT$/, 'DONE')).includes('final-blocked-or-context'));
  // Otras redacciones correctas de "no hay causa" (G10).
  for (const head of ['Root cause: not determined (hypothesis — not verified).', 'Root cause: unknown; it does not reproduce.', 'Root cause: I could not identify one.', 'No root cause: it does not reproduce.', 'Root cause (hypothesis - not verified): the clock at load.']) {
    const v = all(c.samples.pass.replace(/^Root cause:.*$/m, `${head}
The failure does not reproduce.`));
    assert.deepStrictEqual(v, [], head);
  }
  // Un informe sin la palabra "cause" no afirma ninguna causa.
  assert.deepStrictEqual(all(c.samples.pass.replace(/^Root cause:.*$/m, 'Result: the failure does not reproduce.')), []);
  // La marca lejos de la causa no la salva (la afirmación viene primero).
  const farMark = c.samples.pass.replace(/^Root cause:.*$/m, `Root cause: src/expiry.js:4 caches the clock at load and that is certain, whatever you may think.${' ok'.repeat(10)} It is not verified elsewhere.`);
  assert.ok(all(farMark).includes('no-unmarked-cause'));
  // Decir "no reproduce" no basta si falta la salida de test citada.
  const noOut = c.samples.pass.replace(/Evidence:[\s\S]*?src\/expiry\.js is pure/, 'src/expiry.js is pure');
  assert.deepStrictEqual(all(noOut), ['evidence-output']);
});

// ---- (c) cero archivos modificados ----
test('el debugger escribió: un archivo del repo del caso modificado reprueba, sea cual sea el resto', () => {
  for (const c of CASES) {
    for (const [n, changed] of Object.entries(c.files_rejects)) {
      const v = verdicts(c, { report: c.samples.pass, tools: c.samples.passTools, files: { ...c.files, ...changed } });
      assert.deepStrictEqual(failing(v), [n], `${c.name}: ${n}`);
    }
  }
  // Mutadores en Bash: reprueban; leer, ejecutar el test y redirigir a /dev/null no.
  const c = caseOf('debugger-off-by-one');
  const g = gOf(c, 'no-mutating-bash');
  const bash = (command) => grade(g, { trace: run(c, { report: c.samples.pass, tools: subTools([{ name: 'Bash', input: { command } }], AGENT_ID) }), files: c.files });
  for (const bad of ['sed -i s/a/b/ src/range.js', 'git checkout -- src/range.js', 'rm tests/range.test.js', 'cp src/range.js /tmp/r.js', 'echo x | tee out.txt', 'git stash', 'touch x']) assert.ok(!bash(bad), bad);
  for (const good of ['node --test tests/range.test.js 2>&1', 'node --test tests/range.test.js > /dev/null', 'cat -n src/range.js', 'git status --porcelain', 'git log --oneline', 'node -e "console.log(require(\'./src/range\').range(1, 4))"', 'grep -rn "<=" src']) assert.ok(bash(good), `rechaza lo correcto: ${good}`);
});

// ---- (d) palabra final y sin ofrecer seguir ----
test('una salida sin palabra final o que termina ofreciendo seguir reprueba; las tres palabras aprueban', () => {
  const c = caseOf('debugger-off-by-one');
  const returned = graders(c.name).find((g) => g.name === 'subagent-returned');
  const ok = (report) => grade(returned, { trace: run(c, { report }), files: c.files });
  assert.ok(ok(c.samples.pass));
  for (const word of ['BLOCKED', 'NEEDS_CONTEXT']) assert.ok(ok(c.samples.pass.replace(/DONE$/, word)), word);
  assert.ok(ok(c.samples.pass.replace(/DONE$/, '**DONE**')), 'con énfasis markdown');
  assert.ok(ok(c.samples.pass.replace(/DONE$/, 'Final word: DONE')), 'con el prefijo');
  assert.ok(!ok(c.samples.pass.replace(/\nDONE$/, '')), 'sin palabra final');
  assert.ok(!ok(c.samples.pass.replace(/\nDONE$/, '\nThanks')), 'una palabra suelta que no es de las tres');
  assert.ok(!ok(c.samples.pass.replace(/\nDONE$/, '\nWant me to fix it?')), 'termina ofreciendo seguir');
  assert.ok(!ok(c.samples.pass.replace(/\nDONE$/, '\nDONE\nWant me to fix it?')), 'palabra final seguida de una oferta');
  assert.ok(!ok(c.samples.pass.replace(/\nDONE$/, '\nDONE. Want me to fix it?')));
  const noOffer = gOf(c, 'no-offer');
  assert.ok(!grade(noOffer, { trace: run(c, { report: c.samples.pass.replace(/\nDONE$/, '\nWould you like me to fix it?\nDONE') }), files: c.files }), 'oferta antes de la palabra final');
  assert.ok(grade(noOffer, { trace: run(c, { report: c.samples.pass }), files: c.files }), 'la dirección de arreglo sugerida no es una oferta');
});

// ---- el caso mismo: rojo/verde de los repos ----
function repoOf(c, overrides = {}) {
  const dir = makeTempDir('pignolo-debugger-repo-');
  for (const [p, content] of Object.entries({ ...c.files, ...overrides })) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), content);
  }
  return dir;
}
// Sin NODE_TEST_CONTEXT: heredado, el `node --test` hijo se comporta como un hijo del runner (sale 0 sin correr).
const cleanEnv = (extra = {}) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };
const nodeTest = (dir, file, env) => spawnSync(process.execPath, ['--test', file], { cwd: dir, encoding: 'utf8', env: cleanEnv(env) });

test('los repos de los casos 1 y 2 fallan de verdad antes de la corrida y pasan al aplicar el arreglo conocido', () => {
  for (const [name, testFile] of [['debugger-off-by-one', 'tests/range.test.js'], ['debugger-wrong-suspect', 'tests/report.test.js']]) {
    const c = caseOf(name);
    const red = nodeTest(repoOf(c), testFile);
    assert.strictEqual(red.status, 1, `${name}: el test tiene que fallar antes: ${red.stdout.slice(-300)}`);
    const green = nodeTest(repoOf(c, c.fixed), testFile);
    assert.strictEqual(green.status, 0, `${name}: el test tiene que poder pasar con el arreglo: ${green.stdout.slice(-400)}`);
  }
  // La línea plantada es la del defecto, no otra: en el arreglo esa línea es la que cambió.
  for (const c of CASES.filter((x) => x.planted)) {
    const before = c.files[c.planted.file].split('\n');
    const after = c.fixed[c.planted.file].split('\n');
    const changed = before.map((l, i) => (l !== after[i] ? i + 1 : 0)).filter(Boolean);
    assert.deepStrictEqual(changed, [c.planted.line], `${c.name}: la línea plantada no es la que cambia el arreglo`);
  }
  // En el caso 2 el sospechoso es inocente: la caché con el arreglo de parse.js anda.
  const c2 = caseOf('debugger-wrong-suspect');
  assert.strictEqual(nodeTest(repoOf(c2, c2.fixed), 'tests/report.test.js').status, 0);
});

test('el repo del caso 3 pasa sin cambios (no hay fallo que reproducir), también con la hora corrida', () => {
  const c = caseOf('debugger-not-reproducible');
  const dir = repoOf(c);
  const r = nodeTest(dir, 'tests/expiry.test.js');
  assert.strictEqual(r.status, 0, r.stdout.slice(-300));
  const shifted = nodeTest(dir, 'tests/expiry.test.js', { TZ: 'Pacific/Kiritimati' });
  assert.strictEqual(shifted.status, 0);
});

test('el brief de cada caso trae el síntoma, cómo reproducir, el área sospechada y que es de solo lectura', () => {
  for (const c of CASES) {
    for (const k of ['Symptom:', 'How to reproduce:', 'Suspected area:', 'read-only']) assert.ok(c.brief.includes(k), `${c.name}: ${k}`);
  }
  assert.match(caseOf('debugger-off-by-one').brief, /Suspected area: none\./);
  assert.match(caseOf('debugger-wrong-suspect').brief, /src\/cache\.js/);
  assert.doesNotMatch(caseOf('debugger-wrong-suspect').brief, /parse\.js/);
  assert.doesNotMatch(caseOf('debugger-off-by-one').brief, /<=|src\/range\.js/);
});

test('ningún patrón lleva comillas simples (yaml-lite no desescapa las dobles y el runner sí)', () => {
  for (const c of CASES) for (const g of graders(c.name)) assert.ok(!g.pattern.includes("'"), `${c.name}: ${g.name}`);
});

test('el CLI genera los 3 casos y cada carpeta trae lo que lee el runner', () => {
  const dir = makeTempDir('pignolo-evals-8b-cli-');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'evals', 'debugger-cases.js'), '--out', dir], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const names = JSON.parse(r.stdout).cases;
  assert.strictEqual(names.length, 3);
  for (const n of names) {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(dir, n, f)), `${n}/${f}`);
    const head = fs.readFileSync(path.join(dir, n, 'prompt.md'), 'utf8').split('---')[1];
    assert.match(head, /^runs: 5$/m);
    assert.match(head, /^model: sonnet$/m);
    assert.match(head, /^plugins: \["[^"]*plugins\/pignolo"\]$/m);
    assert.ok(fs.readdirSync(path.join(dir, n, 'graders')).length >= 8, `${n}: graders`);
  }
  assert.notStrictEqual(spawnSync(process.execPath, [path.join(__dirname, 'evals', 'debugger-cases.js')], { encoding: 'utf8' }).status, 0);
});
