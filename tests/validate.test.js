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

test('/code-review: no se invoca en un diff chico; en otro diff, desde el hilo principal, con su subagente aparte del tope', () => {
  const t = skill();
  assert.match(t, /\/security-review/);
  const par = paragraphs(t).find((p) => p.includes('/code-review'));
  assert.ok(par, 'falta el párrafo de /code-review');
  assert.match(par, /small diff is reviewed by you in the main thread and the native `\/code-review` is not invoked/);
  assert.match(par, /Any other diff invokes `\/code-review` from the main thread/);
  assert.match(par, /own subagent is counted apart from the cap of 5 and named in the cost line/);
});

test('Validado: se busca de la sesión más nueva hacia atrás; mismo sha con árbol limpio corta con "nada nuevo"', () => {
  const pars = paragraphs(skill());
  const list = pars.find((p) => p.startsWith('1. Search'));
  assert.ok(list, 'falta la lista de bases');
  assert.match(list, /newest-first/);
  assert.match(list, /first line matching/);
  assert.match(list, /equals HEAD and the working tree is clean ignoring `docs\/sessions\/` and `docs\/research\/`/);
  assert.match(list, /"nada nuevo desde <sha>" and stop: no fallback re-review/);
  assert.match(pars.find((p) => p.startsWith('Review base')), /untracked files \(`git status --porcelain`\)/);
  const after = pars.find((p) => p.startsWith('If any other base'));
  assert.ok(after, 'falta el párrafo de los otros casos');
  assert.match(after, /clean ignoring `docs\/sessions\/` and `docs\/research\/`; otherwise write nothing/);
});

test('la línea Frentes: se imprime plana, sin markdown ni backticks', () => {
  const par = paragraphs(skill()).find((p) => p.includes('Frentes:'));
  assert.match(par, /exactly one plain line \(no markdown, no backticks\)/);
});

test('fronts.md: code entra por más de 5 archivos o más de 200 líneas contando solo el diff', () => {
  const sec = read(DIR, 'references', 'fronts.md').split(/^## /m).find((s) => s.startsWith('code'));
  assert.ok(sec, 'falta la sección code');
  assert.match(sec, /more than 5 files or more than 200 changed lines, counted on the diff alone/);
  assert.ok(!/above the small limit/.test(sec), 'quedó el límite chico ambiguo');
});

test('fronts.md: todos los ejemplos "Frentes:" parsean y llevan ids válidos; ningún ejemplo afirma un tope sin evidencia', () => {
  const t = read(DIR, 'references', 'fronts.md');
  const sec = t.split(/^## /m).find((s) => s.startsWith('Worked examples'));
  assert.ok(sec, 'faltan los ejemplos resueltos');
  const examples = [...sec.matchAll(/`(Frentes:[^`]*)`/g)].map((m) => m[1]);
  assert.ok(examples.length >= 3, 'faltan ejemplos');
  for (const ex of examples) {
    const m = ex.match(FRONT_LINE);
    assert.ok(m, `no parsea: ${ex}`);
    for (const id of (m[1] || '').split(', ').filter(Boolean)) assert.ok(IDS.includes(id), `id no permitido ${id}`);
  }
  assert.ok(!/dropped by the cap/i.test(sec), 'el ejemplo afirma que docs cayó por el tope sin tener evidencia');
  assert.match(sec, /docs has no evidence/);
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

// ---- fix round 1 ----
const FRONT_LINE = /^Frentes:(?: ([a-z]+(?:, [a-z]+)*))?$/;

test('la línea Frentes: solo lleva ids permitidos; motivos y costo van después', () => {
  const t = skill();
  const examples = [...t.matchAll(/`(Frentes:[^`]*)`/g)].map((m) => m[1]);
  assert.ok(examples.length >= 2, 'faltan ejemplos de la línea');
  for (const ex of examples) {
    const m = ex.match(FRONT_LINE);
    assert.ok(m, `no parsea: ${ex}`);
    for (const id of (m[1] || '').split(', ').filter(Boolean)) assert.ok(IDS.includes(id), `id no permitido ${id}`);
  }
  const par = paragraphs(t).find((p) => p.includes('Frentes:'));
  assert.match(par, /only the (front )?ids/i);
  assert.match(par, /no reasons/i);
  assert.match(par, /(lines? )?after it|following lines/i);
  assert.match(par, /delegated/i);
});

test('diff chico definido: <=5 archivos y <=200 líneas, sin evidencia de seguridad; security sigue delegándose con evidencia', () => {
  const t = skill() + read(DIR, 'references', 'fronts.md');
  assert.match(t, /5 files/);
  assert.match(t, /200 (changed )?lines/);
  const par = paragraphs(skill()).find((p) => /5 files/.test(p));
  assert.ok(par, 'SKILL.md debe definir el diff chico');
  assert.match(par, /security/i);
  assert.match(par, /form|endpoint/i);
});

test('fronts.md: umbrales por frente con ejemplo negativo, prioridad y tres ejemplos resueltos', () => {
  const t = read(DIR, 'references', 'fronts.md');
  assert.ok((t.match(/Not enough:/g) || []).length >= 6, 'un ejemplo negativo (Not enough:) por frente');
  assert.match(t, /security, database, code, tests, hygiene, docs/);
  assert.match(t, /drop from the end|drop .* from the end/i);
  assert.ok(t.includes('Frentes: security, hygiene'));
  assert.ok(t.includes('Frentes: security, database, code, tests, hygiene'));
  assert.ok(/^Frentes:$/m.test(t) || t.includes('`Frentes:`'));
  assert.match(t, /never "always"|never always/i);
});

test('base del diff: ancestro, fecha más reciente, rama principal, árbol de trabajo, árbol limpio', () => {
  const t = skill() + read(DIR, 'references', 'fronts.md');
  assert.match(t, /merge-base --is-ancestor/);
  assert.match(t, /equals HEAD|empty diff|diff is empty/i);
  assert.match(t, /newest-first/i);
  assert.match(t, /origin\/HEAD/);
  assert.match(t, /init\.defaultBranch/);
  assert.match(t, /working tree/i);
  assert.match(t, /uncommitted/i);
  assert.match(t, /only when the working tree is clean/i);
  const par = paragraphs(skill()).find((p) => /not a git repo/i.test(p));
  assert.ok(par);
  assert.match(par, /no `?Validado:/i);
});
