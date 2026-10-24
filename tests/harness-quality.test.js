'use strict';
// Tests de la ampliación del arnés de medición de Pignolo 2 para una comparación de tres brazos: brazo sin plugin, panel de
// calidad automático, separación dev / validación con freeze, orden aleatorio y batch. Ninguno gasta tokens: el `claude` real se
// reemplaza por tests/fixtures/harness/fake-claude.mjs y tsc / eslint por scripts mínimos escritos en una carpeta temporal.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const HARNESS = path.join(__dirname, 'evals', 'harness');
const STUB = path.join(__dirname, 'fixtures', 'harness', 'fake-claude.mjs');
const imp = (f) => import(pathToFileURL(path.join(HARNESS, f)).href);

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
const put = (root, rel, content) => {
  const p = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

// tsc de juguete: cada línea de un .ts con "// ERR:<código>:<mensaje>" es un error, en el formato de `tsc --pretty false`.
const FAKE_TSC = `
import fs from 'node:fs';
import path from 'node:path';
if (process.env.FAKE_TOOL_LOG) fs.appendFileSync(process.env.FAKE_TOOL_LOG, JSON.stringify({ tool: 'tsc', cwd: process.cwd(), nm: fs.existsSync('node_modules/dep/index.js'), args: process.argv.slice(2) }) + '\\n');
if (process.env.FAKE_TSC_HANG) { setInterval(() => {}, 1000); } else {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) fs.readFileSync(p, 'utf8').split(/\\r?\\n/).forEach((l, i) => {
        const m = l.match(/\\/\\/ ERR:(\\d+):(.*)$/);
        if (m) out.push(path.relative('.', p).replace(/\\\\/g, '/') + '(' + (i + 1) + ',3): error TS' + m[1] + ': ' + m[2].trim());
      });
    }
  };
  walk('.');
  if (out.length) console.log(out.join('\\n'));
  process.exitCode = out.length ? 2 : 0;
}
`;
// eslint de juguete: lee los archivos que vienen después de "--"; "// LINT:error:<regla>" o "// LINT:warn:<regla>" son mensajes.
const FAKE_ESLINT = `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const at = args.indexOf('--');
const files = at >= 0 ? args.slice(at + 1) : [];
if (process.env.FAKE_TOOL_LOG) fs.appendFileSync(process.env.FAKE_TOOL_LOG, JSON.stringify({ tool: 'eslint', cwd: process.cwd(), files }) + '\\n');
const res = files.map((f) => {
  const p = path.resolve(f);
  const messages = [];
  fs.readFileSync(p, 'utf8').split(/\\r?\\n/).forEach((l, n) => {
    const m = l.match(/\\/\\/ LINT:(error|warn):([\\w-]+)/);
    if (m) messages.push({ ruleId: m[2], severity: m[1] === 'error' ? 2 : 1, message: 'x', line: n + 1 });
  });
  return { filePath: p, messages };
});
console.log(JSON.stringify(res));
process.exitCode = res.some((r) => r.messages.some((m) => m.severity === 2)) ? 1 : 0;
`;

// Entorno de juguete con tres brazos: N (sin plugin), S (superpowers) y P (pignolo).
function setup(over = {}, opts = {}) {
  const { tsconfig = true, eslintConfig = true, bin = false } = opts;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-harness3-'));
  const src = path.join(root, 'source');
  const priv = path.join(root, 'private');
  const work = path.join(root, 'work');
  fs.mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'user.name', 't');
  git(src, 'config', 'user.email', 't@example.invalid');
  git(src, 'config', 'core.autocrlf', 'false');
  put(src, 'package.json', '{"name":"toy","scripts":{"test":"node scripts/full.js"}}\n');
  put(src, '.gitignore', 'node_modules/\ngenerated/\n');
  if (tsconfig) put(src, 'tsconfig.json', '{}\n');
  if (eslintConfig) put(src, 'eslint.config.js', 'module.exports = [];\n');
  put(src, 'src/app.js', 'exports.hello = () => "hi";\n');
  put(src, 'src/base.ts', "// base file\nexport const a: number = 'x'; // ERR:2322:Type string is not assignable to type number\n");
  put(src, 'src/lint.js', 'exports.x = 1; // LINT:error:no-undef\n');
  put(src, 'src/untouched.js', 'exports.y = 1; // LINT:error:no-undef\n');
  put(src, 'scripts/full.js', 'console.log("# pass 3");\nconsole.log("# fail 0");\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'toy base');
  const base = git(src, 'rev-parse', 'HEAD');
  put(src, 'node_modules/dep/index.js', 'module.exports = 1;\n');
  put(src, 'generated/client/index.js', 'module.exports = "client";\n');

  const tools = path.join(root, 'tools');
  put(tools, 'fake-tsc.mjs', FAKE_TSC);
  put(tools, 'fake-eslint.mjs', FAKE_ESLINT);
  if (bin) {
    // Scripts en node_modules/.bin para que `npx tsc` los encuentre (en Windows, .cmd).
    for (const [name, script] of [['tsc', 'fake-tsc.mjs'], ['eslint', 'fake-eslint.mjs']]) {
      put(src, `node_modules/.bin/${name}.cmd`, `@echo off\r\n"${process.execPath}" "${path.join(tools, script)}" %*\r\n`);
      put(src, `node_modules/.bin/${name}`, `#!/bin/sh\nexec "${process.execPath}" "${path.join(tools, script)}" "$@"\n`);
      fs.chmodSync(path.join(src, 'node_modules', '.bin', name), 0o755);
    }
  }

  for (const task of ['t1', 't2']) {
    put(priv, `${task}/prompt.md`, 'Add a feature.\n');
    put(priv, `${task}/base.txt`, `${base}\n`);
    put(priv, `${task}/accept/check.js`,
      'const fs=require("fs");const p=process.argv[2];' +
      'if(p)fs.writeFileSync(p,JSON.stringify({numPassedTests:3,numFailedTests:0,numTotalTests:3}));' +
      'console.log("Tests  3 passed (3)");\n');
    put(priv, `${task}/accept-cmd.txt`, 'node check.js {json}\n');
    put(priv, `${task}/full-cmd.txt`, 'node scripts/full.js\n');
  }
  // Un archivo de aceptación con un error de tipos propio: no es del brazo y no debe contarse.
  put(priv, 't1/accept/types/acc.ts', 'export const z: number = 1; // ERR:9999:Error in the acceptance file\n');

  const plugins = {};
  for (const [dir, name] of [['sp', 'superpowers'], ['pg', 'pignolo']]) {
    put(root, `plugins/${dir}/.claude-plugin/plugin.json`, JSON.stringify({ name }));
    put(root, `plugins/${dir}/skills/x/SKILL.md`, `skill of ${name}\n`);
    plugins[name] = path.join(root, 'plugins', dir);
  }
  const cfg = {
    sourceRepo: src,
    privateRoot: priv,
    workRoot: work,
    configDir: path.join(root, 'cfgdir'),
    claudeBin: process.execPath,
    claudeArgsPrefix: [STUB],
    model: 'sonnet',
    permissionMode: 'bypassPermissions',
    perRunCapUsd: 5,
    totalCapUsd: 40,
    trackProcesses: false,
    extraEnvAllow: ['FAKE_CLAUDE_MODE', 'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_EXTRA_PLUGIN', 'FAKE_CLAUDE_VERSION', 'FAKE_TOOL_LOG', 'FAKE_TSC_HANG'],
    timeoutMs: 20000,
    acceptTimeoutMs: 20000,
    arms: {
      N: { pluginName: null, pluginDir: null },
      S: { pluginName: 'superpowers', pluginDir: plugins.superpowers },
      P: { pluginName: 'pignolo', pluginDir: plugins.pignolo },
    },
    contrasts: [{ control: 'N', test: 'S', label: 'S contra N' }, { control: 'N', test: 'P', label: 'P contra N' }, { control: 'S', test: 'P', label: 'P contra S' }],
    copyDirs: ['generated'],
    seed: 7,
    tasks: { t1: { kind: 'medium' }, t2: { kind: 'small' } },
    csvPath: path.join(root, 'runs.csv'),
    gradesPath: path.join(root, 'grades.json'),
    experiment: 'toy-exp',
    preregRepo: src,
    ...over,
  };
  if (!bin && !('tscCmd' in over)) cfg.tscCmd = [process.execPath, path.join(tools, 'fake-tsc.mjs')];
  if (!bin && !('eslintCmd' in over)) cfg.eslintCmd = [process.execPath, path.join(tools, 'fake-eslint.mjs'), '--format', 'json'];
  fs.mkdirSync(cfg.configDir, { recursive: true });
  const cfgPath = path.join(root, 'harness.local.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, src, priv, work, cfg, cfgPath, base, tools, plugins };
}
const cleanup = (env) => fs.rmSync(env.root, { recursive: true, force: true });
const runDir = (env, task, arm, rep) => path.join(env.work, `${task}-${arm}-${rep}`);

async function load(env) {
  const { loadConfig } = await imp('config.mjs');
  return loadConfig(env.cfgPath);
}
async function prepared(env, arm, rep = 1, task = 't1') {
  const cfg = await load(env);
  const { prepare } = await imp('prepare.mjs');
  await prepare(cfg, { task, arm, rep });
  return cfg;
}
// Lo que haría el agente en la copia de la corrida.
function agentEdits(env, arm, rep = 1, task = 't1') {
  const repo = path.join(runDir(env, task, arm, rep), 'repo');
  // Las líneas se corren (el error de base.ts cambia de número de línea), el mismo error se repite una vez y aparece uno nuevo.
  put(repo, 'src/base.ts', "// base file\n// added\n// added\nexport const a: number = 'x'; // ERR:2322:Type string is not assignable to type number\nexport const a2: number = 'y'; // ERR:2322:Type string is not assignable to type number\n");
  put(repo, 'src/new.ts', "export const b: string = 1; // ERR:2322:Type number is not assignable to type string\n");
  put(repo, 'src/lint.js', 'exports.x = 1; // LINT:error:no-undef\nexports.x2 = 1; // LINT:error:no-undef\nexports.x3 = 1; // LINT:warn:semi\n');
  put(repo, 'src/fresh.js', 'exports.f = 1; // LINT:error:eqeqeq\n');
  put(repo, 'src/other.js', 'exports.o = 1;\nexports.o2 = 2;\n');
  put(repo, 'src/new.test.js', "it('a', () => {});\ntest('b', () => {});\n  it.skip('c', () => {});\ndescribe('d', () => {});\n");
  return repo;
}
const GOLD = 'src/base.ts\nsrc/new.ts\nsrc/lint.js\nsrc/new.test.js\n';

// ---------------------------------------------------------------- brazo sin plugin

test('config: un brazo puede omitir pluginName y pluginDir (o ponerlos en null); uno solo de los dos se rechaza', async () => {
  const { loadConfig } = await imp('config.mjs');
  const env = setup();
  try {
    const cfg = await load(env);
    assert.strictEqual(cfg.arms.N.pluginName, null);
    assert.strictEqual(cfg.arms.N.pluginDir, null);
    const omitted = { ...env.cfg, arms: { N: {}, S: env.cfg.arms.S }, contrasts: undefined };
    fs.writeFileSync(env.cfgPath, JSON.stringify(omitted));
    assert.strictEqual(loadConfig(env.cfgPath).arms.N.pluginName, null);
    for (const bad of [{ pluginName: 'x' }, { pluginDir: '/some/dir' }]) {
      fs.writeFileSync(env.cfgPath, JSON.stringify({ ...env.cfg, arms: { N: bad, S: env.cfg.arms.S }, contrasts: undefined }));
      assert.throws(() => loadConfig(env.cfgPath), /van juntos/);
    }
    // Los ids N, S, P valen y los viejos A, B siguen valiendo.
    fs.writeFileSync(env.cfgPath, JSON.stringify({ ...env.cfg, arms: { A: env.cfg.arms.S, B: env.cfg.arms.P }, contrasts: undefined }));
    assert.deepStrictEqual(loadConfig(env.cfgPath).pairs, [['A', 'B']]);
  } finally { cleanup(env); }
});

test('config: contrasts acepta { control, test, label } o [control, test, label], valida los brazos y define los pares por defecto', async () => {
  const { loadConfig } = await imp('config.mjs');
  const env = setup();
  try {
    const cfg = await load(env);
    assert.deepStrictEqual(cfg.contrasts, [
      { control: 'N', test: 'S', label: 'S contra N' }, { control: 'N', test: 'P', label: 'P contra N' }, { control: 'S', test: 'P', label: 'P contra S' }]);
    assert.deepStrictEqual(cfg.pairs, [['N', 'S'], ['N', 'P'], ['S', 'P']]);
    fs.writeFileSync(env.cfgPath, JSON.stringify({ ...env.cfg, contrasts: [['N', 'P', 'con etiqueta'], ['S', 'P']], pairs: undefined }));
    const arr = loadConfig(env.cfgPath);
    assert.deepStrictEqual(arr.contrasts, [{ control: 'N', test: 'P', label: 'con etiqueta' }, { control: 'S', test: 'P', label: 'S contra P' }]);
    for (const bad of [[['N', 'Z']], [['N', 'N']], 'x', [{ control: 'N' }]]) {
      fs.writeFileSync(env.cfgPath, JSON.stringify({ ...env.cfg, contrasts: bad }));
      assert.throws(() => loadConfig(env.cfgPath), /contrasts/);
    }
    // El resumen expone los contrastes para el análisis.
    const { summarize } = await imp('summary.mjs');
    assert.deepStrictEqual(summarize([], { contrasts: cfg.contrasts }).contrasts, cfg.contrasts);
  } finally { cleanup(env); }
});

test('config: set de la tarea es dev (por defecto) o validation', async () => {
  const { loadConfig, taskSet } = await imp('config.mjs');
  const env = setup({ tasks: { t1: { kind: 'medium' }, t2: { kind: 'small', set: 'validation' } } });
  try {
    const cfg = loadConfig(env.cfgPath);
    assert.strictEqual(taskSet(cfg, 't1'), 'dev');
    assert.strictEqual(taskSet(cfg, 't2'), 'validation');
    fs.writeFileSync(env.cfgPath, JSON.stringify({ ...env.cfg, tasks: { t1: { kind: 'medium', set: 'test' } } }));
    assert.throws(() => loadConfig(env.cfgPath), /set debe ser/);
  } finally { cleanup(env); }
});

test('run: el brazo sin plugin no pasa --plugin-dir, no tiene activación y no cuenta como contaminada; la fila dice n/a', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'N');
    const { runTask, buildArgv } = await imp('execute.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    assert.ok(!buildArgv(cfg, 'N').includes('--plugin-dir'));
    assert.ok(buildArgv(cfg, 'S').includes('--plugin-dir'));
    const log = path.join(env.root, 'stub.json');
    const m = await withEnv({ FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_MODE: 'edit,neutral' }, () => runTask(cfg, { task: 't1', arm: 'N', rep: 1 }));
    assert.ok(!readJson(log).argv.includes('--plugin-dir'));
    assert.strictEqual(m.ownPluginLoaded, null);
    assert.strictEqual(m.activationVia, 'n/a');
    assert.strictEqual(m.ownSkillCalls, null);
    assert.strictEqual(m.ownHookRan, 'n/a');
    assert.strictEqual(m.contamination, false, 'los plugins incorporados son neutrales');
    assert.deepStrictEqual(m.invalidReasons, []);
    const row = appendRow(cfg, { task: 't1', arm: 'N', rep: 1 });
    const csv = parseCsv(read(cfg.csvPath))[0];
    assert.strictEqual(csv.activation_via, 'n/a');
    assert.strictEqual(csv.own_skill_calls, '');
    assert.strictEqual(csv.own_hook_ran, 'n/a');
    assert.strictEqual(row.invalid, false);
    // remetric (que relee el stream con la configuración actual) no cambia nada en el brazo sin plugin.
    const { remetricRun } = await imp('remetric.mjs');
    assert.deepStrictEqual(remetricRun(cfg, { task: 't1', arm: 'N', rep: 1 }).changed, []);
  } finally { cleanup(env); }
});

test('run: en el brazo sin plugin, cualquier plugin cargado que no sea neutral contamina (también los de los otros brazos)', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'N', 1);
    await prepared(env, 'N', 2);
    const { runTask } = await imp('execute.mjs');
    const mystery = await withEnv({ FAKE_CLAUDE_MODE: 'edit,contaminated', FAKE_CLAUDE_EXTRA_PLUGIN: 'mystery-plugin' }, () => runTask(cfg, { task: 't1', arm: 'N', rep: 1 }));
    assert.ok(mystery.invalidReasons.includes('contaminated'));
    assert.deepStrictEqual(mystery.contaminationHits, ['plugin:mystery-plugin']);
    const sp = await withEnv({ FAKE_CLAUDE_MODE: 'edit,contaminated', FAKE_CLAUDE_EXTRA_PLUGIN: 'superpowers' }, () => runTask(cfg, { task: 't1', arm: 'N', rep: 2 }));
    assert.ok(sp.invalidReasons.includes('contaminated'));
    assert.ok(sp.contaminationHits.includes('plugin:superpowers'));
    assert.ok(!sp.invalidReasons.includes('own_plugin_not_loaded'), 'no hay plugin propio que cargar');
  } finally { cleanup(env); }
});

test('parseStream: con tres brazos, los plugins de los otros dos brazos contaminan el brazo de un plugin', async () => {
  const { parseStream } = await imp('metrics.mjs');
  const init = (plugins, skills = []) => JSON.stringify({ type: 'system', subtype: 'init', plugins: plugins.map((name) => ({ name })), skills, agents: [], slash_commands: [] });
  const others = [{ name: 'superpowers', dir: '/x/sp' }, { name: 'pignolo', dir: '/x/pg' }];
  const clean = parseStream(init(['pignolo']), { ownPlugin: 'pignolo', otherPlugins: others });
  assert.strictEqual(clean.contamination, false);
  assert.strictEqual(parseStream(init(['pignolo', 'superpowers']), { ownPlugin: 'pignolo', otherPlugins: others }).contamination, true);
  const bySkill = parseStream(init(['pignolo'], ['superpowers:brainstorming']), { ownPlugin: 'pignolo', otherPlugins: others });
  assert.deepStrictEqual(bySkill.contaminationHits, ['skill:superpowers:brainstorming']);
  assert.strictEqual(parseStream('', { ownPlugin: null, otherPlugins: others }).contaminationHits.includes('own_plugin_not_loaded'), false);
  // Sin plugin propio: los neutrales (patrón o contenido sincronizado de la cuenta) no contaminan, cualquier otro sí.
  const none = { ownPlugin: null, otherPlugins: others, neutralPluginNames: ['acme-tools'] };
  assert.strictEqual(parseStream(init(['cc-plugin-telemetry', 'acme-tools']), none).contamination, false);
  assert.deepStrictEqual(parseStream(init(['cc-plugin-telemetry', 'mystery@market']), none).contaminationHits, ['plugin:mystery@market']);
});

test('run: el chequeo previo de configDir también aplica al brazo sin plugin', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'N');
    fs.writeFileSync(path.join(cfg.configDir, 'CLAUDE.md'), 'memoria\n');
    const { runTask } = await imp('execute.mjs');
    await assert.rejects(() => runTask(cfg, { task: 't1', arm: 'N', rep: 1 }), /configDir contaminado/);
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'N', 1), 'stream.jsonl')), 'no se gastó nada');
  } finally { cleanup(env); }
});

test('summary: un par puede nombrar cualquier brazo; la activación solo cuenta a los brazos con plugin', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const row = (arm, rep, tokens, own) => ({
    experiment: 'x', task: 'm', arm, rep, timestamp: `2026-10-23T00:00:0${rep}Z`, cost_usd: tokens / 1000, weighted_tokens: tokens, wall_s: 60, turns: 5, agents: 1,
    skill_calls: 0, own_skill_calls: own, own_hook_ran: 'n/a', activation_via: own === null ? 'n/a' : 'skill_tool', result_subtype: 'success', is_error: false, exit_code: 0,
    invalid: false, invalid_reason: '', accept_exit: 0, accept_pass: 3, accept_fail: 0, accept_suites_failed: 0, timed_out: false, contamination: false, note: '',
  });
  const rows = [row('N', 1, 100, null), row('N', 2, 110, null), row('S', 1, 120, 1), row('S', 2, 125, 2), row('P', 1, 90, 1), row('P', 2, 95, 0)];
  const res = summarize(rows, { kinds: { m: 'medium' }, pairs: [['N', 'S'], ['N', 'P'], ['S', 'P']], contrasts: [] });
  assert.deepStrictEqual(res.tasks.map((t) => t.pair), [['N', 'S'], ['N', 'P'], ['S', 'P']]);
  const ns = res.tasks[0];
  assert.deepStrictEqual(ns.activation.N, { n: 0, m: 0 }, 'sin plugin: ni activó ni dejó de activar');
  assert.deepStrictEqual(ns.activation.S, { n: 2, m: 2 });
  assert.ok(!ns.activationNotes.some((n) => /brazo N/.test(n)));
  assert.match(formatSummary(res), /\[par N contra P\]/);
});

// ---------------------------------------------------------------- panel de calidad

test('quality: tsc cuenta errores nuevos (resultado menos base, sin números de línea) y no cuenta los archivos de aceptación', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'P');
    agentEdits(env, 'P');
    put(env.priv, 't1/gold-files.txt', GOLD);
    const { acceptRun } = await imp('accept.mjs');
    const logf = path.join(env.root, 'tools.log');
    const acc = await withEnv({ FAKE_TOOL_LOG: logf }, () => acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 }));
    assert.ok(acc.quality && !acc.quality.error, JSON.stringify(acc.quality));
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.tsc.baseErrors, 1);
    assert.strictEqual(q.tsc.resultErrors, 3, 'base.ts x2 y new.ts; el archivo de aceptación no cuenta');
    assert.strictEqual(q.tsc.newErrors, 2, 'un error repetido y uno nuevo; el que solo cambió de línea no cuenta');
    assert.ok(q.tsc.newList.every((k) => !/\(\d+,\d+\)/.test(k) && /^src\/.*\(TS\d+,/.test(k)), `formato file(code,message): ${q.tsc.newList}`);
    assert.strictEqual(q.tsc.ignoredAcceptFileErrors, 1);
    // base: copia desechable dentro de la corrida, con node_modules enlazado; se borra al terminar.
    const calls = read(logf).trim().split('\n').map((l) => JSON.parse(l)).filter((c) => c.tool === 'tsc');
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.some((c) => c.cwd.includes('quality-base') && c.nm), 'el base corre con node_modules enlazado');
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'P', 1), 'quality-base')), 'la copia del base se borra');
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'P', 1), 'quality-tmp')));
    // La fuente y la copia de node_modules quedan como estaban.
    assert.strictEqual(git(env.src, 'status', '--porcelain'), '');
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'dep', 'index.js')));
  } finally { cleanup(env); }
});

test('quality: eslint mide solo los archivos de código cambiados, por regla y archivo, contra el base', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'P');
    agentEdits(env, 'P');
    const { acceptRun } = await imp('accept.mjs');
    const logf = path.join(env.root, 'tools.log');
    await withEnv({ FAKE_TOOL_LOG: logf }, () => acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 }));
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.eslint.newErrors, 2, 'no-undef repetido en lint.js (+1) y eqeqeq en el archivo nuevo (+1); lo viejo y lo de untouched.js no cuenta');
    assert.strictEqual(q.eslint.newWarnings, 1);
    assert.ok(q.eslint.newList.includes('error no-undef|src/lint.js') && q.eslint.newList.includes('error eqeqeq|src/fresh.js'));
    const calls = read(logf).trim().split('\n').map((l) => JSON.parse(l)).filter((c) => c.tool === 'eslint');
    const linted = new Set(calls.flatMap((c) => c.files));
    assert.ok(linted.has('src/lint.js') && linted.has('src/fresh.js') && linted.has('src/new.ts'));
    assert.ok(!linted.has('src/untouched.js'), 'solo lo que cambió');
    assert.ok(![...linted].some((f) => /check\.js|acc\.ts/.test(f)), 'los archivos de aceptación no se miden');
    const baseCall = calls.find((c) => c.cwd.includes('quality-base'));
    assert.ok(baseCall && baseCall.files.includes('src/lint.js') && !baseCall.files.includes('src/fresh.js'), 'en el base solo lo que existía');
  } finally { cleanup(env); }
});

test('quality: alcance contra gold-files.txt, tamaño del diff y archivos de test agregados', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'P');
    agentEdits(env, 'P');
    put(env.priv, 't1/gold-files.txt', `# archivos de la solución real\n${GOLD}\n`);
    const { acceptRun } = await imp('accept.mjs');
    await acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 });
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.scope.outOfScopeFiles, 2, 'fresh.js y other.js');
    assert.deepStrictEqual([...q.scope.files].sort(), ['src/fresh.js', 'src/other.js']);
    assert.strictEqual(q.scope.outOfScopeLines, 3, 'una línea de fresh.js y dos de other.js');
    const changes = readJson(path.join(runDir(env, 't1', 'P', 1), 'changes.json'));
    assert.strictEqual(q.diff.files, changes.filesChanged);
    assert.strictEqual(q.diff.lines, changes.linesAdded + changes.linesRemoved);
    assert.strictEqual(q.tests.newTestFiles, 1);
    assert.deepStrictEqual(q.tests.newTestFileNames, ['src/new.test.js']);
    assert.strictEqual(q.tests.testsAdded, 3, 'it, test e it.skip; describe no cuenta');
    assert.strictEqual(q.coverage, null);
    assert.strictEqual(q.mutation, null);
    // Sin gold-files.txt el alcance es null y queda anotado.
    fs.rmSync(path.join(env.priv, 't1', 'gold-files.txt'));
    const { qualityRun } = await imp('quality.mjs');
    const again = await qualityRun(cfg, { task: 't1', arm: 'P', rep: 1 });
    assert.strictEqual(again.scope.outOfScopeFiles, null);
    assert.strictEqual(again.columns.out_of_scope_lines, null);
    assert.ok(again.notes.includes('scope:sin_gold_files'));
  } finally { cleanup(env); }
});

test('quality: sin tsconfig ni configuración de eslint hay notas claras (no un fallo) y las columnas del CSV quedan vacías', async () => {
  const env = setup({}, { tsconfig: false, eslintConfig: false });
  try {
    const cfg = await load(env);
    const noTools = { ...cfg, tscCmd: null, eslintCmd: null };
    const { prepare } = await imp('prepare.mjs');
    await prepare(noTools, { task: 't1', arm: 'P', rep: 1 });
    agentEdits(env, 'P');
    const { acceptRun } = await imp('accept.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const acc = await acceptRun(noTools, { task: 't1', arm: 'P', rep: 1 });
    assert.ok(!acc.quality.error);
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.deepStrictEqual(q.skipped, { tsc: 'sin_tsconfig', eslint: 'sin_config_eslint', scope: 'sin_gold_files' });
    assert.strictEqual(q.tsc.newErrors, null);
    assert.strictEqual(q.eslint.newErrors, null);
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'P', 1), 'quality-base')), 'sin herramientas no se arma el base');
    // La métrica de diff y de tests igual está.
    assert.strictEqual(q.tests.testsAdded, 3);
    // metrics.json mínimo para poder escribir la fila.
    fs.writeFileSync(path.join(runDir(env, 't1', 'P', 1), 'metrics.json'), JSON.stringify({ task: 't1', arm: 'P', rep: 1, experiment: 'toy-exp', finishedAt: '2026-10-23T12:00:00.000Z', invalidReasons: [] }));
    appendRow(noTools, { task: 't1', arm: 'P', rep: 1 });
    const r = parseCsv(read(noTools.csvPath))[0];
    assert.strictEqual(r.tsc_new_errors, '');
    assert.strictEqual(r.quality_note, 'scope:sin_gold_files;tsc:sin_tsconfig;eslint:sin_config_eslint');
    assert.strictEqual(r.tests_added, '3');
    assert.strictEqual(r.new_test_files, '1');
    assert.strictEqual(r.diff_files, String(readJson(path.join(runDir(env, 't1', 'P', 1), 'changes.json')).filesChanged));
  } finally { cleanup(env); }
});

test('quality: con tsconfig pero sin tsc instalado, la nota lo dice; el comando por defecto es "npx tsc --noEmit --pretty false"', async () => {
  const env = setup({}, { eslintConfig: false, bin: false });
  try {
    const cfg = { ...(await load(env)), tscCmd: null, eslintCmd: null };
    const { prepare } = await imp('prepare.mjs');
    await prepare(cfg, { task: 't1', arm: 'P', rep: 1 });
    agentEdits(env, 'P');
    const { acceptRun } = await imp('accept.mjs');
    await acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 });
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.skipped.tsc, 'tsc_no_instalado');
  } finally { cleanup(env); }
});

test('quality: con tsc y eslint en node_modules/.bin se corren por npx con los argumentos del contrato', async () => {
  const env = setup({}, { bin: true });
  try {
    const cfg = await load(env);
    assert.strictEqual(cfg.tscCmd, null);
    const { prepare } = await imp('prepare.mjs');
    await prepare(cfg, { task: 't1', arm: 'P', rep: 1 });
    agentEdits(env, 'P');
    const { acceptRun } = await imp('accept.mjs');
    const logf = path.join(env.root, 'tools.log');
    await withEnv({ FAKE_TOOL_LOG: logf }, () => acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 }));
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.tsc.newErrors, 2, JSON.stringify(q.skipped));
    assert.strictEqual(q.eslint.newErrors, 2, JSON.stringify(q.skipped));
    const calls = read(logf).trim().split('\n').map((l) => JSON.parse(l));
    assert.deepStrictEqual(calls.find((c) => c.tool === 'tsc').args, ['--noEmit', '--pretty', 'false']);
    assert.deepStrictEqual(calls.find((c) => c.tool === 'eslint').files.slice(0, 1).length, 1);
  } finally { cleanup(env); }
});

test('quality: un tsc que no termina (qualityTimeoutMs) deja esas cifras en null con su nota y el resto sigue', async () => {
  const env = setup({ qualityTimeoutMs: 1500 });
  try {
    const cfg = await prepared(env, 'P');
    agentEdits(env, 'P');
    const { acceptRun } = await imp('accept.mjs');
    const acc = await withEnv({ FAKE_TSC_HANG: '1' }, () => acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 }));
    assert.ok(!acc.quality.error);
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.tsc.newErrors, null);
    assert.ok(q.notes.some((n) => /^tsc:.*tiempo_agotado/.test(n)), q.notes.join(';'));
    assert.strictEqual(q.eslint.newErrors, 2, 'eslint no se ve afectado');
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'P', 1), 'quality-base')));
  } finally { cleanup(env); }
});

test('quality: coverage-cmd.txt y mutation-cmd.txt escriben el JSON documentado; sin comando o con JSON inválido queda null', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'P');
    agentEdits(env, 'P');
    put(env.priv, 't1/coverage-cmd.txt', `node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({linesCovered: 80, linesTotal: 100}))" {json}\n`);
    put(env.priv, 't1/mutation-cmd.txt', `node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({killed: 7}))" {json}\n`);
    const { acceptRun } = await imp('accept.mjs');
    await acceptRun(cfg, { task: 't1', arm: 'P', rep: 1 });
    const q = readJson(path.join(runDir(env, 't1', 'P', 1), 'quality.json'));
    assert.strictEqual(q.coverage.linesCovered, 80);
    assert.strictEqual(q.coverage.linesTotal, 100);
    assert.strictEqual(q.mutation, null, 'al JSON le faltan survived y timeout');
    assert.ok(q.notes.includes('mutation:sin_json_valido'));
    assert.strictEqual(q.columns.coverage_lines_covered, 80);
    assert.strictEqual(q.columns.mutation_killed, null);
    put(env.priv, 't1/mutation-cmd.txt', `node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({killed: 7, survived: 2, timeout: 1}))" {json}\n`);
    const { qualityRun } = await imp('quality.mjs');
    const again = await qualityRun(cfg, { task: 't1', arm: 'P', rep: 1 });
    assert.deepStrictEqual([again.columns.mutation_killed, again.columns.mutation_survived, again.columns.mutation_timeout], [7, 2, 1]);
  } finally { cleanup(env); }
});

test('CLI: quality se corre aparte, se niega sin accept y accept lo corre solo', async () => {
  const env = setup();
  try {
    await prepared(env, 'P');
    agentEdits(env, 'P');
    const RUN = path.join(HARNESS, 'run.mjs');
    const cli = (...args) => spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], { encoding: 'utf8', env: { ...process.env, FAKE_CLAUDE_MODE: 'edit' } });
    const early = cli('quality', '--task', 't1', '--arm', 'P', '--rep', '1');
    assert.notStrictEqual(early.status, 0);
    assert.match(early.stderr, /corré accept primero/);
    const acc = cli('accept', '--task', 't1', '--arm', 'P', '--rep', '1');
    assert.strictEqual(acc.status, 0, acc.stderr);
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'P', 1), 'quality.json')), 'accept dejó el panel');
    const q = cli('quality', '--task', 't1', '--arm', 'P', '--rep', '1');
    assert.strictEqual(q.status, 0, q.stderr);
    assert.strictEqual(JSON.parse(q.stdout).tsc.newErrors, 2);
  } finally { cleanup(env); }
});

test('summary: el bloque de calidad imprime medianas y rangos y el costo por tarea resuelta usa la tarea como unidad', async () => {
  const { summarize, formatSummary, costPerSolved } = await imp('summary.mjs');
  const row = (task, arm, rep, cost, green, q = {}) => ({
    experiment: 'x', task, arm, rep, timestamp: `2026-10-23T00:00:0${rep}Z`, cost_usd: cost, weighted_tokens: cost * 1000, wall_s: 60, turns: 5, agents: 1,
    skill_calls: 0, own_skill_calls: null, own_hook_ran: 'n/a', result_subtype: 'success', is_error: false, exit_code: 0, invalid: false, invalid_reason: '',
    accept_exit: green ? 0 : 1, accept_pass: green ? 3 : 1, accept_fail: green ? 0 : 2, accept_suites_failed: 0, timed_out: false, contamination: false, note: '',
    lines_added: 10, lines_removed: 2, ...q,
  });
  const rows = [
    row('a', 'N', 1, 1, true, { tsc_new_errors: 0, eslint_new_errors: 1, out_of_scope_files: 0, diff_lines: 12, tests_added: 2 }),
    row('a', 'N', 2, 1, true, { tsc_new_errors: 2, eslint_new_errors: 3, out_of_scope_files: 1, diff_lines: 20, tests_added: 0 }),
    row('b', 'N', 1, 2, false),
    row('b', 'N', 2, 2, false),
    row('a', 'P', 1, 3, true), row('a', 'P', 2, 3, false), // 1 de 2 verdes: no es más de la mitad
    row('b', 'P', 1, 3, true), row('b', 'P', 2, 3, true),
  ];
  const res = summarize(rows, { kinds: { a: 'small', b: 'small' }, pairs: [['N', 'P']], sets: { a: 'dev', b: 'validation' } });
  const a = res.tasks.find((t) => t.task === 'a');
  assert.deepStrictEqual(a.arms.N.quality.tsc_new_errors, { median: 1, min: 0, max: 2, n: 2 });
  assert.deepStrictEqual(a.arms.N.quality.diff_lines, { median: 16, min: 12, max: 20, n: 2 });
  assert.strictEqual(a.arms.P.quality.tsc_new_errors, null, 'sin dato');
  assert.strictEqual(a.arms.N.quality.diff_lines.n, 2);
  assert.strictEqual(a.arms.P.quality.diff_lines.median, 12, 'sin diff_lines usa lines_added + lines_removed');
  const text = formatSummary(res);
  assert.match(text, /calidad automática \(mediana y rango\): tsc_new_errors 1 \(0 a 2\); eslint_new_errors 2 \(1 a 3\); out_of_scope_files 0\.5 \(0 a 1\); diff_lines 16 \(12 a 20\); tests_added 1 \(0 a 2\)/);
  // N: costo 6 en total y resuelve a (2 de 2 verdes) pero no b: 6 USD / 1 tarea. P: 12 USD; a no (1 de 2), b sí: 12 / 1.
  assert.strictEqual(res.costPerSolved.arms.N.costTotal, 6);
  assert.strictEqual(res.costPerSolved.arms.N.tasksSolved, 1);
  assert.strictEqual(res.costPerSolved.arms.N.costPerSolved, 6);
  assert.strictEqual(res.costPerSolved.arms.P.tasksSolved, 1);
  assert.strictEqual(res.costPerSolved.arms.P.costPerSolved, 12);
  assert.deepStrictEqual(Object.keys(res.costPerSolved.bySet).sort(), ['dev', 'validation']);
  assert.strictEqual(res.costPerSolved.bySet.validation.P.costPerSolved, 6);
  assert.match(text, /costo por tarea resuelta[\s\S]*N: 6 USD por tarea resuelta \(6 USD \/ 1 de 2 tareas resueltas\)/);
  assert.match(text, /\[validación\]/);
  // Sin tareas resueltas no se divide por cero.
  assert.strictEqual(costPerSolved([row('b', 'N', 1, 2, false)]).arms.N.costPerSolved, null);
});

// ---------------------------------------------------------------- freeze

const validationCfg = (env, extra = {}) => ({ ...env.cfg, tasks: { t1: { kind: 'medium', set: 'validation' }, t2: { kind: 'small' } }, ...extra });
const writeCfg = (env, over) => fs.writeFileSync(env.cfgPath, JSON.stringify(over));

test('freeze: escribe freeze.json con el hash de las tareas de validación y la identidad de los brazos, y --check lo verifica sin escribir', async () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const cfg = await load(env);
    const { freeze, verifyFreeze, hashOf, freezePath } = await imp('freeze.mjs');
    const r = freeze(cfg, { prereg: env.base.slice(0, 10) });
    assert.strictEqual(r.preregCommit, env.base);
    const f = readJson(freezePath(cfg));
    assert.strictEqual(f.freezeHash, hashOf(f.body));
    assert.strictEqual(f.preregCommit, env.base);
    assert.ok(!Number.isNaN(Date.parse(f.createdAt)));
    assert.deepStrictEqual(Object.keys(f.body.tasks), ['t1'], 'solo las tareas de validación');
    assert.deepStrictEqual(Object.keys(f.body.tasks.t1.files).sort(), ['accept-cmd.txt', 'accept/check.js', 'accept/types/acc.ts', 'base.txt', 'full-cmd.txt', 'prompt.md']);
    assert.strictEqual(f.body.tasks.t1.baseCommit, env.base);
    assert.strictEqual(f.body.claudeVersion, '9.9.9-fake (Claude Code)');
    assert.strictEqual(f.body.model, 'sonnet');
    assert.strictEqual(f.body.effort, 'medium');
    assert.deepStrictEqual(Object.keys(f.body.arms), ['N', 'S', 'P']);
    assert.strictEqual(f.body.arms.N.plugin.kind, 'none');
    assert.match(f.body.arms.S.plugin.contentHash || f.body.arms.S.plugin.treeHash, /^[0-9a-f]{64}$|^[0-9a-f]{40}$/);
    const before = read(freezePath(cfg));
    const v = verifyFreeze(cfg);
    assert.strictEqual(v.ok, true, v.problems.join('; '));
    assert.strictEqual(v.freezeHash, f.freezeHash);
    assert.strictEqual(read(freezePath(cfg)), before, 'verificar no escribe');
    // El hash no cambia si se recalcula desde cero.
    assert.strictEqual(freeze(cfg, { prereg: env.base, force: true }).freezeHash, f.freezeHash);
  } finally { cleanup(env); }
});

test('freeze: se niega a pisar uno existente; --force deja el anterior en freeze.json.<fecha>.bak; valida el commit y que haya tareas de validación', async () => {
  const env = setup();
  try {
    const { freeze, freezePath } = await imp('freeze.mjs');
    writeCfg(env, validationCfg(env));
    const cfg = await load(env);
    assert.throws(() => freeze(cfg, { prereg: 'zzzzzzz' }), /--prereg/);
    assert.throws(() => freeze(cfg, { prereg: 'abcdef1234' }), /no existe/);
    freeze(cfg, { prereg: env.base });
    assert.throws(() => freeze(cfg, { prereg: env.base }), /--force/);
    put(env.priv, 't1/prompt.md', 'Add a different feature.\n');
    const r = freeze(cfg, { prereg: env.base, force: true });
    assert.ok(r.backup && /freeze\.json\.\d{8}T\d+Z\.bak$/.test(r.backup), r.backup);
    assert.ok(fs.existsSync(r.backup));
    assert.notStrictEqual(readJson(r.backup).freezeHash, readJson(freezePath(cfg)).freezeHash);
    // Sin tareas de validación no hay nada que congelar.
    writeCfg(env, { ...env.cfg });
    const noValidation = await load(env);
    assert.throws(() => freeze(noValidation, { prereg: env.base, force: true }), /no hay tareas de validación/);
  } finally { cleanup(env); }
});

test('run: una tarea de validación se niega sin freeze y con un freeze que ya no se cumple, diciendo qué cambió; las de dev no lo piden', async () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const cfg = await prepared(env, 'N');
    await prepared(env, 'N', 1, 't2');
    const { runTask } = await imp('execute.mjs');
    const { freeze } = await imp('freeze.mjs');
    // Una tarea de dev corre sin freeze.
    const dev = await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runTask(cfg, { task: 't2', arm: 'N', rep: 1 }));
    assert.strictEqual(dev.set, 'dev');
    assert.strictEqual(dev.freezeHash, null);
    // La de validación, sin freeze.json, no corre y no gasta.
    await assert.rejects(() => runTask(cfg, { task: 't1', arm: 'N', rep: 1 }), /freeze/);
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'N', 1), 'stream.jsonl')));
    freeze(cfg, { prereg: env.base });
    // Cambia un test de aceptación después del pre-registro.
    put(env.priv, 't1/accept/check.js', '// changed\n');
    await assert.rejects(() => runTask(cfg, { task: 't1', arm: 'N', rep: 1 }), /cambió accept\/check\.js/);
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'N', 1), 'stream.jsonl')), 'no se gastó nada');
  } finally { cleanup(env); }
});

test('run: con el freeze vigente la corrida de validación avanza y guarda freeze_hash, prereg_commit y set en metrics.json y en el CSV', async () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const cfg = await prepared(env, 'P');
    const { runTask } = await imp('execute.mjs');
    const { freeze } = await imp('freeze.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const fz = freeze(cfg, { prereg: env.base });
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runTask(cfg, { task: 't1', arm: 'P', rep: 1 }));
    assert.strictEqual(m.freezeHash, fz.freezeHash);
    assert.strictEqual(m.preregCommit, env.base);
    assert.strictEqual(m.set, 'validation');
    assert.deepStrictEqual(m.invalidReasons, []);
    appendRow(cfg, { task: 't1', arm: 'P', rep: 1 });
    const r = parseCsv(read(cfg.csvPath))[0];
    assert.strictEqual(r.freeze_hash, fz.freezeHash);
    assert.strictEqual(r.prereg_commit, env.base);
    assert.strictEqual(r.set, 'validation');
  } finally { cleanup(env); }
});

test('freeze: cualquier cambio posterior se detecta y se nombra (archivo, plugin, versión de claude, modelo, esfuerzo, tarea nueva, edición del freeze)', async () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const cfg = await load(env);
    const { freeze, verifyFreeze, freezePath } = await imp('freeze.mjs');
    freeze(cfg, { prereg: env.base });
    const problems = () => verifyFreeze(cfg).problems.join(' | ');
    assert.strictEqual(verifyFreeze(cfg).ok, true);
    // un archivo borrado y uno nuevo del paquete de la tarea
    put(env.priv, 't1/gold-files.txt', 'src/a.ts\n');
    assert.match(problems(), /tarea t1: archivo nuevo gold-files\.txt/);
    fs.rmSync(path.join(env.priv, 't1', 'gold-files.txt'));
    assert.strictEqual(verifyFreeze(cfg).ok, true);
    fs.rmSync(path.join(env.priv, 't1', 'accept', 'check.js'));
    assert.match(problems(), /tarea t1: archivo borrado accept\/check\.js/);
    put(env.priv, 't1/accept/check.js', 'x\n');
    assert.match(problems(), /tarea t1: cambió accept\/check\.js/);
    fs.writeFileSync(path.join(env.priv, 't1', 'accept', 'check.js'),
      'const fs=require("fs");const p=process.argv[2];if(p)fs.writeFileSync(p,JSON.stringify({numPassedTests:3,numFailedTests:0,numTotalTests:3}));console.log("Tests  3 passed (3)");\n');
    assert.strictEqual(verifyFreeze(cfg).ok, true, problems());
    // el plugin de un brazo
    put(env.root, 'plugins/pg/skills/x/SKILL.md', 'edited\n');
    assert.match(problems(), /brazo P: el contenido del plugin cambió/);
    put(env.root, 'plugins/pg/skills/x/SKILL.md', 'skill of pignolo\n');
    // la versión de claude, el modelo y el esfuerzo
    await withEnv({ FAKE_CLAUDE_VERSION: '1.2.3' }, () => assert.match(problems(), /claudeVersion cambió/));
    assert.match(verifyFreeze({ ...cfg, model: 'opus' }).problems.join(' | '), /model cambió/);
    assert.match(verifyFreeze({ ...cfg, effort: 'high' }).problems.join(' | '), /effort cambió/);
    // una tarea marcada validación después del freeze
    assert.match(verifyFreeze({ ...cfg, tasks: { ...cfg.tasks, t2: { kind: 'small', set: 'validation' } } }).problems.join(' | '), /la tarea t2 es de validación pero no figura/);
    // un brazo nuevo y un promptPrefix
    assert.match(verifyFreeze({ ...cfg, arms: { ...cfg.arms, P: { ...cfg.arms.P, promptPrefix: '/pignolo:work ' } } }).problems.join(' | '), /brazo P: cambió el promptPrefix/);
    // editar el freeze.json a mano
    const f = readJson(freezePath(cfg));
    f.body.model = 'opus';
    fs.writeFileSync(freezePath(cfg), JSON.stringify(f));
    assert.match(problems(), /fue editado/);
    fs.rmSync(freezePath(cfg));
    assert.match(problems(), /no existe/);
  } finally { cleanup(env); }
});

test('freeze: la identidad de un plugin dentro de git es el árbol de su carpeta (no cambia con commits ajenos) y un plugin con cambios sin commitear no se congela', async () => {
  const env = setup();
  try {
    const { pluginIdentity, freeze } = await imp('freeze.mjs');
    const repo = path.join(env.root, 'plugrepo');
    fs.mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.name', 't');
    git(repo, 'config', 'user.email', 't@example.invalid');
    put(repo, 'plugins/pg/.claude-plugin/plugin.json', JSON.stringify({ name: 'pignolo' }));
    put(repo, 'docs/x.md', 'one\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'one');
    const dir = path.join(repo, 'plugins', 'pg');
    const a = pluginIdentity(dir);
    assert.strictEqual(a.identity.kind, 'git');
    assert.match(a.identity.treeHash, /^[0-9a-f]{40}$/);
    assert.strictEqual(a.info.dirty, false);
    put(repo, 'docs/x.md', 'two\n');
    git(repo, 'commit', '-qam', 'unrelated');
    const b = pluginIdentity(dir);
    assert.strictEqual(b.identity.treeHash, a.identity.treeHash, 'un commit ajeno al plugin no lo cambia');
    assert.notStrictEqual(b.info.commit, a.info.commit, 'el commit del repo sí se movió y queda registrado');
    put(repo, 'plugins/pg/skills/new.md', 'new\n');
    const c = pluginIdentity(dir);
    assert.strictEqual(c.info.dirty, true);
    writeCfg(env, validationCfg(env, { arms: { ...env.cfg.arms, P: { pluginName: 'pignolo', pluginDir: dir } } }));
    const cfg = await load(env);
    assert.throws(() => freeze(cfg, { prereg: env.base }), /cambios sin commitear/);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'plugin change');
    assert.notStrictEqual(pluginIdentity(dir).identity.treeHash, a.identity.treeHash);
    assert.ok(freeze(cfg, { prereg: env.base }).freezeHash);
  } finally { cleanup(env); }
});

test('CLI: freeze --prereg, freeze --check (sale con error si algo cambió) y el uso de set', () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const RUN = path.join(HARNESS, 'run.mjs');
    const cli = (...args) => spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], { encoding: 'utf8' });
    const nope = cli('freeze', '--check');
    assert.notStrictEqual(nope.status, 0);
    assert.strictEqual(JSON.parse(nope.stdout).ok, false);
    const made = cli('freeze', '--prereg', env.base);
    assert.strictEqual(made.status, 0, made.stderr);
    assert.match(JSON.parse(made.stdout).freezeHash, /^[0-9a-f]{64}$/);
    assert.strictEqual(cli('freeze', '--check').status, 0);
    assert.notStrictEqual(cli('freeze', '--prereg', env.base).status, 0, 'no pisa');
    put(env.priv, 't1/prompt.md', 'changed\n');
    const bad = cli('freeze', '--check');
    assert.notStrictEqual(bad.status, 0);
    assert.match(JSON.parse(bad.stdout).problems.join(' '), /cambió prompt\.md/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- schedule

test('schedule: bloques por tarea con los brazos barajados, tareas barajadas y reproducible con la misma semilla', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const { buildSchedule, writeSchedule, schedulePath } = await imp('schedule.mjs');
    const a = buildSchedule(cfg, { tasks: ['t1', 't2', 'tx', 'ty', 'tz'], arms: ['N', 'S', 'P'], seed: 11 });
    assert.strictEqual(a.entries.length, 15);
    assert.deepStrictEqual(buildSchedule(cfg, { tasks: ['t1', 't2', 'tx', 'ty', 'tz'], arms: ['N', 'S', 'P'], seed: 11 }), a, 'misma semilla, mismo orden');
    // Cada tarea es un bloque contiguo con los tres brazos una vez.
    for (const t of ['t1', 't2', 'tx', 'ty', 'tz']) {
      const mine = a.entries.filter((e) => e.task === t);
      assert.deepStrictEqual(mine.map((e) => e.arm).sort(), ['N', 'P', 'S']);
      assert.strictEqual(new Set(mine.map((e) => e.block)).size, 1);
      const idx = mine.map((e) => e.index);
      assert.strictEqual(idx[2] - idx[0], 2, 'contiguas');
    }
    assert.deepStrictEqual(a.entries.map((e) => e.index), a.entries.map((_, i) => i + 1));
    // Con otra semilla cambia el orden de las tareas o de los brazos; con varias semillas no queda siempre igual.
    const orders = new Set();
    const armOrders = new Set();
    for (let seed = 1; seed <= 12; seed += 1) {
      const s = buildSchedule(cfg, { tasks: ['t1', 't2', 'tx', 'ty', 'tz'], arms: ['N', 'S', 'P'], seed });
      orders.add([...new Set(s.entries.map((e) => e.task))].join(','));
      armOrders.add(s.entries.filter((e) => e.task === 't1').map((e) => e.arm).join(''));
    }
    assert.ok(orders.size > 3, `las tareas se barajan (${orders.size} órdenes en 12 semillas)`);
    assert.ok(armOrders.size > 3, `los brazos se barajan (${armOrders.size} órdenes en 12 semillas)`);
    // Repeticiones: cada rep es una pasada completa con su propio orden.
    const r = buildSchedule(cfg, { tasks: ['t1', 't2'], arms: ['N', 'P'], seed: 3, reps: 2 });
    assert.strictEqual(r.entries.length, 8);
    assert.deepStrictEqual([...new Set(r.entries.slice(0, 4).map((e) => e.rep))], [1]);
    // Archivo <workRoot>/schedule-<semilla>.json; la misma semilla con otros argumentos no lo pisa sin --force.
    const file = writeSchedule(cfg, a);
    assert.strictEqual(file, schedulePath(cfg, 11));
    assert.strictEqual(path.basename(file), 'schedule-11.json');
    assert.deepStrictEqual(readJson(file), a);
    assert.strictEqual(writeSchedule(cfg, a), file, 'mismo contenido: no se queja');
    assert.throws(() => writeSchedule(cfg, buildSchedule(cfg, { tasks: ['t1'], arms: ['N'], seed: 11 })), /ya existe/);
    // Validaciones
    assert.throws(() => buildSchedule(cfg, { tasks: ['t1'], arms: ['Q'], seed: 1 }), /brazo/);
    assert.throws(() => buildSchedule(cfg, { tasks: ['../x'], arms: ['N'], seed: 1 }), /tarea/);
    assert.throws(() => buildSchedule(cfg, { tasks: ['t1'], arms: ['N'], seed: 'x' }), /--seed/);
    assert.throws(() => buildSchedule(cfg, { tasks: ['t1'], arms: ['N'], seed: 1, reps: 0 }), /--reps/);
  } finally { cleanup(env); }
});

test('CLI: schedule imprime el orden y escribe schedule-<semilla>.json', () => {
  const env = setup();
  try {
    const RUN = path.join(HARNESS, 'run.mjs');
    const r = spawnSync(process.execPath, [RUN, 'schedule', '--tasks', 't1,t2', '--arms', 'N,S,P', '--seed', '5', '--config', env.cfgPath], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.split('\n').filter((l) => /bloque/.test(l)).length, 6);
    assert.match(r.stdout, /schedule-5\.json/);
    assert.strictEqual(readJson(path.join(env.work, 'schedule-5.json')).entries.length, 6);
    assert.notStrictEqual(spawnSync(process.execPath, [RUN, 'schedule', '--tasks', 't1', '--seed', '5', '--config', env.cfgPath], { encoding: 'utf8' }).status, 0);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- batch

const scheduleFile = async (env, tasks, arms, seed = 1) => {
  const cfg = await load(env);
  const { buildSchedule, writeSchedule } = await imp('schedule.mjs');
  return writeSchedule(cfg, buildSchedule(cfg, { tasks, arms, seed }));
};

test('batch --dry-run: imprime el plan y el chequeo del ledger sin crear nada ni gastar', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const file = await scheduleFile(env, ['t1', 't2'], ['N', 'P']);
    const { runBatch } = await imp('batch.mjs');
    const lines = [];
    const res = await runBatch(cfg, { schedule: file, dryRun: true }, { log: (l) => lines.push(l) });
    assert.strictEqual(res.dryRun, true);
    assert.strictEqual(res.toRun, 4);
    const text = lines.join('\n');
    assert.match(text, /\[1\/4\].*pendiente -> prepare, run, accept, row/);
    assert.match(text, /gastado hasta ahora 0 USD; tope total 40 USD; tope por corrida 5 USD/);
    assert.match(text, /corridas por lanzar 4; peor caso 20 USD/);
    assert.match(text, /la próxima corrida pasa el chequeo del ledger: sí/);
    assert.ok(!fs.existsSync(cfg.csvPath));
    assert.ok(!fs.existsSync(runDir(env, 't1', 'N', 1)), 'no se preparó nada');
    // Con un tope que no alcanza lo dice, sin tirar error.
    const small = { ...cfg, totalCapUsd: 5 };
    const lines2 = [];
    await runBatch(small, { schedule: file, dryRun: true }, { log: (l) => lines2.push(l) });
    assert.match(lines2.join('\n'), /el peor caso entra en el tope total: no/);
    assert.match(lines2.join('\n'), /la próxima corrida pasa el chequeo del ledger: no: tope total de gasto/);
  } finally { cleanup(env); }
});

test('batch: ejecuta prepare, run, accept y row por entrada, imprime una línea por corrida y una corrida inválida no lo detiene', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const file = await scheduleFile(env, ['t1'], ['N', 'S', 'P'], 2);
    const { runBatch } = await imp('batch.mjs');
    const { parseCsv } = await imp('row.mjs');
    const lines = [];
    // La segunda corrida de la lista falla con el claude falso: el modo se cambia al terminar de imprimir la primera.
    const res = await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runBatch(cfg, { schedule: file }, {
      log: (l) => { lines.push(l); process.env.FAKE_CLAUDE_MODE = lines.length === 1 ? 'fail,edit' : 'edit'; },
    }));
    assert.strictEqual(res.results.length, 3);
    assert.strictEqual(lines.length, 3, 'una línea por corrida');
    for (const [i, l] of lines.entries()) {
      assert.match(l, new RegExp(`^\\[${i + 1}/3\\] t1 [NSP] rep 1 \\| costo 0\\.5000 USD \\| pared [\\d.]+ s \\| turnos 4 \\| agentes 2 \\| activación `));
    }
    const rows = parseCsv(read(cfg.csvPath));
    assert.strictEqual(rows.length, 3);
    assert.deepStrictEqual(rows.map((r) => r.arm).sort(), ['N', 'P', 'S']);
    assert.match(lines[0], /aceptación pasa \| válida/);
    assert.match(lines[1], /inválida: .*exit_nonzero/, lines[1]);
    assert.strictEqual(rows.find((r) => r.arm === 'N').activation_via, 'n/a');
    // Cada fila trae el panel de calidad (el repo de juguete tiene tsconfig y eslint).
    assert.ok(rows.every((r) => r.tsc_new_errors !== undefined && r.diff_files !== ''));
    // El panel de calidad corrió dentro de accept.
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'N', 1), 'quality.json')));
  } finally { cleanup(env); }
});

test('batch: se detiene en el primer error del arnés, no repite lo ya registrado al volver a correrlo y respeta el tope total del ledger', async () => {
  const env = setup();
  try {
    const cfg = await load(env);
    const file = await scheduleFile(env, ['t1', 't2'], ['N'], 3);
    const sched = readJson(file);
    const { runBatch, entryState } = await imp('batch.mjs');
    const { parseCsv } = await imp('row.mjs');
    const second = sched.entries[1].task;
    // La segunda tarea pierde su prompt: error del arnés (no una corrida inválida).
    const promptFile = path.join(env.priv, second, 'prompt.md');
    const saved = read(promptFile);
    fs.rmSync(promptFile);
    const lines = [];
    await assert.rejects(
      () => withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runBatch(cfg, { schedule: file }, { log: (l) => lines.push(l) })),
      (e) => /falló el paso run/.test(e.message) && /retoma/.test(e.message) && e.results.length === 1,
    );
    assert.strictEqual(lines.length, 1, 'la primera corrida quedó registrada');
    assert.strictEqual(parseCsv(read(cfg.csvPath)).length, 1);
    assert.strictEqual(entryState(cfg, sched.entries[0]).status, 'registrada');
    assert.strictEqual(entryState(cfg, sched.entries[1]).status, 'preparada');
    // Se arregla y se vuelve a correr: salta la registrada y termina la otra.
    fs.writeFileSync(promptFile, saved);
    const lines2 = [];
    const out = await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runBatch(cfg, { schedule: file }, { log: (l) => lines2.push(l) }));
    assert.match(lines2[0], /ya registrada en el CSV, se salta/);
    assert.strictEqual(out.results.filter((r) => !r.skipped).length, 1);
    assert.strictEqual(parseCsv(read(cfg.csvPath)).length, 2);
    // El tope total de gasto lo frena como siempre (error del arnés antes de gastar).
    const file2 = await scheduleFile(env, ['t1'], ['P'], 4);
    await assert.rejects(() => runBatch({ ...cfg, totalCapUsd: 1 }, { schedule: file2 }, { log: () => {} }), /tope total de gasto/);
    assert.ok(!fs.existsSync(path.join(runDir(env, 't1', 'P', 1), 'stream.jsonl')));
  } finally { cleanup(env); }
});

test('batch: una tarea de validación sin freeze vigente frena todo antes de preparar nada', async () => {
  const env = setup();
  try {
    writeCfg(env, validationCfg(env));
    const cfg = await load(env);
    const file = await scheduleFile(env, ['t1'], ['N'], 6);
    const { runBatch } = await imp('batch.mjs');
    await assert.rejects(() => runBatch(cfg, { schedule: file }, { log: () => {} }), /chequeos previos.*freeze/);
    assert.ok(!fs.existsSync(runDir(env, 't1', 'N', 1)));
    const lines = [];
    const dry = await runBatch(cfg, { schedule: file, dryRun: true }, { log: (l) => lines.push(l) });
    assert.match(lines.join('\n'), /tareas de validación t1: freeze NO se cumple/);
    assert.ok(dry.problems.length > 0);
  } finally { cleanup(env); }
});

test('CLI: batch --dry-run', () => {
  const env = setup();
  try {
    const RUN = path.join(HARNESS, 'run.mjs');
    const cli = (...args) => spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], { encoding: 'utf8' });
    assert.strictEqual(cli('schedule', '--tasks', 't1', '--arms', 'N,P', '--seed', '9').status, 0);
    const r = cli('batch', '--schedule', path.join(env.work, 'schedule-9.json'), '--dry-run');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[1\/2\]/);
    assert.match(r.stdout, /chequeos previos \(plugins, configDir, freeze\): bien/);
    assert.ok(!fs.existsSync(path.join(env.work, 't1-N-1')));
    assert.notStrictEqual(cli('batch', '--dry-run').status, 0, 'necesita --schedule');
  } finally { cleanup(env); }
});
