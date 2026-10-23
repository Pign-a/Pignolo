'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'plugins', 'pignolo', 'skills', 'work');
const read = (...p) => fs.readFileSync(path.join(DIR, ...p), 'utf8').replace(/\r\n/g, '\n');

test('la description trae frases gatillo en español e inglés, en una línea', () => {
  const m = read('SKILL.md').match(/^description:[ \t]*(.*)$/m);
  assert.ok(m && m[1].trim().length > 20, 'falta description en una línea');
  assert.ok(!/^[>|]/.test(m[1].trim()), 'description no puede ser un bloque YAML');
  assert.ok(m[1].includes('arreglá este bug'));
  assert.ok(m[1].includes('fix this bug'));
});

test('el piso fijo junta los cuatro disparadores en un solo lugar, con su porqué', () => {
  const t = read('SKILL.md');
  const par = t.split(/\n\s*\n/).find((p) => /migraciones|migrations/i.test(p));
  assert.ok(par, 'no hay párrafo con migraciones');
  for (const re of [/authentication|autenticación/i, /secrets|secretos/i, /deletion|borrado/i]) {
    assert.match(par, re, `el disparador ${re} no está junto a migraciones`);
  }
  assert.match(par, /never|nunca/i);
  assert.match(par, /because|since|so that|porque/i, 'falta el porqué del piso');
});

test('menciona el hilo principal y las razones nombrables de delegar', () => {
  const t = read('SKILL.md');
  assert.match(t, /hilo principal|main thread/i);
  assert.match(t, /parallel/i);
  assert.match(t, /independent/i);
});

test('describe los tres niveles y el aviso de árbol sucio sin imponerlo', () => {
  const t = read('SKILL.md');
  for (const re of [/small/i, /feature/i, /large|big/i, /card/i]) assert.match(t, re);
  assert.match(t, /commit/i);
  assert.match(t, /uncommitted|dirty/i);
  assert.match(t, /nothing here blocks/i); assert.match(t, /never impose/i);
});

test('sin documentos previos no se frena', () => {
  const par = read('SKILL.md').split(/\n\s*\n/).find((p) => p.includes('security.md'));
  assert.ok(par, 'no hay párrafo que mencione security.md');
  assert.match(par, /absent|missing/i, 'el párrafo no trata el caso de documentos ausentes');
  assert.match(par, /do not stop/i, 'el párrafo no dice que no se frena');
});

test('card.md lista los cuatro campos como ítems de lista', () => {
  const t = read('references', 'card.md');
  for (const re of [/archivos/i, /interfaces/i, /casos de prueba/i, /criterio de hecho/i]) {
    const line = t.split('\n').find((l) => /^\s*(?:[-*]|\d+\.)\s/.test(l) && re.test(l));
    assert.ok(line, `falta ítem de lista para ${re}`);
  }
});

test('SKILL.md menciona references/card.md y no pasa de 750 palabras', () => {
  const t = read('SKILL.md');
  assert.ok(t.includes('references/card.md'));
  assert.ok(t.split(/\s+/).filter(Boolean).length <= 750);
});
