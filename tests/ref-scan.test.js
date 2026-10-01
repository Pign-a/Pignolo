'use strict';
// Hito 8d, Task 3: referencias a rutas movidas y reescritura segura de enlaces markdown por bytes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { makeRepo, makeTempDir, git, hashTree } = require('./helpers');
const { readProjectConfig } = require('../plugins/pignolo/lib/project-config');
const { pignoloHome } = require('../plugins/pignolo/lib/home');
const SM = require('../plugins/pignolo/lib/safe-move');
const { scanReferences, planRewrites, applyRewrites, relativeLink } = require('../plugins/pignolo/lib/ref-scan');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const put = (repo, rel, text = 'x\n') => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const commitAll = (repo, msg = 'x') => { git(['add', '-A'], repo); git(['commit', '-q', '-m', msg], repo); };
const SPECS = [{ kind: 'dir', from: 'doc/specs', to: 'docs/specs' }];
const verbOf = (args) => args.find((a) => !a.startsWith('-'));

function base() {
  const repo = makeRepo();
  put(repo, 'doc/specs/a.md', '# a\n');
  put(repo, 'README.md', '# r\n');
  commitAll(repo);
  return repo;
}
const scan = (repo, moves = SPECS, extra = {}) => scanReferences({ main: repo, moves, ...extra });
const rewriteOf = (repo, moves, r) => planRewrites({ main: repo, moves, refs: r.refs });

function tryLink(t, target, link) {
  try { fs.symlinkSync(target, link, 'junction'); } catch (e) { t.skip(`no se puede crear un junction: ${e.code}`); return false; }
  t.after(() => { try { fs.rmdirSync(link); } catch (_) { try { fs.unlinkSync(link); } catch (_2) { /* ya no está */ } } });
  return true;
}

test('un enlace hacia lo movido es markdown-link, se reescribe y resuelve a un archivo que existe', () => {
  const repo = base();
  put(repo, 'guide/index.md', 'ver [x](../doc/specs/a.md)\n');
  commitAll(repo);
  const r = scan(repo);
  assert.equal(r.rewritable.length, 1);
  assert.equal(r.rewritable[0].class, 'markdown-link');
  assert.equal(r.manual.length, 0);
  const rw = rewriteOf(repo, SPECS, r);
  assert.equal(rw.files.length, 1);
  assert.equal(rw.files[0].file, 'guide/index.md');
  const p = SM.planMoves({ main: repo, items: SPECS, config: readProjectConfig({ root: repo }) });
  assert.equal(p.ok, true, JSON.stringify(p.items));
  const m = SM.applyMoves({ main: repo, plan: p, config: readProjectConfig({ root: repo }), rewrites: rw.files });
  assert.equal(m.ok, true, JSON.stringify(m));
  const a = applyRewrites({ main: repo, rewrites: rw, record: m.record });
  assert.equal(a.ok, true, JSON.stringify(a));
  const text = fs.readFileSync(path.join(repo, 'guide/index.md'), 'utf8');
  assert.equal(text, 'ver [x](../docs/specs/a.md)\n');
  assert.ok(fs.existsSync(path.resolve(repo, 'guide', '../docs/specs/a.md')));
  const rec = JSON.parse(fs.readFileSync(m.record, 'utf8'));
  assert.equal(rec.rewrites[0].status, 'done');
  assert.ok(rec.rewrites[0].backup.includes(pignoloHome()));
});

test('enlaces que no repiten la ruta vieja (A8D-08)', () => {
  const repo = base();
  put(repo, 'doc/README.md', '[a](specs/a.md)\n');
  put(repo, 'doc/plans/p.md', '[s](../specs/a.md)\n[r](../../README.md)\n');
  commitAll(repo);
  // doc/plans sin mover
  let r = scan(repo);
  const rw = rewriteOf(repo, SPECS, r);
  const byFile = Object.fromEntries(r.rewritable.map((x) => [x.file, x]));
  assert.equal(byFile['doc/README.md'].to, '../docs/specs/a.md');
  assert.equal(byFile['doc/plans/p.md'].to, '../../docs/specs/a.md');
  assert.equal(rw.files.length, 2);
  // las dos carpetas movidas en el mismo lote: el enlace entre ellas y el de profundidad igual no cambian
  const both = [...SPECS, { kind: 'dir', from: 'doc/plans', to: 'docs/plans' }];
  r = scan(repo, both);
  assert.deepEqual(r.rewritable.map((x) => x.file), ['doc/README.md']);
});

test('enlaces que salen de lo movido (más hondo): outbound-link', () => {
  const repo = base();
  put(repo, 'doc/specs/a.md', '[r](../../README.md)\n');
  commitAll(repo);
  const moves = [{ kind: 'dir', from: 'doc/specs', to: 'docs/design/specs' }];
  const r = scan(repo, moves);
  assert.equal(r.rewritable[0].class, 'outbound-link');
  assert.equal(r.rewritable[0].to, '../../../README.md');
  const rw = rewriteOf(repo, moves, r);
  assert.equal(rw.files[0].file, 'docs/design/specs/a.md', 'la ruta de después del movimiento');
  assert.equal(rw.files[0].fileBefore, 'doc/specs/a.md');
});

test('formas: ancla, consulta, definición, ./ y \\; un destino que no existe no se toca ni cuenta', () => {
  const repo = base();
  put(repo, 'guide/forms.md', [
    '[1](../doc/specs/a.md#seccion)',
    '[2](../doc/specs/a.md?x=1)',
    '[x]: ../doc/specs/a.md',
    '[3](./../doc/specs/a.md)',
    '[4](..\\doc\\specs\\a.md)',
    '[5](../doc/specs/falta.md)',
    '',
  ].join('\n'));
  commitAll(repo);
  const r = scan(repo);
  assert.equal(r.rewritable.length, 5);
  assert.ok(!r.refs.some((x) => x.text.includes('falta')));
  const rw = rewriteOf(repo, SPECS, r);
  const out = rw.files[0];
  assert.equal(out.edits, 5);
  const text = out.newBuffer.toString('utf8');
  assert.equal(text, [
    '[1](../docs/specs/a.md#seccion)',
    '[2](../docs/specs/a.md?x=1)',
    '[x]: ../docs/specs/a.md',
    '[3](../docs/specs/a.md)',
    '[4](../docs/specs/a.md)',
    '[5](../doc/specs/falta.md)',
    '',
  ].join('\n'));
});

test('reescritura por bytes: CRLF/LF mezclados y BOM idénticos, Latin-1 sin tocar, código y URL intactos, formas raras manuales (A8D-09)', () => {
  const repo = base();
  put(repo, 'doc/specs/mi a.md', 'm\n');
  const bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('# t\r\n[a](../doc/specs/a.md)\nmas\r\nfin\n', 'utf8')]);
  fs.mkdirSync(path.join(repo, 'guide'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'guide/bom.md'), bom);
  const latin = Buffer.concat([Buffer.from('caf', 'latin1'), Buffer.from([0xE9]), Buffer.from(' [a](../doc/specs/a.md)\n', 'latin1')]);
  fs.writeFileSync(path.join(repo, 'guide/latin1.md'), latin);
  put(repo, 'guide/code.md', ['```', '[a](../doc/specs/a.md)', '```', 'texto `[a](../doc/specs/a.md)` en línea', '[u](https://github.com/o/r/blob/main/doc/specs/a.md)', ''].join('\n'));
  put(repo, 'guide/raras.md', ['[a](/doc/specs/a.md)', '[b](<../doc/specs/a.md>)', '[c](../doc/specs/a.md "titulo")', '[d](../doc/specs/mi%20a.md)', ''].join('\n'));
  commitAll(repo);
  const r = scan(repo);
  assert.deepEqual(r.unscanned.filter((u) => u.reason === 'not-utf8').map((u) => u.path), ['guide/latin1.md']);
  const rw = rewriteOf(repo, SPECS, r);
  assert.deepEqual(rw.files.map((f) => f.fileBefore), ['guide/bom.md']);
  const expected = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('# t\r\n[a](../docs/specs/a.md)\nmas\r\nfin\n', 'utf8')]);
  assert.ok(rw.files[0].newBuffer.equals(expected), 'solo cambia el destino del enlace');
  assert.equal(rw.files[0].sha256Before, sha(bom));
  assert.equal(rw.files[0].sha256After, sha(expected));
  const raras = r.manual.filter((x) => x.file === 'guide/raras.md');
  assert.equal(raras.length, 4);
  assert.ok(raras.every((x) => x.class === 'markdown-unsupported' && !x.rewritable));
  assert.ok(!r.rewritable.concat(r.manual).some((x) => x.file === 'guide/code.md'), 'ni el código ni la URL se reescriben ni frenan (a lo sumo una mención en prosa)');
  assert.ok(fs.readFileSync(path.join(repo, 'guide/latin1.md')).equals(latin));
});

test('manuales que frenan y la mención en prosa que no', () => {
  const repo = base();
  put(repo, 'lib/x.js', "const s = require('../doc/specs/x');\n");
  put(repo, 'package.json', '{ "scripts": { "docs": "cat doc/specs/a.md" } }\n');
  put(repo, '.gitignore', 'doc/specs/*.tmp\n');
  put(repo, '.github/workflows/ci.yml', 'on:\n  push:\n    paths: ["doc/specs/**"]\n');
  put(repo, 'notas.md', 'ver doc/specs para el detalle\n');
  commitAll(repo);
  const r = scan(repo);
  const classes = Object.fromEntries(r.manual.map((x) => [x.file, x.class]));
  assert.deepEqual(classes, { 'lib/x.js': 'code', 'package.json': 'package-json', '.gitignore': 'gitignore', '.github/workflows/ci.yml': 'ci' });
  assert.ok(r.manual.every((x) => !x.rewritable));
  assert.deepEqual(r.warnings.map((x) => [x.file, x.class]), [['notas.md', 'markdown-text']]);
  assert.equal(rewriteOf(repo, SPECS, r).files.length, 0);

  // un origen de un solo segmento: la palabra común en prosa no frena
  const repo2 = makeRepo();
  put(repo2, 'specs/a.md', 'a\n');
  put(repo2, 'prosa.md', 'los specs viven en specs y se llaman specs\n');
  commitAll(repo2, 'p');
  const r2 = scan(repo2, [{ kind: 'dir', from: 'specs', to: 'docs/specs' }]);
  assert.equal(r2.manual.length, 0);
  assert.ok(r2.warnings.length >= 1);
});

test('delimitado por segmento: adoc/specs y doc/specsX no cuentan', () => {
  const repo = base();
  put(repo, 'notas.txt', ['adoc/specs', 'doc/specsX', 'x "doc/specs" y', '(doc/specs/a.md)', 'fin doc/specs', ''].join('\n'));
  commitAll(repo);
  const r = scan(repo);
  assert.deepEqual(r.refs.map((x) => x.line), [3, 4, 5]);
  assert.ok(r.refs.every((x) => x.class === 'other' && x.text.length <= 80));
});

test('un archivo con cambios sin guardar es dirty-file (manual, frena) y no se escribe', () => {
  const repo = base();
  put(repo, 'guide/d.md', '[a](../doc/specs/a.md)\n');
  commitAll(repo);
  fs.appendFileSync(path.join(repo, 'guide/d.md'), 'cambio\n');
  const r = scan(repo);
  assert.equal(r.rewritable.length, 0);
  assert.equal(r.manual[0].class, 'dirty-file');
  assert.equal(rewriteOf(repo, SPECS, r).files.length, 0);
});

test('qué no se lee: binarios, grandes, .pignolo/state, node_modules, ignorados, .env, claves', () => {
  const repo = base();
  fs.writeFileSync(path.join(repo, 'img.png'), Buffer.from([0x89, 0x50, 0, 0, 1, 2]));
  fs.writeFileSync(path.join(repo, 'big.txt'), 'doc/specs\n'.repeat(120000));
  put(repo, '.pignolo/state/s.md', '[a](../doc/specs/a.md)\n');
  put(repo, 'node_modules/m/readme.md', 'doc/specs\n');
  put(repo, 'secreto.md', 'doc/specs\n');
  git(['add', '-f', 'secreto.md'], repo);
  put(repo, '.gitignore', 'secreto.md\n');
  commitAll(repo);
  put(repo, '.env', 'doc/specs=1\n');
  put(repo, 'cert.pem', 'doc/specs\n');
  put(repo, 'k.key', 'doc/specs\n');
  const reads = [];
  const spy = { ...fs, readFileSync(p, o) { reads.push(String(p)); return fs.readFileSync(p, o); } };
  const r = scan(repo, SPECS, { fs: spy });
  assert.ok(reads.length > 0, 'el registro de lecturas no está vacío');
  for (const bad of ['img.png', 'big.txt', '.pignolo', 'node_modules', 'secreto.md', '.env', 'cert.pem', 'k.key']) {
    assert.ok(!reads.some((p) => p.replace(/\\/g, '/').includes(bad)), `se abrió ${bad}`);
  }
  const reason = Object.fromEntries(r.unscanned.map((u) => [u.path, u.reason]));
  assert.equal(reason['img.png'], 'binary');
  assert.equal(reason['big.txt'], 'too-large');
  assert.equal(reason['.pignolo/state/s.md'], 'state');
  assert.equal(reason['node_modules/m/readme.md'], 'node_modules');
  assert.equal(reason['secreto.md'], 'private');
  assert.equal(reason['.env'], 'private');
  assert.equal(reason['cert.pem'], 'private');
  assert.equal(reason['k.key'], 'private');
  assert.equal(r.refs.length, 0);
});

test('junction: lo que está detrás de un enlace no se lee ni se reescribe', (t) => {
  const repo = base();
  const outside = makeTempDir('pignolo-outside-');
  put(outside, 'o.md', '[a](../doc/specs/a.md)\n');
  if (!tryLink(t, outside, path.join(repo, 'doc', 'ext'))) return;
  const h = hashTree(outside);
  const r = scan(repo);
  assert.ok(r.unscanned.some((u) => u.reason === 'link'), JSON.stringify(r.unscanned));
  assert.ok(!r.refs.some((x) => x.file.includes('o.md')));
  assert.equal(rewriteOf(repo, SPECS, r).files.length, 0);
  assert.equal(hashTree(outside), h);
});

test('nombres no ASCII se leen y reescriben; un listado que falla es scan-failed y nunca "sin referencias"', () => {
  const repo = base();
  put(repo, 'docs/especificación.md', '[x](../doc/specs/a.md)\n');
  commitAll(repo);
  put(repo, 'docs/ñandú sin versionar.md', '[x](../doc/specs/a.md)\n');
  const r = scan(repo);
  assert.deepEqual(r.rewritable.map((x) => x.file).sort(), ['docs/especificación.md', 'docs/ñandú sin versionar.md']);
  const rw = rewriteOf(repo, SPECS, r);
  assert.equal(rw.files.length, 2);
  const real = SM.makeRun(repo);
  const calls = [];
  const bad = (args, cwd, o) => { calls.push(args); if (verbOf(args) === 'ls-files') { const e = new Error('spawnSync git ENOBUFS'); e.code = 'ENOBUFS'; throw e; } return real(args, cwd, o); };
  assert.throws(() => scan(repo, SPECS, { run: bad }), (e) => e.kind === 'scan-failed');
  assert.ok(calls.length > 0);
});

test('applyRewrites respalda fuera del árbol y detecta un archivo que cambió entre el plan y la escritura', () => {
  const repo = base();
  put(repo, 'guide/a.md', '[a](../doc/specs/a.md)\n');
  put(repo, 'guide/b.md', '[b](../doc/specs/a.md)\n');
  commitAll(repo);
  const r = scan(repo);
  const rw = rewriteOf(repo, SPECS, r);
  assert.equal(rw.files.length, 2);
  fs.appendFileSync(path.join(repo, 'guide/b.md'), 'otro cambio\n');
  const a = applyRewrites({ main: repo, rewrites: rw });
  assert.equal(a.ok, false);
  assert.equal(a.refused, 'file-changed');
  assert.equal(fs.readFileSync(path.join(repo, 'guide/b.md'), 'utf8'), '[b](../doc/specs/a.md)\notro cambio\n');
  assert.equal(fs.readFileSync(path.join(repo, 'guide/a.md'), 'utf8'), '[a](../doc/specs/a.md)\n', 'se valida todo antes de escribir: nada a medias');
});

test('applyRewrites: el respaldo está en PIGNOLO_HOME y git no ve archivos nuevos del respaldo', () => {
  const repo = base();
  put(repo, 'guide/a.md', '[a](../doc/specs/a.md)\n');
  commitAll(repo);
  const r = scan(repo);
  const rw = rewriteOf(repo, SPECS, r);
  const before = git(['status', '--porcelain', '--untracked-files=all'], repo);
  const a = applyRewrites({ main: repo, rewrites: rw });
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.ok(a.files[0].backup.startsWith(pignoloHome()));
  assert.equal(fs.readFileSync(a.files[0].backup, 'utf8'), '[a](../doc/specs/a.md)\n');
  assert.equal(git(['status', '--porcelain', '--untracked-files=all'], repo), `${before}${before ? '\n' : ''} M guide/a.md`.trim());
});

test('relativeLink: tabla', () => {
  assert.equal(relativeLink('docs/a', 'docs/b/c.md'), '../b/c.md');
  assert.equal(relativeLink('docs/a', 'docs/a/x.md'), 'x.md');
  assert.equal(relativeLink('docs/a', 'README.md'), '../../README.md');
  assert.equal(relativeLink('docs/a', 'docs/b/c.md#x'), '../b/c.md#x');
  assert.equal(relativeLink('docs/a', 'docs/b/c.md?y=1'), '../b/c.md?y=1');
  assert.equal(relativeLink('', 'docs/a.md'), 'docs/a.md');
});
