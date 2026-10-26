'use strict';
// Pruebas del armador de brazos (tests/evals/ui-arms.mjs). Trabajan sobre una copia temporal del plugin del repo.
const nodeTest = require('node:test');
const { flowOnly } = require('./flow-pausado');
const test = flowOnly(nodeTest);
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'pignolo');
const SCRIPT = path.join(__dirname, 'evals', 'ui-arms.mjs');
// sha256 de skills/ui/SKILL.md del plugin 1.0.0 (fin de línea normalizado a LF)
const UI_SKILL_1_0_0 = 'c337825392a6f4220afb11540b6934c39770d914fa140328e7e5df78029d0205';

const lf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const walk = (dir, base = dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc); else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc.sort();
};

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-arms-test-'));
const SRC = path.join(tmpRoot, 'src');
// copia liviana (sin ui-audit y sus fixtures) para que cada brazo se arme rápido; el test de layout usa la copia completa
fs.cpSync(PLUGIN, SRC, { recursive: true, filter: (p) => path.relative(PLUGIN, p).split(path.sep)[0] !== 'ui-audit' });
let mod;
let n = 0;
const build = (arm, src = SRC) => mod.buildArm({ arm, src, out: path.join(tmpRoot, `out-${arm}-${n++}`) });

nodeTest.before(async () => { mod = await import(pathToFileURL(SCRIPT).href); });
nodeTest.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

const UI = 'skills/ui/';
const REF = `${UI}references/`;
const SEEDS = () => walk(path.join(SRC, UI, 'references', 'patterns')).map((f) => `${REF}patterns/${f}`);
const BRIEF = `${REF}brief.md`;
const PATTERNS = `${REF}patterns.md`;
const CRITIQUE = `${REF}critique.md`;

const isKit = (f) => f.startsWith('skills/ui/kit/') || f === 'skills/ui/references/stacks.md';

function expectedFiles(arm) {
  const all = walk(SRC);
  const stepFiles = new Set([BRIEF, PATTERNS, CRITIQUE, ...SEEDS()]);
  const base = all.filter((f) => !stepFiles.has(f) && !isKit(f));
  const plus = {
    U0: [], A0: [], A1: [], A2: [], A3: [],
    U1: [BRIEF],
    U2: [BRIEF, PATTERNS, ...SEEDS()],
    U2S: [BRIEF, PATTERNS, ...SEEDS()],
    U2R: [BRIEF, PATTERNS],
    U3: [BRIEF, PATTERNS, CRITIQUE, ...SEEDS()],
    U3K: [BRIEF, PATTERNS, CRITIQUE, ...SEEDS(), ...all.filter(isKit)],
  }[arm];
  return [...base, ...plus].sort();
}

const TOKENS = {
  brief: [/brief\.md/, /design\/screens/],
  patterns: [/patterns\.md/, /references\/patterns/, /design\/patterns/],
  critique: [/critique\.md/],
};
const DISABLED = {
  U0: ['brief', 'patterns', 'critique'], A0: ['brief', 'patterns', 'critique'], A1: ['brief', 'patterns', 'critique'],
  A2: ['brief', 'patterns', 'critique'], A3: ['brief', 'patterns', 'critique'],
  U1: ['patterns', 'critique'], U2: ['critique'], U2S: ['critique'], U2R: ['critique'], U3: [], U3K: [],
};

test('la fuente trae las 15 fichas semilla (si no, U2S no tendría qué conservar)', () => {
  assert.strictEqual(SEEDS().filter((f) => !/README\.md$/i.test(f)).length, 15);
});

test('cada brazo deja exactamente los archivos esperados', () => {
  for (const arm of Object.keys(DISABLED)) {
    const r = build(arm);
    assert.deepStrictEqual(walk(r.out), expectedFiles(arm), `brazo ${arm}`);
  }
});

test('de un paso desactivado no queda ninguna cadena en ningún archivo del árbol', () => {
  for (const [arm, steps] of Object.entries(DISABLED)) {
    const r = build(arm);
    const files = walk(r.out);
    for (const rel of files) {
      const text = fs.readFileSync(path.join(r.out, rel), 'utf8');
      for (const step of steps) {
        for (const re of TOKENS[step]) {
          assert.ok(!re.test(text) && !re.test(rel), `${arm}: ${rel} conserva ${re} del paso ${step}`);
        }
      }
      if (arm === 'U2R') assert.ok(!/references\/patterns\//.test(text), `U2R: ${rel} nombra la carpeta de semillas`);
    }
  }
});

test('los brazos que quitan la sección no dejan rastro de "Building screens" ni de la línea de work (salvo A2, que la agrega)', () => {
  for (const arm of ['U0', 'A0', 'A1', 'A3']) {
    const r = build(arm);
    for (const rel of walk(r.out).filter((f) => f.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(r.out, rel), 'utf8');
      assert.ok(!/Building screens|screen-building/.test(text), `${arm}: ${rel}`);
    }
  }
});

test('U0 equivale a la skill ui 1.0.0: mismo SKILL.md, mismas referencias y plantillas que el original', () => {
  const r = build('U0');
  assert.strictEqual(sha(lf(path.join(r.out, UI, 'SKILL.md'))), UI_SKILL_1_0_0);
  const original = walk(path.join(SRC, UI)).filter((f) => !/^references\/(brief|patterns|critique)\.md$/.test(f) && !f.startsWith('references/patterns/') && !f.startsWith('kit/') && f !== 'references/stacks.md');
  assert.deepStrictEqual(walk(path.join(r.out, UI)), original);
  for (const f of original.filter((x) => x !== 'SKILL.md')) {
    assert.ok(fs.readFileSync(path.join(r.out, UI, f)).equals(fs.readFileSync(path.join(SRC, UI, f))), `${f} cambió`);
  }
  // work vuelve a ser el de antes de la línea
  const work = lf(path.join(r.out, 'skills', 'work', 'SKILL.md'));
  assert.ok(!work.includes('screen-building'));
  assert.ok(!work.includes('\n\n\n'), 'quedó un renglón en blanco de más');
});

test('U3K es el flujo publicado con el kit: el árbol es idéntico al de la fuente', () => {
  const r = build('U3K');
  assert.strictEqual(r.treeSha256, mod.treeSha256(SRC));
  assert.deepStrictEqual(r.removed, { files: [], dirs: [], lines: [], sections: [] });
});

test('U3 es el flujo sin el kit ni la guía de stacks: solo quita eso y sus punteros', () => {
  const r = build('U3');
  assert.deepStrictEqual(r.removed.dirs, ['skills/ui/kit']);
  assert.deepStrictEqual(r.removed.files, ['skills/ui/references/stacks.md']);
  assert.strictEqual(r.removed.lines.length, 2);
  assert.strictEqual(r.removed.sections.length, 0);
});

test('el plugin armado como U3 pasa tests/plugin-layout.test.js', () => {
  const full = path.join(tmpRoot, 'src-completo');
  fs.cpSync(PLUGIN, full, { recursive: true });
  const r = build('U3', full);
  const run = spawnSync(process.execPath, ['--test', path.join(__dirname, 'plugin-layout.test.js')], {
    env: { ...process.env, PIGNOLO_LAYOUT_PLUGIN: r.out }, encoding: 'utf8',
  });
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
});

test('en todos los brazos las referencias que nombra un SKILL.md existen y el cuerpo de ui cabe en su tope', () => {
  for (const arm of Object.keys(DISABLED)) {
    const r = build(arm);
    for (const skill of ['ui', 'work']) {
      const dir = path.join(r.out, 'skills', skill);
      const text = lf(path.join(dir, 'SKILL.md'));
      for (const m of text.matchAll(/\b((?:references|templates)\/[A-Za-z0-9._-]+)/g)) {
        assert.ok(fs.existsSync(path.join(dir, m[1])), `${arm}/${skill}: no existe ${m[1]}`);
      }
    }
    const body = lf(path.join(r.out, UI, 'SKILL.md')).replace(/^---\n[\s\S]*?\n---\n?/, '');
    assert.ok(body.split(/\s+/).filter(Boolean).length <= 850, `${arm}: ui demasiado largo`);
    const heads = [...body.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));
    assert.deepStrictEqual(heads, heads.map((_, i) => i + 1), `${arm}: secciones mal numeradas`);
  }
});

test('U1 y U2: la sección sigue coherente con los pasos que quedan', () => {
  const u1 = lf(path.join(build('U1').out, UI, 'SKILL.md'));
  assert.match(u1, /references\/brief\.md/);
  assert.ok(!/pattern sheet|critique|rubric/i.test(u1));
  const u2 = lf(path.join(build('U2').out, UI, 'SKILL.md'));
  assert.match(u2, /references\/patterns\.md/);
  assert.ok(!/critique|rubric/i.test(u2));
});

test('U2S exige las 15 semillas; U2R no deja ninguna y patterns.md no las nombra', () => {
  const s = build('U2S');
  assert.strictEqual(walk(path.join(s.out, REF, 'patterns')).filter((f) => f !== 'README.md').length, 15);
  const bad = path.join(tmpRoot, 'src-sin-semillas');
  fs.cpSync(SRC, bad, { recursive: true });
  const one = walk(path.join(bad, REF, 'patterns')).find((f) => f !== 'README.md');
  fs.rmSync(path.join(bad, REF, 'patterns', one));
  assert.throws(() => build('U2S', bad), /15 fichas semilla/);
  const r = build('U2R');
  assert.ok(!fs.existsSync(path.join(r.out, REF, 'patterns')));
  assert.ok(!lf(path.join(r.out, PATTERNS)).includes('references/patterns/'));
  assert.match(lf(path.join(r.out, PATTERNS)), /design\/patterns\//, 'las fichas del proyecto siguen');
});

test('brazos de activación: A1 extiende la description, A2 suma la línea de work, A3 las 4 reglas sin apuntar a ui', () => {
  const orig = lf(path.join(SRC, UI, 'SKILL.md')).match(/^description: "(.*)"$/m)[1];
  const a0 = build('A0');
  assert.strictEqual(lf(path.join(a0.out, UI, 'SKILL.md')).match(/^description: "(.*)"$/m)[1], orig);
  const work0 = lf(path.join(a0.out, 'skills', 'work', 'SKILL.md'));
  for (const arm of ['A1', 'A2']) {
    const r = build(arm);
    const d = lf(path.join(r.out, UI, 'SKILL.md')).match(/^description: "(.*)"$/m)[1];
    assert.ok(d.startsWith(orig) && d.length > orig.length && d.length <= 1536);
    for (const p of ['hacé la pantalla de', 'armá el dashboard', 'construí el panel', 'build the screen', 'make the settings page']) {
      assert.ok(d.includes(p), `${arm}: falta "${p}"`);
    }
  }
  assert.strictEqual(lf(path.join(build('A1').out, 'skills', 'work', 'SKILL.md')), work0);
  const w2 = lf(path.join(build('A2').out, 'skills', 'work', 'SKILL.md'));
  assert.ok(w2.includes(mod.WORK_LINE));
  assert.strictEqual(w2.split('\n').filter((l) => l === mod.WORK_LINE).length, 1);
  const w3 = lf(path.join(build('A3').out, 'skills', 'work', 'SKILL.md'));
  for (const p of ['one primary action per view', 'hover and focus-visible states on everything interactive',
    'never native select or date inputs, use the catalog\'s', 'each panel states its purpose and its primary action']) {
    assert.ok(w3.includes(p), `A3: falta "${p}"`);
  }
  assert.ok(!w3.includes('/pignolo:ui') && !w3.includes('screen-building'), 'A3 no apunta a ui');
});

test('la línea de work del script es idéntica a la que trae work/SKILL.md', () => {
  assert.ok(lf(path.join(SRC, 'skills', 'work', 'SKILL.md')).split('\n').includes(mod.WORK_LINE));
});

test('sobre un árbol 1.0.0, U0 y A0 solo copian; U1 a U3 se niegan porque no hay sección que componer', () => {
  const v1 = build('U0').out;
  const sha1 = mod.treeSha256(v1);
  for (const arm of ['U0', 'A0']) {
    const r = build(arm, v1);
    assert.strictEqual(r.treeSha256, sha1);
    assert.strictEqual(r.srcHadSection, false);
    assert.deepStrictEqual(r.removed.sections, []);
  }
  assert.throws(() => build('U1', v1), /sección "Building screens"/);
});

test('--out: se niega si existe y no está vacío (salvo --force) y nunca borra fuera de --out', () => {
  const out = path.join(tmpRoot, 'out-ocupado');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'viejo.txt'), 'x');
  const sentinel = path.join(tmpRoot, 'vecino.txt');
  fs.writeFileSync(sentinel, 'no me toques');
  assert.throws(() => mod.buildArm({ arm: 'U1', src: SRC, out }), /no está vacío/);
  assert.ok(fs.existsSync(path.join(out, 'viejo.txt')));
  mod.buildArm({ arm: 'U1', src: SRC, out, force: true });
  assert.ok(!fs.existsSync(path.join(out, 'viejo.txt')));
  assert.ok(fs.existsSync(path.join(out, 'skills', 'ui', 'SKILL.md')));
  assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'no me toques');
  assert.throws(() => mod.buildArm({ arm: 'U1', src: SRC, out: tmpRoot, force: true }), /contener/);
  assert.throws(() => mod.buildArm({ arm: 'U1', src: SRC, out: path.join(SRC, 'dentro') }), /dentro de --src/);
  assert.ok(fs.existsSync(path.join(SRC, 'skills')), 'la fuente quedó intacta');
});

test('CLI: imprime el resumen JSON con lo quitado/agregado y el sha256 del árbol; un brazo desconocido falla', () => {
  const out = path.join(tmpRoot, 'out-cli');
  const ok = spawnSync(process.execPath, [SCRIPT, 'build', '--arm', 'U2R', '--src', SRC, '--out', out], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, ok.stderr);
  const j = JSON.parse(ok.stdout);
  assert.strictEqual(j.arm, 'U2R');
  assert.match(j.treeSha256, /^[0-9a-f]{64}$/);
  assert.ok(j.removed.files.includes(CRITIQUE) && j.removed.dirs.includes(`${REF}patterns`));
  const bad = spawnSync(process.execPath, [SCRIPT, 'build', '--arm', 'ZZ', '--src', SRC, '--out', path.join(tmpRoot, 'out-zz')], { encoding: 'utf8' });
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stderr, /brazo desconocido/);
});

test('los fines de línea CRLF de la fuente se conservan al componer', () => {
  const crlf = path.join(tmpRoot, 'src-crlf');
  fs.cpSync(SRC, crlf, { recursive: true });
  for (const f of ['skills/ui/SKILL.md', 'skills/work/SKILL.md']) {
    const p = path.join(crlf, f);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  }
  const r = build('U0', crlf);
  const raw = fs.readFileSync(path.join(r.out, UI, 'SKILL.md'), 'utf8');
  assert.ok(raw.includes('\r\n') && !/[^\r]\n/.test(raw), 'SKILL.md perdió el CRLF');
  assert.strictEqual(sha(lf(path.join(r.out, UI, 'SKILL.md'))), UI_SKILL_1_0_0);
});
