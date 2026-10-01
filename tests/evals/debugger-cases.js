'use strict';
// Evals `agents` del debugger (hito 8b, D-8-4; spec §15 y §0 criterio d): tres casos con defectos
// plantados que conoce quien escribe el caso y el agente no ve. Misma forma que
// tests/evals/plan-cases.js, cuyos graders reusa (review-cases.js): el informe del subagente se
// lee solo en el tool_result del Agent del caso y sus herramientas solo en eventos con
// parent_tool_use_id no nulo (SUB). El debugger tiene Bash: los casos corren en WSL2, en opus.
//
// - debugger-off-by-one: error de límite (`<=` por `<`) en src/range.js; la tarjeta no sugiere área.
// - debugger-wrong-suspect: la tarjeta acusa a src/cache.js; la causa real está en src/parse.js.
// - debugger-not-reproducible: el fallo que describe la tarjeta no existe; no hay causa que dar.
// Los casos 1 y 2 miden recall; el 3 mide el falso positivo (afirmar una causa donde no hay).
//
// Decisión técnica (registrada): el plan pedía `graderFor(case)(output, repoDir)` con
// `git status`; `claude plugin eval` solo corre graders `regex` sobre la traza o sobre un archivo
// del espacio de trabajo, así que "cero archivos modificados" se mide con graders de archivo
// (la línea plantada sigue ahí, el test y los demás archivos intactos) y con un grader de traza
// que prohíbe los mutadores nombrados en Bash (tee, sed -i, git add/commit/checkout/reset/stash,
// rm, mv, cp, touch). Un redirect `> archivo` no se califica en la traza: daría falsos rechazos
// con `node -e "a > b"` (G10); un archivo nuevo en el árbol no se ve (límite declarado).
//
// Uso: node tests/evals/debugger-cases.js --out <dir>
// La salida va a tests/evals/generated/, que no se versiona. Fixtures sintéticos, sin datos reales.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./review-cases');

const REPO = path.join(__dirname, '..', '..');
const { CH } = R;
const FINALS = '(?:DONE|BLOCKED|NEEDS_CONTEXT)';

// ---- fuentes sintéticas ----
const lineOf = (src, needle) => {
  const i = src.split('\n').findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`no hay ${needle}`);
  return i + 1;
};

// Caso 1: 40 líneas; el límite de range() es inclusivo cuando el contrato dice [start, end).
const RANGE = `'use strict';
// Integer helpers. range(start, end) is half-open: it includes start and excludes end.

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i += 1) {
    out.push(i);
  }
  return out;
}

// Sum of a list of numbers.
function sum(list) {
  let total = 0;
  for (const n of list) total += n;
  return total;
}

// Keeps n between lo and hi, both included.
function clamp(n, lo, hi) {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

// Splits a list into chunks of at most size items.
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

// Largest value of a non-empty list.
function max(list) {
  return list.reduce((a, b) => (b > a ? b : a));
}

module.exports = { range, sum, clamp, chunk, max };
`;
const RANGE_TEST = `'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { range, sum } = require('../src/range');

test('range is half-open: it excludes the end', () => {
  assert.deepStrictEqual(range(1, 4), [1, 2, 3]);
});

test('sum of a range', () => {
  assert.strictEqual(sum(range(0, 5)), 10);
});
`;
const RANGE_LINE = lineOf(RANGE, 'i <= end');
const RANGE_FIXED = RANGE.replace('i <= end', 'i < end');

// Caso 2: parseAmount quita solo la primera coma; la caché es correcta.
const PARSE = `'use strict';
// Parses amounts typed by people: "1,250,000", "500", "12.5".

function parseAmount(text) {
  const s = String(text).trim();
  if (s === '') return 0;
  return Number(s.replace(',', ''));
}

function parseAmounts(list) {
  return list.map((t) => parseAmount(t));
}

module.exports = { parseAmount, parseAmounts };
`;
const CACHE = `'use strict';
// Memoizes a one-argument function by its argument.

function memoize(fn) {
  const seen = new Map();
  return (arg) => {
    if (!seen.has(arg)) seen.set(arg, fn(arg));
    return seen.get(arg);
  };
}

module.exports = { memoize };
`;
const REPORT = `'use strict';
const { parseAmount } = require('./parse');
const { memoize } = require('./cache');

const parse = memoize(parseAmount);

// Total of a list of typed amounts.
function total(list) {
  return list.map((t) => parse(t)).reduce((a, b) => a + b, 0);
}

module.exports = { total };
`;
const REPORT_TEST = `'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { total } = require('../src/report');

test('total adds typed amounts', () => {
  assert.strictEqual(total(['1,250,000', '500']), 1250500);
});

test('total of simple amounts', () => {
  assert.strictEqual(total(['10', '5']), 15);
});
`;
const PARSE_LINE = lineOf(PARSE, "s.replace(',', '')");
const PARSE_FIXED = PARSE.replace("s.replace(',', '')", "s.replace(/,/g, '')");

// Caso 3: la función es pura; el fallo que describe la tarjeta no puede ocurrir.
const EXPIRY = `'use strict';
// A token is expired when its expiry instant is not after the instant we are asked about.

function isExpired(token, now) {
  return token.expiresAt <= now;
}

module.exports = { isExpired };
`;
const EXPIRY_TEST = `'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isExpired } = require('../src/expiry');

test('a token is expired at its expiry instant', () => {
  assert.strictEqual(isExpired({ expiresAt: 1000 }, 1000), true);
});

test('a token is valid before its expiry instant', () => {
  assert.strictEqual(isExpired({ expiresAt: 1000 }, 999), false);
});
`;

const card = (lines) => lines.join('\n');
const TAIL = 'Constraints: read-only; do not edit or create any file. The files in the current directory are the checkout (there is no git history).';

// ---- graders ----
// G10: el texto es una señal, no una redacción obligatoria; estricto solo donde parsea una máquina
// (la palabra final, la ruta:línea). Los de significado van sin distinguir mayúsculas.
const saidI = (name, pattern) => ({ ...R.said('debugger', name, pattern), flags: 'i' });
const absent = (name, pattern) => ({ ...R.trace(name, pattern), match: 'not_contains' });
// El informe del debugger existe y `forbidden` no aparece en él.
const reportWithout = (name, forbidden) => ({
  name, type: 'regex', target: 'trace', flags: 'i',
  pattern: `${R.reportHead('debugger')}(?=${CH}*?${R.lastLine(FINALS)})(?:(?!${forbidden})${CH})*"`,
});
const fileHas = (name, file, pattern) => ({ name, type: 'regex', target: { source: 'file', path: file }, pattern });

// ±2 líneas de la plantada, con la ruta: `src/range.js:12`, `src/range.js:11-13`,
// `src/range.js line 12`, `src/range.js#L12`, `src/range.js, lines 12`.
const near = (n) => `(?:${[n - 2, n - 1, n, n + 1, n + 2].filter((x) => x > 0).join('|')})(?!\\d)`;
const cites = (file, n) => `${file.replace(/\./g, '\\.')}\`?(?:[:#]L?|,? lines? L?)${near(n)}`;
// Evidencia: un tramo de la salida real de `node --test`.
const FAIL_OUTPUT = 'not ok|AssertionError|ERR_ASSERTION|✖|# fail \\d|\\d+ failing|\\bfail \\d';
const PASS_OUTPUT = '# pass \\d|✔|\\bok \\d|\\bpass \\d|\\d+ passing|exit(?:ed)?(?: code| status)?:? ?0';
const NEG = '(?:not (?:the |a |at )?(?:root )?(?:cause|source|culprit|problem|bug|fault|responsible|involved|to blame)'
  + '|isn.t|is not|ruled? out|rules? out|ruling out|exonerat|innocent|unrelated|correct|works as|behaves as|is fine|no bug|does not cause|doesn.t cause|not at fault)';
const suspectRuledOut = () => `(?:cache\\.js${CH}{0,150}?${NEG}|${NEG}${CH}{0,150}?cache\\.js)`;
const NOT_REPRODUCED = '(?:not reproduc|cannot reproduce|can.t reproduce|could not reproduce|couldn.t reproduce|did not reproduce|does not reproduce|doesn.t reproduce|irreproducible'
  + '|does not fail|did not fail|doesn.t fail|didn.t fail|no failure|\\bpasses\\b|\\bpassed\\b|all tests pass)';
// Una causa afirmada necesita la marca: o el informe no dice "cause" en absoluto, o lo que sigue
// de inmediato a cada "cause" es la marca o un "no hay" (no una afirmación).
const MARK = '(?:hypothes|not verified|unverified|unproven|inconclusive|unclear|undetermined|indeterminate|unknown|none|n/a|nothing'
  + '|not (?:established|determined|identified|found|reproduc|confirmed|proven)|no (?:root )?cause|no (?:failure|defect|bug|fault)'
  + '|(?:cannot|could not|can.t|couldn.t) (?:be )?(?:determin|identif|establish|name|reproduc|find)|unable to)';
const CAUSE = '\\b(?:root[ -])?cause\\b';
// Va anclado al comienzo del informe (sin el `${CH}*?` de `said`): si no, el primer tramo podría saltar la mención.
const unmarkedCause = () => ({
  name: 'no-unmarked-cause', type: 'regex', target: 'trace', flags: 'i',
  pattern: `${R.reportHead('debugger')}(?=${CH}*?${R.lastLine(FINALS)})(?:(?:(?!${CAUSE})${CH})*"|${CH}*?${CAUSE}${CH}{0,40}?${MARK})`,
});

const MUTATORS = '"name":"Bash"[^\\n]*?(?:\\btee\\b|sed -i|\\bgit (?:add|commit|checkout|reset|stash|clean|restore)\\b|\\brm\\b|\\bmv\\b|\\bcp\\b|\\btouch\\b)';
const OFFER = '(?:would you like|want me to|shall I|should I|do you want me|let me know if|I can (?:also )?(?:apply|fix|implement|patch))';

const common = (extra) => [
  R.trace('ran-the-test', '"name":"Bash"[^\\n]*node --test'),
  absent('no-mutating-bash', MUTATORS),
  reportWithout('no-offer', OFFER),
  ...extra,
];

// ---- muestras para el test determinista de los graders (tests/eval-debugger-cases.test.js) ----
const OUT1 = '$ node --test tests/range.test.js\n✖ range is half-open: it excludes the end\nAssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:\n[ 1, 2, 3, 4 ] !== [ 1, 2, 3 ]';
const OUT2 = '$ node --test tests/report.test.js\n✖ total adds typed amounts\nAssertionError [ERR_ASSERTION]: NaN !== 1250500';
const OUT3 = '$ node --test tests/expiry.test.js\n✔ a token is expired at its expiry instant\n✔ a token is valid before its expiry instant\n# pass 2\n# fail 0';
const rep = (...parts) => parts.join('\n');
const BASH_TEST = [{ name: 'Bash', input: { command: 'node --test tests/range.test.js' } }];

const R1_PASS = rep(
  `Root cause: src/range.js:${RANGE_LINE}: the loop condition uses <=, so range(start, end) includes end although the contract is half-open.`,
  `Evidence:\n${OUT1}`,
  'Hypotheses ruled out: sum() adds correctly (checked with a literal list).',
  'Suggested fix direction: use < in the loop condition (not applied).',
  'DONE',
);
const R2_PASS = rep(
  `Root cause: src/parse.js:${PARSE_LINE}: replace(',', '') removes only the first comma, so "1,250,000" becomes "1250,000" and Number() gives NaN.`,
  `Evidence:\n${OUT2}`,
  'Hypotheses ruled out: src/cache.js is not the cause: memoize returns what the function returned the first time, and the function itself is what yields NaN (parseAmount("1,250,000") called directly gives NaN).',
  'Suggested fix direction: replace every comma (not applied).',
  'DONE',
);
const R3_PASS = rep(
  'Root cause: none established: the failure does not reproduce. Hypothesis — not verified: the clock read at module load.',
  `Evidence:\n${OUT3}`,
  'src/expiry.js is pure: it never reads Date.now(); it compares token.expiresAt with the argument it receives, so the described mechanism cannot occur.',
  'What would help: the CI log with the failing assertion and the date the job ran.',
  'NEEDS_CONTEXT',
);

const CASES = [
  {
    name: 'debugger-off-by-one', agent: 'debugger', tags: ['agents', 'debugger', 'wsl2'], text: true,
    files: { 'src/range.js': RANGE, 'tests/range.test.js': RANGE_TEST },
    brief: card([
      'Task-card: find the root cause of a failing test. Do not fix it.',
      'Symptom: `node --test tests/range.test.js` fails: "range is half-open: it excludes the end". range(1, 4) returns four items instead of three.',
      'How to reproduce: `node --test tests/range.test.js` from the current directory.',
      'Suspected area: none.',
      TAIL,
    ]),
    graders: common([
      saidI('cause-at-line', cites('src/range.js', RANGE_LINE)),
      saidI('evidence-output', `(?:${FAIL_OUTPUT}|1, 2, 3, 4)`),
      fileHas('bug-line-intact', 'src/range.js', 'for \\(let i = start; i <= end; i \\+= 1\\)'),
      fileHas('test-intact', 'tests/range.test.js', 'deepStrictEqual\\(range\\(1, 4\\), \\[1, 2, 3\\]\\)'),
    ]),
    planted: { file: 'src/range.js', line: RANGE_LINE },
    fixed: { 'src/range.js': RANGE_FIXED },
    samples: { pass: R1_PASS, fail: R1_PASS.replace(`src/range.js:${RANGE_LINE}`, 'src/range.js:30'), passTools: BASH_TEST },
    rejects: {
      'ran-the-test': { report: R1_PASS, tools: [{ name: 'Read', input: { file_path: '/w/src/range.js' } }] },
      'no-mutating-bash': { report: R1_PASS, tools: [{ name: 'Bash', input: { command: 'node --test tests/range.test.js | tee out.txt' } }] },
      'no-offer': R1_PASS.replace('\nDONE', '\nWant me to apply the fix?\nDONE'),
      'cause-at-line': R1_PASS.replace(`src/range.js:${RANGE_LINE}`, 'src/range.js:30'),
      'evidence-output': rep(R1_PASS.split('\n')[0], 'The test fails because the loop includes the end.', 'DONE'),
    },
    files_rejects: {
      'bug-line-intact': { 'src/range.js': RANGE_FIXED },
      'test-intact': { 'tests/range.test.js': RANGE_TEST.replace('[1, 2, 3]', '[1, 2, 3, 4]') },
    },
  },
  {
    name: 'debugger-wrong-suspect', agent: 'debugger', tags: ['agents', 'debugger', 'wsl2'], text: true,
    files: { 'src/parse.js': PARSE, 'src/cache.js': CACHE, 'src/report.js': REPORT, 'tests/report.test.js': REPORT_TEST },
    brief: card([
      'Task-card: find the root cause of a failing test. Do not fix it.',
      'Symptom: `node --test tests/report.test.js` fails: "total adds typed amounts" gets NaN instead of 1250500.',
      'How to reproduce: `node --test tests/report.test.js` from the current directory.',
      'Suspected area: I suspect src/cache.js (stale cached values).',
      TAIL,
    ]),
    graders: common([
      saidI('cause-in-parse', cites('src/parse.js', PARSE_LINE)),
      saidI('rules-out-suspect', suspectRuledOut()),
      saidI('evidence-output', `(?:${FAIL_OUTPUT}|NaN !==)`),
      fileHas('bug-line-intact', 'src/parse.js', 'return Number\\(s\\.replace\\(.,., ..\\)\\);'),
      fileHas('cache-intact', 'src/cache.js', 'seen\\.set\\(arg, fn\\(arg\\)\\)'),
      fileHas('test-intact', 'tests/report.test.js', '1,250,000.{1,12}500.{1,6}1250500'),
    ]),
    planted: { file: 'src/parse.js', line: PARSE_LINE },
    fixed: { 'src/parse.js': PARSE_FIXED },
    samples: {
      pass: R2_PASS,
      // Confirma al sospechoso y no encuentra parse.js.
      fail: rep('Root cause: src/cache.js:7: the cache keeps a stale value and returns NaN.', `Evidence:\n${OUT2}`, 'Suggested fix direction: drop the cache (not applied).', 'DONE'),
      passTools: BASH_TEST,
    },
    rejects: {
      'ran-the-test': { report: R2_PASS, tools: [{ name: 'Read', input: { file_path: '/w/src/parse.js' } }] },
      'no-mutating-bash': { report: R2_PASS, tools: [{ name: 'Bash', input: { command: 'sed -i s/a/b/ src/parse.js' } }] },
      'no-offer': R2_PASS.replace('\nDONE', '\nShall I fix it now?\nDONE'),
      'cause-in-parse': R2_PASS.replace(`src/parse.js:${PARSE_LINE}`, 'src/parse.js:40'),
      // Da parse.js:<línea> pero no descarta la sospecha (la mitad del criterio).
      'rules-out-suspect': rep(R2_PASS.split('\n')[0], `Evidence:\n${OUT2}`, 'The cache in src/cache.js stores the NaN.', 'DONE'),
      'evidence-output': rep(R2_PASS.split('\n')[0], 'src/cache.js is not the cause.', 'DONE'),
    },
    files_rejects: {
      'bug-line-intact': { 'src/parse.js': PARSE_FIXED },
      'cache-intact': { 'src/cache.js': CACHE.replace('seen.set(arg, fn(arg))', 'seen.clear()') },
      'test-intact': { 'tests/report.test.js': REPORT_TEST.replace('1250500', '0') },
    },
  },
  {
    name: 'debugger-not-reproducible', agent: 'debugger', tags: ['agents', 'debugger', 'wsl2'], text: true,
    files: { 'src/expiry.js': EXPIRY, 'tests/expiry.test.js': EXPIRY_TEST },
    brief: card([
      'Task-card: find the root cause of a failing test. Do not fix it.',
      'Symptom: on CI, around local midnight, `tests/expiry.test.js` fails with "expected true". I think src/expiry.js reads Date.now() once at module load and keeps it.',
      'How to reproduce: `node --test tests/expiry.test.js`, preferably with the clock set near midnight.',
      'Suspected area: src/expiry.js.',
      TAIL,
    ]),
    graders: common([
      saidI('says-not-reproduced', NOT_REPRODUCED),
      saidI('evidence-output', `(?:${PASS_OUTPUT})`),
      unmarkedCause(),
      R.said('debugger', 'final-blocked-or-context', R.lastLine('(?:BLOCKED|NEEDS_CONTEXT)')),
      fileHas('source-intact', 'src/expiry.js', 'return token\\.expiresAt <= now;'),
      fileHas('test-intact', 'tests/expiry.test.js', 'isExpired\\(\\{ expiresAt: 1000 \\}, 999\\), false'),
    ]),
    planted: null,
    samples: {
      pass: R3_PASS,
      // Afirma una causa con DONE.
      fail: rep('Root cause: src/expiry.js:4 reads the clock once at load and keeps it.', `Evidence:\n${OUT3}`, 'Suggested fix direction: read the clock on every call (not applied).', 'DONE'),
      passTools: [{ name: 'Bash', input: { command: 'node --test tests/expiry.test.js' } }],
    },
    rejects: {
      'ran-the-test': { report: R3_PASS, tools: [{ name: 'Read', input: { file_path: '/w/src/expiry.js' } }] },
      'no-mutating-bash': { report: R3_PASS, tools: [{ name: 'Bash', input: { command: 'git checkout -- src/expiry.js' } }] },
      'no-offer': R3_PASS.replace('\nNEEDS_CONTEXT', '\nDo you want me to keep digging?\nNEEDS_CONTEXT'),
      'says-not-reproduced': rep('Root cause: the clock is read at load.', `Evidence:\n${OUT3.replace('# pass 2', '').replace(/✔/g, 'ok')}`, 'BLOCKED').replace(/pass/g, 'p'),
      'evidence-output': rep('Root cause: none established; it does not reproduce.', 'BLOCKED'),
      // Causa afirmada, sin marca, cerrando con NEEDS_CONTEXT.
      'no-unmarked-cause': rep('Root cause: src/expiry.js:4 caches the clock at load.', `Evidence:\n${OUT3}`, 'It passes here only because the clock is not near midnight.', 'NEEDS_CONTEXT'),
      'final-blocked-or-context': R3_PASS.replace(/NEEDS_CONTEXT$/, 'DONE'),
    },
    files_rejects: {
      'source-intact': { 'src/expiry.js': EXPIRY.replace('<=', '<') },
      'test-intact': { 'tests/expiry.test.js': EXPIRY_TEST.replace('999), false', '999), true') },
    },
  },
];

for (const c of CASES) c.model = 'opus'; // el debugger corre en opus con esfuerzo alto (frontmatter)

const ALLOWED = ['Agent', 'Read', 'Grep', 'Glob', 'Bash'];

// El informe termina en una de las tres palabras (también valida que no cierre ofreciendo seguir).
const returned = () => ({
  name: 'subagent-returned', type: 'regex', target: 'trace',
  pattern: `${R.reportHead('debugger')}${CH}*?${R.lastLine(FINALS)}`,
});

function promptMd(c, caseDir) {
  const plugin = path.relative(caseDir, path.join(REPO, 'plugins', 'pignolo')).split(path.sep).join('/');
  return [
    '---',
    'runs: 5',
    'max_turns: 40',
    'timeout_seconds: 900',
    'model: sonnet',
    `plugins: ["${plugin}"]`,
    `tags: [${[...c.tags, 'opus'].join(', ')}]`,
    `allowed_tools: [${ALLOWED.join(', ')}]`,
    '---',
    '',
    `Dispatch the pignolo:${c.agent} agent (subagent_type pignolo:${c.agent}, model opus) with run_in_background false and exactly the brief between the two lines of dashes. Do not read, run or change anything yourself. When the agent returns, reply with only the word RELAYED.`,
    '',
    '----------',
    c.brief,
    '----------',
    '',
  ].join('\n');
}

function build({ out }) {
  for (const c of CASES) {
    const dir = path.join(out, c.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'graders'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${c.name}\ncontext:\n  scaffold_script: fixture.sh\n`);
    fs.writeFileSync(path.join(dir, 'fixture.sh'), R.fixtureSh(c.files));
    fs.writeFileSync(path.join(dir, 'prompt.md'), promptMd(c, dir));
    const graders = [...R.dispatched(c.agent, 'opus'), R.singleDispatch, returned(), ...c.graders];
    for (const g of graders) fs.writeFileSync(path.join(dir, 'graders', `${g.name}.md`), R.graderMd(g));
  }
  return CASES.map((c) => c.name);
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--out');
  if (i < 0 || !a[i + 1]) {
    process.stderr.write('uso: node tests/evals/debugger-cases.js --out <dir>\n');
    process.exit(2);
  }
  const out = path.resolve(a[i + 1]);
  process.stdout.write(`${JSON.stringify({ out, cases: build({ out }) })}\n`);
}

module.exports = { CASES, build, ALLOWED, returned, RANGE_LINE, PARSE_LINE, OUT3 };
