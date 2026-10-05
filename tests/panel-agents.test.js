'use strict';
// Detalle por agente del panel (parte pura, model.js y state.js): el orden, la densidad, las columnas, lo que hizo cada agente y a qué apuntó.
// El dibujo está en plugins/pignolo-panel/tests/panel.test.ts (claude plugin test).
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./helpers-panel-ui');

const NOW = 1_000_000;
let n = 0;
const ag = (o = {}) => {
  n += 1;
  return { id: 'a' + n, parentId: null, type: 'general-purpose', description: 'tarea ' + n, model: 'haiku', startedAt: NOW - 10_000, lastAt: NOW - 1_000, steps: 1, last: { kind: 'tool', name: 'Read', target: 'x.js' }, ctx: 1000, tokens: 1000, status: 'running', ...o };
};
const ids = (lay) => lay.entries.map((e) => e.agent.id);

test('layoutAgents: it is roomy (two lines and a gap per agent) when the block has 8 + 3 rows per agent, and compact one row less', async () => {
  const { layoutAgents, roomyRows } = await load('model.js');
  const list = [ag(), ag(), ag(), ag()];
  assert.strictEqual(roomyRows(4), 20);
  const roomy = layoutAgents(list, { rows: 20, cols: 80, now: NOW });
  assert.strictEqual(roomy.mode, 'roomy');
  assert.strictEqual(roomy.entries.length, 4);
  assert.strictEqual(roomy.rest, 0);
  assert.ok(roomy.entries.every((e) => e.lines === 2 && e.gapAfter === true));
  assert.strictEqual(layoutAgents(list, { rows: 19, cols: 80, now: NOW }).mode, 'compact');
});

test('layoutAgents: compact gives one line to each agent without warnings and a "rest" count for what does not fit', async () => {
  const { layoutAgents, compactRows } = await load('model.js');
  const list = Array.from({ length: 8 }, () => ag());
  const lay = layoutAgents(list, { rows: 12, cols: 80, now: NOW });
  assert.strictEqual(lay.mode, 'compact');
  assert.ok(lay.entries.every((e) => e.lines === 1));
  assert.strictEqual(lay.entries.length, 5);
  assert.strictEqual(lay.rest, 3);
  assert.ok(compactRows(lay.entries, lay.rest) <= 12);
  // con lugar para todos no hay resto
  const all = layoutAgents(list.slice(0, 6), { rows: 12, cols: 80, now: NOW });
  assert.strictEqual(all.mode, 'compact');
  assert.strictEqual(all.rest, 0);
  assert.strictEqual(all.entries.length, 6);
});

test('layoutAgents: agents that need attention keep two lines and are never dropped into the rest, even with no room', async () => {
  const { layoutAgents } = await load('model.js');
  const stalled = ag({ id: 'S', lastAt: NOW - 90_000 });
  const heavy = ag({ id: 'H', ctx: 156_000 });
  const list = [stalled, heavy, ...Array.from({ length: 6 }, () => ag())];
  const lay = layoutAgents(list, { rows: 8, cols: 80, now: NOW });
  assert.strictEqual(lay.mode, 'compact');
  assert.ok(ids(lay).includes('S') && ids(lay).includes('H'));
  for (const e of lay.entries.filter((x) => x.flags.attention)) assert.strictEqual(e.lines, 2);
  assert.strictEqual(lay.entries.filter((e) => !e.flags.attention).length + lay.rest, 6);
  // con algo de lugar entran algunos normales: el hueco va despues del grupo de avisos y el resto cuenta los que quedaron afuera
  const some = layoutAgents(list, { rows: 15, cols: 80, now: NOW });
  assert.deepStrictEqual([some.entries.length, some.rest], [5, 3]);
  assert.strictEqual(some.entries.filter((e) => e.gapAfter).length, 1);
  assert.strictEqual(some.entries.find((e) => e.gapAfter).agent.id, some.entries.filter((e) => e.flags.attention).pop().agent.id);
});

test('layoutAgents: a narrow block drops the model first, then the tokens, then the "hace n s"', async () => {
  const { layoutAgents } = await load('model.js');
  const at = (cols) => layoutAgents([ag()], { rows: 30, cols, now: NOW }).columns;
  assert.deepStrictEqual(at(60), { model: true, tokens: true, ago: true });
  assert.deepStrictEqual(at(59), { model: false, tokens: true, ago: true });
  assert.deepStrictEqual(at(53), { model: false, tokens: false, ago: true });
  assert.deepStrictEqual(at(47), { model: false, tokens: false, ago: false });
});

test('layoutAgents: attention first, then the most recently started', async () => {
  const { layoutAgents } = await load('model.js');
  const old = ag({ id: 'old', startedAt: 100_000 });
  const fresh = ag({ id: 'fresh', startedAt: 900_000 });
  const stalled = ag({ id: 'stalled', startedAt: 50_000, lastAt: NOW - 70_000 });
  assert.deepStrictEqual(ids(layoutAgents([old, fresh, stalled], { rows: 40, cols: 80, now: NOW })), ['stalled', 'fresh', 'old']);
});

test('layoutAgents: a nested agent goes right after its parent, and it is nested only when the parent is running', async () => {
  const { layoutAgents } = await load('model.js');
  const p = ag({ id: 'P', startedAt: 700_000 });
const r = ag({ id: 'R', startedAt: 500_000 });
  const q = ag({ id: 'Q', startedAt: 900_000 });
  const c = ag({ id: 'C', parentId: 'P', startedAt: 950_000 });
  const lay = layoutAgents([q, c, r, p], { rows: 40, cols: 80, now: NOW });
  assert.deepStrictEqual(ids(lay), ['Q', 'P', 'C', 'R']);
  assert.deepStrictEqual(lay.entries.map((e) => e.nested), [false, false, true, false]);
  const orphan = layoutAgents([ag({ id: 'X', parentId: 'gone' })], { rows: 40, cols: 80, now: NOW });
  assert.strictEqual(orphan.entries[0].nested, false);
  // un ciclo de padres no pierde a nadie ni se cuelga
  const a = ag({ id: 'A', parentId: 'B' });
  const b = ag({ id: 'B', parentId: 'A' });
  assert.strictEqual(layoutAgents([a, b], { rows: 40, cols: 80, now: NOW }).entries.length, 2);
});

test('layoutAgents: the summary has the count, the sum of tokens and the longest elapsed time', async () => {
  const { layoutAgents } = await load('model.js');
  const lay = layoutAgents([ag({ tokens: 1000, startedAt: NOW - 60_000 }), ag({ tokens: 2500, startedAt: NOW - 360_000 })], { rows: 40, cols: 80, now: NOW });
  assert.deepStrictEqual(lay.summary, { count: 2, tokens: 3500, longest: 360_000 });
});

test('agentFlags: stalled after more than 60 s without a step (or since the start), context high from 150000', async () => {
  const { agentFlags } = await load('model.js');
  assert.strictEqual(agentFlags(ag({ lastAt: NOW - 60_000 }), NOW).stalled, false);
  assert.strictEqual(agentFlags(ag({ lastAt: NOW - 60_001 }), NOW).stalled, true);
  assert.strictEqual(agentFlags(ag({ lastAt: null, startedAt: NOW - 61_000 }), NOW).stalled, true);
  assert.strictEqual(agentFlags(ag({ lastAt: null, startedAt: NOW - 5_000 }), NOW).stalled, false);
  assert.strictEqual(agentFlags(ag({ ctx: 149_999 }), NOW).ctxHigh, false);
  const hi = agentFlags(ag({ ctx: 150_000 }), NOW);
  assert.strictEqual(hi.ctxHigh, true);
  assert.strictEqual(hi.attention, true);
});

test('noteStep: it keeps the last tool use with its target, the context of the LAST step and when it ended', async () => {
  const { newRegistry, addAgent, noteStep } = await load('model.js');
  const reg = newRegistry();
  const rec = addAgent(reg, { id: 'x', type: 't', description: 'd', model: 'haiku', startedAt: 1, parentId: 'p' });
  assert.strictEqual(rec.parentId, 'p');
  assert.deepStrictEqual([rec.steps, rec.lastAt, rec.last, rec.ctx], [0, null, null, 0]);
  noteStep(rec, { toolUses: [{ name: 'Grep', input: { pattern: 'a' } }, { name: 'Read', input: { file_path: 'D:\\uno\\dos\\tres\\cuatro.js' } }], usage: { input_tokens: 100, cache_read_input_tokens: 200, cache_creation_input_tokens: 300, output_tokens: 5 } }, 5000);
  assert.deepStrictEqual(rec.last, { kind: 'tool', name: 'Read', target: 'tres/cuatro.js' });
  assert.strictEqual(rec.ctx, 600);
  assert.strictEqual(rec.lastAt, 5000);
  assert.strictEqual(rec.steps, 1);
  // un paso con texto y sin herramienta: escribe la respuesta; el contexto es el del ultimo paso, no la suma
  noteStep(rec, { toolUses: [], answer: 'hola', usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 0, output_tokens: 99 } }, 9000);
  assert.deepStrictEqual(rec.last, { kind: 'text' });
  assert.strictEqual(rec.ctx, 30);
  assert.strictEqual(rec.steps, 2);
  // forma rara: no tira
  noteStep(rec, { toolUses: 'basura', usage: 7 }, 10_000);
  noteStep(rec, null, 11_000);
  noteStep(undefined, {}, 11_000);
  assert.deepStrictEqual(rec.last, { kind: 'text' });
});

test('toolTarget: a path is cut to its last two segments, a command to 80 characters, and each tool gives its own target', async () => {
  const { toolTarget } = await load('model.js');
  assert.strictEqual(toolTarget('Read', { file_path: '/a/b/c/d.js' }), 'c/d.js');
  assert.strictEqual(toolTarget('Edit', { file_path: 'C:\\x\\y\\z.js' }), 'y/z.js');
  assert.strictEqual(toolTarget('Write', { file_path: 'solo.js' }), 'solo.js');
  assert.strictEqual(toolTarget('NotebookEdit', { notebook_path: '/n/m/cuaderno.ipynb' }), 'm/cuaderno.ipynb');
  const long = toolTarget('Bash', { command: 'x'.repeat(200) });
  assert.strictEqual(Array.from(long).length, 80);
  assert.ok(long.endsWith('…'));
  assert.strictEqual(toolTarget('PowerShell', { command: 'Get-ChildItem' }), 'Get-ChildItem');
  assert.strictEqual(toolTarget('Grep', { pattern: 'spawn' }), '"spawn"');
  assert.strictEqual(toolTarget('Grep', { pattern: 'spawn', path: '/r/plugins/' }), '"spawn" en r/plugins');
  assert.strictEqual(toolTarget('Glob', { pattern: '**/*.js', path: '/r/src' }), '**/*.js en r/src');
  assert.strictEqual(toolTarget('Agent', { description: 'buscar usos' }), 'buscar usos');
  assert.strictEqual(toolTarget('WebFetch', { url: 'https://ejemplo.org/x' }), 'https://ejemplo.org/x');
  assert.strictEqual(toolTarget('WebSearch', { query: 'node test' }), 'node test');
  assert.strictEqual(toolTarget('AlgunaOtra', { command: 'ls', file_path: '/a/b' }), '');
  assert.strictEqual(toolTarget('Bash', null), '');
  assert.strictEqual(toolTarget('Bash', { command: 42 }), '');
});

test('toolTarget: control and invisible characters and lone surrogates are drawn as ?, and the target stays one line', async () => {
  const { toolTarget } = await load('model.js');
  const t = toolTarget('Bash', { command: 'echo \u0007hola\u200b\nsegunda\u2028linea \ud800 fin' });
  assert.ok(!/[\u0000-\u001f\u200b\u2028\ud800]/.test(t), JSON.stringify(t));
  assert.ok(t.includes('?'));
  assert.ok(!t.includes('\n'));
  assert.strictEqual(toolTarget('Read', { file_path: '/a/\u202eb/c\u0000.js' }).includes('\u202e'), false);
  // cortar a 80 no parte un par sustituto (emoji)
  const e = toolTarget('Bash', { command: '😀'.repeat(100) });
  assert.strictEqual(Array.from(e).length, 80);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(e));
});

test('ago and the formats: hace 3 s, hace 2 min 10 s, 6,1 min, 14k', async () => {
  const { ago, minutesEs, kilo } = await load('model.js');
  assert.strictEqual(ago(3000), 'hace 3 s');
  assert.strictEqual(ago(130_000), 'hace 2 min 10 s');
  assert.strictEqual(ago(120_000), 'hace 2 min');
  assert.strictEqual(ago(-5), 'hace 0 s');
  assert.strictEqual(minutesEs(366_000), '6,1 min');
  assert.strictEqual(kilo(14_400), '14k');
  assert.strictEqual(kilo(800), '800');
  assert.strictEqual(kilo(0), '—');
});

test('readState: the agent detail of the sample is read and a weird or missing detail never throws', async () => {
  const { readState } = await load('state.js');
  const base = { schema: 'pignolo-panel-state/1' };
  const full = readState({ ...base, agents: [{ type: 't', description: 'd', model: 'haiku', minutes: 1, tokens: 5, id: 'z', parentId: 'y', ctx: 9, idleSec: 130, last: { name: 'Bash', target: 'npm test\u0007' } }] }).snap.agents[0];
  assert.deepStrictEqual([full.id, full.parentId, full.ctx, full.idleSec, full.last], ['z', 'y', 9, 130, { kind: 'tool', name: 'Bash', target: 'npm test?' }]);
  assert.deepStrictEqual(readState({ ...base, agents: [{ type: 't', last: { kind: 'text' } }] }).snap.agents[0].last, { kind: 'text' });
  // el registro real no trae estos campos
  const plain = readState({ ...base, agents: [{ type: 't', description: 'd', model: 'm', minutes: 1, tokens: 2 }] }).snap.agents[0];
  assert.deepStrictEqual([plain.id, plain.parentId, plain.ctx, plain.idleSec, plain.last], ['', '', 0, null, null]);
  const odd = readState({ ...base, agents: [{ type: 't', last: 5, ctx: 'abc', idleSec: 'x', parentId: { a: 1 }, id: [] }, { type: 't', last: { name: '' }, idleSec: null }, { type: 't', last: [] }] });
  assert.strictEqual(odd.kind, 'ok');
  assert.strictEqual(odd.snap.agents.length, 3);
  assert.deepStrictEqual([odd.snap.agents[0].last, odd.snap.agents[0].ctx, odd.snap.agents[0].idleSec], [null, 0, null]);
});

test('the demo sample has four running agents with the detail: one stalled, one nested and one with a high ctx', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { readState } = await load('state.js');
  const { demoView, layoutAgents, agentFlags } = await load('model.js');
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'pignolo-panel', 'sample', 'panel-state.json'), 'utf8'));
  const agents = readState(raw).snap.agents.map((a) => ({ ...a, status: 'running' }));
  assert.strictEqual(agents.length, 4);
  const views = agents.map((a, i) => demoView(a, NOW, i));
  const flags = views.map((v) => agentFlags(v, NOW));
  assert.deepStrictEqual(flags.map((f) => f.stalled), [true, false, false, false]);
  assert.deepStrictEqual(flags.map((f) => f.ctxHigh), [false, true, false, false]);
  const lay = layoutAgents(views, { rows: 40, cols: 94, now: NOW });
  assert.strictEqual(lay.mode, 'roomy');
  assert.strictEqual(lay.entries.filter((e) => e.nested).length, 1);
  assert.ok(views.every((v) => v.last && v.last.kind === 'tool'));
});
