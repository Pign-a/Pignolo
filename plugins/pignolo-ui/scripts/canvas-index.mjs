// canvas-index.mjs: deterministic canvas bytes and the only way to a publication (R-6, R-7, R-8).
// Writes only under <run>/canvas/ and <run>/merge/, never through a link. Prints ONE JSON object on
// stdout; exit 0 done, 1 refusal or finding, 2 usage or own error. Options are closed per subcommand.
//
//   canvas-index.mjs build --project <repo> --run <run> --options <A,B,C> --screens <inicio.html,detalle.html>
//                          --platform desktop|mobile|both --page-name <text> --design <DESIGN.md|none> --first yes|no
//                          [--now <ISO>] [--heights <json file>]
//   canvas-index.mjs verify --run <run>
//   canvas-index.mjs plan --project <repo> --run <run> --values-file <json> --types-file <json> --data <dir>
//   canvas-index.mjs merge --run <run> --live none --live-dir none [--now <ISO>]
//   canvas-index.mjs record --run <run> --step canvas-create|canvas-publish --url <url> --data <dir> --project <repo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCanvas, verifyCanvas, layoutSha256, pageIdFor, CanvasError } from '../lib/canvas-layout.mjs';
import { scanMarkup } from '../lib/canvas-html.mjs';
import { splitFrontmatter } from '../lib/design-doc.mjs';
import { parseYaml } from '../lib/yaml-subset.mjs';
import { RUN_ROOT } from '../lib/run-folder.mjs';
import { linkProblem, removeOwnDir, runLinkProblem, samePath } from '../lib/link-guard.mjs';
import { planNext, mergeLive, recordStep, ownsMainOf, PublishError } from '../lib/canvas-publish.mjs';

class UsageError extends Error {}

const SPECS = {
  build: { value: ['project', 'run', 'options', 'screens', 'platform', 'page-name', 'design', 'first', 'now', 'heights'], flags: [] },
  verify: { value: ['run'], flags: [] },
  plan: { value: ['project', 'run', 'values-file', 'types-file', 'data'], flags: [] },
  merge: { value: ['run', 'live', 'live-dir', 'now'], flags: [] },
  record: { value: ['run', 'step', 'url', 'data', 'project'], flags: [] },
};

function parse(argv, spec, name) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!spec.value.includes(key)) throw new UsageError(`opción desconocida ${a} para ${name}; opciones válidas: ${spec.value.map((k) => `--${k}`).join(', ')}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  return opts;
}

const need = (opts, ...keys) => { for (const k of keys) if (opts[k] === undefined) throw new UsageError(`falta --${k}`); };
const list = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// <project>/.pignolo-ui/runs/<id>: the run folder, and the project it belongs to.
function resolveRun(cwd, opts) {
  need(opts, 'run');
  const run = path.resolve(cwd, opts.run);
  const parts = run.split(path.sep);
  const at = parts.findIndex((p, i) => samePath(p, RUN_ROOT) && samePath(parts[i + 1] ?? '', 'runs'));
  if (at < 1 || parts.length !== at + 3) throw new UsageError(`--run debe ser una carpeta de ${RUN_ROOT}/runs/<id> del proyecto`);
  const project = parts.slice(0, at).join(path.sep) || path.sep;
  if (opts.project !== undefined && !samePath(path.resolve(cwd, opts.project), path.resolve(project))) throw new UsageError('--run no está dentro de --project');
  if (!isDir(run)) throw new UsageError(`--run no existe: ${opts.run}`);
  const link = runLinkProblem(run);
  if (link) throw new UsageError(`${path.relative(project, link)} es un enlace: se rechaza`);
  return { run, project };
}

function readJsonFile(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { throw new UsageError(`no se pudo leer ${what}: ${path.basename(file)} (${e.code || 'JSON inválido'})`); }
}

// R-6: the title is the name of DESIGN.md when it is valid and not the template's, else the constant.
export function canvasTitleFrom(designFile) {
  if (!designFile || !fs.existsSync(designFile)) return 'Proyecto';
  try {
    const fm = splitFrontmatter(fs.readFileSync(designFile, 'utf8'));
    if (!fm.ok) return 'Proyecto';
    const parsed = parseYaml(fm.yaml);
    const name = parsed.supported && parsed.value && typeof parsed.value.name === 'string' ? parsed.value.name.trim() : '';
    if (!name || name === 'Project name' || name.length > 120 || /[\r\n<>]/.test(name)) return 'Proyecto';
    return name;
  } catch {
    return 'Proyecto';
  }
}

function cmdBuild(opts, { cwd }) {
  need(opts, 'project', 'run', 'options', 'screens', 'platform', 'page-name', 'design', 'first');
  const { run, project } = resolveRun(cwd, opts);
  if (!isDir(project)) throw new UsageError('--project no existe');
  const runId = path.basename(run);
  let pageId;
  try { pageId = pageIdFor(runId); } catch { throw new UsageError('el nombre de la corrida no empieza con el sello YYYY-MM-DD-HHMM-'); }
  if (!['desktop', 'mobile', 'both'].includes(opts.platform)) throw new UsageError('--platform debe ser desktop, mobile o both');
  if (!['yes', 'no'].includes(opts.first)) throw new UsageError('--first debe ser yes o no');
  const letters = list(opts.options);
  if (!letters.length || new Set(letters).size !== letters.length || !letters.every((l) => /^[A-Z]$/.test(l))) throw new UsageError('--options debe ser una lista de letras mayúsculas distintas (A,B,C)');
  const screens = list(opts.screens);
  if (!screens.length || new Set(screens).size !== screens.length) throw new UsageError('--screens debe listar pantallas distintas');
  for (const s of screens) if (!/^[a-z0-9][a-z0-9-]*\.html$/.test(s) || s.replace(/\.html$/, '').length > 32) throw new UsageError(`pantalla inválida: ${s.slice(0, 40)}`);
  const pageName = opts['page-name'].trim();
  if (!pageName || pageName.length > 120) throw new UsageError('--page-name debe tener entre 1 y 120 caracteres');
  let now = new Date().toISOString();
  if (opts.now !== undefined) {
    if (Number.isNaN(new Date(opts.now).getTime())) throw new UsageError('--now debe ser una fecha ISO');
    now = new Date(opts.now).toISOString();
  }
  const heights = opts.heights !== undefined ? readJsonFile(path.resolve(cwd, opts.heights), '--heights') : null;
  const designFile = opts.design === 'none' ? null : path.resolve(cwd, opts.design);
  // A4C2-02: first is of the page of this run: the state says yes, or the run already published its own Main.dc.html
  const first = opts.first === 'yes' || ownsMainOf(run);
  const options = letters.map((id) => {
    const dir = path.join(run, `option-${id}`);
    if (!isDir(dir) || linkProblem(dir)) throw new UsageError(`no existe option-${id} en el run (o es un enlace)`);
    return {
      id, kind: 'option',
      screens: screens.map((file) => {
        const f = path.join(dir, file);
        let st = null;
        try { st = fs.lstatSync(f); } catch { /* missing */ }
        if (!st) throw new UsageError(`falta ${file} en option-${id}`);
        // lstat: a screen that is a link is never followed
        if (st.isSymbolicLink() || !st.isFile()) throw new UsageError(`${file} en option-${id} es un enlace o no es un archivo: se rechaza`);
        return { file, html: fs.readFileSync(f, 'utf8') };
      }),
    };
  });
  const canvasDir = path.join(run, 'canvas');
  const mergeDir = path.join(run, 'merge');
  // what was merged before is no longer current
  try { removeOwnDir(mergeDir); } catch (e) { throw new UsageError(e.message); }
  // per-screen scan first: every refusal is listed, and nothing is written
  const problems = [];
  const warnings = [];
  for (const o of options) {
    for (const s of o.screens) {
      const scan = scanMarkup(s.html);
      for (const p of scan.problems) problems.push({ file: `option-${o.id}/${s.file}`, code: p.code, line: p.line });
      for (const w of scan.warnings) warnings.push({ file: `option-${o.id}/${s.file}`, code: w.code });
    }
  }
  let built = null;
  if (!problems.length) {
    try {
      built = buildCanvas({ options, platform: opts.platform, pageId, pageName, canvasTitle: canvasTitleFrom(designFile), first, now, heights });
    } catch (e) {
      if (!(e instanceof CanvasError)) throw e;
      for (const p of e.problems ?? [{ code: e.code }]) problems.push({ file: e.file ?? '', code: p.code ?? e.code, ...(e.detail ? { detail: e.detail } : {}) });
    }
  }
  if (problems.length) {
    // a stale canvas must not be published after a failed build
    try { removeOwnDir(canvasDir); } catch { /* a link: left alone, plan refuses it */ }
    return { out: { ok: false, problems }, code: 1 };
  }
  const tmp = path.join(run, `.canvas-tmp-${process.pid}`);
  try { removeOwnDir(tmp); removeOwnDir(canvasDir); } catch (e) { throw new UsageError(e.message); }
  fs.mkdirSync(path.join(tmp, 'project'), { recursive: true });
  const manifestFiles = [];
  let bytes = 0;
  for (const name of Object.keys(built.files).sort()) {
    const buf = Buffer.from(built.files[name], 'utf8');
    fs.writeFileSync(path.join(tmp, 'project', name), buf);
    manifestFiles.push({ path: `project/${name}`, sha256: sha(buf) });
    bytes += buf.length;
  }
  const layout = layoutSha256(built.fragment);
  fs.writeFileSync(path.join(tmp, 'page.json'), `${JSON.stringify(built.fragment, null, 2)}\n`);
  fs.writeFileSync(path.join(tmp, 'manifest.json'), `${JSON.stringify({ files: manifestFiles, layoutSha256: layout, pageId, bytes, first, warnings }, null, 2)}\n`);
  fs.renameSync(tmp, canvasDir);
  return { out: { out: canvasDir, files: manifestFiles.map((f) => f.path), count: manifestFiles.length, layoutSha256: layout, pageId, first, warnings }, code: 0 };
}

function cmdVerify(opts, { cwd }) {
  const { run } = resolveRun(cwd, opts);
  const dir = path.join(run, 'canvas');
  if (linkProblem(dir)) return { out: { ok: false, problems: [{ code: 'root-is-link' }] }, code: 1 };
  if (!isDir(dir)) return { out: { ok: false, problems: [{ code: 'no-canvas' }] }, code: 1 };
  if (linkProblem(path.join(dir, 'project'))) return { out: { ok: false, problems: [{ code: 'link-in-output', file: 'project' }] }, code: 1 };
  const r = verifyCanvas({ dir });
  return { out: r, code: r.ok ? 0 : 1 };
}

function cmdPlan(opts, { cwd }) {
  need(opts, 'project', 'run', 'values-file', 'types-file', 'data');
  const { run, project } = resolveRun(cwd, opts);
  const valuesFile = path.resolve(cwd, opts['values-file']);
  const types = readJsonFile(path.resolve(cwd, opts['types-file']), '--types-file');
  const r = planNext({ run, project, data: path.resolve(cwd, opts.data), types: { design: typeof types.design === 'string' ? types.design : null }, valuesFile });
  return { out: r, code: r.ok ? 0 : 1 };
}

function cmdMerge(opts, { cwd }) {
  need(opts, 'run', 'live', 'live-dir');
  const { run } = resolveRun(cwd, opts);
  let now = new Date().toISOString();
  if (opts.now !== undefined) {
    if (Number.isNaN(new Date(opts.now).getTime())) throw new UsageError('--now debe ser una fecha ISO');
    now = new Date(opts.now).toISOString();
  }
  const r = mergeLive({ run, live: opts.live, liveDir: opts['live-dir'], now });
  return { out: r, code: r.ok ? 0 : (r.usage ? 2 : 1) };
}

function cmdRecord(opts, { cwd }) {
  need(opts, 'run', 'step', 'url', 'data', 'project');
  const { run } = resolveRun(cwd, opts);
  if (!['canvas-create', 'canvas-publish'].includes(opts.step)) throw new UsageError('--step debe ser canvas-create o canvas-publish');
  try {
    const r = recordStep({ run, step: opts.step, url: opts.url });
    return { out: r, code: r.ok ? 0 : 1 };
  } catch (e) {
    if (e instanceof PublishError && e.usage) throw new UsageError(e.message);
    throw e;
  }
}

const COMMANDS = { build: cmdBuild, verify: cmdVerify, plan: cmdPlan, merge: cmdMerge, record: cmdRecord };

export function main(argv, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  try {
    const [name, ...rest] = argv;
    const cmd = COMMANDS[name];
    if (!cmd) throw new UsageError(`falta el subcomando: ${Object.keys(COMMANDS).join(' | ')}`);
    const { out, code } = cmd(parse(rest, SPECS[name], name), { cwd });
    stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return code;
  } catch (e) {
    const known = e instanceof UsageError || e instanceof CanvasError;
    process.stderr.write(`canvas-index: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
