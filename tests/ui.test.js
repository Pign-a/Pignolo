'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const DIR = path.join(PLUGIN, 'skills', 'ui');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const skill = () => read(DIR, 'SKILL.md');
const template = () => read(DIR, 'templates', 'index.html');
const paragraphs = (t) => t.split(/\n\s*\n/);

function agent() {
  const t = read(PLUGIN, 'agents', 'ui-option.md');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, 'ui-option: sin frontmatter');
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: m[2] };
}

// ---- plantilla index.html ----
test('la plantilla tiene el bloque de datos y las dos palabras de estado', () => {
  const t = template();
  assert.match(t, /<script id="data" type="application\/json">/);
  assert.ok(t.includes('decidido'));
  assert.ok(t.includes('pendiente'));
});

test('la plantilla abre con doble clic: sin fetch ni recursos remotos', () => {
  const t = template();
  assert.ok(!t.includes('fetch('));
  assert.ok(!t.includes('src="http'));
  assert.ok(!t.includes('href="http'));
  assert.ok(!/@import|fonts\.googleapis|url\(\s*["']?https?:/i.test(t), 'sin fuentes ni CSS remoto');
  assert.ok(!/XMLHttpRequest/.test(t));
});

test('el JSON embebido es válido, con las claves documentadas y los dos estados', () => {
  const m = template().match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no se encuentra el bloque de datos');
  const data = JSON.parse(m[1]);
  assert.ok(Array.isArray(data.pieces) && data.pieces.length >= 2);
  for (const p of data.pieces) {
    assert.strictEqual(typeof p.name, 'string');
    assert.ok(p.name.length > 0);
    assert.ok(['decidido', 'pendiente'].includes(p.status), `estado inválido ${p.status}`);
    assert.ok(Array.isArray(p.options));
    for (const o of p.options) {
      assert.match(o, /^options\/[a-z0-9-]+\/[a-z]\.html$/);
    }
  }
  const statuses = new Set(data.pieces.map((p) => p.status));
  assert.ok(statuses.has('decidido') && statuses.has('pendiente'), 'ejemplo de cada estado');
});

test('la plantilla lee el JSON y dibuja la lista con el resumen, y respeta claro/oscuro', () => {
  const t = template();
  assert.match(t, /getElementById\(['"]data['"]\)/);
  assert.match(t, /JSON\.parse/);
  assert.match(t, /prefers-color-scheme:\s*dark/);
  assert.match(t, /name="viewport"/);
  assert.match(t, /<meta charset="utf-8">/);
});

test('la plantilla evita los patrones prohibidos sin dirección de diseño', () => {
  const t = template();
  assert.ok(!/border-radius:\s*(999|9999)px/.test(t), 'sin botones en píldora');
  assert.ok(!/font-style:\s*italic/.test(t));
  assert.ok(!/monospace/i.test(t));
  assert.ok(!/\b0[1-3]\s*[\/.]/.test(t), 'sin etiquetas numeradas');
});

// ---- SKILL.md ----
test('la description trae las frases naturales, en una línea y entre comillas', () => {
  const m = skill().match(/^description:[ \t]*(.*)$/m);
  assert.ok(m && m[1].trim().length > 40);
  assert.ok(m[1].includes('definamos el diseño'));
  assert.ok(m[1].includes('design the screen'));
  assert.ok(m[1].trim().startsWith('"') && m[1].trim().endsWith('"'));
});

test('SKILL.md menciona el catálogo, el navegador, la ruta "interfaz primero" y sus references', () => {
  const t = skill();
  assert.ok(t.includes('design/components'));
  assert.ok(t.includes('index.html'));
  assert.ok(t.includes('interfaz primero'));
  for (const r of ['references/identity.md', 'references/catalog.md', 'references/options.md', 'templates/index.html']) {
    assert.ok(t.includes(r), `falta ${r}`);
  }
});

test('las tres opciones son solo para piezas grandes; un botón o un título no las llevan', () => {
  const par = paragraphs(skill()).find((p) => /three options/i.test(p) && /button/i.test(p));
  assert.ok(par, 'falta el párrafo de las tres opciones');
  assert.match(par, /only/i);
  for (const big of ['identity', 'nav', 'modal', 'sidebar', 'table']) {
    assert.match(par, new RegExp(big, 'i'), `falta pieza grande ${big}`);
  }
  assert.match(par, /button/i);
  assert.match(par, /title/i);
});

test('el estado decidido/pendiente vive en los datos embebidos y el agente regenera el index', () => {
  const t = skill();
  assert.match(t, /decidido/);
  assert.match(t, /pendiente/);
  assert.match(t, /regenerat/i);
  assert.match(t, /embedded/i);
});

test('el catálogo se reutiliza: nunca el calendario o el selector nativo; por convención, sin bloquear', () => {
  const t = skill();
  assert.match(t, /native/i);
  assert.match(t, /calendar/i);
  assert.match(t, /convention/i);
  assert.match(t, /ui-audit/);
  assert.match(t, /nothing blocks/i);
});

test('qué se diseña se deduce de roadmap.md; design.md conserva el nombre existente', () => {
  const t = skill();
  assert.match(t, /roadmap\.md/);
  assert.match(t, /DESIGN\.md/);
  assert.match(t, /design\.md/);
});

test('nada se publica fuera de la máquina', () => {
  assert.match(skill(), /never published|nothing is published|stays on the machine/i);
});

test('references: identity cubre estados y gusto; catalog la estructura; options la disciplina', () => {
  const id = read(DIR, 'references', 'identity.md');
  for (const w of ['palette', 'typography', 'animation', 'navigation', 'icons', 'hover', 'focus', 'disabled', 'loading']) {
    assert.match(id, new RegExp(w, 'i'), `identity: falta ${w}`);
  }
  assert.match(id, /roadmap\.md/);
  assert.match(id, /screenshots?/i);
  const cat = read(DIR, 'references', 'catalog.md');
  assert.ok(cat.includes('design/components'));
  assert.match(cat, /interfaz primero/);
  const op = read(DIR, 'references', 'options.md');
  assert.match(op, /a\.html/);
  assert.match(op, /ui-option/);
});

// ---- agente ----
test('ui-option: tools es exactamente Write; model y effort explícitos; sin claves prohibidas', () => {
  const { data } = agent();
  assert.strictEqual(data.name, 'ui-option');
  assert.strictEqual(data.tools, 'Write');
  assert.strictEqual(data.model, 'sonnet');
  assert.strictEqual(data.effort, 'medium');
  assert.ok(data.description && data.description.length > 20);
  for (const k of ['hooks', 'permissionMode', 'mcpServers']) assert.ok(!(k in data), `clave prohibida ${k}`);
});

test('ui-option: genera HTML estático sin scripts ni recursos remotos y no repite referencias del plugin viejo', () => {
  const { body } = agent();
  assert.match(body, /ONE option/);
  assert.match(body, /no scripts/i);
  assert.match(body, /no remote/i);
  assert.ok(!/canvas|publish|leak/i.test(body), 'sin restos del lienzo ni de la publicación');
});

// ---- fix round 1: el script de la plantilla distingue vacío de dañado ----
const vm = require('node:vm');

function runTemplate(dataText) {
  const html = template().replace(
    /(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}${dataText}${b}`);
  const scripts = [...html.matchAll(/<script(?![^>]*id="data")[^>]*>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1, 'un solo script en línea además del de datos');
  const mk = () => ({
    children: [], textContent: '', className: '', attrs: {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
  });
  const els = {};
  const document = {
    createElement: () => mk(),
    getElementById: (id) => {
      if (id === 'data') return { textContent: dataText };
      return (els[id] = els[id] || mk());
    },
  };
  vm.runInNewContext(scripts[0][1], { document, String, JSON, Array });
  const texts = [];
  const walk = (e) => { if (e.textContent) texts.push(e.textContent); e.children.forEach(walk); };
  walk(els.list);
  return texts.join('\n');
}

test('script de la plantilla: datos válidos dibujan las piezas', () => {
  const out = runTemplate('{"pieces":[{"name":"Navegación","status":"pendiente","options":["options/n/a.html"]}]}');
  assert.match(out, /Navegación/);
  assert.match(out, /pendiente/);
  assert.match(out, /Opción A/);
  assert.ok(!/Todavía no hay piezas/.test(out));
  assert.ok(!/dañados/.test(out));
});

test('script de la plantilla: "pieces": [] muestra el mensaje de lista vacía', () => {
  const out = runTemplate('{"pieces":[]}');
  assert.match(out, /Todavía no hay piezas/);
  assert.ok(!/dañados/.test(out));
});

test('script de la plantilla: un bloque dañado muestra el error y NO dice que no hay piezas', () => {
  const out = runTemplate('{"pieces":[{"name":"A","status":"decidido","options":[],}]}');
  assert.match(out, /dañados/);
  assert.match(out, /regenerar/);
  assert.ok(!/Todavía no hay piezas/.test(out), 'un registro dañado no es una lista vacía');
});

test('SKILL.md: al escribir el bloque de datos, `<` va como u003c escapado y se valida que parsee', () => {
  const t = skill();
  assert.ok(t.includes(String.fromCharCode(92) + 'u003c'));
  assert.match(t, /parses?/i);
});
