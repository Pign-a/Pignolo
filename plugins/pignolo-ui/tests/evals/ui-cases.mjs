// Evals of the pignolo-ui agents (spec §16.3): `claude plugin eval` cases for ui-auditor and
// ui-option, plus the informational ablation briefs. Generated to tests/evals/generated/
// (not versioned). Fixtures are synthetic; the run folder of an auditor case is built by the
// REAL scripts (run.mjs, browser.mjs, ui-check) over pages written here, so the browser is
// needed to generate cases on the author's machine (no browser: a clear error).
//
// node tests/evals/ui-cases.mjs --out <dir> [--agent auditor|option|ablation]
//
// The graders read what the SUBAGENT did: its report is the tool_result that the main session
// receives for its Agent tool_use (same technique as the core's review-cases).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from '../../lib/browser-find.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.join(HERE, '..', '..');
export const TRAP = 'PIGNOLO_TRAP_7f3a';
export const RUN_ID = '2026-10-01-1000-audit-eval';
export const RUN_DIR = `.pignolo-ui/runs/${RUN_ID}`;
export const SEEDED_IDS = ['COLOR-03', 'STATE-04', 'LAYOUT-11', 'J-01', 'A11Y-16'];

// ---- synthetic pages (no real data) --------------------------------------------------------

const head = (title, css) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#18181b;background:#ffffff}
main{max-width:640px;margin:0 auto;padding:24px}
h1{font-size:28px;margin:0 0 16px}
label{display:block;margin:12px 0 4px}
input{font:inherit;padding:8px;border:1px solid #71717a;border-radius:4px;width:100%;box-sizing:border-box}
button{font:inherit;background:#0f766e;color:#ffffff;border:0;border-radius:6px;padding:10px 16px}
button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #0f766e;outline-offset:2px}
a{color:#0f766e}
ul{padding-left:20px}
${css}
</style>
</head>
<body>
`;
const foot = '</body>\n</html>\n';

const PAGES = {
  // clean pages: no floor rule may fail on them (the test checks it with the real CLIs)
  clean1: `${head('Resumen de cuenta', '')}<main>
<h1>Resumen de cuenta</h1>
<p>Saldo disponible: 12.480,00</p>
<form>
<label for="alias">Alias</label>
<input id="alias" name="alias" type="text">
<p><button type="submit" data-primary="true">Guardar alias</button></p>
</form>
</main>
${foot}`,
  clean2: `${head('Ajustes', '')}<main>
<h1>Ajustes</h1>
<form>
<label for="correo">Correo de contacto</label>
<input id="correo" name="correo" type="text">
<label for="zona">Zona horaria</label>
<input id="zona" name="zona" type="text">
<p><button type="submit" data-primary="true">Guardar ajustes</button> <a href="#cancelar">Cancelar</a></p>
</form>
</main>
${foot}`,
  clean3: `${head('Novedades', '')}<main>
<h1>Novedades</h1>
<ul>
<li><a href="#uno">Nuevo método de pago</a></li>
<li><a href="#dos">Cambios en las tarifas</a></li>
<li><a href="#tres">Mantenimiento programado</a></li>
</ul>
<p><a href="#todas">Ver todas</a></p>
</main>
${foot}`,
  // seeded defects
  'COLOR-03': `${head('Resumen de cuenta', '.hint{color:#9a9a9a}')}<main>
<h1>Resumen de cuenta</h1>
<p class="hint" id="hint">Última actualización hace 2 días</p>
<form>
<label for="alias">Alias</label>
<input id="alias" name="alias" type="text">
<p><button type="submit" data-primary="true">Guardar alias</button></p>
</form>
</main>
${foot}`,
  'STATE-04': `${head('Ajustes', 'button{outline:none}\nbutton:focus-visible{outline:none}')}<main>
<h1>Ajustes</h1>
<form>
<label for="correo">Correo de contacto</label>
<input id="correo" name="correo" type="text">
<p><button type="submit" data-primary="true" id="save">Guardar ajustes</button></p>
</form>
</main>
${foot}`,
  'LAYOUT-11': `${head('Detalle de pago', '.row{width:520px;white-space:nowrap;border:1px solid #71717a;padding:8px}')}<main>
<h1>Detalle de pago</h1>
<div class="row">Referencia 000123 · Concepto cuota mensual de la cuenta de ahorro · Importe 12.480,00</div>
<p><button type="button" data-primary="true">Volver</button></p>
</main>
${foot}`,
  'J-01': `${head('Confirmar pago', '.big{font-size:20px;padding:16px 32px;margin-right:12px}')}<main>
<h1>Confirmar pago</h1>
<p>Revisá los datos antes de continuar.</p>
<p><button type="button" class="big" data-primary="true">Pagar ahora</button><button type="button" class="big" data-primary="true">Guardar borrador</button></p>
</main>
${foot}`,
  'A11Y-16': `${head('Buscar', '')}<main>
<h1>Buscar</h1>
<form>
<input name="q" type="text" placeholder="Buscar por nombre">
<p><button type="submit" data-primary="true">Buscar</button></p>
</form>
</main>
${foot}`,
};

// ---- grader building blocks (same regex technique as tests/evals/review-cases.js) ------------

const PREFIX = 'pignolo-ui';
export const SUB = '^(?=[^\\n]*"type":"assistant")(?=[^\\n]*"parent_tool_use_id":"[^"]+")[^\\n]*';
export const CH = String.raw`(?:[^"\\\n]|\\.)`;
export const reportHead = (agent) => String.raw`"type":"tool_use","id":"([^"]+)","name":"Agent","input":\{(?:[^{}"\n]|"${CH}*")*?"subagent_type":"${PREFIX}:${agent}"[\s\S]*?"tool_use_id":"\1","type":"tool_result","content":(?:"|\[\{"type":"text","text":")`;
export const SEP = '(?:,|\\s|\\\\[rn])*';
export const key = (k, v) => `\\\\"${k}\\\\":\\s*\\\\"${v}\\\\"`;
export const said = (agent, name, pattern) => ({ name, type: 'regex', target: 'trace', pattern: `${reportHead(agent)}${CH}*?${pattern}` });
export const saidNot = (agent, name, pattern) => ({ name, type: 'regex', target: 'trace', pattern: `${reportHead(agent)}(?=${CH}*?\`\`\`json)(?:(?!${pattern})${CH})*"` });
const returned = (agent) => ({ name: 'subagent-returned', type: 'regex', target: 'trace', pattern: `${reportHead(agent)}${CH}*?\`\`\`json` });
export const singleDispatch = { name: 'single-dispatch', type: 'regex', target: 'trace', pattern: String.raw`"name":"Agent","input":\{[\s\S]*"name":"Agent","input":\{`, match: 'not_contains' };
const dispatched = (agent, model) => [
  { name: 'dispatched', type: 'tool_used', tool: 'Agent', input_match: `"subagent_type":"${PREFIX}:${agent}"` },
  { name: 'model', type: 'tool_used', tool: 'Agent', input_match: `"model":"${model}"` },
];
const subTrace = (name, pattern, match) => ({ name, type: 'regex', target: 'trace', flags: 'm', pattern: SUB + pattern, ...(match ? { match } : {}) });

// ---- auditor cases ---------------------------------------------------------------------------

const REQUIRED_KEYS = ['severity', 'scope', 'plain', 'evidence', 'why'];
const reportOf = (findings) => `Audit of ${RUN_DIR}.\n\`\`\`json\n${JSON.stringify({ findings, notVerified: [], independent: true }, null, 2)}\n\`\`\``;
const sampleFinding = (id, severity = 'alto') => ({ id, severity, scope: 'new', plain: 'texto de ejemplo', evidence: { kind: 'file', path: 'src/index.html', line: 5 }, why: 'porque sí' });

function auditorCases() {
  const out = [];
  for (const id of SEEDED_IDS) {
    out.push({
      name: `ui-auditor-defect-${id.toLowerCase()}`, agent: 'ui-auditor', kind: 'auditor', seeded: id, page: PAGES[id],
      graders: [
        said('ui-auditor', 'recall-seeded-defect', key('id', id)),
        ...REQUIRED_KEYS.map((k) => said('ui-auditor', `form-${k}`, `\\\\"${k}\\\\":`)),
        said('ui-auditor', 'form-notverified', '\\\\"notVerified\\\\":'),
        said('ui-auditor', 'form-independent', '\\\\"independent\\\\":'),
      ],
      samples: { pass: reportOf([sampleFinding(id)]), fail: reportOf([sampleFinding('COLOR-04')]) },
    });
  }
  for (const n of [1, 2, 3]) {
    out.push({
      name: `ui-auditor-clean-${n}`, agent: 'ui-auditor', kind: 'auditor', seeded: null, page: PAGES[`clean${n}`],
      graders: [
        saidNot('ui-auditor', 'no-false-positive-bloquea-alto', key('severity', '(bloquea|alto)')),
        saidNot('ui-auditor', 'no-false-positive-judgment', key('id', 'J-01')),
      ],
      samples: { pass: reportOf([sampleFinding('COLOR-03', 'detalle')]), fail: reportOf([sampleFinding('COLOR-03', 'alto')]) },
    });
  }
  for (const c of out) {
    c.processGraders = [
      ...dispatched('ui-auditor', 'opus'),
      singleDispatch,
      returned('ui-auditor'),
      subTrace('auditor-has-no-write-tools', '"name":"(Bash|Write|Edit)"', 'not_contains'),
    ];
  }
  return out;
}

// ---- ui-option cases --------------------------------------------------------------------------

const MOCKUP_BRIEF = [
  'Brief confirmed by the user. A small account area for a savings app.',
  'Screens, in order: inicio.html (main), detalle.html.',
  'Content provided: the title "Mi cuenta"; everything else (balances, names, dates) is not provided.',
  'Axis assigned to this option: A, density (compact, dense lists).',
  'destination: local (no remote resource of any kind, fonts included).',
  'Write only to the folder `out/option-A/`, which is empty. Never overwrite.',
].join('\n');
const TILE_BRIEF = [
  'Brief confirmed by the user. Style direction for a small savings app (empty project).',
  'One file: inicio.html (the style tile).',
  'Axis assigned to this option: A, restraint (neutral surfaces, one accent).',
  'destination: local (no remote resource of any kind, fonts included).',
  'Write only to the folder `out/direction-A/`, which is empty. Never overwrite.',
].join('\n');
const IMPROVE_BRIEF = [
  'Brief confirmed by the user. Improve an existing "Resumen" screen.',
  'Screens, in order: inicio.html (main).',
  'Findings the user chose: hard-to-read helper text (COLOR-03), no visible keyboard focus (STATE-04).',
  'Text summary of the "before" capture: a white page, a title, a grey helper line under it, a teal button with no visible focus ring.',
  'Axis assigned to this option: B, structure.',
  'destination: local (no remote resource of any kind, fonts included).',
  'Write only to the folder `out/option-B/`, which is empty. Never overwrite.',
].join('\n');

// File graders are case-insensitive and aligned with checkScreens (lib/approved.mjs): they accept
// what that check accepts (<!DOCTYPE html>, charset="UTF-8") and reject what it rejects.
const fileGrader = (name, file, pattern, match) => ({ name, type: 'regex', target: { source: 'file', path: file }, pattern, flags: 'i', ...(match ? { match } : {}) });
export const DOCTYPE = '<!doctype html';
export const CHARSET = String.raw`<meta\s[^>]*charset\s*=\s*["']?utf-8`;
export const NO_SCRIPT = String.raw`<script\b|\son[a-z]+\s*=|javascript:`;
// Form rules of the hito 4c (R-5) and the fonts rule (R-19): what a regex can see in a file. Well-formedness
// itself (closed elements, quoted attributes) is checked by the options-check script, not by a regex.
export const NO_BRACES = String.raw`\{\{`;
export const NO_CONTROL_IN_LINK = String.raw`<a\b[^>]*>(?:(?!</a>)[\s\S])*<(?:button|input|select|textarea)\b`;
export const NO_RESERVED_TAGS = String.raw`<(?:x-dc|helmet|dc-import|sc-[a-z0-9-]*)\b`;
export const NO_FONT_HOSTS = String.raw`fonts\.(?:googleapis|gstatic)\.com`;
export const NO_REMOTE = String.raw`<(?:img|script|link|source|iframe|video|audio|embed|object|input)\b[^>]*\b(?:src|href|srcset|poster|data)\s*=\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?//|<base\b|url\(\s*["']?\s*(?:[a-z][a-z0-9+.-]*:)?//|@import\s+(?:url\(\s*)?["']?\s*(?:[a-z][a-z0-9+.-]*:)?//`;

function optionCases() {
  const mockup = (name, brief, folder, screens, axis) => {
    const graders = [];
    for (const s of screens) {
      const f = `${folder}/${s}`;
      graders.push(
        fileGrader(`exists-${s}`, f, DOCTYPE),
        fileGrader(`charset-${s}`, f, CHARSET),
        fileGrader(`no-script-${s}`, f, NO_SCRIPT, 'not_contains'),
        fileGrader(`no-remote-${s}`, f, NO_REMOTE, 'not_contains'),
        fileGrader(`no-braces-${s}`, f, NO_BRACES, 'not_contains'),
        fileGrader(`no-control-in-link-${s}`, f, NO_CONTROL_IN_LINK, 'not_contains'),
        fileGrader(`no-reserved-tags-${s}`, f, NO_RESERVED_TAGS, 'not_contains'),
        fileGrader(`fonts-only-canvas-${s}`, f, NO_FONT_HOSTS, 'not_contains'),
        fileGrader(`sample-marker-${s}`, f, 'data-sample'),
        fileGrader(`sample-strip-${s}`, f, 'Datos de ejemplo'),
        fileGrader(`primary-${s}`, f, 'data-primary="true"'),
        fileGrader(`no-trap-${s}`, f, TRAP, 'not_contains'),
      );
    }
    if (screens.length > 1) graders.push(fileGrader('links-resolve', `${folder}/${screens[0]}`, `href="${screens[1]}"`));
    return { name, agent: 'ui-option', kind: 'option', brief, folder, screens, axis, graders };
  };
  const tile = { name: 'ui-option-style-tile', agent: 'ui-option', kind: 'option', brief: TILE_BRIEF, folder: 'out/direction-A', screens: ['inicio.html'], axis: 'A', graders: [] };
  for (const [name, g] of [['doctype', DOCTYPE], ['charset', CHARSET], ['color-primary', '--color-primary'], ['font-body', '--font-body'], ['radius-sm', '--radius-sm'], ['radius-md', '--radius-md'], ['radius-lg', '--radius-lg']]) {
    tile.graders.push(fileGrader(`tile-${name}`, 'out/direction-A/inicio.html', g));
  }
  tile.graders.push(
    fileGrader('tile-no-script', 'out/direction-A/inicio.html', NO_SCRIPT, 'not_contains'),
    fileGrader('tile-no-remote', 'out/direction-A/inicio.html', NO_REMOTE, 'not_contains'),
    fileGrader('tile-no-trap', 'out/direction-A/inicio.html', TRAP, 'not_contains'),
  );
  const cases = [
    mockup('ui-option-mockup', MOCKUP_BRIEF, 'out/option-A', ['inicio.html', 'detalle.html'], 'A'),
    tile,
    mockup('ui-option-improve', IMPROVE_BRIEF, 'out/option-B', ['inicio.html'], 'B'),
  ];
  for (const c of cases) {
    c.processGraders = [
      ...dispatched('ui-option', 'sonnet'),
      singleDispatch,
      { name: 'trap-not-in-trace', type: 'regex', target: 'trace', pattern: TRAP, match: 'not_contains' },
    ];
  }
  return cases;
}

// ---- ablation briefs (informational, not a gate: spec §0.1 point 7) ------------------------------

export const ABLATION_BRIEFS = [
  { name: 'ablation-account-summary', task: 'a screen with the summary of a savings account: balance, last movements and a button to move money' },
  { name: 'ablation-settings', task: 'a settings screen with notification preferences and a save button' },
  { name: 'ablation-sign-up', task: 'a sign-up screen with name, email and password fields' },
];

function ablationCases() {
  return ABLATION_BRIEFS.map((b) => ({
    name: b.name, agent: null, kind: 'ablation', task: b.task, page: null,
    graders: [fileGrader('output-exists', 'out/index.html', '<!doctype html')],
  }));
}

export const CASES = () => [...auditorCases(), ...optionCases(), ...ablationCases()];

// ---- writing ---------------------------------------------------------------------------------------

function yamlValue(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (/^[A-Za-z0-9_.:/-]+$/.test(v) && !/^(true|false)$/.test(v)) return v;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function graderMd(g) {
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

const posix = (p) => p.split(path.sep).join('/');

function heredoc(file, content) {
  if (content.includes('PIGNOLO_EOF')) throw new Error(`delimiter inside ${file}`);
  return [`mkdir -p ${path.posix.dirname(file)}`, `cat > ${file} <<'PIGNOLO_EOF'`, content.replace(/\n$/, ''), 'PIGNOLO_EOF'];
}

export function fixtureSh(c) {
  const out = ['#!/usr/bin/env bash', '# Synthetic fixture generated by tests/evals/ui-cases.mjs (no real data).', 'set -e'];
  if (c.kind === 'auditor') {
    out.push(
      `PLUGIN='${posix(PLUGIN_ROOT)}'`,
      'git init -q', 'git config user.email eval@example.test', 'git config user.name eval', 'git config core.autocrlf false',
      ...heredoc('src/index.html', c.page),
      'git add -A', 'git commit -q -m init',
      `RUN=${RUN_DIR}`,
      'node "$PLUGIN/scripts/run.mjs" init --project . --command audit --slug eval --now 2026-10-01T10:00:00Z --file src/index.html --files src/index.html > /dev/null',
      'node "$PLUGIN/scripts/run.mjs" norms --run "$RUN" > /dev/null',
      // exit 1 of measure/check is a finding, not a failure of the fixture
      'node "$PLUGIN/scripts/browser.mjs" measure --project . --run "$RUN" --file src/index.html --platform desktop > /dev/null || [ $? -eq 1 ]',
      'node "$PLUGIN/scripts/browser.mjs" capture --project . --run "$RUN" --file src/index.html --platform desktop > /dev/null',
      'node "$PLUGIN/scripts/browser.mjs" dom --project . --run "$RUN" --file src/index.html --platform desktop > /dev/null',
      'node "$PLUGIN/scripts/run.mjs" check --project . --run "$RUN" --files src/index.html > /dev/null || [ $? -eq 1 ]',
    );
  } else if (c.kind === 'option') {
    out.push('git init -q', ...heredoc('docs/internal-notes.md', `# Notes\n\nInternal code name: ${TRAP}. Do not use it anywhere.\n`), `mkdir -p ${c.folder}`);
  } else {
    out.push('git init -q', 'mkdir -p out');
  }
  return `${out.join('\n')}\n`;
}

function promptMd(c, caseDir) {
  const plugin = posix(path.relative(caseDir, PLUGIN_ROOT));
  if (c.kind === 'ablation') {
    return [
      '---', 'runs: 5', 'max_turns: 30', 'timeout_seconds: 900', 'model: sonnet', `plugins: ["${plugin}"]`, 'tags: [ablation, informational]', 'allowed_tools: [Read, Write, Edit, Bash, Glob, Grep]', '---', '',
      `Design and write ${c.task} as one static HTML file, out/index.html (self-contained: inline CSS, no scripts, no remote resources). Use real HTML structure and sample data marked as sample.`, '',
    ].join('\n');
  }
  const model = c.kind === 'auditor' ? 'opus' : 'sonnet';
  const brief = c.kind === 'auditor' ? RUN_DIR : c.brief;
  // ui-option writes its mockups with Write: without it every file grader fails (Write is a gated tool)
  const tools = c.kind === 'auditor' ? ['Agent', 'Read', 'Grep', 'Glob'] : ['Agent', 'Read', 'Grep', 'Glob', 'Write'];
  return [
    '---', 'runs: 5', 'max_turns: 20', 'timeout_seconds: 600', 'model: sonnet', `plugins: ["${plugin}"]`,
    `tags: [agents, ${c.kind}, ${model}]`, `allowed_tools: [${tools.join(', ')}]`, '---', '',
    `Dispatch the ${PREFIX}:${c.agent} agent (subagent_type ${PREFIX}:${c.agent}, model ${model}) with run_in_background false and exactly the brief between the two lines of dashes. Do not read, run or change anything yourself. When the agent returns, reply with only the word RELAYED.`, '',
    '----------', brief, '----------', '',
  ].join('\n');
}

export function requireBrowser() {
  const found = findBrowser();
  if (!found.path) throw new Error(`no hay navegador para armar las corridas de los fixtures (${found.reason}): generá los casos en la máquina del autor`);
  return found.path;
}

export function build({ out, agent = 'all', needBrowser = true } = {}) {
  if (!['all', 'auditor', 'option', 'ablation'].includes(agent)) throw new Error('--agent debe ser auditor, option o ablation');
  if (needBrowser && (agent === 'all' || agent === 'auditor')) requireBrowser();
  const names = [];
  for (const c of CASES()) {
    if (agent !== 'all' && c.kind !== agent) continue;
    const dir = path.join(out, c.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'graders'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'case.yaml'), `schema_version: "1.1"\nname: ${c.name}\ncontext:\n  scaffold_script: fixture.sh\n`);
    fs.writeFileSync(path.join(dir, 'fixture.sh'), fixtureSh(c));
    fs.writeFileSync(path.join(dir, 'prompt.md'), promptMd(c, dir));
    for (const g of [...(c.processGraders ?? []), ...c.graders]) fs.writeFileSync(path.join(dir, 'graders', `${g.name}.md`), graderMd(g));
    names.push(c.name);
  }
  return names;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (!get('--out')) {
    process.stderr.write('uso: node tests/evals/ui-cases.mjs --out <dir> [--agent auditor|option|ablation]\n');
    process.exit(2);
  }
  try {
    const names = build({ out: path.resolve(get('--out')), agent: get('--agent') ?? 'all' });
    process.stdout.write(`${JSON.stringify({ out: path.resolve(get('--out')), cases: names })}\n`);
  } catch (e) {
    process.stderr.write(`ui-cases: ${e.message}\n`);
    process.exit(2);
  }
}
