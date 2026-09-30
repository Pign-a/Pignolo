'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { makeRepo, makeTempDir, runLauncher, git } = require('./helpers');
const gate = require('../plugins/pignolo/hooks/handlers/handback-gate');
const { workingTree } = require('../plugins/pignolo/lib/changes');
const { repoIdFor, writeSeal } = require('../plugins/pignolo/lib/seals');
const { readCounter, clearCounter } = require('../plugins/pignolo/lib/handback-counter');
const { withDeadline } = require('../plugins/pignolo/lib/git');

const LAZY = path.join(__dirname, 'fixtures', 'handback-lazy.js');
const PROJECT_MD = [
  '---',
  'type: code-tested',
  'gates:',
  '  on-done: npm test',
  'test-paths:',
  '  - tests/',
  'protected-test-config:',
  '  - jest.config.js',
  '---',
  '',
].join('\n');

// Repo con project.md commiteado, un run.json vigente en el principal y la tarea t1 en
// una worktree real (run.json está en .pignolo/.gitignore: no existe en la worktree).
function flow({ files = {}, runOver = {}, taskOver = {} } = {}) {
  const main = makeRepo();
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(main, rel)), { recursive: true });
    fs.writeFileSync(path.join(main, rel), text);
  };
  write('.pignolo/project.md', PROJECT_MD);
  write('.pignolo/.gitignore', 'run.json\n');
  write('src/a.js', 'module.exports = 1;\n');
  write('tests/a.test.js', "require('../src/a');\n");
  write('jest.config.js', 'module.exports = {};\n');
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  git(['add', '-A'], main);
  git(['commit', '-q', '-m', 'base'], main);
  const base = git(['rev-parse', 'HEAD'], main);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['worktree', 'add', '-q', '-b', 'task/t1', wt], main);
  const run = {
    v: 1, flow: 'daily', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(),
    task: { id: 't1', worktree: wt, base, files: ['src/a.js'], agents: ['pignolo:implementer'], ...taskOver },
    ...runOver,
  };
  fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify(run));
  return { main, wt, base, env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') } };
}

function seal(fx, status = 'PASS', over = {}) {
  const treeHash = workingTree({ cwd: fx.wt });
  const repoId = repoIdFor({ cwd: fx.wt });
  writeSeal({
    env: fx.env, repoId, log: 'ok\n',
    seal: {
      v: 1, repoId, sha: null, treeHash, treeAfter: treeHash, level: 'on-done', command: 'npm test',
      exit: status === 'PASS' || status === 'NO_TESTS' ? 0 : 1, status, logHash: '', time: new Date().toISOString(),
      task: 't1', noTestsReason: null, checks: { scope: [], emptied: [], integrity: [], envDetect: [] }, ...over,
    },
  });
}

const edit = (fx, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(fx.wt, rel)), { recursive: true });
  fs.writeFileSync(path.join(fx.wt, rel), text);
};

function payload(fx, { via = 'stop', agent = 'pignolo:implementer', msg = 'listo\nDONE', id = 'a1', active = false } = {}) {
  if (via === 'handback') {
    return { hook_event_name: 'PreToolUse', tool_name: 'SubagentHandback', tool_input: { message: msg }, agent_type: agent, agent_id: id, cwd: fx.wt };
  }
  return { hook_event_name: 'SubagentStop', agent_type: agent, agent_id: id, last_assistant_message: msg, stop_hook_active: active, cwd: fx.wt };
}

const call = (fx, opts = {}, ctx = {}) => {
  const r = gate.run(payload(fx, opts), { env: fx.env, ...ctx });
  return { exit: r.exit, stdout: r.stdout || '', stderr: r.stderr || '' };
};
const post = (fx, subagent) => {
  const r = gate.run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: subagent }, cwd: fx.main }, { env: fx.env });
  return { exit: r.exit, stdout: r.stdout || '', stderr: r.stderr || '' };
};
const counter = (fx, key = 't1') => readCounter(fx.env, fx.wt, key);

test('§15 gates: DONE is rejected without a seal for the current tree, or with protected tests altered', async (t) => {
  await t.test('no seal -> 2 with Alternativa', () => {
    const r = call(flow());
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /Alternativa:/);
  });
  await t.test('seal of another tree-hash -> 2', () => {
    const fx = flow();
    seal(fx);
    edit(fx, 'src/a.js', 'module.exports = 2;\n');
    assert.strictEqual(call(fx).exit, 2);
  });
  await t.test('protected test altered with PASS seal for that tree -> 2 naming the file', () => {
    const fx = flow();
    edit(fx, 'tests/a.test.js', '// vaciado\n');
    seal(fx);
    const r = call(fx);
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /tests\/a\.test\.js/);
  });
  await t.test('protected config altered -> 2', () => {
    const fx = flow();
    edit(fx, 'jest.config.js', 'module.exports = { bail: true };\n');
    seal(fx);
    const r = call(fx);
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /jest\.config\.js/);
  });
});

test('PASS seal for the current tree and clean integrity -> 0, silent', () => {
  const fx = flow();
  edit(fx, 'src/a.js', 'module.exports = 2;\n');
  seal(fx);
  assert.deepStrictEqual(call(fx), { exit: 0, stdout: '', stderr: '' });
  assert.deepStrictEqual([counter(fx).count, counter(fx).accepted, counter(fx).acceptedAgentId], [0, true, 'a1']);
});

test('seal states', async (t) => {
  for (const [status, over, exit] of [
    ['FAIL', {}, 2], ['NO_GATE', {}, 2], ['TREE_CHANGED', {}, 2],
    ['NO_TESTS', {}, 2], ['NO_TESTS', { noTestsReason: 'solo docs' }, 0],
  ]) {
    await t.test(`${status}${over.noTestsReason ? ' with reason' : ''} -> ${exit}`, () => {
      const fx = flow();
      seal(fx, status, over);
      const r = call(fx);
      assert.strictEqual(r.exit, exit);
      if (exit === 2) assert.match(r.stderr, new RegExp(status));
    });
  }
});

test('last word', async (t) => {
  for (const [name, msg, sealed, exit] of [
    ['BLOCKED without seal', 'no pude\nBLOCKED', false, 0],
    ['NEEDS_CONTEXT without seal', 'falta algo\n`NEEDS_CONTEXT`.\n\n', false, 0],
    ['**DONE** with seal', 'listo\n**DONE**', true, 0],
    ['no final word', 'terminé todo', true, 2],
  ]) {
    await t.test(name, () => {
      const fx = flow();
      if (sealed) seal(fx);
      assert.strictEqual(call(fx, { msg }).exit, exit);
    });
  }
});

test('SubagentStop and SubagentHandback give the same decision', async (t) => {
  for (const sealed of [false, true]) {
    await t.test(sealed ? 'sealed' : 'unsealed', () => {
      const fx = flow();
      if (sealed) seal(fx);
      const a = call(fx, { via: 'stop' }).exit;
      const b = call(fx, { via: 'handback' }).exit;
      assert.strictEqual(a, sealed ? 0 : 2);
      assert.strictEqual(a, b);
    });
  }
});

test('after an accepted handback, the same agent stops without DONE -> 0; another agent is verified again', async (t) => {
  await t.test('same agent_id', () => {
    const fx = flow();
    seal(fx);
    assert.strictEqual(call(fx, { via: 'handback', id: 'a1' }).exit, 0);
    assert.strictEqual(call(fx, { via: 'stop', id: 'a1', msg: 'entregado el reporte' }).exit, 0);
  });
  await t.test('other agent_id without a seal for the current tree', () => {
    const fx = flow();
    seal(fx);
    assert.strictEqual(call(fx, { via: 'handback', id: 'a1' }).exit, 0);
    edit(fx, 'src/a.js', 'module.exports = 3;\n');
    assert.strictEqual(call(fx, { via: 'stop', id: 'a2' }).exit, 2);
  });
});

function lazy(input) {
  const res = spawnSync(process.execPath, [LAZY, JSON.stringify(input)], { encoding: 'utf8', env: { ...process.env } });
  assert.strictEqual(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}
const loadedGit = (cache) => cache.filter((k) => /[\\/]lib[\\/](changes|seals|project-config|git)\.js$/.test(k));

test('non-writer agents pass without loading git modules', async (t) => {
  const fx = flow();
  await t.test('pignolo:explorer via SubagentHandback -> 0', () => {
    assert.deepStrictEqual(call(fx, { via: 'handback', agent: 'pignolo:explorer', msg: 'x' }), { exit: 0, stdout: '', stderr: '' });
  });
  await t.test('general-purpose via SubagentHandback: 0 and lib/changes.js not required', () => {
    const out = lazy(payload(fx, { via: 'handback', agent: 'general-purpose', msg: 'x' }));
    assert.strictEqual(out.result.exit, 0);
    assert.deepStrictEqual(loadedGit(out.cache), []);
  });
  await t.test('PostToolUse Agent with Explore: silent and lib/changes.js not required', () => {
    const out = lazy({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'Explore' }, cwd: fx.main });
    assert.deepStrictEqual([out.result.exit, out.result.stdout || ''], [0, '']);
    assert.deepStrictEqual(loadedGit(out.cache), []);
  });
});

test('no flow, /pignolo:off or PIGNOLO_DISABLED=1 -> 0 silent', async (t) => {
  await t.test('no run.json', () => {
    const fx = flow();
    fs.rmSync(path.join(fx.main, '.pignolo', 'run.json'));
    assert.deepStrictEqual(call(fx), { exit: 0, stdout: '', stderr: '' });
  });
  await t.test('/pignolo:off (project flag)', () => {
    const fx = flow();
    fs.writeFileSync(path.join(fx.main, '.pignolo', '.disabled'), '');
    assert.deepStrictEqual(call(fx), { exit: 0, stdout: '', stderr: '' });
  });
  await t.test('PIGNOLO_DISABLED=1', () => {
    const fx = flow();
    fx.env.PIGNOLO_DISABLED = '1';
    assert.deepStrictEqual(call(fx), { exit: 0, stdout: '', stderr: '' });
  });
});

test('malformed run.json', async (t) => {
  const broken = () => {
    const fx = flow();
    fs.writeFileSync(path.join(fx.main, '.pignolo', 'run.json'), '{roto');
    return fx;
  };
  await t.test('implementer DONE -> 2 with the path, _malformed counts', () => {
    const fx = broken();
    const r = call(fx);
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /run\.json/);
    assert.match(r.stderr, /run\.js/);
    assert.strictEqual(counter(fx, '_malformed').count, 1);
  });
  await t.test('pignolo:explorer -> 0', () => {
    assert.strictEqual(call(broken(), { agent: 'pignolo:explorer' }).exit, 0);
  });
  for (const w of ['BLOCKED', 'NEEDS_CONTEXT']) {
    await t.test(`implementer ${w} -> 0 (last word first)`, () => {
      assert.strictEqual(call(broken(), { msg: `motivo\n${w}` }).exit, 0);
    });
  }
});

test('no valid final word 8 times: 7 rejections, the 8th passes as BLOCKED, counted on the task', () => {
  const fx = flow();
  const exits = [];
  let last;
  for (let i = 0; i < 8; i += 1) {
    last = call(fx, { msg: 'sigo trabajando' });
    exits.push(last.exit);
  }
  assert.deepStrictEqual(exits, [2, 2, 2, 2, 2, 2, 2, 0]);
  assert.match(JSON.parse(last.stdout).systemMessage, /BLOCKED/);
  assert.strictEqual(counter(fx).count, 8);
  assert.strictEqual(counter(fx).blocked, true);
});

test('I1: closes without a final word count on the task: run.js task resets them and PostToolUse sees them', () => {
  const fx = flow();
  for (let i = 0; i < 7; i += 1) assert.strictEqual(call(fx, { msg: 'sigo trabajando' }).exit, 2);
  clearCounter(fx.env, fx.main, 't1'); // lo que hace run.js task al registrar de nuevo la tarea
  assert.strictEqual(call(fx, { msg: 'Todo listo. Task DONE' }).exit, 2);
  assert.match(JSON.parse(post(fx, 'pignolo:implementer').stdout).hookSpecificOutput.additionalContext, /t1.*BLOCKED/);
  seal(fx);
  assert.strictEqual(call(fx).exit, 0);
  assert.strictEqual(call(fx, { msg: 'sigo trabajando', id: 'a2' }).exit, 2);
});

test('M1: at the cap a DONE is still verified: a sealed one is accepted, an unsealed one ends blocked', async (t) => {
  await t.test('sealed 8th -> 0 accepted', () => {
    const fx = flow();
    for (let i = 0; i < 7; i += 1) assert.strictEqual(call(fx).exit, 2);
    seal(fx);
    assert.deepStrictEqual(call(fx), { exit: 0, stdout: '', stderr: '' });
    assert.deepStrictEqual([counter(fx).accepted, counter(fx).blocked, counter(fx).count], [true, false, 0]);
  });
  await t.test('9th after the cap without a seal -> 0 blocked again, no loop', () => {
    const fx = flow();
    for (let i = 0; i < 8; i += 1) call(fx);
    const r = call(fx);
    assert.strictEqual(r.exit, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /BLOCKED/);
    assert.strictEqual(counter(fx).blocked, true);
  });
});

test('I2: a seal of another task (or of gate.js without --task) is not accepted', () => {
  const fx = flow();
  seal(fx, 'PASS', { task: null });
  const r = call(fx);
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /--task y/);
  assert.doesNotMatch(r.stderr, /--task t1/);
  assert.match(r.stderr, /Alternativa:/);
});

test('M4: a task worktree that no longer exists is rejected with a specific reason', () => {
  const fx = flow();
  fs.rmSync(fx.wt, { recursive: true, force: true });
  const r = call({ ...fx, wt: fx.main });
  assert.strictEqual(r.exit, 2);
  assert.match(r.stderr, /no existe/);
  assert.match(r.stderr, /BLOCKED/);
});

test('malformed run.json: PostToolUse warns the main thread; the reason does not print the full command', () => {
  const fx = flow();
  fs.writeFileSync(path.join(fx.main, '.pignolo', 'run.json'), '{roto');
  const r = call(fx);
  assert.strictEqual(r.exit, 2);
  assert.doesNotMatch(r.stderr, /node "/);
  const p = post(fx, 'pignolo:implementer');
  assert.match(JSON.parse(p.stdout).hookSpecificOutput.additionalContext, /run.json/);
  assert.deepStrictEqual(post(fx, 'Explore'), { exit: 0, stdout: '', stderr: '' });
});

test('expired run.json with run.task still verifies DONE', () => {
  const fx = flow({ runOver: { expires: new Date(Date.now() - 60e3).toISOString() } });
  assert.strictEqual(call(fx).exit, 2);
});

test('test-writer DONE', async (t) => {
  await t.test('only tests/ changed -> 0', () => {
    const fx = flow({ taskOver: { files: ['tests/a.test.js'] } });
    edit(fx, 'tests/a.test.js', "require('../src/a'); // nuevo caso\n");
    assert.strictEqual(call(fx, { agent: 'pignolo:test-writer' }).exit, 0);
  });
  await t.test('weakened test (it.skip) inside its card -> 2; testAuthorization lets it pass', () => {
    const fx = flow({ taskOver: { files: ['tests/a.test.js'] } });
    edit(fx, 'tests/a.test.js', "require('../src/a');\nit.skip('x', () => {});\n");
    const r = call(fx, { agent: 'pignolo:test-writer' });
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /skip/);
    assert.match(r.stderr, /tests\/a\.test\.js/);
    assert.match(r.stderr, /Alternativa:/);
    const ok = flow({ taskOver: { files: ['tests/a.test.js'], testAuthorization: true } });
    edit(ok, 'tests/a.test.js', "require('../src/a');\nit.skip('x', () => {});\n");
    assert.strictEqual(call(ok, { agent: 'pignolo:test-writer' }).exit, 0);
  });
  await t.test('I4: an existing test outside its card -> 2', () => {
    const fx = flow({ files: { 'tests/b.test.js': "require('../src/a');\n" }, taskOver: { files: ['tests/a.test.js'] } });
    edit(fx, 'tests/b.test.js', '// vaciado\n');
    const r = call(fx, { agent: 'pignolo:test-writer' });
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /tests\/b\.test\.js/);
  });
  await t.test('src/ changed -> 2', () => {
    const fx = flow();
    edit(fx, 'src/a.js', 'module.exports = 9;\n');
    const r = call(fx, { agent: 'pignolo:test-writer' });
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /src\/a\.js/);
  });
});

test('cap: 7 rejections then an 8th DONE passes as BLOCKED; stop_hook_active does not decide', () => {
  const fx = flow();
  const exits = [];
  let last;
  for (let i = 0; i < 8; i += 1) {
    last = call(fx, { active: i > 0 });
    exits.push(last.exit);
  }
  assert.deepStrictEqual(exits, [2, 2, 2, 2, 2, 2, 2, 0]);
  assert.match(JSON.parse(last.stdout).systemMessage, /t1.*BLOCKED/);
  const c = counter(fx);
  assert.strictEqual(c.blocked, true);
  assert.strictEqual(c.accepted, false);
  assert.deepStrictEqual(c.stopHookActive, [false, true, true, true, true, true, true, true]);
});

test('deadline mid-work (Review Focus 4)', async (t) => {
  await t.test('run throwing on write-tree -> 2 with the deadline reason and the attempt counted on disk', () => {
    const fx = flow();
    seal(fx);
    const real = withDeadline(fx.wt, 10000);
    const run = (args, opts) => {
      if (args[0] === 'write-tree') throw new Error('se agotó el plazo de 2600 ms');
      return real(args, opts);
    };
    const r = call(fx, {}, { run });
    assert.strictEqual(r.exit, 2);
    assert.match(r.stderr, /plazo/);
    assert.strictEqual(counter(fx).count, 1);
  });
  await t.test('deadline already expired -> 2, never 0', () => {
    const fx = flow();
    seal(fx);
    assert.strictEqual(call(fx, {}, { deadline: Date.now() - 1 }).exit, 2);
    assert.strictEqual(counter(fx).count, 1);
  });
});

test('the task worktree as cwd finds the main checkout marker (Review Focus 3)', () => {
  const fx = flow();
  assert.ok(!fs.existsSync(path.join(fx.wt, '.pignolo', 'run.json')));
  assert.strictEqual(call(fx).exit, 2);
});

test('PostToolUse on Agent tells the main thread when a task ended blocked', async (t) => {
  await t.test('counter blocked -> additionalContext with the task id and BLOCKED', () => {
    const fx = flow();
    for (let i = 0; i < 8; i += 1) call(fx);
    const r = post(fx, 'pignolo:implementer');
    assert.strictEqual(r.exit, 0);
    const o = JSON.parse(r.stdout).hookSpecificOutput;
    assert.strictEqual(o.hookEventName, 'PostToolUse');
    assert.match(o.additionalContext, /t1.*BLOCKED/);
  });
  await t.test('rejected once and not accepted -> additionalContext', () => {
    const fx = flow();
    call(fx);
    assert.match(JSON.parse(post(fx, 'pignolo:fixer').stdout).hookSpecificOutput.additionalContext, /BLOCKED/);
  });
  await t.test('accepted counter -> silent', () => {
    const fx = flow();
    call(fx);
    seal(fx);
    assert.strictEqual(call(fx).exit, 0);
    assert.deepStrictEqual(post(fx, 'pignolo:implementer'), { exit: 0, stdout: '', stderr: '' });
  });
  await t.test('Explore -> silent', () => {
    const fx = flow();
    call(fx);
    assert.deepStrictEqual(post(fx, 'Explore'), { exit: 0, stdout: '', stderr: '' });
  });
});

test('launcher smoke: SubagentStop DONE without a seal -> 2', () => {
  const fx = flow();
  const r = runLauncher('handback-gate', { ...payload(fx), last_assistant_message: 'x\nDONE' }, fx.env);
  assert.strictEqual(r.status, 2, r.stderr);
});

test('launcher smoke: PreToolUse SubagentHandback with a seal -> 0 silent', () => {
  const fx = flow();
  seal(fx);
  const r = runLauncher('handback-gate', payload(fx, { via: 'handback' }), fx.env);
  assert.deepStrictEqual([r.status, r.stdout, r.stderr], [0, '', '']);
});

test('launcher smoke: PostToolUse Agent after a rejection -> additionalContext', () => {
  const fx = flow();
  call(fx);
  const r = runLauncher('handback-gate', { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'pignolo:implementer' }, cwd: fx.main }, fx.env);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /t1/);
});

// Repo grande armado con fast-import; solo la worktree de la tarea se desprotege (el
// principal solo necesita .pignolo/project.md y run.json, que se leen sin git).
function bigFlow(n) {
  const main = makeTempDir('pignolo-big-');
  git(['init', '-q', '-b', 'main'], main);
  const files = [['.pignolo/project.md', PROJECT_MD], ['.pignolo/.gitignore', 'run.json\n'], ['src/a.js', 'module.exports = 1;\n'],
    ['tests/a.test.js', "require('../src/a');\n"], ['jest.config.js', 'module.exports = {};\n']];
  for (let i = 0; i < n; i += 1) files.push([`big/d${i % 100}/f${i}.txt`, `${i}\n`]);
  let stream = '';
  files.forEach(([, text], i) => { stream += `blob\nmark :${i + 1}\ndata ${Buffer.byteLength(text)}\n${text}`; });
  stream += 'commit refs/heads/main\ncommitter pignolo-test <test@example.invalid> 0 +0000\ndata 5\nbase\n';
  files.forEach(([rel], i) => { stream += `M 100644 :${i + 1} ${rel}\n`; });
  execFileSync('git', ['fast-import', '--quiet'], { cwd: main, input: stream });
  const base = git(['rev-parse', 'main'], main);
  const wt = path.join(makeTempDir('pignolo-wt-'), 'wt');
  git(['-c', 'core.autocrlf=false', 'worktree', 'add', '-q', '-b', 'task/t1', wt, 'main'], main);
  fs.mkdirSync(path.join(main, '.pignolo'));
  fs.writeFileSync(path.join(main, '.pignolo', 'project.md'), PROJECT_MD);
  fs.writeFileSync(path.join(main, '.pignolo', 'run.json'), JSON.stringify({
    v: 1, flow: 'daily', started: new Date().toISOString(), expires: new Date(Date.now() + 3600e3).toISOString(),
    task: { id: 't1', worktree: wt, base, files: ['src/a.js'], agents: ['pignolo:implementer'] },
  }));
  return { main, wt, base, env: { PIGNOLO_HOME: makeTempDir('pignolo-home-') } };
}

test('launcher on a large repo (20.000 files) accepts a sealed DONE inside the 3 s deadline', () => {
  const fx = bigFlow(20000);
  edit(fx, 'src/a.js', 'module.exports = 5;\n');
  seal(fx);
  const t0 = Date.now();
  const r = runLauncher('handback-gate', payload(fx), fx.env);
  const ms = Date.now() - t0;
  assert.deepStrictEqual([r.status, r.stderr], [0, ''], `${ms} ms`);
  assert.ok(ms < 3000, `${ms} ms`);
});
