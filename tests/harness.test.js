'use strict';
// Tests del arnés de medición de Pignolo 2 (tests/evals/harness). Ninguno gasta tokens:
// el `claude` real se reemplaza por tests/fixtures/harness/fake-claude.mjs.
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

// Entorno de juguete: repo fuente, raíz privada, carpeta de trabajo y configuración.
function setup(over = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-harness-'));
  const src = path.join(root, 'source');
  const priv = path.join(root, 'private');
  const work = path.join(root, 'work');
  fs.mkdirSync(src);
  git(src, 'init', '-q', '-b', 'main');
  git(src, 'config', 'user.name', 't');
  git(src, 'config', 'user.email', 't@example.invalid');
  git(src, 'config', 'core.autocrlf', 'false');
  put(src, 'package.json', '{"name":"toy","scripts":{"test":"node scripts/full.js"}}\n');
  put(src, 'CLAUDE.md', '# private workflow notes\n');
  put(src, 'AGENTS.md', '# agents notes\n');
  put(src, '.mcp.json', '{"mcpServers":{}}\n');
  put(src, '.claude/settings.json', '{}\n');
  put(src, 'docs/CLAUDE.md', '# nested notes\n');
  put(src, '.gitignore', 'node_modules/\ngenerated/\n');
  put(src, 'src/app.js', 'exports.hello = () => "hi";\n');
  put(src, 'scripts/full.js', 'console.log("# pass 3");\nconsole.log("# fail 0");\n');
  git(src, 'add', '-A');
  git(src, 'commit', '-q', '-m', 'toy base');
  const base = git(src, 'rev-parse', 'HEAD');
  put(src, 'node_modules/dep/index.js', 'module.exports = 1;\n');
  put(src, 'generated/client/index.js', 'module.exports = "client";\n');

  put(priv, 't1/prompt.md', 'Add a feature.\nSecond line.\n');
  put(priv, 't1/base.txt', base + '\n');
  put(priv, 't1/accept/test/new.test.js', '// acceptance test\n');
  put(priv, 't1/accept/check.js',
    'const fs=require("fs");const p=process.argv[2];' +
    'if(p)fs.writeFileSync(p,JSON.stringify({numPassedTests:2,numFailedTests:1,numTotalTests:3}));' +
    'console.log("Tests  1 failed | 2 passed (3)");process.exit(1);\n');
  put(priv, 't1/accept-cmd.txt', 'node check.js {json}\n');
  put(priv, 't1/full-cmd.txt', 'node scripts/full.js\n');

  const plugins = {};
  for (const [dir, name] of [['sp', 'superpowers'], ['pg', 'pignolo']]) {
    put(root, `plugins/${dir}/.claude-plugin/plugin.json`, JSON.stringify({ name }));
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
    extraEnvAllow: ['FAKE_CLAUDE_MODE', 'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_EXTRA_PLUGIN', 'FAKE_CLAUDE_ESCAPE_PATH', 'FAKE_CLAUDE_SRC_NM'],
    timeoutMs: 20000,
    acceptTimeoutMs: 20000,
    arms: {
      A: { pluginName: 'superpowers', pluginDir: plugins.superpowers },
      B: { pluginName: 'pignolo', pluginDir: plugins.pignolo },
    },
    copyDirs: ['generated'],
    seed: 7,
    csvPath: path.join(root, 'runs.csv'),
    gradesPath: path.join(root, 'grades.json'),
    experiment: 'toy-exp',
    ...over,
  };
  fs.mkdirSync(cfg.configDir, { recursive: true });
  const cfgPath = path.join(root, 'harness.local.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  return { root, src, priv, work, cfg, cfgPath, base };
}
const cleanup = (env) => fs.rmSync(env.root, { recursive: true, force: true });
const runDir = (env, task, arm, rep) => path.join(env.work, `${task}-${arm}-${rep}`);

// ---------------------------------------------------------------- prepare

test('prepare: exporta el commit base, limpia el contexto del autor y escribe el CLAUDE.md neutral', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    const r = await prepare(loadConfig(env.cfgPath), { task: 't1', arm: 'A', rep: 1 });
    const repo = path.join(runDir(env, 't1', 'A', 1), 'repo');
    assert.strictEqual(r.repo, repo);
    assert.ok(fs.existsSync(path.join(repo, 'src', 'app.js')));
    assert.ok(!fs.existsSync(path.join(repo, 'AGENTS.md')));
    assert.ok(!fs.existsSync(path.join(repo, '.mcp.json')));
    assert.ok(!fs.existsSync(path.join(repo, '.claude')));
    assert.ok(!fs.existsSync(path.join(repo, 'docs', 'CLAUDE.md')), 'también los anidados');
    const neutral = fs.readFileSync(path.join(HARNESS, 'neutral-claude.md'), 'utf8');
    assert.strictEqual(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), neutral);
    assert.ok(!/private workflow/.test(neutral));
    assert.ok(!/plugin|superpowers|pignolo|skill/i.test(neutral), 'el texto neutral no nombra ningún método');
  } finally { cleanup(env); }
});

test('prepare: node_modules es una junction, copyDirs se copia, commit base y git limpio', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    await prepare(loadConfig(env.cfgPath), { task: 't1', arm: 'B', rep: 2 });
    const repo = path.join(runDir(env, 't1', 'B', 2), 'repo');
    const nm = path.join(repo, 'node_modules');
    assert.ok(fs.lstatSync(nm).isSymbolicLink(), 'junction');
    // La junction apunta a la copia (snapshot) bajo workRoot, nunca al node_modules de la fuente.
    assert.strictEqual(path.resolve(fs.readlinkSync(nm)).toLowerCase().replace(/\\+$/, ''),
      path.join(env.work, '_nm', 'node_modules').toLowerCase());
    assert.ok(fs.existsSync(path.join(nm, 'dep', 'index.js')));
    assert.strictEqual(fs.readFileSync(path.join(repo, 'generated', 'client', 'index.js'), 'utf8'),
      'module.exports = "client";\n');
    assert.ok(!fs.lstatSync(path.join(repo, 'generated')).isSymbolicLink(), 'copiado, no enlazado');
    assert.strictEqual(git(repo, 'branch', '--show-current'), 'main');
    assert.strictEqual(git(repo, 'log', '--format=%s'), 'base');
    assert.strictEqual(git(repo, 'log', '-1', '--format=%an <%ae>'), 'eval <eval@example.invalid>');
    assert.strictEqual(git(repo, 'status', '--porcelain'), '', 'node_modules y generated no ensucian');
    assert.ok(!git(repo, 'ls-files').split('\n').some((f) => f.startsWith('node_modules/')));
    assert.ok(git(repo, 'ls-files').split('\n').includes('CLAUDE.md'), 'el neutral entra en base');
    // Borrar la carpeta de la corrida no debe llevarse el node_modules de la fuente.
    fs.rmSync(runDir(env, 't1', 'B', 2), { recursive: true, force: true });
    assert.ok(fs.existsSync(path.join(env.src, 'node_modules', 'dep', 'index.js')));
  } finally { cleanup(env); }
});

test('prepare: se niega a pisar una carpeta de corrida existente y valida copyDirs', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    const cfg = loadConfig(env.cfgPath);
    await prepare(cfg, { task: 't1', arm: 'A', rep: 1 });
    fs.writeFileSync(path.join(runDir(env, 't1', 'A', 1), 'repo', 'mark.txt'), 'x');
    await assert.rejects(() => prepare(cfg, { task: 't1', arm: 'A', rep: 1 }), /ya existe/);
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'A', 1), 'repo', 'mark.txt')), 'no se tocó');
    await assert.rejects(() => prepare({ ...cfg, copyDirs: ['..\\..\\x'] }, { task: 't1', arm: 'B', rep: 1 }), /copyDirs/);
    await assert.rejects(() => prepare(cfg, { task: 't1', arm: 'C', rep: 1 }), /brazo/);
    await assert.rejects(() => prepare(cfg, { task: '../x', arm: 'A', rep: 1 }), /tarea/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- run

async function prepared(env, arm = 'A', rep = 1, task = 't1') {
  const { loadConfig } = await imp('config.mjs');
  const { prepare } = await imp('prepare.mjs');
  const cfg = loadConfig(env.cfgPath);
  await prepare(cfg, { task, arm, rep });
  return cfg;
}
function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; process.env[k] = vars[k]; }
  const restore = () => { for (const k of Object.keys(vars)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } };
  return Promise.resolve().then(fn).finally(restore);
}

test('run: arma el argv exacto, fija CLAUDE_CONFIG_DIR y calcula las métricas', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'B', 1);
    const { runTask } = await imp('execute.mjs');
    const log = path.join(env.root, 'stub.json');
    const m = await withEnv({ FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_MODE: 'ok' }, () => runTask(cfg, { task: 't1', arm: 'B', rep: 1 }));
    const seen = JSON.parse(fs.readFileSync(log, 'utf8'));
    assert.deepStrictEqual(seen.argv, [
      '-p',
      '--model', 'sonnet',
      '--effort', 'medium',
      '--plugin-dir', cfg.arms.B.pluginDir,
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'stream-json',
      '--verbose',
      '--max-budget-usd', '5',
      '--no-session-persistence',
    ]);
    assert.strictEqual(fs.realpathSync(seen.cwd), fs.realpathSync(path.join(runDir(env, 't1', 'B', 1), 'repo')));
    assert.strictEqual(seen.configDir, cfg.configDir);
    assert.strictEqual(seen.stdin, 'Add a feature.\nSecond line.', 'el prompt va por stdin, nunca como argumento (un "-" inicial no es una opción)');
    const dir = runDir(env, 't1', 'B', 1);
    assert.ok(fs.readFileSync(path.join(dir, 'stream.jsonl'), 'utf8').includes('"type":"result"'));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'stderr.txt'), 'utf8').trim(), 'fake stderr');
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'));
    assert.deepStrictEqual(onDisk, JSON.parse(JSON.stringify(m)));
    assert.strictEqual(m.costUsd, 0.5);
    assert.strictEqual(m.turns, 4);
    assert.deepStrictEqual(m.tokens, { input: 150, output: 30, cacheRead: 1500, cacheWrite: 600 });
    assert.strictEqual(m.tokenSource, 'modelUsage');
    assert.deepStrictEqual(m.usageMainThread, { input: 100, output: 20, cacheRead: 1000, cacheWrite: 400 });
    // 150*1 + 30*5 + 1500*0.1 + 600*1.25
    assert.strictEqual(m.weightedTokens, 1200);
    assert.strictEqual(m.agents, 2, 'Agent + Task, sin contar dos veces el mismo tool_use');
    assert.strictEqual(m.agentsMain, 1);
    assert.strictEqual(m.timedOut, false);
    assert.strictEqual(m.exitCode, 0);
    assert.strictEqual(m.contamination, false);
    assert.strictEqual(m.ownPluginLoaded, true);
    assert.ok(m.wallS >= 0 && m.badLines === 1);
    assert.ok(!JSON.stringify(m).includes(process.env.PATH || 'no-path-in-env'), 'no se registra el entorno');
  } finally { cleanup(env); }
});

test('run: usa el peso configurado y cae a usage si no hay modelUsage', async () => {
  const { weightedTokens, parseStream } = await imp('metrics.mjs');
  assert.strictEqual(weightedTokens({ input: 10, output: 10, cacheRead: 10, cacheWrite: 10 }, { input: 2, output: 3, cacheRead: 4, cacheWrite: 5 }), 140);
  const stream = [
    JSON.stringify({ type: 'system', subtype: 'init', plugins: [{ name: 'superpowers' }] }),
    JSON.stringify({ type: 'result', total_cost_usd: 1, duration_ms: 9, num_turns: 2, usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } }),
  ].join('\n');
  const m = parseStream(stream, { ownPlugin: 'superpowers', otherPlugin: 'pignolo', weights: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 } });
  assert.strictEqual(m.tokenSource, 'usage');
  assert.deepStrictEqual(m.tokens, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 });
  assert.strictEqual(m.weightedTokens, 10);
  const none = parseStream('', { ownPlugin: 'a', otherPlugin: 'b' });
  assert.strictEqual(none.costUsd, null);
  assert.strictEqual(none.weightedTokens, null);
  assert.strictEqual(none.hasResult, false);
});

test('run: el timeout mata el proceso y lo anota', async () => {
  const env = setup({ timeoutMs: 600 });
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const t0 = Date.now();
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'hang' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(Date.now() - t0 < 10000, 'volvió');
    assert.strictEqual(m.timedOut, true);
    assert.strictEqual(m.costUsd, null, 'sin mensaje result no se inventan cifras');
    assert.strictEqual(m.hasResult, false);
    assert.ok(m.wallS >= 0.5 && m.wallS < 8, `wallS=${m.wallS}`);
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'A', 1), 'metrics.json')));
  } finally { cleanup(env); }
});

test('run: marca contaminación si el init lista el plugin del otro brazo', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'contaminated', FAKE_CLAUDE_EXTRA_PLUGIN: 'pignolo' },
      () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.contamination, true);
    assert.ok(m.contaminationHits.includes('plugin:pignolo'));
    assert.ok(m.contaminationHits.includes('skill:pignolo:other-skill'));
  } finally { cleanup(env); }
});

test('run: sin costo en el result queda en null y la corrida no falla', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'nocost' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.costUsd, null);
    assert.strictEqual(m.weightedTokens, null);
    assert.strictEqual(m.turns, 4);
  } finally { cleanup(env); }
});

test('run: si no existe la carpeta preparada, pide prepare', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { runTask } = await imp('execute.mjs');
    await assert.rejects(() => runTask(loadConfig(env.cfgPath), { task: 't1', arm: 'A', rep: 9 }), /prepare/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- config, entorno y chequeos previos

async function loadWith(env, over) {
  const f = path.join(env.root, 'variant.json');
  fs.writeFileSync(f, JSON.stringify({ ...env.cfg, ...over }));
  const { loadConfig } = await imp('config.mjs');
  return loadConfig(f);
}

test('config: exige tope total, valida effort, "%" en workRoot, anidamiento de carpetas y copyDirs', async () => {
  const env = setup();
  try {
    const ok = await loadWith(env, {});
    assert.strictEqual(ok.effort, 'medium', 'effort por defecto');
    assert.deepStrictEqual(ok.modelFactor, { opus: 5, sonnet: 1, haiku: 0.33 });
    assert.ok(ok.blindExcludePaths.includes('docs/sessions/') && ok.blindExcludePaths.includes('CLAUDE.md') && ok.blindExcludePaths.includes('.worktrees/'));
    await assert.rejects(() => loadWith(env, { totalCapUsd: undefined }), /totalCapUsd/);
    await assert.rejects(() => loadWith(env, { totalCapUsd: 0 }), /totalCapUsd/);
    await assert.rejects(() => loadWith(env, { effort: 'enorme' }), /effort/);
    await assert.rejects(() => loadWith(env, { workRoot: path.join(env.root, '100%work') }), /%/);
    await assert.rejects(() => loadWith(env, { workRoot: path.join(env.priv, 'work') }), /workRoot.*privateRoot|privateRoot.*workRoot/);
    await assert.rejects(() => loadWith(env, { workRoot: path.join(env.src, 'work') }), /workRoot.*sourceRepo|sourceRepo.*workRoot/);
    await assert.rejects(() => loadWith(env, { privateRoot: env.root }), /privateRoot/);
    for (const bad of ['', '.', '..', '../x', 'a/../../x', path.resolve('/abs')]) {
      await assert.rejects(() => loadWith(env, { copyDirs: [bad] }), /copyDirs/, `copyDirs ${JSON.stringify(bad)}`);
    }
    const { runPaths } = await imp('config.mjs');
    assert.ok(runPaths(ok, { task: 't1', arm: 'A', rep: 1 }).dir.startsWith(ok.workRoot));
  } finally { cleanup(env); }
});

test('run: el hijo recibe solo el entorno de la lista blanca, --effort y el prompt por stdin', async () => {
  const env = setup({ effort: 'high' });
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const log = path.join(env.root, 'stub.json');
    const secrets = { ANTHROPIC_API_KEY: 'sk-secret-value', GITHUB_TOKEN: 'tok-secret-value', CLAUDECODE: '1', CLAUDE_CODE_FOO: 'x', MY_APP_SECRET: 'zzz-secret-value', HARMLESS_VAR: 'harmless' };
    const m = await withEnv({ FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_MODE: 'ok', ...secrets }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    const seen = JSON.parse(fs.readFileSync(log, 'utf8'));
    const names = seen.envNames.map((n) => n.toUpperCase());
    for (const n of Object.keys(secrets)) assert.ok(!names.includes(n), `${n} no debe llegar al hijo`);
    for (const n of ['CLAUDE_CONFIG_DIR', 'DISABLE_AUTOUPDATER', 'FAKE_CLAUDE_MODE']) assert.ok(names.includes(n), `falta ${n}`);
    assert.ok(names.includes('PATH') || names.includes('SYSTEMROOT'), 'lo básico del sistema sí pasa');
    assert.deepStrictEqual(seen.argv.slice(seen.argv.indexOf('--effort'), seen.argv.indexOf('--effort') + 2), ['--effort', 'high']);
    assert.ok(!seen.argv.includes('Add a feature.\nSecond line.'), 'el prompt no va en argv');
    for (const n of ['ANTHROPIC_API_KEY', 'CLAUDECODE', 'CLAUDE_CODE_FOO', 'GITHUB_TOKEN', 'MY_APP_SECRET']) assert.ok(m.droppedEnvNames.includes(n), `se anota ${n}`);
    assert.ok(m.droppedEnvNames.includes('HARMLESS_VAR'), 'se anotan los nombres de TODAS las variables descartadas, no solo las que parecen secretos');
    for (const n of ['SYSTEMDRIVE', 'WINDIR', 'USERNAME', 'HOMEDRIVE', 'HOMEPATH']) {
      if (process.env[n] !== undefined) assert.ok(names.includes(n), `${n} está en la lista blanca`);
    }
    const blob = fs.readFileSync(path.join(runDir(env, 't1', 'A', 1), 'metrics.json'), 'utf8');
    assert.ok(!/sk-secret-value|tok-secret-value|zzz-secret-value/.test(blob), 'solo nombres, nunca valores');
    assert.strictEqual(m.init.model, 'fake-model');
    assert.strictEqual(m.init.claude_code_version, '9.9.9-fake');
  } finally { cleanup(env); }
});

test('run: chequeo previo gratis: plugin del brazo equivocado, configDir contaminado', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const dir = runDir(env, 't1', 'A', 1);
    // 1. pluginDir que no es el plugin del brazo
    const wrong = { ...cfg, arms: { ...cfg.arms, A: { pluginName: 'superpowers', pluginDir: cfg.arms.B.pluginDir } } };
    await assert.rejects(() => runTask(wrong, { task: 't1', arm: 'A', rep: 1 }), /plugin.*superpowers|superpowers.*pignolo/);
    const noManifest = { ...cfg, arms: { ...cfg.arms, A: { pluginName: 'superpowers', pluginDir: env.root } } };
    await assert.rejects(() => runTask(noManifest, { task: 't1', arm: 'A', rep: 1 }), /plugin\.json/);
    // 2. configDir inexistente o con plugins, CLAUDE.md, hooks o enabledPlugins
    await assert.rejects(() => runTask({ ...cfg, configDir: path.join(env.root, 'nope') }, { task: 't1', arm: 'A', rep: 1 }), /configDir/);
    const polluted = [
      ['plugins/cache/x/plugin.json', '{}', /plugins/],
      ['CLAUDE.md', '# memoria', /CLAUDE\.md/],
      ['settings.json', '{"hooks":{"Stop":[]}}', /hooks/],
      ['settings.json', '{"enabledPlugins":{"a@b":true}}', /enabledPlugins/],
      ['skills/mine/SKILL.md', 'x', /skills/],
    ];
    for (const [rel, content, re] of polluted) {
      const bad = path.join(env.root, 'polluted');
      fs.rmSync(bad, { recursive: true, force: true });
      put(bad, rel, content);
      await assert.rejects(() => runTask({ ...cfg, configDir: bad }, { task: 't1', arm: 'A', rep: 1 }), re, rel);
    }
    // Un configDir con login (credenciales) y un settings.json inocuo está bien.
    const good = path.join(env.root, 'good');
    put(good, '.credentials.json', '{}');
    put(good, 'settings.json', '{"theme":"dark"}');
    put(good, 'plugins/known_marketplaces.json', '{}');
    const m = await runTask({ ...cfg, configDir: good }, { task: 't1', arm: 'A', rep: 1 });
    assert.strictEqual(m.hasResult, true);
    assert.ok(fs.existsSync(path.join(dir, 'stream.jsonl')));
  } finally { cleanup(env); }
});

test('run: si el plugin del brazo no figura cargado, la corrida queda contaminada e inválida', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'noplugin' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.ownPluginLoaded, false);
    assert.strictEqual(m.contamination, true);
    assert.ok(m.contaminationHits.includes('own_plugin_not_loaded'));
    assert.ok(m.invalidReasons.includes('own_plugin_not_loaded'));
  } finally { cleanup(env); }
});

test('run: cualquier plugin cargado que no sea el del brazo cuenta como contaminación', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'contaminated', FAKE_CLAUDE_EXTRA_PLUGIN: 'some-third-plugin' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.contamination, true);
    assert.ok(m.contaminationHits.includes('plugin:some-third-plugin'));
    assert.ok(m.invalidReasons.includes('contaminated'));
  } finally { cleanup(env); }
});

test('metrics: los plugins neutrales (incorporados en toda sesión) no son contaminación, pero se registran; uno desconocido sí lo es', async () => {
  const { parseStream, isNeutralPlugin } = await imp('metrics.mjs');
  const { DEFAULT_NEUTRAL_PLUGINS } = await imp('config.mjs');
  assert.deepStrictEqual(DEFAULT_NEUTRAL_PLUGINS, ['cc-plugin-*']);
  assert.strictEqual(isNeutralPlugin('cc-plugin-telemetry', DEFAULT_NEUTRAL_PLUGINS), true);
  assert.strictEqual(isNeutralPlugin('cc-plugin-x@market', DEFAULT_NEUTRAL_PLUGINS), true);
  assert.strictEqual(isNeutralPlugin('my-cc-plugin-x', DEFAULT_NEUTRAL_PLUGINS), false, 'el patrón es de prefijo, no de subcadena');
  assert.strictEqual(isNeutralPlugin('cc-plugin-x', []), false);
  const init = (names) => JSON.stringify({ type: 'system', subtype: 'init', plugins: names.map((name) => ({ name })) });
  const opts = { ownPlugin: 'superpowers', otherPlugin: 'pignolo', neutralPlugins: DEFAULT_NEUTRAL_PLUGINS };
  const ok = parseStream(init(['superpowers', 'cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring']), opts);
  assert.strictEqual(ok.contamination, false);
  assert.deepStrictEqual(ok.contaminationHits, []);
  assert.deepStrictEqual(ok.neutralPluginsLoaded, ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring']);
  assert.strictEqual(ok.ownPluginLoaded, true);
  // Un plugin desconocido fuera de la lista y del brazo sigue siendo contaminación; el otro brazo también.
  const bad = parseStream(init(['superpowers', 'cc-plugin-telemetry', 'mystery-plugin']), opts);
  assert.deepStrictEqual(bad.contaminationHits, ['plugin:mystery-plugin']);
  assert.deepStrictEqual(bad.neutralPluginsLoaded, ['cc-plugin-telemetry']);
  assert.ok(parseStream(init(['superpowers', 'pignolo']), opts).contamination);
  // Sin la lista (neutralPlugins vacío) los incorporados cuentan como contaminación otra vez.
  assert.ok(parseStream(init(['superpowers', 'cc-plugin-telemetry']), { ...opts, neutralPlugins: [] }).contamination);
});

test('run: los plugins incorporados se registran como neutrales, la corrida sigue válida y la fila lo muestra', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'neutral,edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.contamination, false);
    assert.ok(!m.invalidReasons.includes('contaminated'));
    assert.deepStrictEqual(m.neutralPluginsLoaded, ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring']);
    const row = appendRow(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.strictEqual(row.neutral_plugins, 'cc-plugin-agents-md;cc-plugin-telemetry;cc-plugin-plugin-authoring');
    assert.strictEqual(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))[0].neutral_plugins, row.neutral_plugins);
    // Un plugin desconocido sí contamina, aunque haya neutrales a su lado.
    await prepared(env, 'A', 2);
    const bad = await withEnv({ FAKE_CLAUDE_MODE: 'neutral,contaminated,edit', FAKE_CLAUDE_EXTRA_PLUGIN: 'mystery-plugin' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 2 }));
    assert.ok(bad.invalidReasons.includes('contaminated'));
    assert.deepStrictEqual(bad.contaminationHits, ['plugin:mystery-plugin']);
  } finally { cleanup(env); }
});

test('row: una corrida inválida sin aceptación se registra igual, y su gasto sigue contando después de limpiar la carpeta', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const { cleanRun } = await imp('clean.mjs');
    const { spentUsd } = await imp('ledger.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'fail,edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(m.invalidReasons.length > 0);
    assert.ok(!fs.existsSync(path.join(runDirName(env, 't1', 'A', 1), 'acceptance.json')), 'sin aceptación');
    const row = appendRow(cfg, { task: 't1', arm: 'A', rep: 1, note: 'calibracion descartada' });
    assert.strictEqual(row.invalid, true);
    assert.ok(row.accept_pass == null);
    const r = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))[0];
    assert.strictEqual(r.accept_pass, '');
    assert.strictEqual(r.cost_usd, '0.5');
    assert.strictEqual(spentUsd(cfg), 0.5);
    assert.strictEqual(cleanRun(cfg, { task: 't1', arm: 'A', rep: 1 }).removed, true, 'ya registrada: se limpia sin --force');
    assert.ok(!fs.existsSync(runDirName(env, 't1', 'A', 1)));
    assert.strictEqual(spentUsd(cfg), 0.5, 'el gasto sigue contado por la fila del CSV');
  } finally { cleanup(env); }
});

test('run: tope total de gasto (suma del CSV y de corridas sin fila) antes de lanzar nada', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { COLUMNS } = await imp('row.mjs');
    const csvRow = (o) => COLUMNS.map((c) => o[c] ?? '').join(',');
    const dir = runDir(env, 't1', 'A', 1);
    // 36 USD ya gastados en el CSV (otro experimento): 36 + 5 > 40
    fs.writeFileSync(cfg.csvPath, `${COLUMNS.join(',')}\n${csvRow({ experiment: 'toy-exp-calib', task: 't0', arm: 'A', rep: 1, timestamp: 't', cost_usd: 36 })}\n`);
    await assert.rejects(() => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }), /tope total/);
    assert.ok(!fs.existsSync(path.join(dir, 'stream.jsonl')), 'no se lanzó nada');
    // 33 + 1,25 x 5 = 39,25 <= 40: corre (el margen del 25 % cubre lo que una corrida puede pasarse del tope)
    fs.writeFileSync(cfg.csvPath, `${COLUMNS.join(',')}\n${csvRow({ experiment: 'toy-exp', task: 't0', arm: 'A', rep: 1, timestamp: 't', cost_usd: 33 })}\n`);
    await runTask(cfg, { task: 't1', arm: 'A', rep: 1 });
    // la corrida de recién (0,5) no tiene fila todavía y cuenta: 33 + 0,5 + 6,25 <= 40, pero una sin fila de 2 la rompe
    writeRun(env, 't9', 'B', 1, { metrics: { costUsd: 2 } });
    const cfgB = await prepared(env, 'B', 1);
    await assert.rejects(() => runTask(cfgB, { task: 't1', arm: 'B', rep: 1 }), /tope total/);
    // una corrida sin costo conocido (cortada) cuenta como el tope por corrida
    fs.writeFileSync(cfg.csvPath, `${COLUMNS.join(',')}\n${csvRow({ experiment: 'toy-exp', task: 't0', arm: 'A', rep: 1, timestamp: 't', cost_usd: 20 })}\n${csvRow({ experiment: 'toy-exp', task: 't0', arm: 'B', rep: 1, timestamp: 'u', cost_usd: '' })}\n`);
    fs.rmSync(runDir(env, 't9', 'B', 1), { recursive: true, force: true });
    fs.rmSync(path.join(runDir(env, 't1', 'A', 1), 'metrics.json'));
    const { spentUsd } = await imp('ledger.mjs');
    assert.strictEqual(spentUsd(cfg), 30, 'una corrida con stream.jsonl y sin metrics.json (interrumpida) cuenta como el tope por corrida: 20 + 5 + 5');
    fs.rmSync(path.join(runDir(env, 't1', 'A', 1), 'stream.jsonl'));
    assert.strictEqual(spentUsd(cfg), 25, '20 + 5 (sin costo = tope por corrida)');
  } finally { cleanup(env); }
});

test('run: procesos que sobran después de la corrida se registran (sin matarlos)', async () => {
  const env = setup();
  try {
    const cfg = { ...(await prepared(env, 'A', 1)), trackProcesses: true };
    const { runTask } = await imp('execute.mjs');
    const calls = [];
    const lists = [['a.exe', 'b.exe', 'node.exe'], ['a.exe', 'b.exe', 'node.exe', 'node.exe', 'orphan.exe']];
    const m = await runTask(cfg, { task: 't1', arm: 'A', rep: 1 }, { listProcesses: () => { calls.push(1); return lists[calls.length - 1]; } });
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(m.leftover_processes.sort(), ['node.exe', 'orphan.exe']);
  } finally { cleanup(env); }
});

test('run: se registran los nombres que aparecen o desaparecen en configDir', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    put(cfg.configDir, 'settings.json', '{}');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'cfg-write' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(m.config_dir_delta.added.includes('cache-x'));
    assert.ok(m.config_dir_delta.added.includes('cache-x/f.txt'));
    assert.deepStrictEqual(m.config_dir_delta.removed, []);
    assert.ok(!JSON.stringify(m.config_dir_delta).includes('"x"'), 'solo nombres, nada de contenido');
  } finally { cleanup(env); }
});

test('run: tocar el repo fuente, la carpeta privada u otra corrida se marca escaped_cwd', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const own = path.join(runDir(env, 't1', 'A', 1), 'repo', 'src');
    const clean = await withEnv({ FAKE_CLAUDE_MODE: 'escape', FAKE_CLAUDE_ESCAPE_PATH: own }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(!clean.invalidReasons.includes('escaped_cwd'), 'su propia carpeta no es un escape');
    for (const [label, target] of [['fuente', path.join(env.src, 'src', 'app.js')], ['privada', path.join(env.priv, 't1', 'accept', 'x')], ['otra corrida', path.join(env.work, 't1-B-1', 'repo', 'x')]]) {
      const c = await prepared(env, 'B', label === 'otra corrida' ? 2 : label === 'fuente' ? 3 : 4);
      const rep = label === 'otra corrida' ? 2 : label === 'fuente' ? 3 : 4;
      const m = await withEnv({ FAKE_CLAUDE_MODE: 'escape', FAKE_CLAUDE_ESCAPE_PATH: target }, () => runTask(c, { task: 't1', arm: 'B', rep }));
      assert.ok(m.invalidReasons.includes('escaped_cwd'), label);
      assert.ok(m.escapedCwd.command.length <= 200 && m.escapedCwd.command.includes('type '), label);
    }
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- node_modules (copia aislada) y árbol medido

test('prepare: node_modules se copia UNA vez a _nm; borrar una corrida no toca la fuente ni la copia', async () => {
  const env = setup();
  try {
    await prepared(env, 'A', 1);
    const snap = path.join(env.work, '_nm', 'node_modules');
    assert.ok(fs.existsSync(path.join(snap, 'dep', 'index.js')), 'copia del contenido');
    assert.ok(fs.existsSync(path.join(env.work, '_nm.manifest.json')));
    fs.writeFileSync(path.join(snap, 'marker.txt'), 'm');
    await prepared(env, 'B', 1);
    assert.ok(fs.existsSync(path.join(snap, 'marker.txt')), 'la segunda preparación no vuelve a copiar');
    assert.ok(!fs.existsSync(path.join(env.src, 'node_modules', 'marker.txt')));
    const { removeTreeSafe } = await imp('fsutil.mjs');
    removeTreeSafe(runDirName(env, 't1', 'A', 1));
    assert.ok(!fs.existsSync(runDirName(env, 't1', 'A', 1)));
    assert.ok(fs.existsSync(path.join(env.src, 'node_modules', 'dep', 'index.js')), 'la fuente intacta');
    assert.ok(fs.existsSync(path.join(snap, 'dep', 'index.js')), 'la copia intacta');
    assert.ok(fs.existsSync(path.join(runDirName(env, 't1', 'B', 1), 'repo', 'node_modules', 'dep', 'index.js')), 'la otra corrida sigue enlazada');
  } finally { cleanup(env); }
});
const runDirName = (env, task, arm, rep) => path.join(env.work, `${task}-${arm}-${rep}`);

test('nm: lo que se ve a través del enlace se resuelve (require entre paquetes hermanos) y los .bin arrancan', async () => {
  // Node resuelve "import b" subiendo desde la RUTA REAL del archivo hasta una carpeta llamada node_modules: la copia tiene que
  // vivir dentro de una carpeta con ese nombre (<workRoot>/_nm/node_modules), o los paquetes hermanos no se encuentran.
  const env = setup();
  try {
    const nm = path.join(env.src, 'node_modules');
    put(nm, 'a/index.js', 'module.exports = require("b") + 1;\n');
    put(nm, 'b/index.js', 'module.exports = 41;\n');
    put(nm, '@sc/d/index.js', 'module.exports = require("b") + 2;\n');
    put(nm, 'c/cli.js', 'console.log("cli:" + require("a") + ":" + require("@sc/d"));\n');
    put(nm, '.bin/hello.cmd', '@node "%~dp0..\\c\\cli.js"\r\n');
    const { loadConfig } = await imp('config.mjs');
    const { ensureSnapshot, linkNodeModules } = await imp('nm.mjs');
    const cfg = loadConfig(env.cfgPath);
    ensureSnapshot(cfg);
    const run = path.join(env.root, 'runfolder');
    fs.mkdirSync(run);
    assert.strictEqual(linkNodeModules(cfg, run), true);
    const r = spawnSync(process.execPath, ['-e', 'console.log(require("a") + "," + require("@sc/d"))'], { cwd: run, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), '42,43');
    if (process.platform === 'win32') {
      const bin = spawnSync(path.join(run, 'node_modules', '.bin', 'hello.cmd'), { cwd: run, encoding: 'utf8', shell: true });
      assert.strictEqual(bin.status, 0, bin.stderr);
      assert.strictEqual(bin.stdout.trim(), 'cli:42:43', 'un .bin que arranca desde el enlace y resuelve sus dependencias');
    }
  } finally { cleanup(env); }
});

test('nm: una copia con el diseño viejo (_nm sin node_modules adentro) se descarta y se vuelve a copiar, gratis y antes de gastar', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { repairSnapshot, snapshotState } = await imp('nm.mjs');
    const cfg = loadConfig(env.cfgPath);
    // Diseño viejo: los paquetes directamente bajo _nm, con su manifiesto de entonces.
    put(env.work, '_nm/dep/index.js', 'module.exports = 1;\n');
    fs.writeFileSync(path.join(env.work, '_nm.manifest.json'), JSON.stringify({ count: 1, names: ['dep'], lockHash: null, digest: 'x', sourceDigest: 'y' }));
    assert.strictEqual(snapshotState(cfg), 'stale');
    assert.strictEqual(repairSnapshot(cfg), 'repaired');
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'dep', 'index.js')));
    assert.ok(!fs.existsSync(path.join(env.work, '_nm', 'dep')), 'nada del diseño viejo');
    assert.strictEqual(snapshotState(cfg), 'intact');
    // Aunque la fuente haya cambiado desde entonces: una copia vieja no es una copia alterada, se reemplaza igual.
    fs.rmSync(path.join(env.work, '_nm', 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(env.work, '_nm', 'dep'));
    fs.writeFileSync(path.join(env.work, '_nm.manifest.json'), JSON.stringify({ digest: 'x', sourceDigest: 'otro' }));
    fs.mkdirSync(path.join(env.src, 'node_modules', 'new-dep'));
    assert.strictEqual(repairSnapshot(cfg), 'repaired');
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'new-dep')));
  } finally { cleanup(env); }
});

test('nm: el manifiesto cambia con paquetes o lockfile, no con cachés de herramientas', async () => {
  const env = setup();
  try {
    const { manifest } = await imp('nm.mjs');
    const d = path.join(env.root, 'nmtest');
    put(d, 'a/index.js', '1');
    put(d, 'b/index.js', '1');
    put(d, '@s/x/index.js', '1');
    put(d, '.package-lock.json', '{"v":1}');
    const m0 = manifest(d);
    assert.deepStrictEqual(m0.names, ['.package-lock.json', '@s/x', 'a', 'b']);
    assert.strictEqual(m0.count, 4);
    assert.ok(m0.lockHash && m0.digest);
    put(d, '.vite/vitest/results.json', '{}');
    assert.strictEqual(manifest(d).digest, m0.digest, 'una caché de herramienta no cuenta');
    put(d, 'c/index.js', '1');
    assert.notStrictEqual(manifest(d).digest, m0.digest);
    fs.rmSync(path.join(d, 'c'), { recursive: true });
    assert.strictEqual(manifest(d).digest, m0.digest);
    put(d, '.package-lock.json', '{"v":2}');
    assert.notStrictEqual(manifest(d).digest, m0.digest);
    put(d, '@s/y/index.js', '1');
    assert.ok(manifest(d).names.includes('@s/y'));
  } finally { cleanup(env); }
});

test('run: si el agente cambia node_modules la corrida es inválida y la copia se descarta; la fuente no se toca', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { manifest } = await imp('nm.mjs');
    const srcBefore = manifest(path.join(env.src, 'node_modules')).digest;
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'nm-modify' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.nm.snapshotChanged, true);
    assert.ok(m.invalidReasons.includes('nm_changed'));
    assert.ok(!fs.existsSync(path.join(env.work, '_nm')), 'la copia modificada se borró');
    assert.strictEqual(manifest(path.join(env.src, 'node_modules')).digest, srcBefore, 'la fuente intacta');
    assert.ok(!fs.existsSync(path.join(env.src, 'node_modules', 'zz-new')));
    assert.strictEqual(m.nm.sourceChanged, false);
    // La próxima preparación vuelve a copiar desde la fuente intacta, sin lo que dejó el agente.
    await prepared(env, 'A', 2);
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'dep', 'index.js')));
    assert.ok(!fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'zz-new')));
    const ok = await withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 2 }));
    assert.ok(!ok.invalidReasons.includes('nm_changed') && ok.nm.snapshotChanged === false);
  } finally { cleanup(env); }
});

test('run: si la fuente cambia durante la corrida se marca source_nm_changed', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'src-nm-modify', FAKE_CLAUDE_SRC_NM: path.join(env.src, 'node_modules') }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.nm.sourceChanged, true);
    assert.ok(m.invalidReasons.includes('source_nm_changed'));
  } finally { cleanup(env); }
});

test('run: una copia de node_modules alterada se repone sola, gratis y antes de gastar; si la fuente cambió, frena', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    fs.mkdirSync(path.join(env.work, '_nm', 'node_modules', 'tampered'));
    const m = await runTask(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.ok(!fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'tampered')), 'se volvió a copiar desde la fuente');
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'dep', 'index.js')));
    assert.ok(!m.invalidReasons.includes('nm_changed'));
    // Alterada Y la fuente ya no es la que se copió: no se repone sola y no se gasta nada.
    await prepared(env, 'A', 2);
    fs.mkdirSync(path.join(env.work, '_nm', 'node_modules', 'tampered'));
    fs.mkdirSync(path.join(env.src, 'node_modules', 'new-dep'));
    await assert.rejects(() => runTask(cfg, { task: 't1', arm: 'A', rep: 2 }), /fuente/);
    assert.ok(!fs.existsSync(path.join(runDirName(env, 't1', 'A', 2), 'stream.jsonl')));
  } finally { cleanup(env); }
});

test('árbol medido: el código en un worktree se mide y se acepta ahí (con node_modules y copyDirs)', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { acceptRun } = await imp('accept.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'worktree' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.trees.measured.kind, 'worktree');
    assert.strictEqual(m.trees.noChanges, false);
    assert.ok(!m.invalidReasons.includes('no_changes'));
    assert.ok(m.trees.branchesAhead.length === 0, 'el worktree tiene cambios sin commit: la rama no está adelantada');
    await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    const dir = runDirName(env, 't1', 'A', 1);
    const wt = path.join(dir, 'wt');
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8'));
    assert.strictEqual(path.resolve(c.measuredTree).toLowerCase(), path.resolve(wt).toLowerCase());
    assert.deepStrictEqual(c.files, ['src/feature.js']);
    assert.strictEqual(c.candidates.length, 2);
    assert.deepStrictEqual(c.flags, []);
    assert.ok(fs.existsSync(path.join(wt, 'test', 'new.test.js')), 'los tests de aceptación se copian al árbol medido');
    assert.ok(!fs.existsSync(path.join(dir, 'repo', 'test', 'new.test.js')));
    assert.ok(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink() && fs.existsSync(path.join(wt, 'node_modules', 'dep', 'index.js')));
    assert.strictEqual(fs.readFileSync(path.join(wt, 'generated', 'client', 'index.js'), 'utf8'), 'module.exports = "client";\n');
  } finally { cleanup(env); }
});

test('árbol medido: cambios en dos árboles se registran todos y se marca multiple_trees', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { acceptRun } = await imp('accept.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    await withEnv({ FAKE_CLAUDE_MODE: 'worktree,edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    const c = JSON.parse(fs.readFileSync(path.join(runDirName(env, 't1', 'A', 1), 'changes.json'), 'utf8'));
    assert.deepStrictEqual(c.flags, ['multiple_trees']);
    assert.strictEqual(c.candidates.filter((x) => x.filesChanged > 0).length, 2);
    assert.strictEqual(c.candidates.length, 2);
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.match(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))[0].note, /multiple_trees/);
  } finally { cleanup(env); }
});

test('árbol medido: código solo en una rama (sin worktree) se mide y se acepta en un worktree propio', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { acceptRun } = await imp('accept.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'branch-only' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.deepStrictEqual(m.trees.branchesAhead, [{ branch: 'feature', ahead: 1 }]);
    assert.strictEqual(m.trees.measured.kind, 'branch');
    assert.ok(!m.invalidReasons.includes('no_changes'));
    await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    const dir = runDirName(env, 't1', 'A', 1);
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8'));
    assert.deepStrictEqual(c.files, ['src/feature.js']);
    assert.ok(path.resolve(c.measuredTree).toLowerCase().endsWith(`${path.sep}measured`));
    assert.ok(fs.existsSync(path.join(dir, 'measured', 'test', 'new.test.js')));
  } finally { cleanup(env); }
});

test('run: una corrida que termina sin cambios (por ejemplo con una pregunta) queda inválida por no_changes', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'ask' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.trees.noChanges, true);
    assert.ok(m.invalidReasons.includes('no_changes'));
    assert.ok(m.finalText.endsWith('A or B?'));
  } finally { cleanup(env); }
});

test('accept: los conteos son solo de código (pathspec, también con espacios) y el parche completo conserva todo', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { acceptRun } = await imp('accept.mjs');
    await withEnv({ FAKE_CLAUDE_MODE: 'process-files' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    const dir = runDirName(env, 't1', 'A', 1);
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8'));
    assert.deepStrictEqual(c.files, ['docs/my notes/file with space.md', 'src/feature.js']);
    assert.strictEqual(c.linesAdded, 4);
    assert.ok(c.rawFilesChanged > c.filesChanged, 'el total sin excluir se conserva aparte');
    const raw = fs.readFileSync(path.join(dir, 'changes.patch'), 'utf8');
    assert.ok(raw.includes('docs/superpowers/plan.md') && raw.includes('.superpowers/note.md') && raw.includes('docs/sessions/s.md'));
    const blindPatch = fs.readFileSync(path.join(dir, 'changes.blind.patch'), 'utf8');
    for (const hidden of ['plan.md', '.superpowers', 'docs/sessions', 'CLAUDE.md', '.gitignore']) assert.ok(!blindPatch.includes(hidden), `${hidden} fuera del diff a ciegas`);
    assert.ok(blindPatch.includes('file with space.md') && blindPatch.includes('src/feature.js'));
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- enlaces, limpieza, configDir, entorno y árboles raros

const link = (target, at) => fs.symlinkSync(target, at, 'junction');

test('prepare: se niega, antes de copiar y de gastar, si node_modules tiene enlaces que salen de la carpeta', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    const cfg = loadConfig(env.cfgPath);
    const outside = path.join(env.root, 'outside');
    put(outside, 'secret.txt', 'x');
    const nm = path.join(env.src, 'node_modules');
    // Un enlace que queda adentro es válido.
    link(path.join(nm, 'dep'), path.join(nm, 'alias-dep'));
    await prepare(cfg, { task: 't1', arm: 'A', rep: 1 });
    fs.rmSync(path.join(env.work), { recursive: true, force: true });
    for (const where of ['lnk', '@scope/pkg', '.pnpm/pkg']) {
      const at = path.join(nm, ...where.split('/'));
      fs.mkdirSync(path.dirname(at), { recursive: true });
      link(outside, at);
      await assert.rejects(() => prepare(cfg, { task: 't1', arm: 'A', rep: 1 }), /enlaces que salen/, where);
      assert.ok(!fs.existsSync(path.join(env.work, '_nm')), 'no queda copia');
      assert.ok(!fs.existsSync(runDirName(env, 't1', 'A', 1)), 'no queda la carpeta de la corrida');
      fs.rmdirSync(at);
    }
    assert.ok(fs.existsSync(path.join(outside, 'secret.txt')), 'el destino del enlace no se tocó');
  } finally { cleanup(env); }
});

test('prepare: un copyDirs con un enlace que sale de la carpeta se rechaza', async () => {
  const env = setup();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { prepare } = await imp('prepare.mjs');
    const cfg = loadConfig(env.cfgPath);
    const outside = path.join(env.root, 'outside');
    put(outside, 'secret.txt', 'x');
    link(outside, path.join(env.src, 'generated', 'client', 'out'));
    await assert.rejects(() => prepare(cfg, { task: 't1', arm: 'A', rep: 1 }), /enlaces que salen|copyDirs/);
    assert.ok(!fs.existsSync(runDirName(env, 't1', 'A', 1)));
    assert.ok(fs.existsSync(path.join(outside, 'secret.txt')));
  } finally { cleanup(env); }
});

test('clean: borra la carpeta de una corrida sin seguir ningún enlace y se niega si hay datos sin registrar', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { cleanRun } = await imp('clean.mjs');
    const { runTask } = await imp('execute.mjs');
    const { appendRow } = await imp('row.mjs');
    const dir = runDirName(env, 't1', 'A', 1);
    const outside = path.join(env.root, 'outside');
    put(outside, 'keep.txt', 'x');
    for (const rel of ['measured/node_modules', '.worktrees/x/node_modules', 'repo/sub/lnk']) {
      const at = path.join(dir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(at), { recursive: true });
      link(outside, at);
    }
    // Solo preparada: se limpia sin más.
    const r = cleanRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.strictEqual(r.removed, true);
    assert.ok(!fs.existsSync(dir));
    assert.ok(fs.existsSync(path.join(outside, 'keep.txt')), 'el destino de los enlaces intacto');
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'dep', 'index.js')), 'la copia compartida intacta');
    assert.ok(fs.existsSync(path.join(env.src, 'node_modules', 'dep', 'index.js')));
    // Con datos de una corrida que no está en el CSV: se niega, salvo --force.
    await prepared(env, 'A', 1);
    await runTask(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.throws(() => cleanRun(cfg, { task: 't1', arm: 'A', rep: 1 }), /sin registrar|--force/);
    assert.ok(fs.existsSync(dir));
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.strictEqual(cleanRun(cfg, { task: 't1', arm: 'A', rep: 1 }).removed, true);
    // Una carpeta que no existe no es un error.
    assert.strictEqual(cleanRun(cfg, { task: 't1', arm: 'A', rep: 1 }).removed, false);
    // --force con datos sin registrar.
    await prepared(env, 'B', 1);
    await runTask(cfg, { task: 't1', arm: 'B', rep: 1 });
    assert.strictEqual(cleanRun(cfg, { task: 't1', arm: 'B', rep: 1 }, { force: true }).removed, true);
  } finally { cleanup(env); }
});

test('CLI: clean borra la corrida', () => {
  const env = setup();
  try {
    assert.strictEqual(cli(env, 'prepare', '--task', 't1', '--arm', 'A', '--rep', '1').status, 0);
    const c = cli(env, 'clean', '--task', 't1', '--arm', 'A', '--rep', '1');
    assert.strictEqual(c.status, 0, c.err);
    assert.ok(!fs.existsSync(runDirName(env, 't1', 'A', 1)));
    assert.ok(fs.existsSync(path.join(env.src, 'node_modules', 'dep', 'index.js')));
  } finally { cleanup(env); }
});

test('run: chequeo de configDir por installed_plugins.json y plugins/cache; plugins/data se permite y queda anotado', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask, checkConfigDir } = await imp('execute.mjs');
    const dir = path.join(env.root, 'cd');
    const reset = () => { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); };
    reset(); put(dir, 'plugins/installed_plugins.json', '{"version":2,"plugins":{}}');
    assert.doesNotThrow(() => checkConfigDir(dir), 'archivo vacío: bien');
    reset(); put(dir, 'plugins/installed_plugins.json', '{"version":2,"plugins":{"a@b":[{"scope":"user"}]}}');
    assert.throws(() => checkConfigDir(dir), /installed_plugins/);
    reset(); put(dir, 'plugins/installed_plugins.json', '{"plugins":{"a@b":{"version":"1"}}}');
    assert.throws(() => checkConfigDir(dir), /installed_plugins/, 'formato viejo');
    reset(); put(dir, 'plugins/installed_plugins.json', 'no es json');
    assert.throws(() => checkConfigDir(dir), /installed_plugins/, 'ilegible: no se adivina');
    reset(); put(dir, 'plugins/cache/x/y.txt', 'x');
    assert.throws(() => checkConfigDir(dir), /cache/);
    reset(); put(dir, 'plugins/data/x/y.txt', 'x'); put(dir, 'plugins/known_marketplaces.json', '{}');
    assert.doesNotThrow(() => checkConfigDir(dir));
    // Lo que aparece en plugins/data durante la corrida queda en config_dir_delta.
    reset(); put(dir, 'settings.json', '{}');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'cfg-write' }, () => runTask({ ...cfg, configDir: dir }, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(m.config_dir_delta.added.includes('cache-x'));
  } finally { cleanup(env); }
});

test('configDir: el contenido sincronizado de la cuenta (skills/synced, plugins/synced, plugins/data) es neutral; lo demás o lo que se llame como un brazo bloquea', async () => {
  const env = setup();
  try {
    const { checkConfigDir } = await imp('execute.mjs');
    const { DEFAULT_NEUTRAL_CONFIG_PATHS } = await imp('config.mjs');
    assert.deepStrictEqual(DEFAULT_NEUTRAL_CONFIG_PATHS, ['skills/synced', 'plugins/synced', 'plugins/data']);
    const dir = path.join(env.root, 'cd2');
    const reset = () => { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); };
    const arms = ['superpowers', 'pignolo'];
    reset();
    put(dir, 'skills/synced/b1/docx/SKILL.md', 'x'); put(dir, 'skills/synced/b1/built-in-browser/SKILL.md', 'x');
    put(dir, 'plugins/synced/b1/acme-tools/.claude-plugin/plugin.json', '{"name":"acme-tools"}'); put(dir, 'plugins/synced/b1/acme-tools/.mcp.json', '{}');
    put(dir, 'plugins/data/pignolo-inline/state.json', '{}');
    assert.doesNotThrow(() => checkConfigDir(dir, { armNames: arms }), 'lo sincronizado y los datos del plugin del brazo son neutrales');
    // Cualquier otra cosa en skills/ o plugins/ sigue bloqueando.
    reset(); put(dir, 'skills/synced/b1/docx/SKILL.md', 'x'); put(dir, 'skills/mine/SKILL.md', 'x');
    assert.throws(() => checkConfigDir(dir, { armNames: arms }), /skills\/mine/);
    reset(); put(dir, 'plugins/synced/b1/a/plugin.json', '{"name":"a"}'); put(dir, 'plugins/cache/x/y.txt', 'x');
    assert.throws(() => checkConfigDir(dir, { armNames: arms }), /cache/);
    reset(); put(dir, 'plugins/installed_plugins.json', '{"plugins":{"a@b":[{}]}}');
    assert.throws(() => checkConfigDir(dir, { armNames: arms }), /installed_plugins/);
    reset(); put(dir, 'skills/synced/b1/docx/SKILL.md', 'x'); put(dir, 'settings.json', '{"hooks":{"Stop":[]}}');
    assert.throws(() => checkConfigDir(dir, { armNames: arms }), /hooks/);
    reset(); put(dir, 'skills/synced/b1/docx/SKILL.md', 'x'); put(dir, 'CLAUDE.md', '# x');
    assert.throws(() => checkConfigDir(dir, { armNames: arms }), /CLAUDE\.md/);
    // Una ruta que no está en la lista deja de ser neutral.
    reset(); put(dir, 'skills/synced/b1/docx/SKILL.md', 'x');
    assert.throws(() => checkConfigDir(dir, { armNames: arms, neutralPaths: ['plugins/data'] }), /skills\/synced/);
    // Contenido sincronizado que se llama como un brazo: contamina.
    for (const [rel, body, label] of [
      ['skills/synced/b1/superpowers/SKILL.md', 'x', 'skill con el nombre de un brazo'],
      ['skills/synced/b1/pignolo-ui/SKILL.md', 'x', 'skill con prefijo de un brazo'],
      ['skills/synced/superpowers-extra/docx/SKILL.md', 'x', 'bucket con prefijo de un brazo'],
      ['plugins/synced/b1/whatever/.claude-plugin/plugin.json', '{"name":"pignolo"}', 'plugin.json con el nombre de un brazo'],
      ['plugins/synced/b1/superpowers-x/.claude-plugin/plugin.json', '{"name":"other"}', 'carpeta de plugin con prefijo de un brazo'],
    ]) {
      reset(); put(dir, rel, body);
      assert.throws(() => checkConfigDir(dir, { armNames: arms }), /sincronizado.*(superpowers|pignolo)|(superpowers|pignolo).*sincronizado/, label);
    }
    // El nombre de un brazo como parte de otro nombre no contamina (no es prefijo con guion).
    reset(); put(dir, 'skills/synced/b1/mypignolo/SKILL.md', 'x');
    assert.doesNotThrow(() => checkConfigDir(dir, { armNames: arms }));
  } finally { cleanup(env); }
});

test('run: se registra el contenido sincronizado (solo nombres y conteos), si ya estaba o lo creó la corrida, y en la fila', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { appendRow } = await imp('row.mjs');
    // Creado por la corrida (como en el primer inicio de sesión con la cuenta).
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'sync,edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    const c = m.neutralConfigContent;
    assert.deepStrictEqual(c.after.skillsSynced, { files: 3, folders: ['docx', 'pdf'] });
    assert.deepStrictEqual(c.after.pluginsSynced, { files: 3, plugins: ['acme-tools'] });
    assert.deepStrictEqual(c.after.pluginsData, { folders: ['arm-inline'] });
    assert.deepStrictEqual(c.before.skillsSynced, { files: 0, folders: [] });
    assert.strictEqual(c.createdByRun, true);
    assert.ok(!JSON.stringify(c).includes('"x"'), 'nunca contenido');
    assert.strictEqual(appendRow(cfg, { task: 't1', arm: 'A', rep: 1 }).neutral_config, 'skills_synced=3;plugins_synced=3;plugins_data=1;creado_en_la_corrida');
    // Ya estaba antes de la corrida: pasa el chequeo previo y no figura como creado.
    await prepared(env, 'A', 2);
    const m2 = await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 2 }));
    assert.strictEqual(m2.neutralConfigContent.createdByRun, false);
    assert.strictEqual(m2.neutralConfigContent.before.skillsSynced.files, 3);
    assert.strictEqual(appendRow(cfg, { task: 't1', arm: 'A', rep: 2 }).neutral_config, 'skills_synced=3;plugins_synced=3;plugins_data=1');
    assert.ok(!m2.invalidReasons.includes('contaminated'));
  } finally { cleanup(env); }
});

test('run: un plugin del init que viene del contenido sincronizado es neutral; uno desconocido sigue contaminando', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const ok = await withEnv({ FAKE_CLAUDE_MODE: 'sync,sync-plugin,edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(ok.contamination, false, ok.contaminationHits.join(','));
    assert.deepStrictEqual(ok.neutralPluginsLoaded, ['acme-tools']);
    // El mismo plugin en el init pero SIN estar en el contenido sincronizado: contaminación.
    await prepared(env, 'B', 1);
    const fresh = path.join(env.root, 'cd-fresh');
    fs.mkdirSync(fresh);
    const bad = await withEnv({ FAKE_CLAUDE_MODE: 'sync-plugin,edit' }, () => runTask({ ...cfg, configDir: fresh }, { task: 't1', arm: 'B', rep: 1 }));
    assert.deepStrictEqual(bad.contaminationHits.filter((h) => h.startsWith('plugin:')), ['plugin:acme-tools']);
    assert.ok(bad.invalidReasons.includes('contaminated'));
  } finally { cleanup(env); }
});

test('metrics: contenido sincronizado que aparece con el nombre de un brazo durante la corrida la invalida', async () => {
  const { invalidReasons } = await imp('metrics.mjs');
  const base = { hasResult: true, resultSubtype: 'success', isError: false, exitCode: 0, timedOut: false, contaminationHits: [] };
  assert.deepStrictEqual(invalidReasons(base), []);
  assert.deepStrictEqual(invalidReasons({ ...base, neutralConfigArmNamed: ['skills/synced/b1/pignolo-ui'] }), ['contaminated']);
});

test('metrics: un plugin con el nombre del brazo como prefijo (pignolo-ui) no es el propio', async () => {
  const { parseStream, belongsTo } = await imp('metrics.mjs');
  assert.strictEqual(belongsTo('pignolo-ui@market', 'pignolo'), false);
  assert.strictEqual(belongsTo('pignolo-ui', 'pignolo'), false);
  assert.strictEqual(belongsTo('superpowers-x', 'superpowers'), false);
  assert.strictEqual(belongsTo('pignolo@market', 'pignolo'), true);
  assert.strictEqual(belongsTo('pignolo:work', 'pignolo'), true);
  const stream = JSON.stringify({ type: 'system', subtype: 'init', plugins: [{ name: 'pignolo-ui@market' }] });
  const m = parseStream(stream, { ownPlugin: 'pignolo', otherPlugin: 'superpowers' });
  assert.strictEqual(m.ownPluginLoaded, false);
  assert.ok(m.contaminationHits.includes('plugin:pignolo-ui@market'));
});

test('accept: los comandos corren con el entorno en lista blanca, sin secretos ni CLAUDE_CONFIG_DIR', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { acceptRun } = await imp('accept.mjs');
    const outFile = path.join(env.root, 'env-names.json');
    put(env.priv, 't1/accept/check.js', 'require("fs").writeFileSync(process.argv[2],JSON.stringify(Object.keys(process.env)));console.log("Tests  2 passed (2)");\n');
    put(env.priv, 't1/accept-cmd.txt', `node check.js "${outFile}"\n`);
    await withEnv({ GITHUB_TOKEN: 'tok', ANTHROPIC_API_KEY: 'sk', CLAUDE_CONFIG_DIR: 'x', MY_APP_SECRET: 's', FAKE_CLAUDE_MODE: 'ok' }, () => acceptRun({ ...cfg, extraEnvAllow: [...cfg.extraEnvAllow, 'KEEP_ME'] }, { task: 't1', arm: 'A', rep: 1 }));
    const names = JSON.parse(fs.readFileSync(outFile, 'utf8')).map((n) => n.toUpperCase());
    for (const n of ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'MY_APP_SECRET', 'DISABLE_AUTOUPDATER']) assert.ok(!names.includes(n), n);
    assert.ok(names.includes('PATH') || names.includes('SYSTEMROOT'));
    assert.ok(names.includes('FAKE_CLAUDE_MODE'), 'lo que el autor permite en extraEnvAllow llega');
  } finally { cleanup(env); }
});

test('árboles: un worktree que ya no existe no rompe la medición; solo cambios en archivos excluidos no son "sin cambios"', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'worktree-gone' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(m.treesError, null, 'el worktree desaparecido se ignora (prune)');
    assert.deepStrictEqual(m.postRunError, []);
    assert.ok(m.trees.candidates.every((c) => c.kind !== 'worktree'));
    assert.ok(m.invalidReasons.includes('no_changes'), 'el código se perdió con el worktree');
    // Un cambio solo en un archivo excluido (una nota) sigue siendo un cambio: no se puede decir que no hizo nada.
    const cfg2 = await prepared(env, 'B', 1);
    const m2 = await withEnv({ FAKE_CLAUDE_MODE: 'only-excluded' }, () => runTask(cfg2, { task: 't1', arm: 'B', rep: 1 }));
    assert.strictEqual(m2.trees.noChanges, false);
    assert.ok(!m2.invalidReasons.includes('no_changes'));
    const { acceptRun } = await imp('accept.mjs');
    await acceptRun(cfg2, { task: 't1', arm: 'B', rep: 1 });
    const c = JSON.parse(fs.readFileSync(path.join(runDirName(env, 't1', 'B', 1), 'changes.json'), 'utf8'));
    assert.deepStrictEqual([c.filesChanged, c.rawFilesChanged, c.noChanges], [0, 1, false]);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- robustez después de gastar, tope y carpetas

test('ledger: cuenta calibración en su subcarpeta, corridas interrumpidas y el registro de gasto del revisor; exige 25 % de margen', async () => {
  const env = setup();
  try {
    const cfg = await loadWith(env, {});
    const { spentUsd, assertWithinTotalCap } = await imp('ledger.mjs');
    put(env.work, 'toy-calib/t1-A-1/metrics.json', JSON.stringify({ task: 't1', arm: 'A', rep: 1, finishedAt: 'x', costUsd: 3 }));
    put(env.work, 't1-A-2/stream.jsonl', '{}\n');
    put(env.work, 't1-B-1/prepare.json', '{}');
    put(env.priv, 'grader-spend.csv', 'date,usd,note\n2026-10-23,1.5,pack t1\n2026-10-24,0.5,\n');
    assert.strictEqual(spentUsd(cfg), 3 + 5 + 2, 'calibración 3, interrumpida 5 (tope por corrida), revisor 2; una corrida solo preparada no cuesta');
    assert.doesNotThrow(() => assertWithinTotalCap({ ...cfg, totalCapUsd: 16.25 }));
    assert.throws(() => assertWithinTotalCap({ ...cfg, totalCapUsd: 16 }), /tope total/);
  } finally { cleanup(env); }
});

test('run: si no se puede borrar la copia de node_modules (EBUSY) la corrida igual queda escrita, con drop_failed', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const busy = () => { throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' }); };
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'nm-modify,edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }, { removeTree: busy }));
    assert.ok(m.invalidReasons.includes('nm_changed') && m.invalidReasons.includes('drop_failed'));
    assert.ok(m.nm.drop.trash.includes('_nm.trash-') && fs.existsSync(m.nm.drop.trash), 'la carpeta renombrada queda para borrarla después');
    assert.ok(!fs.existsSync(path.join(env.work, '_nm')), 'el nombre _nm quedó libre');
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'A', 1), 'metrics.json')));
    // La próxima preparación vuelve a copiar y limpia la basura anterior.
    await prepared(env, 'A', 2);
    assert.ok(fs.existsSync(path.join(env.work, '_nm', 'node_modules', 'dep', 'index.js')));
    assert.ok(!fs.existsSync(m.nm.drop.trash), 'la basura se borró cuando ya no estaba bloqueada');
  } finally { cleanup(env); }
});

test('run: cualquier error después de gastar se anota (post_run_error) y metrics.json se escribe igual', async () => {
  const env = setup();
  try {
    const cfg = { ...(await prepared(env, 'A', 1)), trackProcesses: true };
    const { runTask } = await imp('execute.mjs');
    let calls = 0;
    const m = await runTask(cfg, { task: 't1', arm: 'A', rep: 1 }, { listProcesses: () => { calls += 1; if (calls === 2) throw new Error('tasklist roto'); return []; } });
    assert.ok(m.invalidReasons.includes('post_run_error'));
    assert.match(m.postRunError.join(' '), /tasklist roto/);
    assert.strictEqual(m.costUsd, 0.5, 'lo medido se conserva');
    assert.ok(fs.existsSync(path.join(runDir(env, 't1', 'A', 1), 'metrics.json')));
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- corridas inválidas, pesos por modelo, texto final

test('run: tope de presupuesto superado, error y corte por tiempo quedan marcados como inválidos', async () => {
  const env = setup({ timeoutMs: 800 });
  try {
    const { runTask } = await imp('execute.mjs');
    const cfgA = await prepared(env, 'A', 1);
    const budget = await withEnv({ FAKE_CLAUDE_MODE: 'budget,edit' }, () => runTask(cfgA, { task: 't1', arm: 'A', rep: 1 }));
    assert.strictEqual(budget.resultSubtype, 'error_max_budget_usd');
    assert.deepStrictEqual(budget.invalidReasons.sort(), ['budget_cap', 'is_error']);
    await prepared(env, 'A', 2);
    const failed = await withEnv({ FAKE_CLAUDE_MODE: 'fail,edit' }, () => runTask(cfgA, { task: 't1', arm: 'A', rep: 2 }));
    assert.deepStrictEqual(failed.invalidReasons.sort(), ['exit_nonzero', 'is_error', 'result_not_success']);
    await prepared(env, 'A', 3);
    const hung = await withEnv({ FAKE_CLAUDE_MODE: 'hang' }, () => runTask(cfgA, { task: 't1', arm: 'A', rep: 3 }));
    assert.deepStrictEqual(hung.invalidReasons.sort(), ['no_changes', 'no_result', 'timed_out']);
    await prepared(env, 'A', 4);
    const ok = await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runTask(cfgA, { task: 't1', arm: 'A', rep: 4 }));
    assert.deepStrictEqual(ok.invalidReasons, []);
    const { invalidReasons } = await imp('metrics.mjs');
    assert.deepStrictEqual(invalidReasons({ hasResult: true, resultSubtype: 'error_max_turns', isError: true, exitCode: 0, timedOut: false, contaminationHits: [] }).sort(), ['is_error', 'result_not_success']);
    assert.deepStrictEqual(invalidReasons({ hasResult: true, resultSubtype: 'success', isError: false, exitCode: 0, timedOut: false, contaminationHits: [] }), []);
  } finally { cleanup(env); }
});

test('metrics: un solo juego de pesos, multiplicado por el factor de la familia del modelo', async () => {
  const { weightedTokens, parseStream } = await imp('metrics.mjs');
  const t = { input: 100, output: 10, cacheRead: 1000, cacheWrite: 100 };
  const base = weightedTokens(t); // 100 + 50 + 100 + 125
  assert.strictEqual(base, 375);
  assert.strictEqual(weightedTokens(t, undefined, 5), 1875);
  const { modelFactorFor } = await imp('metrics.mjs');
  const factors = { opus: 5, sonnet: 1, haiku: 0.33 };
  assert.strictEqual(modelFactorFor('claude-opus-4-1-20250805', factors), 5);
  assert.strictEqual(modelFactorFor('claude-sonnet-4-5[1m]', factors), 1);
  assert.strictEqual(modelFactorFor('claude-haiku-4-5', factors), 0.33);
  assert.strictEqual(modelFactorFor('mystery-model', factors), 1, 'sin familia conocida: 1');
  const mu = (n) => ({ inputTokens: n, outputTokens: n, cacheReadInputTokens: n, cacheCreationInputTokens: n });
  const stream = [
    JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-opus-4-1', plugins: [{ name: 'superpowers' }] }),
    JSON.stringify({ type: 'result', subtype: 'success', total_cost_usd: 3, modelUsage: { 'claude-opus-4-1': mu(100), 'claude-haiku-4-5': mu(100), 'weird-model': mu(10) } }),
  ].join('\n');
  const m = parseStream(stream, { ownPlugin: 'superpowers', otherPlugin: 'pignolo', modelFactor: factors });
  const per = 100 * 1 + 100 * 5 + 100 * 0.1 + 100 * 1.25; // 735
  assert.strictEqual(m.weightedTokens, Math.round((per * 5 + per * 0.33 + 73.5) * 100) / 100);
  assert.deepStrictEqual(m.tokensByModel['claude-opus-4-1'], { input: 100, output: 100, cacheRead: 100, cacheWrite: 100 });
  assert.deepStrictEqual(m.unknownModels, ['weird-model']);
  assert.deepStrictEqual(m.tokens, { input: 210, output: 210, cacheRead: 210, cacheWrite: 210 });
});

test('run: guarda el final del texto del resultado (solo en metrics.json) para ver si terminó con una pregunta', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const m = await withEnv({ FAKE_CLAUDE_MODE: 'ask' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    assert.ok(m.finalText.length <= 1024 && m.finalText.endsWith('A or B?'), 'las últimas líneas, acotadas a ~1 KB');
    const ok = await prepared(env, 'B', 1);
    const m2 = await withEnv({ FAKE_CLAUDE_MODE: 'ok' }, () => runTask(ok, { task: 't1', arm: 'B', rep: 1 }));
    assert.strictEqual(m2.finalText, 'Done.');
  } finally { cleanup(env); }
});

test('row: una corrida inválida se marca con sus motivos y una fila de otro experimento se rechaza', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, {
      acceptance: ACC, changes: CHG,
      metrics: { resultSubtype: 'error_max_budget_usd', isError: true, exitCode: 1, timedOut: true, invalidReasons: ['budget_cap', 'is_error', 'timed_out'] },
    });
    writeRun(env, 't1', 'B', 1, { acceptance: ACC, changes: CHG, metrics: { experiment: 'otro-exp' } });
    const { loadConfig } = await imp('config.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const cfg = loadConfig(env.cfgPath);
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1 });
    const [r] = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'));
    assert.deepStrictEqual([r.invalid, r.invalid_reason, r.result_subtype, r.is_error, r.exit_code, r.timed_out], ['true', 'budget_cap;is_error;timed_out', 'error_max_budget_usd', 'true', '1', 'true']);
    assert.throws(() => appendRow(cfg, { task: 't1', arm: 'B', rep: 1 }), /otro-exp/);
    // Las corridas de otro experimento viven en su propia subcarpeta de workRoot.
    fs.mkdirSync(path.join(env.work, 'otro-exp'));
    fs.renameSync(runDir(env, 't1', 'B', 1), path.join(env.work, 'otro-exp', 't1-B-1'));
    appendRow({ ...cfg, experiment: 'otro-exp' }, { task: 't1', arm: 'B', rep: 1 });
    assert.strictEqual(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))[1].experiment, 'otro-exp');
  } finally { cleanup(env); }
});

test('escapes: la coincidencia es en el borde de la ruta; formas de git-bash, barras dobles y ".." que salen de la corrida', async () => {
  const { findEscape } = await imp('metrics.mjs');
  const ctx = { sourceRepo: 'C:\\X\\app', privateRoot: 'C:\\X\\priv', workRoot: 'C:\\X\\work', runDir: 'C:\\X\\work\\t1-A-1' };
  const stream = (input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input }] } });
  const hit = (command) => findEscape(stream({ command }), ctx);
  // No son escapes: prefijos parecidos, la propia carpeta, la copia compartida y ".." que se queda adentro.
  for (const ok of [
    'ls C:\\X\\app-runs\\foo', 'ls C:/X/app-runs', 'cat C:\\X\\private-runs\\a', 'cat /c/X/private-runs/a', 'echo C:\\X\\application',
    'type C:\\X\\work\\t1-A-1\\repo\\src\\a.js', 'cat /c/X/work/t1-A-1/repo/a', 'dir C:\\X\\work\\_nm\\dep',
    'cd ..', 'cat ../wt/a.js', 'cat src/../lib/a.js', 'curl http://example.com/a/../b', 'grep -r "a..b" src',
  ]) assert.strictEqual(hit(ok), null, ok);
  // Sí lo son.
  for (const [bad, why] of [
    ['cat C:\\X\\app\\src\\a.js', 'fuente'], ['ls C:/X/app', 'fuente con barras'], ['cat /c/X/app/src/a.js', 'git-bash'],
    ['cd "C:\\\\X\\\\priv\\\\t1"', 'barras dobles'], ['ls /mnt/c/X/priv', 'WSL'], ['ls C:\\X\\work', 'la raíz de las corridas'],
    ['cat C:\\X\\work\\t1-B-1\\repo\\a', 'otra corrida'], ['cat C:\\X\\work\\t1-A-10\\repo\\a', 'otra corrida con el mismo prefijo'],
    ['cd ../..', 'sale de la corrida'], ['cat ../../t1-B-1/repo/a', 'sale y entra en otra'], ['ls C:/X/app;ls', 'borde con ;'],
  ]) {
    const r = hit(bad);
    assert.ok(r && r.command.length <= 200, `${why}: ${bad}`);
  }
  assert.strictEqual(hit('cat C:\\X\\app\\a').match, 'sourceRepo');
  assert.strictEqual(hit('cd ../..').match, 'relativeEscape');
  // Calibración: la propia carpeta vive en <workRoot>/<experimento>/<corrida>.
  const calib = { ...ctx, runDir: 'C:\\X\\work\\calib\\t1-A-1' };
  assert.strictEqual(findEscape(stream({ command: 'cat C:\\X\\work\\calib\\t1-A-1\\repo\\a' }), calib), null);
  assert.ok(findEscape(stream({ command: 'cat C:\\X\\work\\calib\\t1-B-1\\repo\\a' }), calib));
  assert.ok(findEscape(stream({ file_path: 'C:\\X\\priv\\t1\\prompt.md' }), ctx), 'también en otros campos del input');
});

// ---------------------------------------------------------------- accept

test('accept: calcula el resumen de cambios ANTES de copiar los tests y registra los conteos', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { runTask } = await imp('execute.mjs');
    const { acceptRun, parseCounts } = await imp('accept.mjs');
    await withEnv({ FAKE_CLAUDE_MODE: 'edit' }, () => runTask(cfg, { task: 't1', arm: 'A', rep: 1 }));
    const a = await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    const dir = runDir(env, 't1', 'A', 1);
    const changes = JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8'));
    assert.deepStrictEqual(changes.files, ['src/feature.js']);
    assert.strictEqual(changes.filesChanged, 1);
    assert.strictEqual(changes.linesAdded, 3);
    assert.strictEqual(changes.linesRemoved, 0);
    assert.match(changes.shortstat, /1 file changed, 3 insertions/);
    const patch = fs.readFileSync(path.join(dir, 'changes.patch'), 'utf8');
    assert.ok(patch.includes('src/feature.js') && !patch.includes('new.test.js') && !patch.includes('check.js'));
    // Los tests de aceptación sí quedaron copiados en el repo, y después del resumen.
    assert.strictEqual(fs.readFileSync(path.join(dir, 'repo', 'test', 'new.test.js'), 'utf8'), '// acceptance test\n');
    assert.strictEqual(a.accept.exitCode, 1);
    assert.deepStrictEqual([a.accept.pass, a.accept.fail, a.accept.source], [2, 1, 'json']);
    assert.deepStrictEqual([a.full.pass, a.full.fail, a.full.source, a.full.exitCode], [3, 0, 'summary', 0]);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'acceptance.json'), 'utf8')), JSON.parse(JSON.stringify(a)));
    // Una segunda pasada no vuelve a calcular el resumen con los tests ya copiados.
    await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'changes.json'), 'utf8')).files, ['src/feature.js']);

    assert.deepStrictEqual(parseCounts('Tests  3 failed | 9 passed (12)', 1), { pass: 9, fail: 3, source: 'summary' });
    assert.deepStrictEqual(parseCounts('Tests:       1 failed, 2 passed, 3 total', 1), { pass: 2, fail: 1, source: 'summary' });
    assert.deepStrictEqual(parseCounts('ℹ pass 5\nℹ fail 0\n', 0), { pass: 5, fail: 0, source: 'summary' });
    assert.deepStrictEqual(parseCounts('Tests  4 passed (4)', 0), { pass: 4, fail: 0, source: 'summary' });
    assert.deepStrictEqual(parseCounts('nada reconocible', 0), { pass: 1, fail: 0, source: 'exit-code' });
    assert.deepStrictEqual(parseCounts('nada reconocible', 3), { pass: 0, fail: 1, source: 'exit-code' });
  } finally { cleanup(env); }
});

test('accept: guarda el código de salida y las suites fallidas; un archivo que no importa no es verde; lee el piso de la suite completa', async () => {
  const env = setup();
  try {
    const cfg = await prepared(env, 'A', 1);
    const { acceptRun, parseSuites } = await imp('accept.mjs');
    // Un archivo de test que no se puede importar: 0 tests fallidos, 1 suite fallida, salida 1.
    put(env.priv, 't1/accept/check.js',
      'const fs=require("fs");const p=process.argv[2];' +
      'if(p)fs.writeFileSync(p,JSON.stringify({numPassedTests:3,numFailedTests:0,numFailedTestSuites:1}));' +
      'console.log("Test Files  1 failed | 2 passed (3)");process.exit(1);\n');
    put(env.priv, 'tasks.json', JSON.stringify({ t1: { baselineFull: { fail: 2 } } }));
    const a = await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.deepStrictEqual([a.accept.pass, a.accept.fail, a.accept.exitCode, a.accept.suitesFailed], [3, 0, 1, 1]);
    assert.deepStrictEqual([a.full.exitCode, a.full.suitesFailed], [0, null]);
    assert.deepStrictEqual(a.baselineFull, { fail: 2 });
    // Sin tasks.json (o sin esa tarea) el piso queda desconocido: null, no cero.
    fs.rmSync(path.join(env.priv, 'tasks.json'));
    assert.strictEqual((await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 })).baselineFull, null);
    assert.strictEqual(parseSuites('Test Files  1 failed | 2 passed (3)'), 1);
    assert.strictEqual(parseSuites('Test Files  4 passed (4)'), 0);
    assert.strictEqual(parseSuites('Test Suites: 2 failed, 3 passed, 5 total'), 2);
    assert.strictEqual(parseSuites('ℹ pass 5'), null);
  } finally { cleanup(env); }
});

test('accept: el timeout del comando se registra y no cuelga', async () => {
  const env = setup({ acceptTimeoutMs: 500 });
  try {
    const cfg = await prepared(env, 'A', 1);
    put(env.priv, 't1/accept-cmd.txt', 'node -e "setInterval(()=>{},1000)"\n');
    const { acceptRun } = await imp('accept.mjs');
    const a = await acceptRun(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.strictEqual(a.accept.timedOut, true);
    assert.strictEqual(a.accept.fail, 1);
    assert.strictEqual(a.full.timedOut, false);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- row

function writeRun(env, task, arm, rep, { metrics = {}, acceptance, changes, patch, blindPatch } = {}) {
  const dir = runDir(env, task, arm, rep);
  fs.mkdirSync(dir, { recursive: true });
  const m = {
    task, arm, rep, experiment: 'toy-exp', model: 'sonnet', finishedAt: '2026-10-23T12:00:00.000Z', costUsd: 1.5,
    weightedTokens: 1200, tokens: { input: 150, output: 30, cacheRead: 1500, cacheWrite: 600 },
    tokensByModel: { 'fake-model': { input: 100, output: 20, cacheRead: 1000, cacheWrite: 400 }, 'fake-sub': { input: 50, output: 10, cacheRead: 500, cacheWrite: 200 } },
    wallS: 42.5, durationMs: 40000, turns: 4, agents: 2, agentsMain: 1, resultSubtype: 'success', isError: false, exitCode: 0,
    init: { model: 'fake-model', claude_code_version: '9.9.9-fake' }, invalidReasons: [],
    timedOut: false, contamination: false, ...metrics,
  };
  fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify(m));
  if (acceptance) fs.writeFileSync(path.join(dir, 'acceptance.json'), JSON.stringify(acceptance));
  if (changes) fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(changes));
  if (patch !== undefined) fs.writeFileSync(path.join(dir, 'changes.patch'), patch);
  if (blindPatch !== undefined) fs.writeFileSync(path.join(dir, 'changes.blind.patch'), blindPatch);
}
const ACC = {
  accept: { pass: 2, fail: 1, source: 'json', exitCode: 1, suitesFailed: 0 },
  full: { pass: 3, fail: 0, source: 'summary', exitCode: 0, suitesFailed: null },
  baselineFull: { fail: 0 },
};
const CHG = { filesChanged: 1, linesAdded: 3, linesRemoved: 0, files: ['src/feature.js'] };

test('row: agrega una fila con las columnas del contrato y rechaza duplicados', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, { acceptance: ACC, changes: CHG });
    const { loadConfig } = await imp('config.mjs');
    const { appendRow, COLUMNS, parseCsv } = await imp('row.mjs');
    const cfg = loadConfig(env.cfgPath);
    assert.strictEqual(COLUMNS.join(','),
      ['experiment', 'task', 'arm', 'rep', 'timestamp', 'model', 'model_resolved', 'claude_version', 'cost_usd', 'weighted_tokens', 'input', 'output',
        'cache_read', 'cache_write', 'model_tokens', 'wall_s', 'duration_ms', 'turns', 'agents', 'agents_main', 'result_subtype', 'is_error',
        'exit_code', 'timed_out', 'invalid', 'invalid_reason', 'accept_exit', 'accept_pass', 'accept_fail', 'accept_suites_failed', 'full_pass',
        'full_fail', 'full_baseline_fail', 'contamination', 'neutral_plugins', 'neutral_config', 'files_changed', 'lines_added', 'lines_removed', 'note'].join(','));
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1, note: 'prueba, con coma' });
    const lines = fs.readFileSync(cfg.csvPath, 'utf8').trim().split(/\r?\n/);
    assert.strictEqual(lines[0], COLUMNS.join(','));
    assert.strictEqual(lines.length, 2);
    const [r] = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'));
    assert.deepStrictEqual(r, {
      experiment: 'toy-exp', task: 't1', arm: 'A', rep: '1', timestamp: '2026-10-23T12:00:00.000Z', model: 'sonnet',
      model_resolved: 'fake-model', claude_version: '9.9.9-fake',
      cost_usd: '1.5', weighted_tokens: '1200', input: '150', output: '30', cache_read: '1500', cache_write: '600',
      model_tokens: 'fake-model=100/20/1000/400|fake-sub=50/10/500/200',
      wall_s: '42.5', duration_ms: '40000', turns: '4', agents: '2', agents_main: '1', result_subtype: 'success', is_error: 'false', exit_code: '0',
      timed_out: 'false', invalid: 'false', invalid_reason: '',
      accept_exit: '1', accept_pass: '2', accept_fail: '1', accept_suites_failed: '0', full_pass: '3', full_fail: '0', full_baseline_fail: '0',
      contamination: 'false', neutral_plugins: '', neutral_config: '', files_changed: '1', lines_added: '3', lines_removed: '0',
      note: 'prueba, con coma',
    });
    assert.throws(() => appendRow(cfg, { task: 't1', arm: 'A', rep: 1 }), /ya existe una fila.*rerun/);
    assert.strictEqual(fs.readFileSync(cfg.csvPath, 'utf8').trim().split(/\r?\n/).length, 2, 'no cambió');
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1, note: 'rerun' });
    assert.strictEqual(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8')).length, 2);
    // Una corrida sin aceptación todavía deja las columnas vacías en vez de inventar.
    writeRun(env, 't1', 'B', 1);
    appendRow(cfg, { task: 't1', arm: 'B', rep: 1 });
    const rows = parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'));
    assert.strictEqual(rows[2].accept_pass, '');
    assert.strictEqual(rows[2].files_changed, '');
  } finally { cleanup(env); }
});

test('row: un conteo por código de salida se avisa en la nota', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, { acceptance: { accept: { pass: 0, fail: 1, source: 'exit-code' }, full: { pass: 3, fail: 0, source: 'json' } }, changes: CHG });
    const { loadConfig } = await imp('config.mjs');
    const { appendRow, parseCsv } = await imp('row.mjs');
    const cfg = loadConfig(env.cfgPath);
    appendRow(cfg, { task: 't1', arm: 'A', rep: 1 });
    assert.match(parseCsv(fs.readFileSync(cfg.csvPath, 'utf8'))[0].note, /accept-por-codigo-de-salida/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- blind

const PATCH = (n, extra = '') =>
  `diff --git a/src/feature.js b/src/feature.js\nnew file mode 100644\n--- /dev/null\n+++ b/src/feature.js\n@@ -0,0 +1,1 @@\n+const value${n} = ${n};\n` + extra;
const PROCESS_ARTIFACT = 'diff --git a/docs/superpowers/plan.md b/docs/superpowers/plan.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/superpowers/plan.md\n@@ -0,0 +1,1 @@\n+plan\n';

function blindEnv() {
  const env = setup();
  let n = 0;
  for (const arm of ['A', 'B']) {
    for (const rep of [1, 2]) {
      n += 1;
      writeRun(env, 't1', arm, rep, {
        changes: { filesChanged: 1, linesAdded: n, linesRemoved: 0, files: ['src/feature.js'] },
        patch: PATCH(n, arm === 'A' && rep === 1 ? PROCESS_ARTIFACT : ''),
        blindPatch: PATCH(n),
      });
    }
  }
  return env;
}
function allFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p)); else out.push(p);
  }
  return out;
}

test('blind: los paquetes no revelan el brazo, la clave queda aparte y el orden es reproducible', async () => {
  const env = blindEnv();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { blind } = await imp('blind.mjs');
    const cfg = loadConfig(env.cfgPath);
    const r = blind(cfg, { task: 't1', reps: [1, 2] });
    const base = path.join(env.priv, 'blind', 't1');
    assert.strictEqual(r.packs, 4);
    const packs = fs.readdirSync(base).filter((d) => d.startsWith('pack-')).sort();
    assert.deepStrictEqual(packs, ['pack-1', 'pack-2', 'pack-3', 'pack-4']);
    const labels = [];
    for (const p of packs) {
      assert.deepStrictEqual(fs.readdirSync(path.join(base, p)).sort(), ['diff.patch', 'meta.json']);
      labels.push(JSON.parse(fs.readFileSync(path.join(base, p, 'meta.json'), 'utf8')).label);
    }
    assert.deepStrictEqual([...labels].sort(), ['W', 'X', 'Y', 'Z']);
    for (const f of packs.flatMap((p) => allFiles(path.join(base, p)))) {
      const text = fs.readFileSync(f, 'utf8');
      assert.ok(!/superpowers|pignolo|t1-[AB]-\d|"arm"|"rep"/i.test(text), `${f} revela el brazo`);
    }
    // La clave vive FUERA de la carpeta que se le da al revisor, en <privateRoot>/blind-keys/<tarea>.json.
    const keyFile = path.join(env.priv, 'blind-keys', 't1.json');
    assert.ok(fs.existsSync(keyFile));
    for (const f of allFiles(base)) {
      assert.ok(!/key/i.test(path.basename(f)), `${f}: nada de clave junto a los paquetes`);
      assert.ok(!/"arm"|"rep"|"A"|"B"/.test(fs.readFileSync(f, 'utf8')), `${f} no trae la asignación`);
    }
    assert.ok(!fs.readFileSync(path.join(base, 'pack-1', 'diff.patch'), 'utf8').includes('plan.md'));
    const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    assert.deepStrictEqual(Object.keys(key).sort(), ['W', 'X', 'Y', 'Z']);
    assert.deepStrictEqual(Object.values(key).map((v) => `${v.arm}${v.rep}`).sort(), ['A1', 'A2', 'B1', 'B2']);
    for (const p of packs) {
      const label = JSON.parse(fs.readFileSync(path.join(base, p, 'meta.json'), 'utf8')).label;
      const k = key[label];
      assert.ok(fs.readFileSync(path.join(base, p, 'diff.patch'), 'utf8').includes('value'));
      assert.ok(k.arm && k.rep);
    }
    const prompt = fs.readFileSync(path.join(base, 'grader-prompt.md'), 'utf8');
    assert.match(prompt, /serious_findings/);
    assert.match(prompt, /correctness/);
    assert.ok(!/superpowers|pignolo|key\.json contents/i.test(prompt));
    assert.match(prompt, /process notes/i);
    assert.match(prompt, /must not be penali[sz]ed/i);
    assert.ok(fs.existsSync(path.join(base, 'task-prompt.md')));

    // Reproducible con la misma semilla, otra semilla cambia el orden.
    const first = fs.readFileSync(keyFile, 'utf8');
    assert.throws(() => blind(cfg, { task: 't1', reps: [1, 2] }), /ya existe/);
    blind(cfg, { task: 't1', reps: [1, 2], force: true });
    assert.strictEqual(fs.readFileSync(keyFile, 'utf8'), first);
    const orders = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      blind({ ...cfg, seed }, { task: 't1', reps: [1, 2], force: true });
      orders.add(fs.readFileSync(keyFile, 'utf8'));
    }
    assert.ok(orders.size > 1, 'la semilla influye');
    const { shuffle } = await imp('blind.mjs');
    assert.deepStrictEqual(shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42), shuffle([1, 2, 3, 4, 5, 6, 7, 8], 42));
  } finally { cleanup(env); }
});

test('blind: si un diff nombra un plugin, se detiene salvo --allow-leaks', async () => {
  const env = setup();
  try {
    writeRun(env, 't1', 'A', 1, { changes: CHG, blindPatch: PATCH(1, '+// written with Superpowers\n') });
    writeRun(env, 't1', 'B', 1, { changes: CHG, blindPatch: PATCH(2) });
    const { loadConfig } = await imp('config.mjs');
    const { blind } = await imp('blind.mjs');
    const cfg = loadConfig(env.cfgPath);
    assert.throws(() => blind(cfg, { task: 't1', reps: [1] }), /revela|nombra/);
    assert.ok(!fs.existsSync(path.join(env.priv, 'blind', 't1', 'pack-1')), 'no deja paquetes a medias');
    const r = blind(cfg, { task: 't1', reps: [1], allowLeaks: true });
    assert.strictEqual(r.packs, 2);
    assert.ok(r.leaks.length >= 1);
  } finally { cleanup(env); }
});

test('unblind: pasa las notas del revisor a grades.json usando la clave', async () => {
  const env = blindEnv();
  try {
    const { loadConfig } = await imp('config.mjs');
    const { blind, unblind } = await imp('blind.mjs');
    const cfg = loadConfig(env.cfgPath);
    blind(cfg, { task: 't1', reps: [1, 2] });
    const key = JSON.parse(fs.readFileSync(path.join(env.priv, 'blind-keys', 't1.json'), 'utf8'));
    const input = Object.keys(key).map((label) => ({ label, serious_findings: label === 'X' ? ['f1'] : [], correctness: 4, quality: 3 }));
    const inFile = path.join(env.root, 'grader.json');
    fs.writeFileSync(inFile, JSON.stringify(input));
    unblind(cfg, { task: 't1', input: inFile });
    const grades = JSON.parse(fs.readFileSync(cfg.gradesPath, 'utf8'));
    assert.strictEqual(grades.length, 4);
    const x = grades.find((g) => g.arm === key.X.arm && g.rep === key.X.rep);
    assert.deepStrictEqual(x.serious_findings, ['f1']);
    assert.strictEqual(x.timestamp, '2026-10-23T12:00:00.000Z', 'la nota recuerda de qué corrida es (la que se rehace no hereda notas viejas)');
    assert.strictEqual(x.task, 't1');
    assert.throws(() => unblind(cfg, { task: 't1', input: inFile }), /ya hay nota/);
    fs.writeFileSync(inFile, JSON.stringify([{ label: 'Q', quality: 1 }]));
    assert.throws(() => unblind(cfg, { task: 't1', input: inFile, force: true }), /etiqueta/);
  } finally { cleanup(env); }
});

// ---------------------------------------------------------------- summary

function mk(task, arm, rep, tokens, extra = {}) {
  return {
    experiment: 'x', task, arm, rep, timestamp: '2026-10-23T00:00:0' + rep + 'Z', model: 'sonnet',
    cost_usd: tokens / 1000, weighted_tokens: tokens, wall_s: 60, turns: 5, agents: 1,
    result_subtype: 'success', is_error: false, exit_code: 0, invalid: false, invalid_reason: '',
    accept_exit: 0, accept_pass: 3, accept_fail: 0, accept_suites_failed: 0, full_pass: 10, full_fail: 0, full_baseline_fail: 0,
    timed_out: false, contamination: false, note: '', ...extra,
  };
}
const arm = (task, a, tokens, over = {}) => tokens.map((t, i) => mk(task, a, i + 1, t, typeof over === 'function' ? over(i) : over));
const grade = (task, a, quality, serious = 0) => quality.map((q, i) => ({ task, arm: a, rep: i + 1, quality: q, correctness: 4, serious_findings: Array(serious).fill('s') }));

test('summary medio: pasa con tokens <= 1,5x, calidad igual y rangos separados', async () => {
  const { summarize } = await imp('summary.mjs');
  const rows = [...arm('m', 'A', [100, 105, 110]), ...arm('m', 'B', [130, 135, 140])];
  const grades = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 5, 4])];
  const r = summarize(rows, { kinds: { m: 'medium' }, grades });
  const t = r.tasks[0];
  assert.strictEqual(t.decision.verdict, 'pasa');
  assert.strictEqual(t.evidence, 'E3');
  assert.deepStrictEqual([t.arms.A.n, t.arms.A.tokens.median, t.arms.A.tokens.min, t.arms.A.tokens.max], [3, 105, 100, 110]);
  assert.strictEqual(t.arms.B.tokens.median, 135);
  const two = summarize([...arm('m', 'A', [100, 105]), ...arm('m', 'B', [130, 135])], { kinds: { m: 'medium' }, grades });
  assert.strictEqual(two.tasks[0].evidence, 'E2');
});

test('summary medio (no inferioridad, R16): rangos que se pisan NO impiden pasar, solo impiden afirmar superioridad', async () => {
  const { summarize } = await imp('summary.mjs');
  const rows = [...arm('m', 'A', [100, 110, 130]), ...arm('m', 'B', [120, 125, 140])];
  const grades = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 4, 4])];
  const t = summarize(rows, { kinds: { m: 'medium' }, grades }).tasks[0];
  assert.strictEqual(t.decision.verdict, 'pasa', t.decision.reasons.join(' | '));
  const sup = summarize([...arm('m', 'A', [100, 110, 130]), ...arm('m', 'B', [90, 100, 125])], { kinds: { m: 'medium' }, grades }).tasks[0].decision;
  assert.match(sup.reasons.join(' '), /no se afirma superioridad/);
  // Mediana dentro del umbral pero un máximo de B pasado de 1,5 x el máximo de A: no pasa.
  const spike = summarize([...arm('m', 'A', [100, 100, 100]), ...arm('m', 'B', [100, 100, 160])], { kinds: { m: 'medium' }, grades }).tasks[0].decision;
  assert.strictEqual(spike.verdict, 'no pasa');
  assert.match(spike.reasons.join(' '), /máximo/);
  const edge = summarize([...arm('m', 'A', [100, 100, 100]), ...arm('m', 'B', [150, 150, 150])], { kinds: { m: 'medium' }, grades }).tasks[0].decision;
  assert.strictEqual(edge.verdict, 'pasa', '1,5 exacto pasa (<=)');
});

test('summary medio: más de 1,5x en tokens no pasa; peor calidad no pasa; sin notas queda pendiente', async () => {
  const { summarize } = await imp('summary.mjs');
  const heavy = [...arm('m', 'A', [100, 102, 104]), ...arm('m', 'B', [300, 310, 320])];
  const g = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [5, 5, 5])];
  assert.strictEqual(summarize(heavy, { kinds: { m: 'medium' }, grades: g }).tasks[0].decision.verdict, 'no pasa');
  const ok = [...arm('m', 'A', [100, 105, 110]), ...arm('m', 'B', [130, 135, 140])];
  const worse = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [3, 3, 3])];
  const w = summarize(ok, { kinds: { m: 'medium' }, grades: worse }).tasks[0].decision;
  assert.strictEqual(w.verdict, 'no pasa');
  assert.match(w.reasons.join(' '), /calidad/);
  const moreSerious = [...grade('m', 'A', [4, 4, 4], 0), ...grade('m', 'B', [4, 4, 4], 1)];
  assert.strictEqual(summarize(ok, { kinds: { m: 'medium' }, grades: moreSerious }).tasks[0].decision.verdict, 'no pasa');
  const pending = summarize(ok, { kinds: { m: 'medium' }, grades: [] }).tasks[0].decision;
  assert.strictEqual(pending.verdict, 'pendiente');
});

test('summary chico: B <= A en tiempo y tokens pasa; exceso con rangos pisados es sin diferencia; sin pisar, no pasa', async () => {
  const { summarize } = await imp('summary.mjs');
  const wall = (ws) => (i) => ({ wall_s: ws[i] });
  const good = [...arm('s', 'A', [100, 110, 120], wall([60, 65, 70])), ...arm('s', 'B', [80, 85, 90], wall([50, 52, 54]))];
  assert.strictEqual(summarize(good, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'pasa');
  const overlap = [...arm('s', 'A', [100, 110, 120], wall([60, 65, 70])), ...arm('s', 'B', [105, 115, 125], wall([50, 52, 54]))];
  assert.strictEqual(summarize(overlap, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'sin diferencia demostrada');
  const bad = [...arm('s', 'A', [100, 110, 120], wall([60, 65, 70])), ...arm('s', 'B', [200, 210, 220], wall([50, 52, 54]))];
  assert.strictEqual(summarize(bad, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'no pasa');
  const wrong = [...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 1 ? { accept_fail: 1 } : {}))];
  const w = summarize(wrong, { kinds: { s: 'small' } }).tasks[0].decision;
  assert.strictEqual(w.verdict, 'no pasa');
  assert.match(w.reasons.join(' '), /correct/);
});

test('summary: rerun reemplaza a la corrida original, la contaminada se excluye y se dice', async () => {
  const { summarize } = await imp('summary.mjs');
  const rows = [
    ...arm('s', 'A', [100, 110, 120]),
    ...arm('s', 'B', [80, 85, 90]),
    mk('s', 'B', 1, 500, { note: 'rerun', timestamp: '2026-10-24T00:00:00Z' }),
    mk('s', 'B', 4, 70, { contamination: true }),
  ];
  const r = summarize(rows, { kinds: { s: 'small' } });
  const t = r.tasks[0];
  assert.strictEqual(t.arms.B.n, 3, 'rep 4 contaminada fuera');
  assert.strictEqual(t.arms.B.tokens.max, 500, 'rerun de rep 1 reemplaza');
  assert.ok(r.notes.some((n) => /contamin/.test(n)));
  assert.ok(r.notes.some((n) => /rerun|repetid/.test(n)));
  const inc = summarize(rows, { kinds: { s: 'small' }, includeContaminated: true });
  assert.strictEqual(inc.tasks[0].arms.B.n, 4);
});

test('summary: la salida de texto lleva mediana con rango, nivel de evidencia y nunca un número solo', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const rows = [...arm('m', 'A', [100, 105, 110]), ...arm('m', 'B', [130, 135, 140])];
  const text = formatSummary(summarize(rows, { kinds: { m: 'medium' }, grades: [] }));
  assert.match(text, /mediana 105 \(rango 100 a 110\)/);
  assert.match(text, /mediana 135 \(rango 130 a 140\)/);
  assert.match(text, /evidence: E3/);
  assert.match(text, /aceptación/);
  const text2 = formatSummary(summarize([...arm('m', 'A', [100]), ...arm('m', 'B', [130])], { kinds: {} }));
  assert.match(text2, /evidence: sin evidencia/);
  assert.match(text2, /tipo de tarea no definido/);
});

test('summary: una corrida inválida sale de las cifras, se lista y deja la tarea pendiente hasta repetirla', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const bad = (i) => (i === 1 ? { invalid: true, invalid_reason: 'timed_out;no_result', timed_out: true, weighted_tokens: 9999, cost_usd: 99 } : {});
  const rows = [...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], bad)];
  const r = summarize(rows, { kinds: { s: 'small' } });
  const t = r.tasks[0];
  assert.strictEqual(t.arms.B.n, 2, 'la inválida no cuenta en n');
  assert.strictEqual(t.arms.B.tokens.max, 90, 'ni en tokens, costo o tiempo');
  assert.strictEqual(t.decision.verdict, 'pendiente: 1 corridas inválidas');
  assert.deepStrictEqual(t.invalid, [{ run: 's/B/2', reasons: ['timed_out', 'no_result'] }]);
  assert.ok(r.notes.some((n) => /inválidas/.test(n) && /s\/B\/2/.test(n) && /timed_out/.test(n)));
  assert.ok(r.notes.some((n) => /cortadas por tiempo/.test(n) && !/entran en las cifras/.test(n)), 'la nota de tiempo es exacta');
  assert.match(formatSummary(r), /pendiente: 1 corridas inválidas/);
  // Un rerun válido de la misma repetición la reemplaza y la tarea deja de estar pendiente.
  const fixed = summarize([...rows, mk('s', 'B', 2, 88, { note: 'rerun', timestamp: '2026-10-24T00:00:00Z' })], { kinds: { s: 'small' } });
  assert.doesNotMatch(fixed.tasks[0].decision.verdict, /pendiente: \d+ corridas/);
  assert.strictEqual(fixed.tasks[0].arms.B.n, 3);
  // El tope de presupuesto superado se informa aparte ("superó el tope").
  const cut = summarize([...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 0 ? { invalid: true, invalid_reason: 'budget_cap;is_error', result_subtype: 'error_max_budget_usd', is_error: true } : {}))], { kinds: { s: 'small' } });
  assert.ok(cut.notes.some((n) => /superó el tope/.test(n) && /s\/B\/1/.test(n)));
  // Una contaminada legada (sin motivo escrito) también es inválida; --include-contaminated la deja entrar.
  const dirty = [...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 2 ? { contamination: true } : {}))];
  assert.strictEqual(summarize(dirty, { kinds: { s: 'small' } }).tasks[0].decision.verdict, 'pendiente: 1 corridas inválidas');
  assert.strictEqual(summarize(dirty, { kinds: { s: 'small' }, includeContaminated: true }).tasks[0].arms.B.n, 3);
});

test('summary: verde = código de salida 0, sin suites fallidas, sin tests fallidos y más de 0 pasados', async () => {
  const { summarize } = await imp('summary.mjs');
  const verdict = (extra) => summarize([...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 0 ? extra : {}))], { kinds: { s: 'small' } }).tasks[0];
  assert.strictEqual(verdict({}).decision.verdict, 'pasa');
  for (const [label, extra] of [
    ['un archivo de test que no importa (suite fallida, 0 tests fallidos)', { accept_suites_failed: 1, accept_exit: 1 }],
    ['código de salida distinto de 0', { accept_exit: 1 }],
    ['sin código de salida', { accept_exit: null }],
    ['cero tests pasados', { accept_pass: 0 }],
    ['un test fallido', { accept_fail: 1 }],
  ]) {
    const t = verdict(extra);
    assert.strictEqual(t.decision.verdict, 'no pasa', label);
    assert.strictEqual(t.arms.B.accept.greenRuns, 2, label);
  }
});

test('summary chico: la suite completa se compara con el piso (baselineFull) y sin aceptación queda pendiente', async () => {
  const { summarize } = await imp('summary.mjs');
  const mkRows = (extra) => [...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 1 ? extra : {}))];
  const v = (extra) => summarize(mkRows(extra), { kinds: { s: 'small' } }).tasks[0].decision;
  assert.strictEqual(v({ full_fail: 2, full_baseline_fail: 2 }).verdict, 'pasa', 'igual al piso: bien');
  const worse = v({ full_fail: 3, full_baseline_fail: 2 });
  assert.strictEqual(worse.verdict, 'no pasa');
  assert.match(worse.reasons.join(' '), /suite completa/);
  const unknown = v({ full_baseline_fail: null });
  assert.strictEqual(unknown.verdict, 'pendiente');
  assert.match(unknown.reasons.join(' '), /baselineFull/);
  const noAccept = v({ accept_pass: null, accept_fail: null, accept_exit: null, accept_suites_failed: null });
  assert.strictEqual(noAccept.verdict, 'pendiente');
  assert.match(noAccept.reasons.join(' '), /aceptación/);
});

test('summary: los tokens ponderados se recalculan con la configuración actual desde los tokens crudos por modelo', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const tokens = 'claude-opus-4=100/10/1000/100|claude-haiku-4=200/20/0/0';
  const stale = (i) => ({ model_tokens: tokens, weighted_tokens: 1, cost_usd: 2 + i });
  const rows = [...arm('s', 'A', [1, 1, 1], stale), ...arm('s', 'B', [1, 1, 1], stale)];
  const W = { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 };
  const mine = summarize(rows, { kinds: { s: 'small' }, weights: W, modelFactor: { opus: 5, sonnet: 1, haiku: 0.33 } });
  const opus = (100 + 50 + 100 + 125) * 5;
  const haiku = (200 + 100) * 0.33;
  assert.strictEqual(mine.tasks[0].arms.A.tokens.median, Math.round((opus + haiku) * 100) / 100, 'no se confía en el guardado (1)');
  const other = summarize(rows, { kinds: { s: 'small' }, weights: W, modelFactor: { opus: 1, sonnet: 1, haiku: 1 } });
  assert.strictEqual(other.tasks[0].arms.A.tokens.median, 375 + 300);
  // Sin tokens por modelo (fila vieja) se usa lo guardado y se avisa.
  const old = summarize([...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90])], { kinds: { s: 'small' }, weights: W });
  assert.strictEqual(old.tasks[0].arms.A.tokens.median, 110);
  assert.ok(old.notes.some((n) => /sin tokens por modelo/.test(n)));
  // El costo va al lado de los tokens ponderados.
  const text = formatSummary(mine);
  assert.match(text, /tokens ponderados.*mediana/);
  assert.match(text, /costo USD: mediana 3 \(rango 2 a 4\)/);
});

test('summary: filtra por experimento, las notas cuentan solo para las corridas usadas y falta de aceptación deja pendiente', async () => {
  const { summarize } = await imp('summary.mjs');
  const calib = arm('m', 'A', [5000, 5000, 5000], { experiment: 'calib' });
  const rows = [
    ...arm('m', 'A', [100, 105, 110], { experiment: 'real' }), ...arm('m', 'B', [130, 135, 140], { experiment: 'real' }), ...calib,
  ];
  const grades = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 4, 4])];
  const r = summarize(rows, { kinds: { m: 'medium' }, grades, experiment: 'real' });
  assert.strictEqual(r.tasks[0].arms.A.tokens.max, 110, 'la calibración no se mezcla');
  assert.ok(r.notes.some((n) => /otros experimentos/.test(n) && /calib/.test(n)));
  assert.strictEqual(r.tasks[0].decision.verdict, 'pasa');
  // La nota de una corrida inválida (rep 4) no cuenta; la de la corrida que la reemplaza hace falta aparte.
  const bad4 = mk('m', 'B', 4, 9000, { experiment: 'real', invalid: true, invalid_reason: 'is_error', timestamp: '2026-10-23T00:00:04Z' });
  const gradesBad = [...grades, { task: 'm', arm: 'B', rep: 4, timestamp: '2026-10-23T00:00:04Z', quality: 1, correctness: 1, serious_findings: ['x', 'y'] }];
  const r2 = summarize([...rows, bad4], { kinds: { m: 'medium' }, grades: gradesBad, experiment: 'real' });
  assert.match(r2.tasks[0].decision.verdict, /^pendiente: 1 corridas inválidas/);
  const rerun4 = mk('m', 'B', 4, 136, { experiment: 'real', note: 'rerun', timestamp: '2026-10-25T00:00:00Z' });
  const stale = summarize([...rows, bad4, rerun4], { kinds: { m: 'medium' }, grades: gradesBad, experiment: 'real' }).tasks[0].decision;
  assert.strictEqual(stale.verdict, 'pendiente', 'la nota vieja era de otra corrida');
  assert.match(stale.reasons.join(' '), /nota/);
  const fresh = [...gradesBad, { task: 'm', arm: 'B', rep: 4, timestamp: '2026-10-25T00:00:00Z', quality: 4, correctness: 4, serious_findings: [] }];
  const withFresh = summarize([...rows, bad4, rerun4], { kinds: { m: 'medium' }, grades: [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 4, 4]), fresh[fresh.length - 1]], experiment: 'real' }).tasks[0];
  assert.strictEqual(withFresh.decision.verdict, 'pasa', withFresh.decision.reasons.join(' | '));
  assert.strictEqual(withFresh.arms.B.n, 4);
  // Sin aceptación en alguna corrida válida: pendiente (nunca se descarta en silencio).
  const noAcc = [...arm('m', 'A', [100, 105, 110], { experiment: 'real' }), ...arm('m', 'B', [130, 135, 140], (i) => ({ experiment: 'real', ...(i === 2 ? { accept_pass: null, accept_fail: null, accept_exit: null } : {}) }))];
  const na = summarize(noAcc, { kinds: { m: 'medium' }, grades, experiment: 'real' }).tasks[0].decision;
  assert.strictEqual(na.verdict, 'pendiente');
  assert.match(na.reasons.join(' '), /aceptación/);
});

test('summary: un brazo que termina sin cambios en todas las corridas es un RESULTADO, no un pendiente eterno', async () => {
  const { summarize, formatSummary } = await imp('summary.mjs');
  const empty = (i) => ({ invalid: true, invalid_reason: 'no_changes', files_changed: 0 });
  const rowsB = summarize([...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], empty)], { kinds: { s: 'small' } });
  const t = rowsB.tasks[0];
  assert.strictEqual(t.decision.verdict, 'no pasa');
  assert.match(t.decision.reasons[0], /el brazo B termina sin cambios en todas las corridas: 3\/3/);
  assert.deepStrictEqual(t.systematicNoChanges, ['B']);
  assert.match(formatSummary(rowsB), /el brazo B termina sin cambios en todas las corridas: 3\/3/);
  const control = summarize([...arm('m', 'A', [100, 110, 120], empty), ...arm('m', 'B', [80, 85, 90])], { kinds: { m: 'medium' } }).tasks[0];
  assert.strictEqual(control.decision.verdict, 'no comparable');
  assert.match(control.decision.reasons[0], /el brazo A termina sin cambios en todas las corridas: 3\/3/);
  // Si solo algunas corridas terminan sin cambios, sigue siendo pendiente hasta repetirlas.
  const some = summarize([...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], (i) => (i === 0 ? { invalid: true, invalid_reason: 'no_changes' } : {}))], { kinds: { s: 'small' } }).tasks[0];
  assert.strictEqual(some.decision.verdict, 'pendiente: 1 corridas inválidas');
  assert.deepStrictEqual(some.systematicNoChanges, []);
});

test('ficha: el texto preinscrito dice lo mismo que el código (superioridad, no inferioridad, piso de la suite, evidencia)', async () => {
  const ficha = fs.readFileSync(path.join(__dirname, 'evals', 'RESULTS-pignolo2.md'), 'utf8');
  const { summarize } = await imp('summary.mjs');
  // Las frases las produce el código; la ficha tiene que contener las mismas.
  const grades = [...grade('m', 'A', [4, 4, 4]), ...grade('m', 'B', [4, 4, 4])];
  const over = summarize([...arm('m', 'A', [100, 110, 130]), ...arm('m', 'B', [90, 100, 125])], { kinds: { m: 'medium' }, grades }).tasks[0].decision;
  assert.ok(over.reasons.some((r) => r.includes('no se afirma superioridad')));
  assert.ok(over.reasons.includes('no inferioridad (H1): se cumple'));
  const small = summarize([...arm('s', 'A', [100, 110, 120]), ...arm('s', 'B', [80, 85, 90], { full_fail: 3, full_baseline_fail: 2 })], { kinds: { s: 'small' } }).tasks[0].decision;
  assert.ok(small.reasons.some((r) => r.includes('baselineFull')));
  for (const phrase of ['no se afirma superioridad', 'no inferioridad (H1): se cumple', 'baselineFull', 'sin evidencia', 'termina sin cambios en todas las corridas', 'más fallas que el piso']) {
    assert.ok(ficha.includes(phrase), `la ficha no contiene: ${phrase}`);
  }
  assert.ok(!/sin diferencia demostrada.*feature mediana/i.test(ficha), 'la ficha no promete "sin diferencia demostrada" para la tarea mediana');
});

// ---------------------------------------------------------------- CLI

const RUN = path.join(HARNESS, 'run.mjs');
function cli(env, ...args) {
  const r = spawnSync(process.execPath, [RUN, ...args, '--config', env.cfgPath], {
    encoding: 'utf8', env: { ...process.env, FAKE_CLAUDE_MODE: 'edit' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test('CLI: prepare, run, accept, row y summary de punta a punta con el claude falso', () => {
  const env = setup();
  try {
    const a = cli(env, 'prepare', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(a.status, 0, a.err);
    assert.ok(JSON.parse(a.out).repo.endsWith('repo'));
    const again = cli(env, 'prepare', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.notStrictEqual(again.status, 0);
    assert.match(again.err, /ya existe/);
    const r = cli(env, 'run', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(r.status, 0, r.err);
    assert.strictEqual(JSON.parse(r.out).weightedTokens, 1200);
    const ac = cli(env, 'accept', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(ac.status, 0, ac.err);
    const row = cli(env, 'row', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.strictEqual(row.status, 0, row.err);
    const dup = cli(env, 'row', '--task', 't1', '--arm', 'B', '--rep', '1');
    assert.notStrictEqual(dup.status, 0);
    assert.match(dup.err, /rerun/);
    const s = cli(env, 'summary', '--csv', env.cfg.csvPath);
    assert.strictEqual(s.status, 0, s.err);
    assert.match(s.out, /t1/);
    assert.match(s.out, /mediana 1200 \(rango 1200 a 1200\)/);
    const bad = cli(env, 'nope');
    assert.notStrictEqual(bad.status, 0);
    const miss = spawnSync(process.execPath, [RUN, 'prepare', '--task', 't1', '--arm', 'A', '--rep', '1', '--config', path.join(env.root, 'no.json')], { encoding: 'utf8' });
    assert.notStrictEqual(miss.status, 0);
    assert.match(miss.stderr, /harness\.example\.json/);
  } finally { cleanup(env); }
});

test('CLI: una corrida de calibración (--experiment) cuenta para el tope pero no se mezcla en el resumen real', () => {
  const env = setup();
  try {
    const step = (...a) => { const r = cli(env, ...a); assert.strictEqual(r.status, 0, r.err); return r; };
    step('prepare', '--task', 't1', '--arm', 'A', '--rep', '1');
    step('prepare', '--task', 't1', '--arm', 'A', '--rep', '1', '--experiment', 'toy-calib');
    assert.ok(fs.existsSync(path.join(env.work, 't1-A-1')) && fs.existsSync(path.join(env.work, 'toy-calib', 't1-A-1')), 'la calibración tiene su carpeta y no pisa la real');
    step('run', '--task', 't1', '--arm', 'A', '--rep', '1', '--experiment', 'toy-calib');
    step('accept', '--task', 't1', '--arm', 'A', '--rep', '1', '--experiment', 'toy-calib');
    assert.notStrictEqual(cli(env, 'row', '--task', 't1', '--arm', 'A', '--rep', '1').status, 0, 'sin --experiment apunta a la carpeta real, que no corrió');
    step('row', '--task', 't1', '--arm', 'A', '--rep', '1', '--experiment', 'toy-calib');
    assert.match(fs.readFileSync(env.cfg.csvPath, 'utf8'), /^toy-calib,t1,A,1,/m);
    const real = step('summary', '--csv', env.cfg.csvPath).out;
    assert.doesNotMatch(real, /== t1/, 'el experimento real no ve la calibración');
    assert.match(real, /otros experimentos/);
    assert.match(step('summary', '--csv', env.cfg.csvPath, '--experiment', 'toy-calib').out, /== t1/);
  } finally { cleanup(env); }
});

test('repo: harness.local.json está en .gitignore y harness.example.json no trae datos reales', async () => {
  const { DEFAULT_BLIND_EXCLUDE, DEFAULT_MODEL_FACTOR, DEFAULT_NEUTRAL_PLUGINS, DEFAULT_NEUTRAL_CONFIG_PATHS } = await imp('config.mjs');
  const ig = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(ig, /^tests\/evals\/harness\/harness\.local\.json$/m);
  const ex = JSON.parse(fs.readFileSync(path.join(HARNESS, 'harness.example.json'), 'utf8'));
  for (const k of ['sourceRepo', 'privateRoot', 'workRoot', 'configDir', 'arms', 'model', 'effort', 'permissionMode', 'perRunCapUsd', 'totalCapUsd', 'timeoutMs', 'weights', 'modelFactor', 'seed', 'blindExcludePaths']) {
    assert.ok(k in ex, `falta ${k}`);
  }
  // El ejemplo y los valores por defecto del código dicen lo mismo.
  assert.deepStrictEqual(ex.blindExcludePaths, DEFAULT_BLIND_EXCLUDE);
  assert.deepStrictEqual(ex.modelFactor, DEFAULT_MODEL_FACTOR);
  assert.deepStrictEqual(ex.neutralPlugins, DEFAULT_NEUTRAL_PLUGINS);
  assert.deepStrictEqual(ex.neutralConfigPaths, DEFAULT_NEUTRAL_CONFIG_PATHS);
  const text = JSON.stringify(ex);
  assert.ok(!/[A-Za-z]:[\\/]Users|pigna/i.test(text), 'sin rutas personales');
  // Ningún archivo versionado del arnés (salvo la configuración local, que no se versiona) trae rutas personales.
  for (const f of fs.readdirSync(HARNESS)) {
    if (f === 'harness.local.json') continue;
    const body = fs.readFileSync(path.join(HARNESS, f), 'utf8');
    assert.ok(!/[A-Za-z]:[\\/]Users|\/home\/\w+|pigna(?!ture)/i.test(body), `${f} trae una ruta o nombre personal`);
  }
});
