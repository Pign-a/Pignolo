'use strict';
// Red check of the defect cards (card lentes-reales, section 4): for each defect, the test of
// the fix must FAIL before the fix and PASS on the fix commit. Uses one temporary detached
// worktree (outside the repo); runs only the test files of the defects, never the whole suite.
//
// States tried per defect (the fix's test files are copied over the tree in the first two):
//   tip        the card's pre-fix tip (c3e45af for 7a, 46d6ac3 for 8d, 12659b1 for pignolo-ui)
//   fixParent  the commit right before the fix
//   fix        the fix commit (the test must pass)
//
//   node tests/bench/revision/redcheck.js --wt <worktree dir> --out <dir> [--repo <path>] [--only id,id] [--timeout-s 900] [--remove]
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { git, loadCases, parseArgs, DEFAULT_REPO } = require('./lib');

// Parse node --test TAP output into { title -> 'pass' | 'fail' | 'skip' } for top-level tests.
function parseTap(out) {
  const res = {};
  for (const line of out.split('\n')) {
    const m = /^(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO)\b.*)?\s*$/.exec(line);
    if (!m) continue; // nested subtests are indented and ignored
    const title = m[2].replace(/\\#/g, '#');
    res[title] = m[3] ? 'skip' : m[1] === 'ok' ? 'pass' : 'fail';
  }
  return res;
}

// A child `node --test` must not inherit the context of a parent test run (even an empty value).
function cleanEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runFile(wt, file, timeoutS) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    cwd: wt, encoding: 'utf8', maxBuffer: 1 << 28, timeout: timeoutS * 1000, env: cleanEnv(),
  });
  const out = `${r.stdout || ''}`;
  const loadError = /ERR_MODULE_NOT_FOUND|Cannot find module|ERR_REQUIRE|SyntaxError/.test(`${out}${r.stderr || ''}`) && !Object.keys(parseTap(out)).some((t) => !t.endsWith('.js') && !t.endsWith('.mjs'));
  return { results: parseTap(out), status: r.status, timedOut: r.error && r.error.code === 'ETIMEDOUT', loadError, tail: out.split('\n').filter((l) => /not ok|# (fail|pass)|Error/.test(l)).slice(0, 12).join('\n') };
}

function checkout(wt, commit) {
  git(wt, ['checkout', '-f', '--detach', commit]);
  git(wt, ['clean', '-fdxq']);
}

function overlay(repo, wt, commit, files) {
  for (const f of files) {
    const dest = path.join(wt, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, git(repo, ['show', `${commit}:${f}`], { buffer: true }));
  }
}

// A test status for a title prefix: the first top-level test whose title starts with it.
function statusOf(results, prefix, runInfo) {
  const title = Object.keys(results).find((t) => t.startsWith(prefix));
  if (!title) return { title: null, status: runInfo.loadError ? 'load-error' : 'absent' };
  return { title, status: results[title] };
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.wt || !a.out) {
    process.stderr.write('uso: node redcheck.js --wt <dir> --out <dir> [--repo <path>] [--only id,id] [--timeout-s 900] [--remove]\n');
    process.exit(2);
  }
  const repo = a.repo ? path.resolve(a.repo) : DEFAULT_REPO;
  const wt = path.resolve(a.wt);
  const cases = loadCases();
  const only = a.only ? String(a.only).split(',') : null;
  const timeoutS = Number(a['timeout-s'] || 900);
  const defects = cases.defects.filter((d) => d.tests.length && (!only || only.includes(d.id)));
  if (!fs.existsSync(wt)) git(repo, ['worktree', 'add', '--detach', wt, defects[0].tip]);
  fs.mkdirSync(a.out, { recursive: true });

  const cache = new Map(); // state|testCommit|file -> run
  const rows = [];
  for (const d of defects) {
    const testCommit = d.testFrom || d.fix;
    const files = [...new Set(d.tests.map((t) => t.file))];
    const states = [
      { name: 'tip', commit: d.tip, overlay: true },
      { name: 'fixParent', commit: `${d.fix}^`, overlay: true },
      { name: 'fix', commit: d.testFrom ? `${d.fix}` : d.fix, overlay: Boolean(d.testFrom) },
    ];
    const row = { id: d.id, fix: d.fix, checks: {} };
    for (const s of states) {
      const key = (f) => `${s.name === 'tip' ? d.tip : s.name === 'fixParent' ? `${d.fix}^` : d.fix}|${testCommit}|${f}`;
      let prepared = false;
      const perFile = {};
      for (const f of files) {
        if (!cache.has(key(f))) {
          if (!prepared) { checkout(wt, s.commit); if (s.overlay) overlay(repo, wt, testCommit, files); prepared = true; }
          const t0 = Date.now();
          const run = runFile(wt, f, timeoutS);
          run.seconds = Math.round((Date.now() - t0) / 1000);
          cache.set(key(f), run);
        }
        perFile[f] = cache.get(key(f));
      }
      row.checks[s.name] = d.tests.map((t) => ({ file: t.file, role: t.role, prefix: t.name, ...statusOf(perFile[t.file].results, t.name, perFile[t.file]), loadError: perFile[t.file].loadError, timedOut: Boolean(perFile[t.file].timedOut) }));
      process.stdout.write(`${d.id}\t${s.name}\t${row.checks[s.name].map((c) => `${c.role}:${c.status}`).join(' ')}\n`);
    }
    const primary = (name) => row.checks[name].filter((c) => c.role === 'primary');
    const isRed = (c) => c.status === 'fail' || c.status === 'load-error';
    const verdict = (name) => {
      const p = primary(name);
      return p.every(isRed) ? 'red' : p.some(isRed) ? 'partial' : 'not-red';
    };
    row.red = { tip: verdict('tip'), fixParent: verdict('fixParent') };
    row.redKind = primary('tip').some((c) => c.status === 'load-error') ? 'load-error (module or file missing)' : 'assertion';
    row.green = primary('fix').every((c) => c.status === 'pass') ? 'green' : 'not-green';
    row.flag = row.red.tip !== 'red' || row.red.fixParent !== 'red' || row.green !== 'green';
    rows.push(row);
    fs.writeFileSync(path.join(a.out, 'red-check.json'), `${JSON.stringify(rows, null, 2)}\n`);
  }
  const md = ['| Defecto | Arreglo | Rojo en la punta de la ficha | Rojo en el padre del arreglo | Verde en el arreglo | Tipo de rojo | Marca |', '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.id} | ${r.fix} | ${r.red.tip} | ${r.red.fixParent} | ${r.green} | ${r.redKind} | ${r.flag ? 'REVISAR' : ''} |`)].join('\n');
  fs.writeFileSync(path.join(a.out, 'red-check.md'), `${md}\n`);
  process.stdout.write(`${md}\n`);
  if (a.remove) git(repo, ['worktree', 'remove', '--force', wt]);
}

if (require.main === module) {
  try { main(); } catch (e) { process.stderr.write(`redcheck: ${e.message}\n`); process.exit(1); }
}

module.exports = { parseTap, statusOf };
