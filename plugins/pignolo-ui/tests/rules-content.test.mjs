// Extra cases for the content rules that the fixture harness cannot express (spec §5.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCheck } from '../lib/ui-check.mjs';

async function run(file, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-content-'));
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

test('rule ICON-01 anchor outside nav is not checked', async () => {
  const e = await run('a.html', '<a href="/">\u{1F3E0} Inicio</a>');
  assert.equal(fails(e, 'ICON-01').length, 0);
});
