'use strict';
// Tests debilitados en el diff (hito 4a, Task 1): skip, only, retry, actualización de
// snapshots, aserciones quitadas, tests y snapshots borrados o cambiados. Heurística
// declarada: los comentarios no se excluyen, como los tripwires (spec §4.2).
const path = require('node:path');
const { matchAny } = require('./globs');
const { changedFiles, addedLines } = require('./changes');

const KINDS = Object.freeze([
  'skip', 'only', 'retry', 'snapshot-update', 'assertion-removed', 'test-deleted', 'snapshot-changed',
]);

// Límite a la izquierda: `process.exit(` no es `xit(` ni `benefit(` es `fit(`.
const L = String.raw`(?<![\w.$])`;

const SKIP = [
  new RegExp(`${L}(?:it|test|describe)\\.skip\\(`),
  new RegExp(`${L}(?:it|test)\\.todo\\(`),
  new RegExp(`${L}(?:xit|xdescribe|xtest)\\(`),
  new RegExp(`${L}skip\\s*:\\s*true`),
  new RegExp(`${L}t\\.skip\\(`),
  new RegExp(`${L}pytest\\.skip\\(`),
  /@pytest\.mark\.(?:skip|xfail)/,
  /@unittest\.skip/,
  /@Disabled\b/,
  /\[Ignore\]/,
];
const ONLY = [
  new RegExp(`${L}(?:it|test|describe)\\.only\\(`),
  new RegExp(`${L}(?:fit|fdescribe)\\(`),
  new RegExp(`${L}only\\s*:\\s*true`),
];
const RETRY = [
  new RegExp(`${L}jest\\.retryTimes\\(`),
  new RegExp(`${L}this\\.retries\\(`),
  new RegExp(`${L}(?:retries|retry)\\s*:`),
  /@pytest\.mark\.flaky/,
  /--reruns/,
];
const SNAPSHOT_UPDATE = [
  /(?<![\w-])--(?:update|updateSnapshot|update-snapshots?|snapshot-update)(?![\w-])/,
  /\b(?:jest|vitest)\b.*\s-u(?![\w-])/,
];
const ASSERTION = [
  new RegExp(`${L}expect\\(`),
  new RegExp(`${L}assert\\.`),
  new RegExp(`${L}assert\\(`),
  /\.should/,
  new RegExp(`${L}t\\.(?:is|deepEqual)\\(`),
  /self\.assert/,
  /^\s*assert\b/,
];
const SNAPSHOT_PATH = /(?:\.snap$|(?:^|\/)__snapshots__\/|golden)/;

const any = (res, text) => res.some((re) => re.test(text));

// Función pura: `lines` es la salida de addedLines ({ path, line, text, sign }), `files` la de
// changedFiles ({ path, status }; 'D' borrado, 'A' agregado). Sin git.
function classify(lines, files, { testPaths = [], protectedTestConfig = [] } = {}) {
  const isTest = (p) => matchAny(testPaths, p);
  const isConfig = (p) => matchAny(protectedTestConfig, p);
  const isPackage = (p) => path.posix.basename(p) === 'package.json';
  const status = new Map((files || []).map((f) => [f.path, f.status]));
  const out = [];
  const push = (p, line, kind, text) => out.push({ path: p, line, kind, text });

  const counts = new Map();
  for (const l of lines || []) {
    const test = isTest(l.path);
    const config = isConfig(l.path);
    if (!test && !config && !isPackage(l.path)) continue;
    if (l.sign === '+') {
      if (test) {
        if (any(SKIP, l.text)) push(l.path, l.line, 'skip', l.text);
        if (any(ONLY, l.text)) push(l.path, l.line, 'only', l.text);
      }
      if ((test || config) && any(RETRY, l.text)) push(l.path, l.line, 'retry', l.text);
      if ((config || isPackage(l.path)) && any(SNAPSHOT_UPDATE, l.text)) push(l.path, l.line, 'snapshot-update', l.text);
    }
    if (test && status.get(l.path) !== 'D' && any(ASSERTION, l.text)) {
      const c = counts.get(l.path) || { removed: 0, added: 0, first: l.line };
      if (l.sign === '-') {
        if (c.removed === 0) c.first = l.line;
        c.removed += 1;
      } else c.added += 1;
      counts.set(l.path, c);
    }
  }
  for (const [p, c] of counts) {
    if (c.removed > c.added) push(p, c.first, 'assertion-removed', `aserciones quitadas: ${c.removed}, agregadas: ${c.added}`);
  }
  for (const f of files || []) {
    if (f.status === 'D' && isTest(f.path)) push(f.path, 1, 'test-deleted', f.path);
    if (f.status !== 'A' && SNAPSHOT_PATH.test(f.path) && (isTest(f.path) || isConfig(f.path))) {
      push(f.path, 1, 'snapshot-changed', f.path);
    }
  }
  return out;
}

// Debilitamientos entre base y tree (git). La compuerta la llama con los globs del proyecto.
function weakenings({ cwd, base, tree, testPaths = [], protectedTestConfig = [], timeoutMs } = {}) {
  const lines = addedLines({ cwd, base, tree, timeoutMs });
  const files = changedFiles({ cwd, base, tree, timeoutMs, sizes: false });
  return classify(lines, files, { testPaths, protectedTestConfig });
}

module.exports = { weakenings, classify, KINDS };
