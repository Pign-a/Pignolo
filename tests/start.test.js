'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'plugins', 'pignolo', 'skills', 'start');
const read = (...p) => fs.readFileSync(path.join(DIR, ...p), 'utf8');
const TEMPLATES = ['CLAUDE.md', 'security.md', 'design.md', 'roadmap.md'];

test('SKILL.md menciona los cuatro documentos y las tres opciones de plan', () => {
  const t = read('SKILL.md');
  for (const f of ['security.md', 'CLAUDE.md', 'design.md', 'roadmap.md']) {
    assert.ok(t.includes(f), `falta ${f}`);
  }
  for (const o of ['punta a punta', 'por fases', 'interfaz primero']) {
    assert.ok(t.includes(o), `falta la opción ${o}`);
  }
});

test('la description trae las frases gatillo en español e inglés', () => {
  const m = read('SKILL.md').replace(/\r\n/g, '\n').match(/^description:\s*(.*)$/m);
  assert.ok(m, 'falta description');
  assert.ok(m[1].includes('tengo una idea'));
  assert.ok(m[1].includes('I have an idea'));
});

test('un archivo existente no se sobrescribe y se conserva el nombre de design.md/DESIGN.md', () => {
  const t = read('SKILL.md');
  assert.match(t, /never overwrit/i);
  assert.ok(t.includes('DESIGN.md') && t.includes('design.md'));
  assert.match(t, /keep the (existing|name)/i);
});

test('las plantillas existen y llevan fecha y origen', () => {
  for (const f of TEMPLATES) {
    const t = read('templates', f);
    assert.match(t, /Fecha/, `${f}: falta Fecha`);
    assert.match(t, /Origen/, `${f}: falta Origen`);
  }
});

test('security.md tiene sus secciones y roadmap.md sus fases', () => {
  const s = read('templates', 'security.md');
  for (const h of ['Datos', 'Usuarios', 'Superficie', 'Qué se protege']) {
    assert.ok(s.includes(h), `security.md: falta ${h}`);
  }
  const r = read('templates', 'roadmap.md');
  assert.match(r, /Fase/);
  assert.match(r, /próxima/i);
  assert.match(read('templates', 'design.md'), /Identidad/);
});

test('nada menciona cloud.md', () => {
  for (const f of ['SKILL.md', ...TEMPLATES.map((x) => path.join('templates', x))]) {
    assert.ok(!read(f).includes('cloud.md'), `${f} menciona cloud.md`);
  }
});
