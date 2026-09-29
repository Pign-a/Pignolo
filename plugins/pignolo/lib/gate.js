'use strict';
// Compuerta fuera de hooks (spec §8.2, §9.2, §9.4): corre el comando del nivel, mide
// que el árbol no cambie, alcance e integridad de tests, y escribe el sello.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readProjectConfig } = require('./project-config');
const { matchAny } = require('./globs');
const { workingTree, changedFiles, addedLines, headSha } = require('./changes');
const { repoIdFor, writeSeal } = require('./seals');

const LEVELS = ['on-edit', 'on-done', 'pre-merge'];
const SEALED = ['on-done', 'pre-merge'];
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const GIT_MS = 120000;
const TAIL_LINES = 40;

const ENV_DETECT = [
  /process\.env\.VITEST\b/,
  /\bJEST_WORKER_ID\b/,
  /\bNODE_ENV\b\s*[!=]==?\s*['"]test['"]|['"]test['"]\s*[!=]==?\s*(?:process\.env\.)?NODE_ENV\b/,
  /import\.meta\.vitest\b/,
  /\bPYTEST_CURRENT_TEST\b/,
  /['"]pytest['"]\s+in\s+sys\.modules/,
];

// Por defecto: la shell, con stdout y stderr a un archivo por fd (sin maxBuffer).
function defaultExec(command, { cwd, timeoutMs, logFile }) {
  const fd = fs.openSync(logFile, 'w');
  try {
    const r = spawnSync(command, { cwd, shell: true, windowsHide: true, timeout: timeoutMs, stdio: ['ignore', fd, fd] });
    if (r.error || r.status === null) {
      fs.writeSync(fd, `\n[pignolo gate] el comando no terminó: ${r.error ? r.error.message : `señal ${r.signal}`}\n`);
      return { exit: 124 };
    }
    return { exit: r.status };
  } finally {
    fs.closeSync(fd);
  }
}

const inFiles = (files, p) => files.includes(p) || matchAny(files, p);

function runGate({ cwd, level, env = process.env, task, noTestsReason, timeoutMs = DEFAULT_TIMEOUT_MS, exec = defaultExec } = {}) {
  if (!LEVELS.includes(level)) throw new Error(`nivel inválido: ${level} (on-edit | on-done | pre-merge)`);
  const ref = task ? (task.testRef || task.base) : undefined;
  const config = readProjectConfig({ root: cwd, ref, timeoutMs: GIT_MS });
  const command = config.gates[level] || '';
  const gitOpts = { cwd, timeoutMs: GIT_MS };

  const treeHash = workingTree(gitOpts);
  const seal = {
    v: 1, repoId: repoIdFor({ cwd }), sha: headSha(gitOpts), treeHash, treeAfter: treeHash, level,
    command, exit: null, status: 'NO_GATE', time: new Date().toISOString(),
    task: task ? task.id : null, noTestsReason: null,
    checks: { scope: [], emptied: [], integrity: [], envDetect: [] },
  };
  let log = '';

  if (command) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-gate-'));
    const logFile = path.join(dir, 'gate.log');
    try {
      seal.exit = exec(command, { cwd, timeoutMs, logFile }).exit;
      try { log = fs.readFileSync(logFile, 'utf8'); } catch (_) { log = ''; }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    seal.treeAfter = workingTree(gitOpts);
    const c = seal.checks;
    const flags = { treeChanged: seal.treeAfter !== treeHash, noRef: false, integrity: false, scope: false, noTests: false };

    if (flags.treeChanged) c.scope.push(...changedFiles({ ...gitOpts, base: treeHash, tree: seal.treeAfter, sizes: false }).map((f) => f.path));

    const baseRef = task ? task.base : headSha(gitOpts);
    if (task) {
      if (!ref) flags.noRef = true;
      else {
        const files = changedFiles({ ...gitOpts, base: ref, tree: treeHash });
        const listed = task.files || [];
        const writer = (task.agents || []).includes('pignolo:test-writer') || task.testAuthorization === true;
        for (const f of files) {
          if (!inFiles(listed, f.path) && !c.scope.includes(f.path)) c.scope.push(f.path);
          if (f.emptied) c.emptied.push(f.path);
          const isTest = matchAny(config.testPaths, f.path) || matchAny(config.protectedTestConfig, f.path);
          if (isTest && !(writer && inFiles(listed, f.path))) c.integrity.push(f.path);
        }
      }
    }
    if (baseRef) {
      const added = addedLines({ ...gitOpts, base: baseRef, tree: treeHash });
      for (const l of added) {
        if (l.sign === '+' && !matchAny(config.testPaths, l.path) && ENV_DETECT.some((re) => re.test(l.text))) c.envDetect.push({ path: l.path, line: l.line, text: l.text.trim() });
      }
      if (config.type === 'code-untested') {
        const changed = changedFiles({ ...gitOpts, base: baseRef, tree: treeHash, sizes: false });
        flags.noTests = !changed.some((f) => matchAny(config.testPaths, f.path));
      }
    }
    flags.integrity = c.integrity.length > 0;
    flags.scope = c.scope.length > 0 || c.emptied.length > 0;

    const reason = typeof noTestsReason === 'string' && noTestsReason.trim() ? noTestsReason : null;
    if (flags.noRef) seal.status = 'INTEGRITY_NO_REF';
    else if (flags.treeChanged) seal.status = 'TREE_CHANGED';
    else if (seal.exit !== 0) seal.status = 'FAIL';
    else if (flags.integrity) seal.status = 'INTEGRITY';
    else if (flags.scope) seal.status = 'SCOPE';
    else if (flags.noTests) { seal.status = 'NO_TESTS'; seal.noTestsReason = reason; } else seal.status = 'PASS';
  }

  let logHash;
  let file = null;
  if (SEALED.includes(level)) {
    ({ file, logHash } = writeSeal({ env, repoId: seal.repoId, seal, log }));
    seal.logHash = logHash;
  } else {
    seal.logHash = require('node:crypto').createHash('sha256').update(log).digest('hex');
  }
  const tail = log.split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).slice(-TAIL_LINES).join('\n');
  Object.defineProperty(seal, 'logTail', { value: tail, enumerable: false });
  Object.defineProperty(seal, 'file', { value: file, enumerable: false });
  return seal;
}

module.exports = { runGate, LEVELS, DEFAULT_TIMEOUT_MS };
