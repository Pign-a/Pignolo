// Extra cases for the content rules that the fixture harness cannot express (spec §5.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runCheck } from '../lib/ui-check.mjs';
import { makeTempDir } from './helpers.mjs';

async function run(file, text) {
  const dir = makeTempDir('ui-content-');
  try {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
    return (await runCheck({ project: dir, files: [file], design: null, base: null, dom: [] })).entries;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const fails = (entries, id) => entries.filter((e) => e.id === id && e.status === 'fail');

test('rule CONTENT-01 one finding per element even with both marker forms', async () => {
  const e = await run('a.html', '<p data-sample>\u2039Cifra\u203A</p>');
  assert.equal(fails(e, 'CONTENT-01').length, 1);
});

test('rule COPY-01 english list is not applied under lang es', async () => {
  const e = await run('a.html', '<html lang="es"><body><p>Seamless</p></body></html>');
  assert.equal(fails(e, 'COPY-01').length, 0);
});

test('rule COPY-01 matching ignores case and accents', async () => {
  const e = await run('a.html', '<p>PONÉ TU NEGOCIO SIN ESFUERZO</p>');
  assert.equal(fails(e, 'COPY-01').length, 1);
});

test('rule ICON-01 ignores spaces and variation selectors before the emoji', async () => {
  const e = await run('a.html', '<button>  \uFE0F\u{1F680} Go</button>');
  assert.equal(fails(e, 'ICON-01').length, 1);
});

test('rule COPY-01 matches whole words only (Unicode boundaries after folding)', async () => {
  const cases = [
    ['<p>Desbloquear cuenta</p>', 0],
    ['<p>Desbloquea tu potencial</p>', 1],
    ['<p>¡DESBLOQUEÁ… no: desbloquea!</p>', 1],
    ['<p>Rediseñamos: revolucionario</p>', 0],
    ['<p>Una experiencia seamless.</p>', 1],
    ['<p>seamlessly done</p>', 0],
    ['<p>añoseamless</p>', 0],
  ];
  for (const [html, n] of cases) {
    const e = await run('a.html', html);
    assert.equal(fails(e, 'COPY-01').length, n, html);
  }
});

test('rule ICON-01 needs emoji presentation (or U+FE0F), not ©, ® or ™', async () => {
  const cases = [
    ['<li>© 2026 Empresa</li>', 0],
    ['<li>® Marca</li>', 0],
    ['<h2>™ Producto</h2>', 0],
    ['<li>❤ texto</li>', 0],
    ['<li>❤' + String.fromCharCode(0xfe0f) + ' texto</li>', 1],
    ['<button>✅ Listo</button>', 1],
    ['<button>\u{1F680} Go</button>', 1],
  ];
  for (const [html, n] of cases) {
    const e = await run('a.html', html);
    assert.equal(fails(e, 'ICON-01').length, n, html);
  }
});

test('rule ICON-01 anchor outside nav is not checked', async () => {
  const e = await run('a.html', '<a href="/">\u{1F3E0} Inicio</a>');
  assert.equal(fails(e, 'ICON-01').length, 0);
});
