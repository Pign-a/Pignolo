'use strict';
// Evals `agents` del hito 3b (§15): lentes, refuter, jueces y fixer. Una sola tabla genera
// los casos de `claude plugin eval` (prompt.md, case.yaml, fixture.sh, graders/*.md).
// Los graders miran lo que hizo el SUBAGENTE, no la sesión principal: una línea del
// trace (un evento stream-json) cuenta solo si es de tipo assistant y trae un
// parent_tool_use_id no nulo. La sesión principal solo despacha y contesta RELAYED.
//
// Uso: node tests/evals/review-cases.js --out <dir> [--reviewer-model opus|sonnet]
// (la salida va a tests/evals/generated/, que no se versiona).
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..');
const FAKE_SHA = '1111111111111111111111111111111111111111';

// ---- fuentes sintéticas (sin datos reales) ----
const PAGES = `'use strict';
// Devuelve la página \`page\` (desde 1) de \`items\`, de a \`size\` elementos.
function pageOf(items, page, size) {
  if (!Array.isArray(items)) throw new TypeError('items debe ser una lista');
  if (!(page >= 1) || !(size >= 1)) throw new RangeError('page y size empiezan en 1');
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

module.exports = { pageOf };
`;
const PAGES_BUG = PAGES.replace('start + size);', 'start + size - 1);');
const PAGES_CLEAN = PAGES.replace('  const start = (page - 1) * size;\n', '  const start = (page - 1) * size; // índice del primer elemento\n');

const STORE = `'use strict';
const fs = require('node:fs');

// Guarda \`rows\` como JSON en \`file\`. Devuelve true solo si quedó escrito.
function saveRows(file, rows) {
  const tmp = \`\${file}.tmp\`;
  fs.writeFileSync(tmp, JSON.stringify(rows));
  fs.renameSync(tmp, file);
  return true;
}

module.exports = { saveRows };
`;
const STORE_BUG = STORE.replace(`  fs.writeFileSync(tmp, JSON.stringify(rows));
  fs.renameSync(tmp, file);
  return true;`, `  try {
    fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file);
  } catch (e) {
    return true;
  }
  return true;`);
const STORE_CLEAN = STORE.replace(`  fs.writeFileSync(tmp, JSON.stringify(rows));
  fs.renameSync(tmp, file);`, `  try {
    fs.writeFileSync(tmp, JSON.stringify(rows));
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }`);

const REPORT = `'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'reports');

// Lee el informe \`name\` de reports/ (solo nombres simples).
function readReport(name) {
  if (!/^[a-z0-9-]+\\.txt$/.test(name)) throw new Error('nombre inválido');
  return fs.readFileSync(path.join(DIR, name), 'utf8');
}

module.exports = { readReport };
`;
const REPORT_BUG = REPORT.replace("  if (!/^[a-z0-9-]+\\.txt$/.test(name)) throw new Error('nombre inválido');\n", '');
const REPORT_CLEAN = REPORT.replace("throw new Error('nombre inválido')", "throw new Error(`nombre de informe inválido: ${name}`)");

const TOKEN = `'use strict';
// true si el token ya venció.
function isExpired(token, now = Date.now()) {
  return token.expiresAt <= now;
}

module.exports = { isExpired };
`;
const TOKEN_BUG = TOKEN.replace('// true si el token ya venció.', '// true si el token sigue vigente.');
const TOKEN_CLEAN = TOKEN.replace('// true si el token ya venció.', '// true si el token ya venció (expiresAt en ms desde epoch).');

const PAGES_TEST = `'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pageOf } = require('../src/pages');

// Protects: R1 · Breaks if: pageOf drops the last item of a page
test('pageOf returns size items per full page', () => {
  assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 1, 2), [1, 2]);
  assert.deepStrictEqual(pageOf([1, 2, 3, 4, 5], 3, 2), [5]);
});
`;

// Diff unificado mínimo (una sola zona de cambio) entre dos versiones, para el brief.
function diff(file, a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  let s = 0;
  while (s < x.length && x[s] === y[s]) s += 1;
  let e = 0;
  while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e += 1;
  const from = Math.max(0, s - 2);
  const oldEnd = x.length - e;
  const newEnd = y.length - e;
  const ctxEnd = Math.min(x.length, oldEnd + 2);
  const lines = [
    `--- a/${file}`, `+++ b/${file}`,
    `@@ -${from + 1},${ctxEnd - from} +${from + 1},${ctxEnd - from + (newEnd - oldEnd)} @@`,
    ...x.slice(from, s).map((l) => ` ${l}`),
    ...x.slice(s, oldEnd).map((l) => `-${l}`),
    ...y.slice(s, newEnd).map((l) => `+${l}`),
    ...x.slice(oldEnd, ctxEnd).map((l) => ` ${l}`),
  ];
  return lines.join('\n');
}

// ---- graders ----
// Línea de trace de un subagente (evento assistant con parent_tool_use_id no nulo).
const SUB = '^(?=[^\\n]*"type":"assistant")(?=[^\\n]*"parent_tool_use_id":"[^"]+")[^\\n]*';
// Separadores entre dos claves JSON dentro del texto del subagente (serializado: \" y \n).
const SEP = '(?:,|\\s|\\\\[rn])*';
const key = (k, v) => `\\\\"${k}\\\\":\\s*\\\\"${v}\\\\"`;
const trace = (name, pattern, match = 'contains') => ({ name, type: 'regex', target: 'trace', flags: 'm', pattern: SUB + pattern, match });
// Ubicación aceptada: `archivo:N` con N en `lines` (ventana de ±3 líneas) o un rango `archivo:A-B`
// que contiene la línea plantada `at` (B acotado a at + 30 para no aceptar un archivo entero).
const rangesAround = (at) => {
  const out = [];
  for (let a = 1; a <= at; a += 1) for (let b = Math.max(at, a + 1); b <= at + 30; b += 1) out.push(`${a}-${b}`);
  return out.join('|');
};
const finding = (file, lines, sev, at) => `${key('location', `${file.replace(/\./g, '\\.')}:(${lines}|${rangesAround(at)})`)}${SEP}${key('severity', `(${sev})`)}`;
const verdict = (word) => trace(`verdict-${word.toLowerCase()}`, `\\\\n${word}(\\\\n)*"`);
const dispatched = (agent, model) => [
  { name: 'dispatched', type: 'tool_used', tool: 'Agent', input_match: `"subagent_type":"pignolo:${agent}"` },
  ...(model ? [{ name: 'model', type: 'tool_used', tool: 'Agent', input_match: `"model":"${model}"` }] : []),
];

// ---- muestras para el test determinista de los graders (tests/eval-cases.test.js) ----
const report = (findings, word) => `Review of ${FAKE_SHA}.\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\`\n${word}`;
const f = (lens, location, severity) => ({ id: '1', lens, location, severity, evidence: 'observed in the file', ...(/BLOCKER|CRITICAL/.test(severity) ? { repro: 'call it and compare' } : {}) });

const LENS_CASES = [
  { lens: 'reliability', file: 'src/pages.js', base: PAGES, bug: PAGES_BUG, clean: PAGES_CLEAN, lines: '[4-9]|10', sample: 7, sev: 'BLOCKER|CRITICAL', goal: 'pageOf returns page `page` (1-based) of `items`, `size` items per page.' },
  { lens: 'resilience', file: 'src/store.js', base: STORE, bug: STORE_BUG, clean: STORE_CLEAN, lines: '[8-9]|1[0-5]', sample: 11, sev: 'BLOCKER|CRITICAL', goal: 'saveRows writes rows atomically and returns true only when they were written.' },
  { lens: 'risk', file: 'src/report.js', base: REPORT, bug: REPORT_BUG, clean: REPORT_CLEAN, lines: '[6-9]|1[0-2]', sample: 9, sev: 'BLOCKER|CRITICAL', goal: 'readReport returns a report from reports/ by simple name; names come from HTTP requests.' },
  { lens: 'readability', file: 'src/token.js', base: TOKEN, bug: TOKEN_BUG, clean: TOKEN_CLEAN, lines: '[1-5]', sample: 2, sev: 'BLOCKER|CRITICAL|WARNING', goal: 'isExpired tells whether a token has expired.' },
];

const reviewBrief = (goal, file, a, b) => [
  `Frozen SHA: ${FAKE_SHA} (the files in the current directory are that SHA).`,
  'Risk level: high.',
  `Task-card goal: ${goal}`,
  'Diff (base..SHA):',
  '```diff', diff(file, a, b), '```',
].join('\n');

function lensCases() {
  const out = [];
  for (const c of LENS_CASES) {
    const agent = `review-${c.lens}`;
    out.push({
      name: `${agent}-defect`, agent, tags: ['agents', 'review', 'defect'], reviewer: true,
      files: { [c.file]: c.bug }, brief: reviewBrief(c.goal, c.file, c.base, c.bug),
      graders: [trace('finds-planted-defect', finding(c.file, c.lines, c.sev, c.sample))],
      samples: {
        pass: report([f(c.lens, `${c.file}:${c.sample}`, c.lens === 'readability' ? 'WARNING' : 'CRITICAL')], 'REQUEST_CHANGES'),
        fail: report([f(c.lens, `src/other.js:7`, 'CRITICAL')], 'REQUEST_CHANGES'),
      },
    });
    out.push({
      name: `${agent}-clean`, agent, tags: ['agents', 'review', 'clean'], reviewer: true,
      files: { [c.file]: c.clean }, brief: reviewBrief(c.goal, c.file, c.base, c.clean),
      graders: [verdict('APPROVE'), trace('no-blocking-finding', `${SEP}${key('severity', '(BLOCKER|CRITICAL)')}`, 'not_contains')],
      samples: {
        pass: report([f(c.lens, `${c.file}:3`, 'SUGGESTION')], 'APPROVE'),
        fail: report([f(c.lens, `${c.file}:3`, 'CRITICAL')], 'REQUEST_CHANGES'),
      },
    });
  }
  return out;
}

function judgeCases() {
  const out = [];
  for (const j of ['judge-a', 'judge-b']) {
    out.push({
      name: `${j}-defect`, agent: j, tags: ['agents', 'judges', 'defect'], reviewer: true,
      files: { 'src/pages.js': PAGES_BUG }, brief: reviewBrief(LENS_CASES[0].goal, 'src/pages.js', PAGES, PAGES_BUG),
      graders: [trace('finds-planted-defect', finding('src/pages.js', '[4-9]|10', 'BLOCKER|CRITICAL', LENS_CASES[0].sample)), verdict('REQUEST_CHANGES')],
      samples: { pass: report([f(j, 'src/pages.js:7', 'BLOCKER')], 'REQUEST_CHANGES'), fail: report([], 'APPROVE') },
    });
    out.push({
      name: `${j}-clean`, agent: j, tags: ['agents', 'judges', 'clean'], reviewer: true,
      files: { 'src/pages.js': PAGES_CLEAN }, brief: reviewBrief(LENS_CASES[0].goal, 'src/pages.js', PAGES, PAGES_CLEAN),
      graders: [verdict('APPROVE'), trace('no-blocking-finding', `${SEP}${key('severity', '(BLOCKER|CRITICAL)')}`, 'not_contains')],
      samples: { pass: report([], 'APPROVE'), fail: report([f(j, 'src/pages.js:7', 'CRITICAL')], 'REQUEST_CHANGES') },
    });
  }
  return out;
}

const claim = (id, v) => `${key('claim', id)}${SEP}${key('verdict', v)}`;
// El refuter también tiene Bash (lib/roles.js): su caso corre desde WSL2, junto al del fixer.
const refuterCase = {
  name: 'refuter-false-finding', agent: 'refuter', tags: ['agents', 'refuter', 'wsl2'], reviewer: true,
  allowedTools: ['Agent', 'Read', 'Grep', 'Glob', 'Bash'],
  files: { 'src/pages.js': PAGES, 'src/token.js': TOKEN },
  brief: [
    `SHA: ${FAKE_SHA} (the files in the current directory are that SHA; there is no git history).`,
    'Claims:',
    'C1. src/pages.js:6 — pageOf(items, 0, 2) computes a negative start and returns the wrong items. Repro-spec: call pageOf([1,2,3], 0, 2) and observe a non-empty result.',
    'C2. src/token.js:4 — isExpired returns true when expiresAt equals now. Repro-spec: isExpired({ expiresAt: 5 }, 5) returns true.',
  ].join('\n'),
  graders: [trace('refutes-false-claim', claim('C1', 'REFUTED')), trace('keeps-true-claim', claim('C2', 'REFUTED'), 'not_contains')],
  samples: {
    pass: `\`\`\`json\n${JSON.stringify([{ claim: 'C1', verdict: 'REFUTED', reason: 'line 5 throws' }, { claim: 'C2', verdict: 'CONFIRMED', reason: '<=' }], null, 2)}\n\`\`\``,
    fail: `\`\`\`json\n${JSON.stringify([{ claim: 'C1', verdict: 'CONFIRMED', reason: 'x' }, { claim: 'C2', verdict: 'REFUTED', reason: 'y' }], null, 2)}\n\`\`\``,
  },
};

// El fixer tiene Bash: su caso requiere WSL2 (§15); en Windows nativo el runner lo rechaza.
const fixerCase = {
  name: 'fixer-confirmed-finding', agent: 'fixer', tags: ['agents', 'fixer', 'wsl2'], reviewer: false,
  files: { 'src/pages.js': PAGES_BUG, 'tests/pages.test.js': PAGES_TEST },
  brief: [
    'Task-card: fix the confirmed finding below. Files you may touch: src/pages.js. Gate: node --test tests/',
    'Ledger entry reliability-1 (confirmed): location src/pages.js:7, severity CRITICAL, evidence: slice end drops the last item of each full page.',
    'Confirming test (red against the frozen SHA): tests/pages.test.js.',
  ].join('\n'),
  allowedTools: ['Agent', 'Read', 'Edit', 'Write', 'Bash'],
  graders: [
    { name: 'fixed', type: 'regex', target: { source: 'file', path: 'src/pages.js' }, pattern: 'slice\\(start, start \\+ size\\)' },
    { name: 'test-untouched', type: 'regex', target: { source: 'file', path: 'tests/pages.test.js' }, pattern: 'pageOf\\(\\[1, 2, 3, 4, 5\\], 3, 2\\), \\[5\\]' },
    trace('subagent-edited-source', '"name":"(Edit|Write)"[^\\n]*src/pages\\.js'),
    trace('subagent-ran-tests', '"name":"Bash"[^\\n]*node --test'),
    trace('done', '\\\\nDONE(\\\\n)*"'),
  ],
  samples: { pass: 'RED: ... GREEN: ...\nDONE', fail: 'I could not run it.\nBLOCKED' },
};

const CASES = [...lensCases(), ...judgeCases(), refuterCase, fixerCase];

// ---- escritura ----
function yamlValue(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (/^[A-Za-z0-9_.:/-]+$/.test(v) && !/^(true|false)$/.test(v)) return v;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function graderMd(g) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(g)) {
    if (k === 'name') continue;
    if (v && typeof v === 'object') {
      lines.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${yamlValue(v2)}`);
    } else lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function fixtureSh(files) {
  const out = ['#!/usr/bin/env bash', '# Synthetic fixture generated by tests/evals/review-cases.js (no real data).', 'set -e'];
  for (const [p, content] of Object.entries(files)) {
    if (content.includes('PIGNOLO_EOF')) throw new Error(`delimitador dentro de ${p}`);
    out.push(`mkdir -p ${path.posix.dirname(p)}`, `cat > ${p} <<'PIGNOLO_EOF'`, content.replace(/\n$/, ''), 'PIGNOLO_EOF');
  }
  return `${out.join('\n')}\n`;
}

function promptMd(c, caseDir, reviewerModel) {
  const plugin = path.relative(caseDir, path.join(REPO, 'plugins', 'pignolo')).split(path.sep).join('/');
  const model = c.reviewer ? reviewerModel : null;
  const tools = c.allowedTools || ['Agent', 'Read', 'Grep', 'Glob'];
  const how = model ? `subagent_type pignolo:${c.agent}, model ${model}` : `subagent_type pignolo:${c.agent}`;
  return [
    '---',
    `runs: 5`,
    `max_turns: ${c.reviewer ? 20 : 40}`,
    `timeout_seconds: ${c.reviewer ? 600 : 900}`,
    'model: sonnet',
    `plugins: ["${plugin}"]`,
    `tags: [${[...c.tags, model || 'frontmatter'].join(', ')}]`,
    `allowed_tools: [${tools.join(', ')}]`,
    '---',
    '',
    `Dispatch the pignolo:${c.agent} agent (${how}) with exactly the brief between the two lines of dashes. Do not read, run or change anything yourself. When the agent returns, reply with only the word RELAYED.`,
    '',
    '----------',
    c.brief,
    '----------',
    '',
  ].join('\n');
}

function build({ out, reviewerModel = 'opus' }) {
  if (!['opus', 'sonnet'].includes(reviewerModel)) throw new Error('--reviewer-model debe ser opus o sonnet');
  for (const c of CASES) {
    const dir = path.join(out, c.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'graders'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${c.name}\ncontext:\n  scaffold_script: fixture.sh\n`);
    fs.writeFileSync(path.join(dir, 'fixture.sh'), fixtureSh(c.files));
    fs.writeFileSync(path.join(dir, 'prompt.md'), promptMd(c, dir, reviewerModel));
    const graders = [...dispatched(c.agent, c.reviewer ? reviewerModel : null), ...c.graders];
    for (const g of graders) fs.writeFileSync(path.join(dir, 'graders', `${g.name}.md`), graderMd(g));
  }
  return CASES.map((c) => c.name);
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const out = get('--out');
  if (!out) {
    process.stderr.write('uso: node tests/evals/review-cases.js --out <dir> [--reviewer-model opus|sonnet]\n');
    process.exit(2);
  }
  const names = build({ out: path.resolve(out), reviewerModel: get('--reviewer-model') || 'opus' });
  process.stdout.write(`${JSON.stringify({ out: path.resolve(out), cases: names })}\n`);
}

module.exports = { CASES, build, SUB };
