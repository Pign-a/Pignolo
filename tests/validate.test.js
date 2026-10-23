'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const DIR = path.join(PLUGIN, 'skills', 'validate');
const AGENTS = path.join(PLUGIN, 'agents');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const skill = () => read(DIR, 'SKILL.md');
const paragraphs = (t) => t.split(/\n\s*\n/);

function agent(id) {
  const t = read(AGENTS, `review-${id}.md`);
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, `review-${id}: sin frontmatter`);
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: m[2] };
}

const IDS = ['security', 'database', 'code', 'tests', 'hygiene', 'docs'];
const PAIRS = {
  security: ['sonnet', 'high'], database: ['sonnet', 'medium'], code: ['sonnet', 'medium'],
  tests: ['sonnet', 'medium'], hygiene: ['haiku', 'low'], docs: ['haiku', 'low'],
};

test('existen los seis agentes con su model/effort por defecto', () => {
  for (const id of IDS) {
    const { data } = agent(id);
    assert.strictEqual(data.name, `review-${id}`);
    assert.strictEqual(data.model, PAIRS[id][0], `${id}: model`);
    assert.strictEqual(data.effort, PAIRS[id][1], `${id}: effort`);
    assert.ok(data.description && data.description.length > 20, `${id}: description`);
  }
});

test('ningún agente declara Write ni Edit; tools va en una línea separada por comas', () => {
  for (const id of IDS) {
    const { data } = agent(id);
    assert.match(data.tools, /^(Read|Grep|Glob|Bash)(, (Read|Grep|Glob|Bash))*$/, `${id}: tools`);
    assert.ok(!/\b(Write|Edit)\b/.test(data.tools));
  }
});

test('los agentes piden todos los hallazgos con evidencia, sin filtrar por gravedad', () => {
  for (const id of IDS) {
    const { body } = agent(id);
    assert.match(body, /file:line/i, `${id}: pide evidencia file:line`);
    assert.match(body, /every finding|all findings/i, `${id}: pide todo`);
    assert.match(body, /severity/i, `${id}: aclara que no filtra por gravedad`);
  }
});

test('review-hygiene solo lista: nunca borra', () => {
  assert.match(agent('hygiene').body, /never delete|do not delete/i);
});

test('la description de la skill trae "validá" y "validate", en una línea', () => {
  const m = skill().match(/^description:[ \t]*(.*)$/m);
  assert.ok(m && m[1].trim().length > 20);
  assert.ok(m[1].includes('validá'));
  assert.ok(m[1].includes('validate'));
});

test('imprime una línea "Frentes:" con los ids permitidos, y la lista vacía', () => {
  const t = skill();
  assert.match(t, /Frentes: security, hygiene/);
  const par = paragraphs(t).find((p) => p.includes('Frentes:'));
  assert.ok(par);
  for (const id of IDS) assert.ok(par.includes(id), `falta ${id} junto a Frentes:`);
  assert.match(par, /empty/i, 'no trata la lista vacía');
});

test('tope de 5 agentes y diff chico en el hilo principal sin agentes', () => {
  const t = skill();
  assert.ok(paragraphs(t).find((p) => /\b5\b/.test(p) && /agent/i.test(p)), 'falta el tope 5');
  const par = paragraphs(t).find((p) => /small diff/i.test(p));
  assert.ok(par, 'falta el diff chico');
  assert.match(par, /main thread/i);
  assert.match(par, /no agents|without agents/i);
});

test('un frente solo entra con evidencia; security.md se lee semánticamente', () => {
  const t = skill();
  assert.match(t, /only .*evidence|evidence .*only/i);
  const par = paragraphs(t).find((p) => p.includes('security.md'));
  assert.ok(par);
  assert.match(par, /Spanish/);
  assert.match(par, /heading/i);
  assert.match(t, /sensitive/i);
  assert.match(t, /`?opus`?/);
  assert.match(t, /minimal/i, 'ofrece un security.md mínimo si falta');
});

test('las tres bases del diff en orden, la línea Validado: y funcionamiento sin remoto ni git', () => {
  const t = skill();
  assert.match(t, /Validado: <sha>/);
  assert.ok(t.includes('^Validado: ([0-9a-f]{7,40})'));
  assert.match(t, /docs\/sessions\//);
  const par = paragraphs(t).find((p) => /merge-base/i.test(p));
  assert.ok(par, 'no hay párrafo con merge-base');
  const iV = par.indexOf('Validado');
  const iM = par.search(/merge-base/i);
  const iL = par.search(/last commits/i);
  assert.ok(iV >= 0 && iV < iM && iM < iL, 'orden: Validado, merge-base, últimos commits');
  assert.match(t, /no (git )?remote/i);
  assert.match(t, /not a git repo/i);
});

test('/code-review y /security-review se invocan desde el hilo principal', () => {
  const t = skill();
  assert.match(t, /\/code-review/);
  assert.match(t, /\/security-review/);
  assert.match(paragraphs(t).find((p) => p.includes('/code-review')), /main thread/i);
});

test('la auditoría de interfaz no forma parte: se pide con ui-audit', () => {
  const par = paragraphs(skill()).find((p) => p.includes('ui-audit'));
  assert.ok(par);
  assert.match(par, /not part|is not/i);
});

test('se pide con "validá" o en un hito, nunca por tarea', () => {
  const t = skill();
  assert.match(t, /milestone/i);
  assert.match(t, /never per task/i);
});

test('fronts.md nombra los seis ids y schema.prisma en la fila de database', () => {
  const t = read(DIR, 'references', 'fronts.md');
  for (const id of IDS) assert.ok(t.includes(id), `falta ${id}`);
  const sec = paragraphs(t).find((p) => p.includes('schema.prisma'));
  assert.ok(sec && /database/.test(sec), 'schema.prisma no está junto a database');
  assert.match(sec, /migrations/);
});

test('SKILL.md apunta a references/fronts.md y no pasa de 750 palabras', () => {
  const t = skill();
  assert.ok(t.includes('references/fronts.md'));
  const body = t.replace(/^---\n[\s\S]*?\n---\n/, '');
  assert.ok(body.split(/\s+/).filter(Boolean).length <= 750);
});

test('ningún archivo del frente contiene valores de secretos', () => {
  const files = [path.join(DIR, 'SKILL.md'), path.join(DIR, 'references', 'fronts.md'),
    ...IDS.map((i) => path.join(AGENTS, `review-${i}.md`))];
  for (const f of files) assert.ok(!/(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,})/.test(read(f)));
});
