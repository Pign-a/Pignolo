'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'plugins', 'pignolo', 'skills', 'session');
const read = (...p) => fs.readFileSync(path.join(DIR, ...p), 'utf8').replace(/\r\n/g, '\n');
const paragraphs = (t) => t.split(/\n\s*\n/);

test('description: frases gatillo en español e inglés', () => {
  const m = read('SKILL.md').match(/^description:[ \t]*(.*)$/m);
  assert.ok(m, 'falta description');
  assert.ok(m[1].includes('documentemos la sesión'));
  assert.ok(m[1].includes('document the session'));
});

test('research.md: la tabla tiene las cinco columnas en orden y Tipo dato/opinión/supuesto', () => {
  const t = read('templates', 'research.md');
  const header = t.split('\n').find((l) => l.startsWith('|') && l.includes('Afirmación'));
  assert.ok(header, 'sin fila de encabezado');
  const cols = header.split('|').slice(1, -1).map((c) => c.trim());
  assert.deepStrictEqual(cols, ['Afirmación', 'Fuente', 'Credibilidad', 'Tipo', 'Fecha']);
  for (const w of ['dato', 'opinión', 'supuesto', 'alta', 'media', 'baja']) {
    assert.ok(t.includes(w), `falta ${w}`);
  }
});

test('session.md: Puntos abiertos, Próximo paso y línea Validado: al inicio de línea', () => {
  const t = read('templates', 'session.md');
  assert.match(t, /^#+ .*Puntos abiertos/m);
  assert.match(t, /^#+ .*Próximo paso/m);
  assert.match(t, /^Validado: ?$/m, 'Validado: vacío, sin viñeta ni negrita');
  const lines = t.split('\n');
  assert.ok(lines.findIndex((l) => /^Validado:/.test(l)) < lines.findIndex((l) => /^## /.test(l)),
    'Validado: debe estar antes de la primera sección');
});

test('SKILL.md: no depende de GitHub (sin remoto), dicho explícitamente', () => {
  const p = paragraphs(read('SKILL.md')).find((x) => /no remote|sin remoto/i.test(x));
  assert.ok(p, 'falta la mención');
  assert.match(p, /GitHub/);
  assert.match(p, /branch|rama/i);
});

test('SKILL.md: regla de Validado: conservar y copiar hacia adelante', () => {
  const p = paragraphs(read('SKILL.md')).find((x) => !x.startsWith('#') && x.includes('Validado:'));
  assert.ok(p, 'falta el párrafo');
  assert.match(p, /preserv/i);
  assert.match(p, /copy forward|carry forward/i);
  assert.match(p, /most recent/i);
});

test('SKILL.md: puntos abiertos se concilian (arrastrado, cerrado o descartado con motivo)', () => {
  const p = paragraphs(read('SKILL.md')).find((x) => /open items/i.test(x) && /reconcile/i.test(x));
  assert.ok(p, 'falta el párrafo');
  for (const w of ['carried', 'closed', 'dropped', 'reason']) assert.match(p, new RegExp(w, 'i'));
});

test('SKILL.md: investigaciones en docs/research con fuente, credibilidad y tipo; mantiene CLAUDE.md y roadmap.md', () => {
  const t = read('SKILL.md');
  const p = paragraphs(t).find((x) => x.includes('docs/research/YYYY-MM-DD-'));
  assert.ok(p, 'falta docs/research');
  for (const w of ['source', 'credibility', 'criterion']) assert.match(p, new RegExp(w, 'i'));
  assert.match(t, /docs\/sessions\/YYYY-MM-DD\.md/);
  assert.match(t, /CLAUDE\.md/);
  assert.match(t, /roadmap\.md/);
});

test('SKILL.md: nunca escribe valores de secretos, con el motivo', () => {
  const p = paragraphs(read('SKILL.md')).find((x) => /secret values/i.test(x));
  assert.ok(p, 'falta el párrafo');
  assert.match(p, /never/i);
  assert.match(p, /because/i);
});
