'use strict';
// Compuerta fuera de hooks (spec §8.2, §9.2, §9.4): corre el comando del nivel, mide
// que el árbol no cambie, alcance e integridad de tests, y escribe el sello.
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readProjectConfig } = require('./project-config');
const { matchAny } = require('./globs');
const { workingTree, changedFiles, addedLines, headSha } = require('./changes');
const { weakenings } = require('./test-integrity');
const { repoIdFor, writeSeal } = require('./seals');
const { expandSeed } = require('./init-seed');

const LEVELS = ['on-edit', 'on-done', 'pre-merge'];
const SEALED = ['on-done', 'pre-merge'];
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const GIT_MS = 120000;
const TAIL_LINES = 40;
// Extensiones de código para las que se pide `Protects:` en un test agregado (se registra, no bloquea).
const CODE_EXT = /\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|cs|rb|php)$/;
const PROTECTS_LINES = 20;

const ENV_DETECT = [
  /process\.env\.VITEST\b/,
  /\bJEST_WORKER_ID\b/,
  /\bNODE_ENV\b\s*[!=]==?\s*['"]test['"]|['"]test['"]\s*[!=]==?\s*(?:process\.env\.)?NODE_ENV\b/,
  /import\.meta\.vitest\b/,
  /\bPYTEST_CURRENT_TEST\b/,
  /['"]pytest['"]\s+in\s+sys\.modules/,
];

// Por defecto: la shell, con stdout y stderr a un archivo por fd (sin maxBuffer).
function defaultExec(command, { cwd, timeoutMs, logFile, env }) {
  const fd = fs.openSync(logFile, 'w');
  try {
    const r = spawnSync(command, { cwd, env, shell: true, windowsHide: true, timeout: timeoutMs, stdio: ['ignore', fd, fd] });
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

function hasProtects(cwd, rel) {
  try {
    return fs.readFileSync(path.join(cwd, rel), 'utf8').split(/\r?\n/, PROTECTS_LINES).some((l) => /\bProtects:/.test(l));
  } catch (_) { return true; } // ilegible: no se acusa
}

function runGate({ cwd, level, env = process.env, task, noTestsReason, timeoutMs = DEFAULT_TIMEOUT_MS, exec = defaultExec, seed, base } = {}) {
  if (!LEVELS.includes(level)) throw new Error(`nivel inválido: ${level} (on-edit | on-done | pre-merge)`);
  const ref = task ? (task.testRef || task.base) : undefined;
  const config = readProjectConfig({ root: cwd, ref, timeoutMs: GIT_MS });
  const command = config.gates[level] || '';
  const gitOpts = { cwd, timeoutMs: GIT_MS };
  const seedOffered = Number.isInteger(seed) ? seed : crypto.randomInt(0, 2 ** 32);
  const runEnv = { ...process.env, PIGNOLO_TEST_SEED: String(seedOffered) };

  const treeHash = workingTree(gitOpts);
  const seal = {
    v: 1, repoId: repoIdFor({ cwd }), sha: headSha(gitOpts), treeHash, treeAfter: treeHash, level,
    command, exit: null, status: 'NO_GATE', time: new Date().toISOString(),
    task: task ? task.id : null, noTestsReason: null, seedOffered, seedInCommand: command.includes('{seed}'),
    checks: { scope: [], emptied: [], integrity: [], envDetect: [], weakened: [], noProtects: [], mutation: null },
  };
  let log = '';
  const baseRef = task ? task.base : (base || headSha(gitOpts));
  // Cambiados contra la base que caen en high-risk-paths, si `mutation: true`.
  const mutationFiles = () => {
    if (!config.mutation || !baseRef || !config.highRiskPaths.length) return [];
    return changedFiles({ ...gitOpts, base: baseRef, tree: treeHash, sizes: false })
      .filter((f) => f.status !== 'D' && matchAny(config.highRiskPaths, f.path)).map((f) => f.path);
  };

  if (command) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-gate-'));
    const logFile = path.join(dir, 'gate.log');
    const c = seal.checks;
    try {
      seal.exit = exec(expandSeed(command, seedOffered), { cwd, timeoutMs, logFile, env: runEnv }).exit;
      try { log = fs.readFileSync(logFile, 'utf8'); } catch (_) { log = ''; }
      seal.treeAfter = workingTree(gitOpts);
      const mutFiles = mutationFiles();
      if (level === 'pre-merge' && mutFiles.length) {
        if (!config.gates.mutation) c.mutation = { files: mutFiles, exit: null };
        else if (seal.exit === 0 && seal.treeAfter === treeHash) {
          const mutLog = path.join(dir, 'mutation.log');
          const mutEnv = { ...runEnv, PIGNOLO_MUTATE_FILES: mutFiles.join('\n') };
          const exit = exec(config.gates.mutation, { cwd, timeoutMs, logFile: mutLog, env: mutEnv }).exit;
          let out = '';
          try { out = fs.readFileSync(mutLog, 'utf8'); } catch (_) { out = ''; }
          log += `${log === '' || log.endsWith('\n') ? '' : '\n'}--- mutation ---\n${out}`;
          c.mutation = { files: mutFiles, exit };
          seal.treeAfter = workingTree(gitOpts);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const flags = { treeChanged: seal.treeAfter !== treeHash, noRef: false, integrity: false, scope: false, noTests: false, noMutationTool: false, mutation: false };

    if (flags.treeChanged) c.scope.push(...changedFiles({ ...gitOpts, base: treeHash, tree: seal.treeAfter, sizes: false }).map((f) => f.path));

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
    const weakRef = ref ?? baseRef;
    if (weakRef) {
      c.weakened.push(...weakenings({ ...gitOpts, base: weakRef, tree: treeHash, testPaths: config.testPaths, protectedTestConfig: config.protectedTestConfig }));
      for (const f of changedFiles({ ...gitOpts, base: weakRef, tree: treeHash, sizes: false })) {
        if (f.status === 'A' && CODE_EXT.test(f.path) && matchAny(config.testPaths, f.path) && !hasProtects(cwd, f.path)) c.noProtects.push(f.path);
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
    flags.integrity = c.integrity.length > 0 || (c.weakened.length > 0 && !(task && task.testAuthorization === true));
    flags.noMutationTool = !!c.mutation && c.mutation.exit === null && !config.gates.mutation;
    flags.mutation = !!c.mutation && c.mutation.exit !== null && c.mutation.exit !== 0;
    flags.scope = c.scope.length > 0 || c.emptied.length > 0;

    const reason = typeof noTestsReason === 'string' && noTestsReason.trim() ? noTestsReason : null;
    if (flags.noRef) seal.status = 'INTEGRITY_NO_REF';
    else if (flags.treeChanged) seal.status = 'TREE_CHANGED';
    else if (seal.exit !== 0) seal.status = 'FAIL';
    else if (flags.integrity) seal.status = 'INTEGRITY';
    else if (flags.scope) seal.status = 'SCOPE';
    else if (flags.noMutationTool) seal.status = 'NO_MUTATION_TOOL';
    else if (flags.mutation) seal.status = 'MUTATION';
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
