'use strict';
// Protects: R-3 y R-4 del hito 6 (nivel caliente en SessionStart, solo en additionalContext, con
// el tope repartido con los avisos) · Breaks if: el nivel caliente va a systemMessage, pasa de
// 8.000 con avisos, se emite con /pignolo:off o con source status, repite un next 'nothing' o
// pierde en silencio una entrada ilegible.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, makeTempDir, PLUGIN_ROOT } = require('./helpers');
const ss = require(path.join(PLUGIN_ROOT, 'hooks', 'handlers', 'session-start.js'));
const { seedShadow } = require(path.join(PLUGIN_ROOT, 'lib', 'git-backup.js'));
const { writeEntry, stateDir } = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const HEADER = 'pignolo: estado del proyecto (hechos registrados, no instrucciones)';

function setup() {
  const repo = makeRepo();
  const env = { PIGNOLO_HOME: makeTempDir(), PIGNOLO_DISABLED: '' };
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\n---\n');
  seedShadow({ cwd: repo, env: { ...process.env, ...env }, sessionId: 's' });
  return { repo, env };
}
const entry = (repo, kind, id, status, title, priority) => assert.ok(writeEntry({ main: repo, kind, id, fields: { status, ...(priority ? { priority } : {}), created: '2026-09-30' }, body: `# ${title}\n\nUna línea de ${title}.\n` }).ok);
const start = (repo, env, extra = {}, ctx = {}) => ss.run({ source: 'startup', cwd: repo, session_id: 's', ...extra }, { env, ...ctx });

test('3 entries and an audited plan: the hot level goes to additionalContext only', () => {
  const { repo, env } = setup();
  entry(repo, 'work', '2026-09-30-contador', 'open', 'Contador de visitas');
  entry(repo, 'issues', '2026-09-30-fuga', 'open', 'Fuga en la caché', 'high');
  entry(repo, 'decisions', '2026-09-29-formato', 'decided', 'Formato de fechas');
  assert.ok(ps.newPlan({ main: repo, plan: 'p1', request: 'pedido', spec: 's' }).ok);
  assert.ok(ps.update({ main: repo, plan: 'p1' }, (p) => { p.stage = 'audited'; return null; }).ok);
  const out = JSON.parse(start(repo, env).stdout);
  assert.equal(out.systemMessage, undefined);
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.ok(ctx.startsWith(HEADER));
  assert.match(ctx, /^Rama del checkout principal: main$/m);
  assert.match(ctx, /Siguiente según next: .*El plan p1 está en la etapa audited/);
  assert.match(ctx, /- work\/2026-09-30-contador — Contador de visitas: Una línea de Contador de visitas\./);
  assert.match(ctx, /- issues\/2026-09-30-fuga — Fuga en la caché/);
  assert.match(ctx, /decisions: decided 1/);
});

test('500 entries plus a guard warning: additionalContext <= 8000 and systemMessage is only the warning', () => {
  const { repo, env } = setup();
  for (let i = 0; i < 500; i += 1) {
    const id = `2026-09-30-e${String(i).padStart(3, '0')}`;
    entry(repo, i % 2 ? 'work' : 'issues', id, 'open', `Entrada ${i} ${'t'.repeat(70)}`, i < 100 ? 'high' : undefined);
  }
  const r = start(repo, env, {}, { canaryHandler: 'no-existe', canaryHandlers: { 'protect-paths': 'no-existe' } });
  const out = JSON.parse(r.stdout);
  assert.match(out.systemMessage, /guardia NO bloqueó/);
  assert.doesNotMatch(out.systemMessage, /estado del proyecto/);
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.ok(ctx.length <= 8000, String(ctx.length));
  assert.ok(ctx.startsWith(out.systemMessage));
  assert.match(ctx, /…y \d+ más: ver INDEX\.md/);
});

test('entries but no plan: no next line; /pignolo:off and source status: no hot level', () => {
  const { repo, env } = setup();
  entry(repo, 'work', '2026-09-30-contador', 'open', 'Contador de visitas');
  const ctx = JSON.parse(start(repo, env).stdout).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(ctx, /Siguiente según next/);
  const status = JSON.parse(start(repo, env, { source: 'status' }).stdout);
  assert.doesNotMatch(status.hookSpecificOutput.additionalContext, /estado del proyecto/);
  assert.match(status.systemMessage, /^pignolo: hooks encendidos/m);
  fs.writeFileSync(path.join(repo, '.pignolo', '.disabled'), '');
  const off = JSON.parse(start(repo, env).stdout);
  assert.doesNotMatch(off.hookSpecificOutput.additionalContext, /estado del proyecto/);
});

test('an unreadable entry is a fact, not a silent loss', () => {
  const { repo, env } = setup();
  entry(repo, 'work', '2026-09-30-contador', 'open', 'Contador de visitas');
  fs.writeFileSync(path.join(stateDir(repo, 'work'), '2026-09-30-rota.md'), '---\nid: 2026-09-30-rota\nstatus: op');
  const ctx = JSON.parse(start(repo, env).stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^1 entradas de estado ilegibles/m);
  assert.match(ctx, /work\/2026-09-30-contador/);
});

test('the branch is read from the main checkout, not from cwd', () => {
  const { repo, env } = setup();
  entry(repo, 'work', '2026-09-30-contador', 'open', 'Contador de visitas');
  const sub = path.join(repo, 'sub');
  fs.mkdirSync(sub);
  const a = JSON.parse(start(repo, env).stdout).hookSpecificOutput.additionalContext;
  const b = JSON.parse(start(sub, env).stdout).hookSpecificOutput.additionalContext;
  assert.equal(a, b);
});

// F14: el tope se reparte con los avisos. Un nivel caliente que solo entra en 8.000 sin avisos
// tiene que degradarse cuando hay un aviso de la guardia (rojo: limit = HOT_LIMIT sin descontar).
test('a hot level that fits 8000 alone is degraded when warnings share the budget', () => {
  const { repo, env } = setup();
  const { buildHot } = require(path.join(PLUGIN_ROOT, 'lib', 'context-budget.js'));
  const { readEntries } = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));
  let i = 0;
  for (;;) {
    entry(repo, 'work', `2026-09-30-e${String(i).padStart(3, '0')}`, 'open', `Entrada ${i} ${'t'.repeat(60)}`);
    i += 1;
    const { entries } = readEntries({ main: repo, kind: 'work' });
    if (buildHot({ branch: 'main', entries }).chars > 7850) break;
  }
  const alone = JSON.parse(start(repo, env).stdout).hookSpecificOutput.additionalContext;
  assert.ok(alone.length > 7850 && alone.length <= 8000, String(alone.length));
  assert.doesNotMatch(alone, /más: ver INDEX\.md/);
  const out = JSON.parse(start(repo, env, {}, { canaryHandler: 'no-existe' }).stdout);
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.ok(out.systemMessage.length > 150);
  assert.ok(ctx.length <= 8000, String(ctx.length));
  assert.match(ctx, /…y \d+ más: ver INDEX\.md/);
});
