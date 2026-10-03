'use strict';
// Contrato entre el panel y el núcleo (etapa 3, T3): el panel no importa el núcleo, así que este test —que vive solo en tests/— los
// mantiene alineados: lo que el núcleo escribe lo lee el panel, y todo mensaje que el panel arma lo valida el núcleo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, git } = require('./helpers');
const { load } = require('./helpers-panel-ui');
const IC = require('../plugins/pignolo/lib/init-choices');
const W = require('../plugins/pignolo/lib/wizard-detect');

const SAMPLE = path.join(__dirname, '..', 'plugins', 'pignolo-panel', 'sample', 'wizard-detect.json');
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commitAll = (repo) => { git(['add', '-A'], repo); git(['commit', '-q', '-m', 'c'], repo); };

function fixtures() {
  const node = makeRepo();
  write(node, 'package.json', JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' }, devDependencies: { vitest: '1' } }));
  write(node, 'src/a.test.ts', '// t\n');
  write(node, 'specs/a-design.md', '# a\n');
  write(node, 'plans/b-plan.md', '# b\n');
  write(node, 'research/r.md', '# r\n');
  commitAll(node);
  const plain = makeRepo();
  write(plain, 'package.json', JSON.stringify({ name: 'demo' }));
  commitAll(plain);
  const blank = makeRepo();
  git(['rm', '-q', 'a.txt'], blank);
  write(blank, 'README.md', '# x\n');
  commitAll(blank);
  return { node, plain, blank };
}

test('wizard-contract: what the core writes is read by the panel, for a Node project, a bare one, a blank one and the sample', async () => {
  const M = await load('wizard-model.js');
  const f = fixtures();
  for (const [name, repo] of Object.entries(f)) {
    const text = JSON.stringify({ ...W.buildWizardDetect({ main: repo }), offer: true });
    const r = M.readWizardDetect(text);
    assert.equal(r.ok, true, `${name}: ${r.reason}`);
    assert.equal(r.data.id, JSON.parse(text).id, name);
    assert.equal(r.data.blank, name === 'blank');
  }
  const s = M.readWizardDetect(fs.readFileSync(SAMPLE, 'utf8'));
  assert.equal(s.ok, true, s.reason);
  // las carpetas candidatas y sus opciones llegan enteras
  const node = M.readWizardDetect(JSON.stringify(W.buildWizardDetect({ main: f.node }))).data;
  assert.deepEqual(node.places.candidates.map((c) => c.kind).sort(), ['plan', 'research', 'spec']);
  for (const c of node.places.candidates) assert.deepEqual(c.options, ['adopt', 'move', 'leave']);
});

test('wizard-contract: every message the panel can build for the fixtures is ok in parseChoices of the core', async () => {
  const M = await load('wizard-model.js');
  const f = fixtures();
  const texts = [
    ...Object.values(f).map((repo) => JSON.stringify(W.buildWizardDetect({ main: repo }))),
    fs.readFileSync(SAMPLE, 'utf8'),
  ];
  let built = 0;
  for (const raw of texts) {
    const { data } = M.readWizardDetect(raw);
    for (const uiInstalled of [false, true]) {
      const steps = M.stepsFor({ data, uiInstalled });
      // cada combinación: en cada paso se prueba cada letra (y cada decisión de cada carpeta) y se pasa al siguiente
      let states = [M.initialState(steps, data)];
      for (let k = 0; k < steps.length; k += 1) {
        const step = steps[k];
        const next = [];
        for (const s of states) {
          const variants = [s];
          if (step === 'places') {
            let cur = s;
            for (let i = 0; i < data.places.candidates.length; i += 1) for (let n = 0; n < 2; n += 1) { cur = M.move(cur, 'pick', String(i + 1), data); variants.push(cur); }
          } else if (step !== 'summary' && step !== 'blank') for (const l of ['a', 'b', 'c']) variants.push(M.move(s, 'pick', l, data));
          for (const v of variants) next.push(k < steps.length - 1 ? M.move(v, 'next', undefined, data) : v);
        }
        states = next;
      }
      for (const s of states) {
        const msg = M.choicesMessage(M.choicesOf(s, data, { uiInstalled }));
        assert.equal(typeof msg, 'string');
        const json = M.jsonOf(msg);
        const p = IC.parseChoices(json);
        assert.equal(p.ok, true, `${p.reason}: ${json}`);
        assert.equal(p.choices.id, data.id);
        built += 1;
      }
    }
  }
  assert.ok(built >= 40, `combinaciones probadas: ${built}`);
  // y el núcleo rechaza lo que el panel nunca arma (lo que no es de su vocabulario)
  assert.equal(IC.parseChoices('{"v":1,"id":"5d3f0a91c2e7","project":"confirm","profile":"balanced","perms":"user","run":"rm"}').ok, false);
  assert.equal(M.choicesMessage({ v: 1, id: '5d3f0a91c2e7', project: 'confirm', profile: 'balanced', perms: 'user', run: 'rm' }), null);
});

test('wizard-contract: the panel and the core share the same enumerations', async () => {
  const M = await load('wizard-model.js');
  const data = M.readWizardDetect(fs.readFileSync(SAMPLE, 'utf8')).data;
  const values = { profile: new Set(), perms: new Set(), project: new Set(), ui: new Set() };
  for (const l of 'abc') {
    for (const step of ['project', 'profile', 'perms', 'ui']) {
      const v = M.optionFor(step, l, data);
      if (v !== undefined) values[step].add(v);
    }
  }
  for (const [k, set] of Object.entries(values)) for (const v of set) assert.ok(IC.ENUM[k].includes(v), `${k}=${v}`);
  for (const [k, list] of Object.entries(IC.ENUM)) for (const v of list) assert.ok(values[k].has(v), `el panel no ofrece ${k}=${v}`);
});
