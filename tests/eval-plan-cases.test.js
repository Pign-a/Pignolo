'use strict';
// Graders de las evals del hito 5b (spec-reviewer, plan-auditor, validator), sin gastar tokens,
// con los traces de forma real de tests/evals/traces.js: el informe bueno aprueba, el malo
// reprueba, lo hecho por la sesión principal reprueba y sin informe "hubo informe" reprueba.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');
const { ROLES } = require('../plugins/pignolo/lib/roles');
const { parseScopeCard, validateScopeCard } = require('../plugins/pignolo/lib/scope-card');
const { parseReview, parseVerification } = require('../plugins/pignolo/lib/plan-audit');
const { SUB, reportHead } = require('./evals/review-cases');
const { CASES, build, REQUEST, VERIFY_CLAIMS } = require('./evals/plan-cases');
const { AGENT_ID, grade, dispatch, toolUse, agentResult, agentError, agentLaunched, run } = require('./evals/traces');

const out = makeTempDir('pignolo-evals-5b-');
build({ out });
const graders = (name) => fs.readdirSync(path.join(out, name, 'graders'))
  .map((f) => ({ name: f.replace(/\.md$/, ''), ...parseFrontmatter(fs.readFileSync(path.join(out, name, 'graders', f), 'utf8')).data }))
  .filter((g) => g.type === 'regex');
const subTools = (list, parent) => (list || []).map((t) => toolUse(t.name, t.input, parent));
const caseOf = (name) => CASES.find((c) => c.name === name);

test('evals 5b: son siete casos, con los nombres del plan', () => {
  assert.deepStrictEqual(CASES.map((c) => c.name), [
    'spec-reviewer-added-scope', 'spec-reviewer-clean', 'plan-auditor-review-defect', 'plan-auditor-review-clean',
    'plan-auditor-verify-claim', 'validator-drift', 'validator-no-holdout',
  ]);
});

for (const c of CASES) {
  test(`eval ${c.name}: estructura, fixture, opus y herramientas permitidas`, () => {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(out, c.name, f)), f);
    const sh = fs.readFileSync(path.join(out, c.name, 'fixture.sh'), 'utf8');
    for (const content of Object.values(c.files)) assert.ok(sh.includes(content.replace(/\n$/, '')));
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.match(prompt, new RegExp(`subagent_type pignolo:${c.agent}, model opus\\)`));
    assert.match(prompt, /run_in_background false/);
    assert.match(fs.readFileSync(path.join(out, c.name, 'graders', 'model.md'), 'utf8'), /"model":"opus"/);
    assert.match(fs.readFileSync(path.join(out, c.name, 'case.yaml'), 'utf8'), /schema_version: "1\.1"/);
  });

  test(`eval ${c.name}: los graders leen solo lo que hizo el subagente`, () => {
    const gs = graders(c.name);
    const s = c.samples;
    // (a) El informe bueno aprueba todo; el malo reprueba alguno.
    const good = { trace: run(c, { report: s.pass, tools: subTools(s.passTools, AGENT_ID) }), files: c.files };
    for (const g of gs) assert.ok(grade(g, good), `${c.name}: ${g.name} reprueba el informe bueno`);
    const bad = { trace: run(c, { report: s.fail, tools: subTools(s.failTools, AGENT_ID) }), files: c.files };
    assert.ok(gs.some((g) => !grade(g, bad)), `${c.name}: ningún grader reprueba el informe malo`);

    // (b) Lo bueno hecho por la sesión principal, con el subagente devolviendo un informe neutro.
    const fromMain = { trace: run(c, { report: 'No report.', tools: subTools(s.passTools, null), main: s.pass }), files: c.files };
    for (const g of gs.filter((x) => x.target === 'trace' && x.match !== 'not_contains' && !['subagent-returned', 'single-dispatch', 'no-blocking-finding'].includes(x.name))) {
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
      for (const g of gs.filter((x) => ['subagent-returned', 'no-blocking-finding', 'one-json-block'].includes(x.name))) {
        assert.ok(!grade(g, { trace, files: c.files }), `${c.name}: ${g.name} aprueba ${why}`);
      }
    }

    // (d) Dos despachos del mismo agente: single-dispatch reprueba.
    const twice = run(c, { report: s.pass, before: [dispatch(c, 'toolu_FIRST'), agentResult(c, s.fail, 'toolu_FIRST')] });
    assert.ok(!grade(gs.find((g) => g.name === 'single-dispatch'), { trace: twice, files: c.files }), `${c.name}: single-dispatch aprueba dos despachos`);

    // Todo grader del trace se ata al subagente: al tool_result de su Agent o a sus eventos (SUB).
    for (const g of gs.filter((x) => x.target === 'trace' && x.name !== 'single-dispatch')) {
      assert.ok(g.pattern.startsWith(reportHead(c.agent)) || g.pattern.startsWith(SUB), `${c.name}: ${g.name} no se ata al subagente`);
    }
  });
}

test('evals 5b: la tarjeta del informe bueno de spec-reviewer pasa validateScopeCard contra el pedido; sin cita literal, no', () => {
  const c = caseOf('spec-reviewer-added-scope');
  const text = c.samples.pass.slice(c.samples.pass.indexOf('## Goal'), c.samples.pass.lastIndexOf('\n'));
  const errs = validateScopeCard(text, { request: REQUEST });
  assert.deepStrictEqual(errs, [], errs.join('; '));
  assert.deepStrictEqual(parseScopeCard(text).added.map((a) => a.id), ['A1']);
  const broken = validateScopeCard(text.replace('"filter them by status"', '"filtering by state"'), { request: REQUEST });
  assert.ok(broken.length > 0);
});

test('evals 5b: added-scope exige A1 con CSV y la cita entre comillas; la tarjeta con none reprueba', () => {
  const c = caseOf('spec-reviewer-added-scope');
  const g = (n) => graders(c.name).find((x) => x.name === n);
  const ok = (name, report) => grade(g(name), { trace: run(c, { report }), files: c.files });
  assert.ok(ok('lists-a1', c.samples.pass));
  assert.ok(!ok('lists-a1', c.samples.fail));
  assert.ok(!ok('lists-a1', c.samples.pass.replace('A1: CSV export', 'A1: something else')), 'A1 sin CSV');
  assert.ok(ok('examples-quote-the-request', c.samples.pass));
  const noQuotes = c.samples.pass.replace(/"/g, '');
  assert.ok(!ok('examples-quote-the-request', noQuotes), 'ejemplos sin cita');
  assert.ok(!ok('eight-headings', c.samples.pass.replace('## Out of scope', '## Out-of-scope')), 'encabezado renombrado');
  assert.ok(!ok('not-approve', c.samples.pass.replace(/REQUEST_CHANGES$/, 'APPROVE')));
});

test('evals 5b: el informe bueno de plan-auditor parsea con parseReview y parseVerification', () => {
  const r = parseReview(caseOf('plan-auditor-review-defect').samples.pass);
  assert.strictEqual(r.error, undefined, r.error);
  assert.strictEqual(r.findings.length, 2);
  assert.ok(r.claims.some((c) => /numstat/.test(c.claim)));
  assert.strictEqual(parseReview(caseOf('plan-auditor-review-clean').samples.pass).error, undefined);
  const v = parseVerification(caseOf('plan-auditor-verify-claim').samples.pass, VERIFY_CLAIMS);
  assert.strictEqual(v.error, undefined, v.error);
  assert.deepStrictEqual(v.missing, []);
  assert.deepStrictEqual(v.entries.map((e) => `${e.id}:${e.verdict}`), ['c1:false', 'c2:holds']);
});

test('evals 5b: review-defect reprueba con Bash del subagente, con dos bloques json y con un defecto sin su tarea', () => {
  const c = caseOf('plan-auditor-review-defect');
  const gs = graders(c.name);
  const g = (n) => gs.find((x) => x.name === n);
  const withBash = run(c, { report: c.samples.pass, tools: subTools([{ name: 'Bash', input: { command: 'ls' } }], AGENT_ID) });
  assert.ok(!grade(g('no-bash'), { trace: withBash, files: c.files }), 'aprueba con Bash');
  const two = `${c.samples.pass}\n\`\`\`json\n{}\n\`\`\`\nREQUEST_CHANGES`;
  assert.ok(!grade(g('one-json-block'), { trace: run(c, { report: two }), files: c.files }), 'aprueba dos bloques');
  const noTask2 = c.samples.pass.replace('"plan": "Task 2"', '"plan": "Task 9"');
  assert.notStrictEqual(noTask2, c.samples.pass);
  assert.ok(!grade(g('finds-test-defect'), { trace: run(c, { report: noTask2 }), files: c.files }), 'aprueba sin Task 2');
  const noClaim = c.samples.pass.replace(/numstat/g, 'x');
  assert.ok(!grade(g('claim-numstat'), { trace: run(c, { report: noClaim }), files: c.files }), 'aprueba sin la afirmación');
});

test('evals 5b: verify-claim exige un Bash y un Write por afirmación, no uno solo', () => {
  const c = caseOf('plan-auditor-verify-claim');
  const gs = graders(c.name);
  const one = run(c, { report: c.samples.pass, tools: subTools(c.samples.failTools, AGENT_ID) });
  for (const n of ['experiment-per-claim', 'script-per-claim']) {
    assert.ok(!grade(gs.find((x) => x.name === n), { trace: one, files: c.files }), `${n} aprueba con un solo experimento`);
  }
  const swapped = c.samples.pass.replace('"verdict": "false"', '"verdict": "X"').replace('"verdict": "holds"', '"verdict": "false"').replace('"verdict": "X"', '"verdict": "holds"');
  assert.ok(!grade(gs.find((x) => x.name === 'numstat-false'), { trace: run(c, { report: swapped }), files: c.files }), 'aprueba el veredicto cruzado');
});

test('evals 5b: validator-no-holdout reprueba con APPROVE y sin nombrar el holdout; drift exige nombrar el archivo y el informe falso', () => {
  const nh = caseOf('validator-no-holdout');
  const g = (c, n) => graders(c.name).find((x) => x.name === n);
  assert.ok(!grade(g(nh, 'verdict-escalate'), { trace: run(nh, { report: nh.samples.pass.replace(/ESCALATE$/, 'APPROVE') }), files: nh.files }));
  assert.ok(!grade(g(nh, 'names-missing-holdout'), { trace: run(nh, { report: 'Drift: none.\nHoldout: green.\nESCALATE' }), files: nh.files }));
  const d = caseOf('validator-drift');
  const t = (report) => ({ trace: run(d, { report }), files: d.files });
  assert.ok(!grade(g(d, 'names-extra-file'), t(d.samples.pass.replace('src/export.js', 'x'))));
  assert.ok(!grade(g(d, 'names-false-report'), t(d.samples.pass.replace('slugify trims the ends', 'x'))));
  assert.ok(!grade(g(d, 'holdout-not-verified'), t(d.samples.pass.replace('not verified', 'skipped'))));
});

test('evals 5b: spec-reviewer corre en Windows (sin Bash); el resto en wsl2 con Bash en allowed_tools', () => {
  for (const c of CASES) {
    const bash = ROLES[c.agent].tools.includes('Bash');
    const prompt = fs.readFileSync(path.join(out, c.name, 'prompt.md'), 'utf8');
    assert.strictEqual(c.tags.includes('wsl2'), bash, `${c.name}: etiqueta wsl2`);
    assert.strictEqual(c.tags.includes('windows'), !bash, `${c.name}: etiqueta windows`);
    assert.strictEqual(/^allowed_tools: \[[^\]]*\bBash\b/m.test(prompt), bash, `${c.name}: Bash en allowed_tools`);
    assert.ok(c.tags.includes('agents'));
  }
  assert.deepStrictEqual(CASES.filter((c) => c.tags.includes('windows')).map((c) => c.name), ['spec-reviewer-added-scope', 'spec-reviewer-clean']);
  assert.strictEqual(CASES.filter((c) => c.agent === 'plan-auditor').length, 3);
  assert.strictEqual(CASES.filter((c) => c.agent === 'validator').length, 2);
});

test('evals 5b: ningún patrón lleva comillas simples (yaml-lite no desescapa las dobles y el runner sí)', () => {
  for (const c of CASES) for (const g of graders(c.name)) assert.ok(!g.pattern.includes("'"), `${c.name}: ${g.name}`);
});

test('evals 5b: el CLI genera los 7 casos y cada carpeta trae lo que lee el runner', () => {
  const dir = makeTempDir('pignolo-evals-5b-cli-');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'evals', 'plan-cases.js'), '--out', dir], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const names = JSON.parse(r.stdout).cases;
  assert.strictEqual(names.length, 7);
  for (const n of names) {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh']) assert.ok(fs.existsSync(path.join(dir, n, f)), `${n}/${f}`);
    const head = fs.readFileSync(path.join(dir, n, 'prompt.md'), 'utf8').split('---')[1];
    assert.match(head, /^runs: 5$/m);
    assert.match(head, /^model: sonnet$/m);
    assert.match(head, /^plugins: \["[^"]*plugins\/pignolo"\]$/m);
    assert.ok(fs.readdirSync(path.join(dir, n, 'graders')).length >= 5, `${n}: graders`);
  }
  assert.notStrictEqual(spawnSync(process.execPath, [path.join(__dirname, 'evals', 'plan-cases.js')], { encoding: 'utf8' }).status, 0);
});

test('evals 5b: el brief del plan-auditor verify trae las dos afirmaciones y la carpeta scratch', () => {
  const c = caseOf('plan-auditor-verify-claim');
  for (const k of VERIFY_CLAIMS) assert.ok(c.brief.includes(k.claim));
  assert.match(c.brief, /scratch\//);
  assert.ok('scratch/.keep' in c.files);
});

test('evals 5b: spec-reviewer-clean reprueba con un hallazgo BLOCKER o CRITICAL y con un informe sin veredicto', () => {
  const c = caseOf('spec-reviewer-clean');
  const g = graders(c.name).find((x) => x.name === 'no-blocking-finding');
  const ok = (report) => grade(g, { trace: run(c, { report }), files: c.files });
  assert.ok(ok(c.samples.pass));
  assert.ok(!ok(c.samples.pass.replace('- none', '- BLOCKER spec.md:3: contradiction')), 'aprueba un BLOCKER');
  assert.ok(!ok(c.samples.pass.replace('- none', '- CRITICAL spec.md:3: contradiction')), 'aprueba un CRITICAL');
  assert.ok(!ok('Findings\n- none\nbut I have no verdict'), 'aprueba sin palabra de veredicto');
});

// ---- arreglos de la revisión final de 5b (0.8.1): I4, I5, I6 y M1 ----
const verifyReportOf = (entries) => `Experiments done.\n\`\`\`json\n${JSON.stringify(entries, null, 2)}\n\`\`\`\nREQUEST_CHANGES`;

test('evals 5b (I4): cada grader regex tiene su muestra de rechazo y la reprueba (un grader trivial se ve acá)', () => {
  for (const c of CASES) {
    const gs = graders(c.name).filter((g) => !['subagent-returned', 'single-dispatch'].includes(g.name));
    assert.ok(gs.length >= 2, `${c.name}: pocos graders`);
    for (const g of gs) {
      const r = c.rejects && c.rejects[g.name];
      assert.ok(r !== undefined, `${c.name}: ${g.name} no tiene muestra de rechazo en rejects`);
      const { report, tools } = typeof r === 'string' ? { report: r, tools: c.samples.passTools } : r;
      const trace = run(c, { report, tools: subTools(tools, AGENT_ID) });
      assert.ok(!grade(g, { trace, files: c.files }), `${c.name}: ${g.name} aprueba su muestra de rechazo`);
    }
    for (const name of Object.keys(c.rejects)) assert.ok(gs.some((g) => g.name === name), `${c.name}: rejects nombra un grader que no existe: ${name}`);
  }
});

test('evals 5b (I5): examples-quote-the-request exige citas literales del pedido, lo mismo que validateScopeCard', () => {
  const c = caseOf('spec-reviewer-added-scope');
  const g = graders(c.name).find((x) => x.name === 'examples-quote-the-request');
  const ok = (report) => grade(g, { trace: run(c, { report }), files: c.files });
  const cardOf = (report) => report.slice(report.indexOf('## Goal'), report.lastIndexOf('\n'));
  assert.ok(ok(c.samples.pass));
  assert.deepStrictEqual(validateScopeCard(cardOf(c.samples.pass), { request: REQUEST }), []);
  const para = c.samples.pass.replace('"filter them by status"', '"filtering by state"').replace(/"lists the tasks with their status"/g, '"shows every task and its state"');
  assert.ok(validateScopeCard(cardOf(para), { request: REQUEST }).length > 0, 'validateScopeCard rechaza la paráfrasis');
  assert.ok(!ok(para), 'aprueba citas inventadas');
  const oneBad = c.samples.pass.replace('"filter them by status"', '"filter them by state"');
  assert.ok(!ok(oneBad), 'aprueba con una sola cita inventada entre literales');
  const oneWord = c.samples.pass.replace('"filter them by status"', '"status"');
  assert.ok(!ok(oneWord), 'aprueba una cita de una sola palabra');
  const other = c.samples.pass.replace('"filter them by status"', '"let me filter them by status."').replace(/"lists the tasks with their status"/g, '"their status, and let me"');
  assert.ok(ok(other), 'reprueba otros tramos literales del pedido');
  assert.deepStrictEqual(validateScopeCard(cardOf(other), { request: REQUEST }), []);
});

test('evals 5b (I6): validator-drift acepta REQUEST_CHANGES y ESCALATE (la carta admite los dos: holdout ausente) y reprueba APPROVE', () => {
  const c = caseOf('validator-drift');
  const g = graders(c.name).find((x) => x.name === 'not-approve');
  assert.ok(g, 'falta not-approve');
  assert.ok(!graders(c.name).some((x) => x.name === 'verdict-request_changes'));
  const ok = (report) => grade(g, { trace: run(c, { report }), files: c.files });
  assert.ok(ok(c.samples.pass));
  assert.ok(ok(c.samples.pass.replace(/REQUEST_CHANGES$/, 'ESCALATE')), 'reprueba ESCALATE');
  assert.ok(!ok(c.samples.pass.replace(/REQUEST_CHANGES$/, 'APPROVE')));
});

test('evals 5b (M1): los graders aceptan otras redacciones correctas y siguen reprobando las incorrectas', () => {
  const g = (c, n) => graders(c.name).find((x) => x.name === n);
  const ok = (c, n, report) => grade(g(c, n), { trace: run(c, { report }), files: c.files });
  const add = caseOf('spec-reviewer-added-scope');
  assert.ok(ok(add, 'lists-a1', add.samples.pass.replace('A1: CSV export of the list (not requested)', 'A1: Export button that saves the list to a file (not requested)')), 'A1 con Export sin CSV');
  assert.ok(!ok(add, 'lists-a1', add.samples.pass.replace('A1: CSV export of the list (not requested)', 'A1: a button that saves the list (not requested)')), 'A1 sin señal');
  const dr = caseOf('validator-drift');
  assert.ok(ok(dr, 'names-false-report', dr.samples.pass.replace('"slugify trims the ends" fails', 'tests/slug.test.js:9 fails (the trim test)')), 'archivo:línea');
  assert.ok(ok(dr, 'names-false-report', dr.samples.pass.replace('"slugify trims the ends" fails', 'the second test (trim) fails')), 'trim');
  assert.ok(!ok(dr, 'names-false-report', dr.samples.pass.replace('"slugify trims the ends" fails', 'one test fails')));
  const rv = caseOf('plan-auditor-review-defect');
  assert.ok(ok(rv, 'finds-block-defect', rv.samples.pass.replace('"plan": "Task 1"', '"plan": "plan.md:9"')), 'línea del bloque de la tarea 1');
  assert.ok(ok(rv, 'finds-test-defect', rv.samples.pass.replace('"plan": "Task 2"', '"plan": "plan.md:20"')), 'línea del test de la tarea 2');
  assert.ok(!ok(rv, 'finds-block-defect', rv.samples.pass.replace('"plan": "Task 1"', '"plan": "plan.md:20"')), 'línea de otra tarea');
  assert.ok(!ok(rv, 'finds-block-defect', rv.samples.pass.replace('"plan": "Task 1"', '"plan": "Task 10"')), 'Task 10 no es Task 1');
  const vf = caseOf('plan-auditor-verify-claim');
  const between = vf.samples.pass.replace('"id": "c1",', '"id": "c1",\n    "claim": "numstat",').replace('"id": "c2",', '"id": "c2",\n    "claim": "node --test",');
  assert.ok(ok(vf, 'numstat-false', between), 'claim entre id y verdict');
  assert.ok(ok(vf, 'other-holds', between));
  const crossed = verifyReportOf([{ id: 'c1', experiment: 'scratch/c1.js', verdict: 'holds' }, { id: 'c2', experiment: 'scratch/c2.js', verdict: 'false' }]);
  assert.ok(!ok(vf, 'numstat-false', crossed), 'no cruza objetos');
  assert.ok(!ok(vf, 'other-holds', crossed), 'no cruza objetos');
});
