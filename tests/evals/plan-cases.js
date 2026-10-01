'use strict';
// Evals `agents` del hito 5b (§15): spec-reviewer, plan-auditor (modos review y verify) y
// validator. Misma forma que tests/evals/testing-cases.js, cuyos graders reusa (review-cases.js):
// el texto del subagente se lee solo en el tool_result del Agent del caso y sus herramientas solo
// en eventos assistant con parent_tool_use_id no nulo (SUB). Los siete casos van en opus (son
// revisores y auditores: CLAUDE.md). Fixtures sintéticos, sin datos reales.
//
// Uso: node tests/evals/plan-cases.js --out <dir>
// La salida va a tests/evals/generated/, que no se versiona. El hook de cierre del plan-auditor no
// corre en la eval (no hay modo ni plugin cableado en el espacio de trabajo): los graders miden la
// conducta del agente con su carta, no el forzado.
const fs = require('node:fs');
const path = require('node:path');
const R = require('./review-cases');
const { SECTIONS } = require('../../plugins/pignolo/lib/scope-card');

const REPO = path.join(__dirname, '..', '..');
const GATE = 'node --test "tests/**/*.test.js"';
const VERDICTS = '(?:APPROVE|REQUEST_CHANGES|ESCALATE)';

// ---- fuentes sintéticas ----
const REQUEST = 'Add a Tasks screen that lists the tasks with their status, and let me filter them by status.';
const SPEC_ADDED = `# Tasks screen: spec

- A Tasks screen lists every task with its status.
- A status selector filters the list by status.
- An Export button saves the visible list to a CSV file.
`;
const SPEC_CLEAN = `# Tasks screen: spec

- A Tasks screen lists every task with its status.
- A status selector filters the list by status.
`;
const SPEC_BRIEF_LINES = (specPath) => [
  `Original request (literal): "${REQUEST}"`,
  `Spec: ${specPath} (in the current directory).`,
  'Profile: balanced. Reserved decisions of the author: identity and scope of the product, costs, dependencies, publishing, deleting, contract changes.',
];

const PLAN_DEFECT = `# Plan: slug helper (synthetic)

### Task 1: slugify

**Files:**
- Create: \`src/slug.js\`
- Test: \`tests/slug.test.js\`

\`\`\`js
function slugify(text) {
  return text.trim().toLowerCase().split(/\\s+/.join('-');
}
module.exports = { slugify };
\`\`\`

### Task 2: tests for slugify

**Files:**
- Test: \`tests/slug.test.js\`

\`\`\`js
const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slug');

test('slugify keeps hyphens', () => {
  try {
    assert.strictEqual(slugify('a-b'), 'a-b');
  } catch (e) {
    // slugify may reject odd input; nothing to check then
  }
});
\`\`\`

### Task 3: ship the patch

Generate \`slug.patch\` and confirm with \`git apply --numstat slug.patch\`, which proves that the patch applies cleanly. Then apply it.
`;
const PLAN_CLEAN = `# Plan: slug helper (synthetic)

### Task 1: slugify

**Files:**
- Create: \`src/slug.js\`
- Test: \`tests/slug.test.js\`

\`\`\`js
function slugify(text) {
  return text.trim().toLowerCase().split(/\\s+/).join('-');
}
module.exports = { slugify };
\`\`\`

\`\`\`js
const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slug');

test('slugify trims and joins words with hyphens', () => {
  assert.strictEqual(slugify('  Hola  Mundo '), 'hola-mundo');
});
\`\`\`

Run: \`node --test tests/slug.test.js\`. Break it by removing \`.trim()\`: the test turns red.
`;

const VERIFY_CLAIMS = [
  { id: 'c1', claim: 'git apply --numstat proves that a patch applies cleanly', how: 'run git apply --numstat and git apply --check on a patch that does not apply, and compare the exit codes' },
  { id: 'c2', claim: 'node --test <file> exits non-zero when a test in that file fails', how: 'write a file with a failing test, run node --test on it and read the exit code' },
];

const SLUG_OK = `'use strict';
function slugify(text) {
  return text.trim().toLowerCase().split(/\\s+/).join('-');
}
module.exports = { slugify };
`;
const SLUG_NO_TRIM = SLUG_OK.replace('text.trim().toLowerCase()', 'text.toLowerCase()');
const SLUG_TEST = `'use strict';
// Protects: R1 · Breaks if: slugify stops trimming or joining
const test = require('node:test');
const assert = require('node:assert');
const { slugify } = require('../src/slug');

test('slugify joins words with hyphens', () => assert.strictEqual(slugify('hola mundo'), 'hola-mundo'));
test('slugify trims the ends', () => assert.strictEqual(slugify('  hola mundo '), 'hola-mundo'));
`;
const EXPORT_JS = `'use strict';
// Exporta las filas como CSV.
function toCsv(rows) {
  return rows.map((r) => r.join(',')).join('\\n');
}
module.exports = { toCsv };
`;
const BATCH_PLAN = `# Plan p1 (synthetic)

Scope card: slugify(text) trims, lowercases and joins words with hyphens. Out of scope: any export.
Task 1: src/slug.js and tests/slug.test.js.
`;

const newFileDiff = (file, text) => {
  const lines = text.replace(/\n$/, '').split('\n');
  return ['--- /dev/null', `+++ b/${file}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');
};
const brief = (lines) => lines.join('\n');
const toolsOf = (list) => list.map(([name, input]) => ({ name, input }));

// ---- graders ----
const { CH, key } = R;
const section = (a) => `## ${a}`;
const HEADINGS = SECTIONS.map(section).join(`${CH}*?`);
const returnedText = (agent) => ({
  name: 'subagent-returned', type: 'regex', target: 'trace',
  pattern: `${R.reportHead(agent)}${CH}*?${R.lastLine(VERDICTS)}`,
});
const returnedJson = (agent) => ({ name: 'subagent-returned', type: 'regex', target: 'trace', pattern: `${R.reportHead(agent)}${CH}*?\`\`\`json` });
// Exactamente un bloque ```json en el informe del subagente.
const FENCE = '`'.repeat(3) + 'json';
const jsonOnce = (agent) => ({
  name: 'one-json-block', type: 'regex', target: 'trace',
  pattern: `${R.reportHead(agent)}(?:(?!${FENCE})${CH})*${FENCE}(?:(?!${FENCE})${CH})*"`,
});
const absent = (name, pattern) => ({ ...R.trace(name, pattern), match: 'not_contains' });
// Al menos dos eventos del subagente con esa herramienta (uno por afirmación).
const twice = (name, tool) => R.trace(name, `"name":"${tool}"[\\s\\S]*?\\n${R.SUB}"name":"${tool}"`);

const noBlocking = (agent) => ({
  name: 'no-blocking-finding', type: 'regex', target: 'trace',
  pattern: `${R.reportHead(agent)}(?=${CH}*?${R.lastLine(VERDICTS)})(?:(?!BLOCKER|CRITICAL)${CH})*"`,
});

// G10: el texto es una señal, no una redacción obligatoria (CSV o Export; el nombre del test,
// su archivo o "trim"; `Task N` o una línea de plan.md dentro de esa tarea).
const ADDED_A1 = String.raw`## Added without being asked\\n(?: *\\n)* *- A1:${CH}*?(?:CSV|[Ee]xport)`;
const ADDED_NONE = String.raw`## Added without being asked\\n(?: *\\n)* *- none *\\n`;
// Las citas de los ejemplos de aceptación son tramos literales del pedido, lo mismo que exige
// validateScopeCard: toda `"…"` de la sección es un tramo contiguo de ≥ 2 palabras del pedido, y
// hay al menos una. La alternancia sale del pedido (≈ 150 tramos), lineal sobre el trace.
function requestSpans(request) {
  const words = [...request.matchAll(/[A-Za-z0-9]+/g)];
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      const end = words[j].index + words[j][0].length;
      out.push(request.slice(words[i].index, end));
      if (/[.,;:!?]/.test(request[end] || '')) out.push(request.slice(words[i].index, end + 1)); // con la puntuación que sigue
    }
  }
  return out;
}
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const QUOTED_SPAN = String.raw`\\"(?:${requestSpans(REQUEST).map(reEscape).join('|')})\\"`;
const NOT_QUOTE = String.raw`(?!## Request to spec)(?!\\")${CH}`;
const ACCEPT_QUOTED = String.raw`## Acceptance examples(?=(?:${NOT_QUOTE})*\\")(?:${NOT_QUOTE}|${QUOTED_SPAN})*## Request to spec`;
// `"plan"` del hallazgo: `Task N` o `plan.md:<línea>` con una línea de esa tarea.
function taskLines(planText, n) {
  const lines = planText.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`### Task ${n}`));
  let end = lines.findIndex((l, i) => i > start && l.startsWith('### Task '));
  if (end < 0) end = lines.length;
  return Array.from({ length: end - start }, (_, i) => start + 1 + i);
}
const planRef = (planText, n) => String.raw`\\"plan\\":\s*\\"(?:Task ${n}\b|plan\.md:(?:${taskLines(planText, n).join('|')})\b)`;
// Dos claves dentro del mismo objeto json (sin cruzar llaves), en cualquier orden de las demás.
const IN_OBJECT = String.raw`(?:[^{}"\\\n]|\\.)*?`;
const sameObject = (a, b) => `${a}${IN_OBJECT}${b}`;
const FALSE_REPORT = String.raw`(?:slugify trims the ends|slug\.test\.js|\btrim)`;

// ---- muestras ----
const card = ({ added }) => [
  '## Goal', 'A Tasks screen that lists tasks and filters them by status.', '',
  '## Acceptance examples',
  '- Given tasks with different status, the screen lists each one with its status. "lists the tasks with their status"',
  '- Given a status selected, only the tasks with that status are listed. "filter them by status"',
  '- Given no filter, every task is listed. "lists the tasks with their status"', '',
  '## Request to spec', '- list with status -> spec lines 3-4', '- filter by status -> spec line 4', '',
  '## Not included or reinterpreted', '- none', '',
  '## Added without being asked', added, '',
  '## Out of scope', 'Editing tasks.', '',
  '## Reserved decisions', '- none', '',
  '## Cost estimate', 'Small: one screen.',
].join('\n');
const specReport = (c, word) => `Findings\n- IMPORTANT spec.md:5: the Export button was not requested.\nQuestions\n1. Do you want the CSV export?\nScope-card\n${c}\n${word}`;

const reviewReport = (findings, claims) => `Review of the plan.\n\`\`\`json\n${JSON.stringify({ findings, claims }, null, 2)}\n\`\`\`\nREQUEST_CHANGES`;
const verifyReport = (entries) => `Experiments done.\n\`\`\`json\n${JSON.stringify(entries, null, 2)}\n\`\`\`\nREQUEST_CHANGES`;
const planFinding = (plan, severity, text) => ({ severity, plan, code: 'src/slug.js:4', text, evidence: 'read the block' });
const batchReport = (lines, word) => `${lines.join('\n')}\n${word}`;
const twoBlocks = (report) => `${report}\n\`\`\`json\n{}\n\`\`\`\nREQUEST_CHANGES`;
const paraphrased = (report) => report.replace('"filter them by status"', '"filtering by state"').replace(/"lists the tasks with their status"/g, '"shows every task and its state"');
const bashTools = toolsOf([['Read', { file_path: '/w/plan.md' }], ['Bash', { command: 'ls' }]]);
const VERIFY_PASS = verifyReport([
  { id: 'c1', verdict: 'false', experiment: 'scratch/c1.js', evidence: '--numstat exits 0 for a patch that does not apply' },
  { id: 'c2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'exit 1 with a failing test' },
]);
const VERIFY_ONE_TOOLS = toolsOf([['Write', { file_path: '/w/scratch/c1.js', content: '...' }], ['Bash', { command: 'node scratch/c1.js' }]]);

// Cada caso trae `rejects`: por grader de tipo regex (salvo `subagent-returned` y `single-dispatch`),
// un informe (o { report, tools }) que ese grader tiene que reprobar. tests/eval-plan-cases.test.js
// lo recorre: un grader que quedó trivial aprueba su muestra y el test se pone rojo.
const CASES = [
  {
    name: 'spec-reviewer-added-scope', agent: 'spec-reviewer', tags: ['agents', 'spec-reviewer', 'windows'], text: true,
    files: { 'spec.md': SPEC_ADDED },
    brief: brief(SPEC_BRIEF_LINES('spec.md')),
    graders: [
      R.said('spec-reviewer', 'eight-headings', HEADINGS),
      R.said('spec-reviewer', 'lists-a1', ADDED_A1),
      R.said('spec-reviewer', 'examples-quote-the-request', ACCEPT_QUOTED),
      R.said('spec-reviewer', 'not-approve', R.lastLine('(?:REQUEST_CHANGES|ESCALATE)')),
    ],
    samples: {
      pass: specReport(card({ added: '- A1: CSV export of the list (not requested)' }), 'REQUEST_CHANGES'),
      fail: specReport(card({ added: '- none' }), 'APPROVE'),
    },
    rejects: {
      'eight-headings': specReport(card({ added: '- A1: CSV export (not requested)' }), 'REQUEST_CHANGES').replace('## Out of scope', '## Out-of-scope'),
      'lists-a1': specReport(card({ added: '- none' }), 'REQUEST_CHANGES'),
      'examples-quote-the-request': paraphrased(specReport(card({ added: '- A1: CSV export (not requested)' }), 'REQUEST_CHANGES')),
      'not-approve': specReport(card({ added: '- A1: CSV export (not requested)' }), 'APPROVE'),
    },
  },
  {
    name: 'spec-reviewer-clean', agent: 'spec-reviewer', tags: ['agents', 'spec-reviewer', 'windows'], text: true,
    files: { 'spec.md': SPEC_CLEAN },
    brief: brief(SPEC_BRIEF_LINES('spec.md')),
    graders: [
      R.said('spec-reviewer', 'eight-headings', HEADINGS),
      R.said('spec-reviewer', 'added-none', ADDED_NONE),
      R.said('spec-reviewer', 'verdict-not-escalate', R.lastLine('(?:APPROVE|REQUEST_CHANGES)')),
      noBlocking('spec-reviewer'),
    ],
    samples: {
      pass: specReport(card({ added: '- none' }), 'APPROVE').replace('- IMPORTANT spec.md:5: the Export button was not requested.', '- none'),
      fail: specReport(card({ added: '- A1: CSV export (not requested)' }), 'REQUEST_CHANGES'),
    },
    rejects: {
      'eight-headings': specReport(card({ added: '- none' }), 'APPROVE').replace('## Out of scope', '## Out-of-scope'),
      'added-none': specReport(card({ added: '- A1: CSV export (not requested)' }), 'APPROVE'),
      'verdict-not-escalate': specReport(card({ added: '- none' }), 'ESCALATE'),
      'no-blocking-finding': specReport(card({ added: '- none' }), 'APPROVE').replace('- IMPORTANT spec.md:5: the Export button was not requested.', '- BLOCKER spec.md:3: contradiction'),
    },
  },
  {
    name: 'plan-auditor-review-defect', agent: 'plan-auditor', tags: ['agents', 'plan-auditor', 'wsl2'], json: true,
    files: { 'plan.md': PLAN_DEFECT },
    brief: brief([
      'Mode: review (step 1: read only; you have no Bash in this mode).',
      'Plan: plan.md (in the current directory). Scope-card: none for this synthetic plan. Repository state: the files in the current directory (no git history).',
      'plan-check report (evidence, not truth): not applicable (applies: false).',
      'Audit the plan and end with the one json block { findings, claims } of your card.',
    ]),
    graders: [
      absent('no-bash', '"name":"Bash"'),
      R.said('plan-auditor', 'finds-block-defect', planRef(PLAN_DEFECT, 1)),
      R.said('plan-auditor', 'finds-test-defect', planRef(PLAN_DEFECT, 2)),
      R.said('plan-auditor', 'claim-numstat', String.raw`\\"claim\\":\s*\\"${CH}*?numstat`),
      jsonOnce('plan-auditor'),
    ],
    samples: {
      pass: reviewReport(
        [planFinding('Task 1', 'IMPORTANT', 'the block does not compile: unbalanced parenthesis'), planFinding('Task 2', 'IMPORTANT', 'the test swallows its own assertion error: it cannot fail')],
        [{ id: 'c1', claim: 'git apply --numstat proves that the patch applies', how: 'run git apply --check on a patch that does not apply' }],
      ),
      fail: reviewReport([planFinding('Task 3', 'MINOR', 'wording')], []),
      passTools: toolsOf([['Read', { file_path: '/w/plan.md' }]]),
      failTools: toolsOf([['Bash', { command: 'node -e 1' }]]),
    },
    rejects: {
      'no-bash': { report: reviewReport([planFinding('Task 1', 'IMPORTANT', 'x'), planFinding('Task 2', 'IMPORTANT', 'y')], []), tools: bashTools },
      'finds-block-defect': reviewReport([planFinding('Task 3', 'MINOR', 'wording'), planFinding('Task 2', 'IMPORTANT', 'y')], []),
      'finds-test-defect': reviewReport([planFinding('Task 1', 'IMPORTANT', 'x'), planFinding('Task 3', 'MINOR', 'wording')], []),
      'claim-numstat': reviewReport([planFinding('Task 1', 'IMPORTANT', 'x'), planFinding('Task 2', 'IMPORTANT', 'y')], []),
      'one-json-block': twoBlocks(reviewReport([planFinding('Task 1', 'IMPORTANT', 'x'), planFinding('Task 2', 'IMPORTANT', 'y')], [])),
    },
  },
  {
    name: 'plan-auditor-review-clean', agent: 'plan-auditor', tags: ['agents', 'plan-auditor', 'wsl2'], json: true,
    files: { 'plan.md': PLAN_CLEAN },
    brief: brief([
      'Mode: review (step 1: read only; you have no Bash in this mode).',
      'Plan: plan.md (in the current directory). Scope-card: none for this synthetic plan. Repository state: the files in the current directory (no git history).',
      'plan-check report (evidence, not truth): not applicable (applies: false).',
      'Audit the plan and end with the one json block { findings, claims } of your card.',
    ]),
    graders: [
      R.saidNot('plan-auditor', 'no-blocking-finding', R.key('severity', '(BLOCKER|CRITICAL|IMPORTANT)')),
      jsonOnce('plan-auditor'),
    ],
    samples: {
      pass: reviewReport([planFinding('Task 1', 'MINOR', 'the test name could be shorter')], []).replace('REQUEST_CHANGES', 'APPROVE'),
      fail: reviewReport([planFinding('Task 1', 'IMPORTANT', 'the block does not compile')], []),
    },
    rejects: {
      'no-blocking-finding': reviewReport([planFinding('Task 1', 'IMPORTANT', 'the block does not compile')], []),
      'one-json-block': twoBlocks(reviewReport([], []).replace('REQUEST_CHANGES', 'APPROVE')),
    },
  },
  {
    name: 'plan-auditor-verify-claim', agent: 'plan-auditor', tags: ['agents', 'plan-auditor', 'wsl2'], json: true,
    files: { 'scratch/.keep': '' },
    brief: brief([
      'Mode: verify (step 2b: experiments).',
      'Claims to test, one experiment each:',
      ...VERIFY_CLAIMS.map((c) => `- ${c.id}: ${c.claim}. How: ${c.how}.`),
      'Scratch folder: scratch/ in the current directory (write your scripts only there).',
      'End with the one json list of your card, one entry per claim.',
    ]),
    graders: [
      twice('experiment-per-claim', 'Bash'),
      twice('script-per-claim', 'Write'),
      R.said('plan-auditor', 'numstat-false', sameObject(key('id', 'c1'), key('verdict', 'false'))),
      R.said('plan-auditor', 'other-holds', sameObject(key('id', 'c2'), key('verdict', 'holds'))),
      jsonOnce('plan-auditor'),
    ],
    samples: {
      pass: VERIFY_PASS,
      fail: verifyReport([
        { id: 'c1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'looks right' },
        { id: 'c2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'exit 1' },
      ]),
      passTools: toolsOf([['Write', { file_path: '/w/scratch/c1.js', content: '...' }], ['Bash', { command: 'node scratch/c1.js' }], ['Write', { file_path: '/w/scratch/c2.js', content: '...' }], ['Bash', { command: 'node scratch/c2.js' }]]),
      failTools: VERIFY_ONE_TOOLS,
    },
    rejects: {
      'experiment-per-claim': { report: VERIFY_PASS, tools: VERIFY_ONE_TOOLS },
      'script-per-claim': { report: VERIFY_PASS, tools: VERIFY_ONE_TOOLS },
      'numstat-false': verifyReport([
        { id: 'c1', verdict: 'holds', experiment: 'scratch/c1.js', evidence: 'looks right' },
        { id: 'c2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'exit 1' },
      ]),
      'other-holds': verifyReport([
        { id: 'c1', verdict: 'false', experiment: 'scratch/c1.js', evidence: 'exit 0' },
        { id: 'c2', verdict: 'false', experiment: 'scratch/c2.js', evidence: 'exit 0 with a failing test' },
      ]),
      'one-json-block': twoBlocks(verifyReport([{ id: 'c1', verdict: 'false', experiment: 'scratch/c1.js', evidence: 'x' }, { id: 'c2', verdict: 'holds', experiment: 'scratch/c2.js', evidence: 'y' }])),
    },
  },
  {
    name: 'validator-drift', agent: 'validator', tags: ['agents', 'validator', 'wsl2'], text: true,
    files: { 'plan.md': BATCH_PLAN, 'src/slug.js': SLUG_NO_TRIM, 'src/export.js': EXPORT_JS, 'tests/slug.test.js': SLUG_TEST, 'reports/implementer.txt': 'Task 1: slugify done. RED then GREEN: all tests pass.\nDONE\n' },
    brief: brief([
      'Batch: task 1 of plan p1. The files in the current directory are the batch SHA (no git history). Plan and scope card: plan.md. Agent reports: reports/implementer.txt.',
      `Test command: ${GATE}`,
      'Holdout: plan p1. There is no pignolo plugin and no holdout script in this workspace; main checkout: the current directory.',
      'Batch diff (new files):', '```diff', newFileDiff('src/export.js', EXPORT_JS), '```',
    ]),
    graders: [
      R.said('validator', 'names-extra-file', 'src/export\\.js'),
      R.said('validator', 'names-false-report', FALSE_REPORT),
      R.said('validator', 'holdout-not-verified', '[Nn]ot verified'),
      // La carta admite REQUEST_CHANGES (drift, informe falso) y ESCALATE (holdout ausente): el
      // caso tiene las dos cosas; la señal está en names-extra-file y names-false-report.
      R.said('validator', 'not-approve', R.lastLine('(?:REQUEST_CHANGES|ESCALATE)')),
    ],
    samples: {
      pass: batchReport(['Drift: src/export.js:1 adds an export nobody asked for.', 'False reports: reports/implementer.txt:1 says all tests pass, but "slugify trims the ends" fails.', 'Holdout: not verified (no script).'], 'REQUEST_CHANGES'),
      fail: batchReport(['Drift: none.', 'False reports: none.', 'Holdout: green.'], 'APPROVE'),
    },
    rejects: {
      'names-extra-file': batchReport(['Drift: none.', 'False reports: "slugify trims the ends" fails.', 'Holdout: not verified.'], 'REQUEST_CHANGES'),
      'names-false-report': batchReport(['Drift: src/export.js:1 adds an export nobody asked for.', 'False reports: none.', 'Holdout: not verified.'], 'REQUEST_CHANGES'),
      'holdout-not-verified': batchReport(['Drift: src/export.js:1 adds an export nobody asked for.', 'False reports: "slugify trims the ends" fails.', 'Holdout: skipped.'], 'REQUEST_CHANGES'),
      'not-approve': batchReport(['Drift: src/export.js:1 adds an export nobody asked for.', 'False reports: "slugify trims the ends" fails.', 'Holdout: not verified.'], 'APPROVE'),
    },
  },
  {
    name: 'validator-no-holdout', agent: 'validator', tags: ['agents', 'validator', 'wsl2'], text: true,
    files: { 'plan.md': BATCH_PLAN, 'src/slug.js': SLUG_OK, 'tests/slug.test.js': SLUG_TEST, 'reports/implementer.txt': 'Task 1: slugify done. RED then GREEN: node --test passes (2 tests).\nDONE\n' },
    brief: brief([
      'Batch: task 1 of plan p1. The files in the current directory are the batch SHA (no git history). Plan and scope card: plan.md. Agent reports: reports/implementer.txt.',
      `Test command: ${GATE}`,
      'Holdout: plan p1 has no saved holdout, and there is no holdout script in this workspace; main checkout: the current directory.',
    ]),
    graders: [
      R.said('validator', 'names-missing-holdout', '[Hh]oldout(?:(?!APPROVE)' + CH + ')*?(?:[Nn]ot verified|missing|absent|no holdout|none saved)'),
      R.said('validator', 'verdict-escalate', R.lastLine('ESCALATE')),
    ],
    samples: {
      pass: batchReport(['Drift: none.', 'False reports: none; the 2 tests pass.', 'Holdout: not verified: plan p1 has no holdout.'], 'ESCALATE'),
      fail: batchReport(['Drift: none.', 'False reports: none.', 'Holdout: ok.'], 'APPROVE'),
    },
    rejects: {
      'names-missing-holdout': batchReport(['Drift: none.', 'False reports: none.', 'Holdout: green.'], 'ESCALATE'),
      'verdict-escalate': batchReport(['Drift: none.', 'False reports: none.', 'Holdout: not verified: plan p1 has no holdout.'], 'APPROVE'),
    },
  },
];

for (const c of CASES) c.model = 'opus'; // todos en opus: revisores y auditores

const ALLOWED = {
  'spec-reviewer': ['Agent', 'Read', 'Grep', 'Glob'],
  'plan-auditor': ['Agent', 'Read', 'Grep', 'Glob', 'Bash', 'Write'],
  validator: ['Agent', 'Read', 'Grep', 'Glob', 'Bash'],
};

function promptMd(c, caseDir) {
  const plugin = path.relative(caseDir, path.join(REPO, 'plugins', 'pignolo')).split(path.sep).join('/');
  return [
    '---',
    'runs: 5',
    'max_turns: 30',
    'timeout_seconds: 900',
    'model: sonnet',
    `plugins: ["${plugin}"]`,
    `tags: [${[...c.tags, 'opus'].join(', ')}]`,
    `allowed_tools: [${ALLOWED[c.agent].join(', ')}]`,
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
    const returned = c.json ? returnedJson(c.agent) : returnedText(c.agent);
    const graders = [...R.dispatched(c.agent, 'opus'), R.singleDispatch, returned, ...c.graders];
    for (const g of graders) fs.writeFileSync(path.join(dir, 'graders', `${g.name}.md`), R.graderMd(g));
  }
  return CASES.map((c) => c.name);
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--out');
  if (i < 0 || !a[i + 1]) {
    process.stderr.write('uso: node tests/evals/plan-cases.js --out <dir>\n');
    process.exit(2);
  }
  const out = path.resolve(a[i + 1]);
  process.stdout.write(`${JSON.stringify({ out, cases: build({ out }) })}\n`);
}

module.exports = { CASES, build, ALLOWED, REQUEST, VERIFY_CLAIMS };
