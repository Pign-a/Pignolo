// run.mjs: thin CLI over lib/ for what the skills would otherwise assert by themselves (spec §3.2,
// §7, §8, §12). Every subcommand prints ONE JSON object on stdout; exit 0 done, 1 refusal or
// finding, 2 usage or own error. JSON input always comes from a file, never inline.
//
//   run.mjs env [--claude-min <x.y.z>]
//   run.mjs init --project <repo> --command new|improve|audit --slug <slug> [--now <ISO>] [--url <local URL> | --file <path>] [--files <a,b>]
//   run.mjs config get|set --data <dir> --project <repo> [--key <k> --value <v>]
//   run.mjs present --data <dir> --project <repo> --presentation <auto|local|unsubstituted text> --kind option|direction --artifact yes|no --design-type yes|no [--run <run>]
//     prints mode, destination, reasons, notice, canvasPublished (the canvas record of the project or null) and first (by state)
//   run.mjs publish-gate --data <dir> --project <repo> --presentation <auto|local|unsubstituted text> [--run <run>]
//   run.mjs no-publish --run <run>
//   run.mjs norms --run <run> [--norms <norms.md>]
//   run.mjs check --project <repo> --run <run> [--files <a,b>] [--design <DESIGN.md>] [--base <ref>] [--url <local URL>] [--before <ui-check.json>]
//   run.mjs leak-values --project <repo> --run <run> [--email <mail>]   (writes OUTSIDE the project; `out` is the values file)
//   run.mjs leak-migrate --project <repo> [--delete]   (old leak files under .pignolo-ui/runs: lists, never prints contents)
//   run.mjs git-state --project <repo> --out <file>
//   run.mjs options-check --project <repo> --run <run> --option <A|B|C> [--kind option|direction] --expected <a.html,b.html> --git-before <file> [--destination canvas|local] [--provided-file <json list>]
//   run.mjs discard --run <run> --option <A|B|C> [--kind option|direction]
//   run.mjs auditor-check --project <repo> --run <run> [--mode findings|verdict]
//   run.mjs context --project <repo> --run <run> [--brief <brief.md>] [--values-file <json>]
//   run.mjs verdict-request --run <run> --chosen <J-05,J-07>
//   run.mjs register --project <repo> [--brief <brief.md>]
//   run.mjs menu --run <run> [--norms <file>] [--extra-symptoms-file <json>] [--words-file <txt>]
//   run.mjs report-skeleton --project <repo> --run <run> [--implements <design/approved/flow>]
//   run.mjs option-model --profile <max|balanced|economy>
//   run.mjs report-line --facts <json file>
//   run.mjs verdict --project <repo> --run <run> [--build-ok yes|no]
//   run.mjs compare-html --run <run> --platform desktop|mobile|both --screens <a.html,b.html> [--kind option|direction] [--no-open]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isLoopbackUrl } from '../lib/site-fetch.mjs';
import { envReport } from '../lib/env-check.mjs';
import { initRun } from '../lib/run-init.mjs';
import { readConfig, readCanvas, readOptOut, writeConfig, ConfigError } from '../lib/project-config.mjs';
import { decidePresentation, gateDecision, NOTICE } from '../lib/presentation.mjs';
import { loadNorms, extract, judgmentIds } from '../lib/norms.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { loadSymptoms, mergeUserSymptoms, buildMenu, matchWords } from '../lib/symptoms.mjs';
import { collectLeakValues, collectLeakOrigins } from '../lib/leak-values.mjs';
import { writeLeakFiles, findLegacyLeakFiles } from '../lib/leak-store.mjs';
import { optionModel } from '../lib/option-model.mjs';
import { readValuesFile } from '../lib/leak-check.mjs';
import { gitState, checkOption } from '../lib/option-check.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { findDesignFile } from '../lib/approved.mjs';
import { validateBrief, designRegister } from '../lib/brief-md.mjs';
import { validateFindings, validateVerdicts } from '../lib/auditor-output.mjs';
import { validateProduct, extractContext, SECTION_MAX } from '../lib/product-md.mjs';
import { firstLine, reportSkeleton, verdict } from '../lib/report-build.mjs';
import { checkReport, ReportError } from '../lib/report-check.mjs';
import crypto from 'node:crypto';
import { isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { portable } from '../lib/portable.mjs';
import { isLink, linkProblem, runLinkProblem } from '../lib/link-guard.mjs';
import { buildCompareHtml, openFile } from '../lib/compare-html.mjs';
import { writeLocalCopies, LocalCopyError } from '../lib/local-copy.mjs';

class UsageError extends Error {}

const LEAK_NOTE = 'Estos valores son datos personales: viven fuera del proyecto; nunca los agregues a git (ni con git add -f).';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const LETTER = /^[A-Z]$/;

// ---- argument parsing -------------------------------------------------------------------

function parse(argv, spec) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (spec.flags?.includes(key)) { opts[key] = true; continue; }
    if (!spec.value.includes(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: ${[...spec.value, ...(spec.flags ?? [])].map((k) => `--${k}`).join(', ')}`);
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
const yesNo = (v, name) => { if (v === 'yes') return true; if (v === 'no') return false; throw new UsageError(`--${name} debe ser yes o no`); };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) {
    throw new UsageError(`no se pudo leer ${what}: ${file} (${e.code || e.message})`);
  }
}
const readJsonIf = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function readText(file, what) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { throw new UsageError(`no se pudo leer ${what}: ${file} (${e.code || e.message})`); }
}

function projectDir(cwd, opts) {
  need(opts, 'project');
  const p = path.resolve(cwd, opts.project);
  if (!isDir(p)) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
  return p;
}

// A run folder is anything inside <project>/.pignolo-ui/runs/ (a sub-folder such as after/ included).
function runDirOf(cwd, project, opts) {
  need(opts, 'run');
  const run = path.resolve(cwd, opts.run);
  const runs = path.join(project, RUN_ROOT, 'runs');
  const rel = path.relative(runs, run);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/runs/ del proyecto`);
  if (!isDir(run)) throw new UsageError(`--run no existe: ${opts.run}`);
  return run;
}

// For commands without --project: the project is whatever precedes .pignolo-ui/runs in the path.
function projectOfRun(cwd, opts) {
  need(opts, 'run');
  const run = path.resolve(cwd, opts.run);
  const parts = run.split(path.sep);
  const at = parts.findIndex((p, i) => p === RUN_ROOT && parts[i + 1] === 'runs');
  if (at < 1 || parts.length <= at + 2) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/runs/`);
  const project = parts.slice(0, at).join(path.sep) || path.sep;
  if (!isInsideRunRoot(project, run)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/runs/`);
  return { project, run };
}

// I-1: the first file listed in ui-check.json inputs whose sha256 no longer matches the disk.
function staleInput(project, ui) {
  for (const i of Array.isArray(ui.inputs) ? ui.inputs : []) {
    if (!i || typeof i.file !== 'string') continue;
    let sha = null;
    try { sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(project, ...i.file.split('/')))).digest('hex'); } catch { /* missing counts as changed */ }
    if (sha !== i.sha256) return i.file;
  }
  return null;
}

// I-2: does package.json declare a script the flow has to run (typecheck, build or lint)?
function declaresBuild(project) {
  const pkg = readJsonIf(path.join(project, 'package.json'));
  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
  return ['typecheck', 'build', 'lint'].some((s) => typeof scripts[s] === 'string');
}

function kindOf(opts) {
  const kind = opts.kind ?? 'option';
  if (!['option', 'direction'].includes(kind)) throw new UsageError('--kind debe ser option o direction');
  return kind;
}

function optionLetter(opts) {
  need(opts, 'option');
  if (!LETTER.test(opts.option)) throw new UsageError('--option debe ser una letra mayúscula (A, B, C)');
  return opts.option;
}

// ---- subcommands ------------------------------------------------------------------------

const COMMANDS = {
  env: {
    spec: { value: ['claude-min'] },
    run(opts) {
      return { out: envReport({ minClaude: opts['claude-min'] ?? '2.1.271' }), code: 0 };
    },
  },

  init: {
    spec: { value: ['project', 'command', 'slug', 'now', 'url', 'file', 'files'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      need(opts, 'command', 'slug');
      const meta = {};
      if (opts.url !== undefined && opts.file !== undefined) throw new UsageError('indicá --url o --file, no los dos');
      if (opts.url !== undefined) {
        if (!isLoopbackUrl(opts.url)) throw new UsageError(`--url solo acepta direcciones locales (localhost, 127.0.0.1, ::1): ${opts.url}`);
        meta.url = opts.url;
      }
      if (opts.file !== undefined) meta.file = opts.file;
      if (opts.files !== undefined) meta.files = list(opts.files);
      const now = opts.now !== undefined ? new Date(opts.now) : new Date();
      if (Number.isNaN(now.getTime())) throw new UsageError('--now debe ser una fecha ISO');
      let res;
      try { res = initRun({ project, command: opts.command, slug: opts.slug, now, meta }); } catch (e) { throw new UsageError(e.message); }
      return { out: { ...res, run: res.run.split(path.sep).join('/') }, code: 0 };
    },
  },

  // The gate runs BEFORE any Artifact call (also before action: "list"): exit 0 allowed, exit 1 not.
  // Anything but the literal "auto" (the text ${user_config.presentation} that Claude Code did not substitute
  // included) counts as local: an unreadable setting never opens a publication (D-4c-15).
  'publish-gate': {
    spec: { value: ['data', 'project', 'presentation', 'run'] },
    run(opts, { cwd }) {
      need(opts, 'data', 'project', 'presentation');
      const project = projectDir(cwd, opts);
      const { optOut, dataProblem } = readOptOut({ data: path.resolve(cwd, opts.data), project });
      const runOptOut = opts.run !== undefined && fs.existsSync(path.join(runDirOf(cwd, project, opts), 'no-publish'));
      const out = gateDecision({ presentation: opts.presentation, projectOptOut: optOut, runOptOut, dataUnresolved: dataProblem !== null });
      return { out, code: out.allowed ? 0 : 1 };
    },
  },

  'no-publish': {
    spec: { value: ['run'] },
    run(opts, { cwd }) {
      const { project, run } = projectOfRun(cwd, opts);
      if (!isInsideRunRoot(project, run) || !isDir(run)) throw new UsageError('--run no existe o está fuera de .pignolo-ui/');
      // the run and the two folders above it: nothing is written through a link or a junction
      const linked = runLinkProblem(run);
      if (linked) throw new UsageError(`${path.relative(project, linked)} es un enlace: se rechaza`);
      const file = path.join(run, 'no-publish');
      if (isLink(file)) throw new UsageError('no-publish es un enlace: se rechaza');
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, 'no-publish\n');
      fs.renameSync(tmp, file);
      return { out: { out: file }, code: 0 };
    },
  },

  present: {
    spec: { value: ['data', 'project', 'presentation', 'kind', 'artifact', 'design-type', 'run'] },
    run(opts, { cwd }) {
      need(opts, 'data', 'project', 'presentation', 'kind', 'artifact', 'design-type');
      const project = projectDir(cwd, opts);
      const kind = kindOf(opts);
      const unresolved = !['auto', 'local'].includes(opts.presentation);
      const { optOut, dataProblem } = readOptOut({ data: path.resolve(cwd, opts.data), project });
      const runOptOut = opts.run !== undefined && fs.existsSync(path.join(runDirOf(cwd, project, opts), 'no-publish'));
      const decision = decidePresentation({
        dataUnresolved: dataProblem !== null,
        presentation: opts.presentation,
        kind,
        artifact: yesNo(opts.artifact, 'artifact'),
        designType: yesNo(opts['design-type'], 'design-type'),
        optOut,
      });
      const reasons = runOptOut ? [...decision.reasons.filter((r) => r !== 'run-opt-out'), 'run-opt-out'] : decision.reasons;
      let mode = runOptOut ? 'local' : decision.mode;
      // the canvas of the project (R-16): present says where it is and whether this run opens it. `first` is by
      // state only: build adds the ownsMain of the run (R-7). A record that is not valid is not a canvas.
      const stored = readCanvas(readConfig({ data: path.resolve(cwd, opts.data), project }).config);
      const first = stored.canvas === null || stored.canvas.state === 'created' || stored.canvas.pages === 0;
      // an invalid record of the canvas is not a canvas: this run stays local and says why (RL2-07); the way out is plan --new-canvas
      if (stored.problem && mode === 'canvas') { mode = 'local'; reasons.push('canvas-invalid'); }
      const out = { mode, reasons, destination: mode === 'canvas' ? 'canvas' : 'local', canvasPublished: stored.canvas, first };
      if (stored.problem) out.canvasInvalid = true;
      if (mode === 'canvas') out.notice = NOTICE;
      if (unresolved) out.presentationUnresolved = true;
      return { out, code: 0 };
    },
  },

  norms: {
    spec: { value: ['run', 'norms'] },
    run(opts, { cwd }) {
      need(opts, 'run');
      const run = path.resolve(cwd, opts.run);
      if (!isDir(run)) throw new UsageError(`--run no existe: ${opts.run}`);
      const loaded = loadNorms({ userFile: opts.norms !== undefined ? path.resolve(cwd, opts.norms) : null });
      const out = path.join(run, 'norms.md');
      fs.writeFileSync(out, extract(loaded));
      const user = loaded.user === null ? 'none' : loaded.user.ok ? 'ok' : 'ignored';
      return { out: { out, user, ...(loaded.user && loaded.user.warning ? { warning: loaded.user.warning } : {}) }, code: 0 };
    },
  },

  check: {
    spec: { value: ['project', 'run', 'files', 'design', 'base', 'url', 'before'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      const args = [path.join(SCRIPTS_DIR, 'ui-check.mjs'), '--project', project, '--run', run];
      const doms = readJsonIf(path.join(run, 'dom.json'));
      const domList = doms && Array.isArray(doms.doms) ? doms.doms : [];
      for (const d of domList) args.push('--dom', path.join(run, d.path));
      const hasMeasures = fs.existsSync(path.join(run, 'browser.json'));
      if (hasMeasures) args.push('--measures', path.join(run, 'browser.json'));
      const files = opts.files !== undefined ? list(opts.files) : [];
      for (const f of files) args.push('--files', path.resolve(project, f));
      if (!domList.length && !hasMeasures && !files.length) throw new UsageError('no hay nada que chequear: falta dom.json, browser.json o --files');
      if (opts.design !== undefined) args.push('--design', path.resolve(project, opts.design));
      if (opts.base !== undefined) args.push('--base', opts.base);
      if (opts.url !== undefined) args.push('--url', opts.url);
      if (opts.before !== undefined) args.push('--before', path.resolve(cwd, opts.before));
      const res = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300000, windowsHide: true });
      if (res.stderr) process.stderr.write(res.stderr);
      let json = null;
      try { json = JSON.parse(res.stdout); } catch { /* ui-check wrote no JSON */ }
      return { out: json ?? { error: 'ui-check no devolvió JSON' }, code: res.status ?? 2 };
    },
  },

  'leak-values': {
    spec: { value: ['project', 'run', 'out', 'email'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      if (opts.out !== undefined) throw new UsageError('--out ya no existe: los valores se guardan fuera del proyecto (--run)');
      need(opts, 'run');
      const values = collectLeakValues({ project, email: opts.email });
      // canvas-index plan reads leak-origins.json (next to the values) to refuse when git did not run; it holds only booleans and the git state
      const origins = collectLeakOrigins({ project, email: opts.email });
      let written;
      try { written = writeLeakFiles({ project, run: opts.run, values, origins }); } catch (e) {
        if (/^leak-store:/.test(e.message)) throw new UsageError(e.message);
        throw e;
      }
      process.stderr.write(`${LEAK_NOTE}\n`);
      return { out: { out: written.valuesFile, count: values.length, origins, legacy: findLegacyLeakFiles(project).length, note: LEAK_NOTE }, code: 0 };
    },
  },

  'leak-migrate': {
    spec: { value: ['project'], flags: ['delete'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const found = findLegacyLeakFiles(project);
      let tracked = [];
      if (found.length) {
        const ls = spawnSync('git', ['ls-files', '-z', '--', ...found], { cwd: project, encoding: 'utf8', timeout: 30000, windowsHide: true });
        if (ls.status === 0) tracked = ls.stdout.split('\0').filter(Boolean).sort();
      }
      const deleted = [];
      if (opts.delete === true) {
        for (const rel of found) {
          try { fs.rmSync(path.join(project, ...rel.split('/'))); deleted.push(rel); } catch { /* left in place */ }
        }
        if (tracked.length) process.stderr.write('Hay archivos con valores personales en el índice de git: sacalos del índice y revisá el historial, ver docs/fuga-leak-values.md. Esto no toca el índice ni el historial.\n');
      }
      return { out: { found, tracked, deleted }, code: 0 };
    },
  },

  'git-state': {
    spec: { value: ['project', 'out'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      need(opts, 'out');
      const state = gitState(project);
      const out = path.resolve(cwd, opts.out);
      fs.writeFileSync(out, state);
      return { out: { out, lines: state ? state.split('\n').length : 0 }, code: 0 };
    },
  },

  'options-check': {
    spec: { value: ['project', 'run', 'option', 'kind', 'expected', 'git-before', 'destination', 'provided-file'] },
    async run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      const kind = kindOf(opts);
      const letter = optionLetter(opts);
      need(opts, 'expected', 'git-before');
      const destination = opts.destination ?? 'local';
      if (!['canvas', 'local'].includes(destination)) throw new UsageError('--destination debe ser canvas o local');
      const expected = list(opts.expected);
      let gitBefore;
      try { gitBefore = fs.readFileSync(path.resolve(cwd, opts['git-before']), 'utf8'); } catch (e) { throw new UsageError(`no se pudo leer --git-before (${e.code || e.message})`); }
      let provided = null;
      if (opts['provided-file']) {
        const pf = path.resolve(cwd, opts['provided-file']);
        if (!fs.existsSync(pf)) throw new UsageError('--provided-file: the values file does not exist (pass it only when the brief step wrote it)');
        try { provided = readValuesFile(pf); } catch (e) { throw new UsageError(`--provided-file: ${e.message}`); }
      }
      const dir = path.join(run, `${kind}-${letter}`);
      const result = checkOption({ dir, expected, project, gitBefore, ignoreUnder: [`${RUN_ROOT}/`], kind, destination, provided });
      const files = isDir(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => path.join(dir, f)) : [];
      let contradicted = [];
      if (files.length) {
        const designFile = findDesignFile(project);
        const checked = await runCheck({ project, files, design: designFile });
        contradicted = [...new Set(checked.entries.filter((e) => e.status === 'fail').map((e) => e.id))];
      }
      return { out: { ok: result.ok, problems: result.problems, warnings: result.warnings, contradicted }, code: result.ok ? 0 : 1 };
    },
  },

  discard: {
    spec: { value: ['run', 'option', 'kind'] },
    run(opts, { cwd }) {
      const { project, run } = projectOfRun(cwd, opts);
      const kind = kindOf(opts);
      const letter = optionLetter(opts);
      const from = path.join(run, `${kind}-${letter}`);
      if (!fs.existsSync(from)) throw new UsageError(`no existe ${kind}-${letter} en el run`);
      if (fs.lstatSync(from).isSymbolicLink() || !fs.lstatSync(from).isDirectory()) throw new UsageError(`${kind}-${letter} no es una carpeta común`);
      const base = path.join(run, 'discarded');
      let n = 1;
      while (fs.existsSync(path.join(base, `${kind}-${letter}-${n}`))) n++;
      const to = path.join(base, `${kind}-${letter}-${n}`);
      if (!isInsideRunRoot(project, from) || !isInsideRunRoot(project, to)) throw new UsageError('origen o destino fuera de .pignolo-ui/');
      fs.mkdirSync(base, { recursive: true });
      fs.renameSync(from, to);
      return { out: { from, to }, code: 0 };
    },
  },

  // Product context of the run (hito 4f): PRODUCT.md and the brief of the screen, copied byte by byte into the run.
  // A missing or invalid PRODUCT.md never stops the flow; an invalid brief does (the user just confirmed it).
  context: {
    spec: { value: ['project', 'run', 'brief', 'values-file'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      let values = [];
      if (opts['values-file'] !== undefined) {
        try { values = readValuesFile(path.resolve(cwd, opts['values-file'])); } catch { throw new UsageError('--values-file debe ser un archivo JSON con una lista de textos'); }
      }
      const runFile = path.join(run, 'run.json');
      const info = readJson(runFile, 'run.json');

      const productFile = fs.readdirSync(project).find((n) => n.toLowerCase() === 'product.md');
      let product = { status: 'missing' };
      let productText = '';
      let line = null;
      if (!productFile) line = 'sin PRODUCT.md: se sigue sin contexto de producto';
      else {
        const v = validateProduct(readText(path.join(project, productFile), 'PRODUCT.md'), { leakValues: values });
        if (v.status === 'ok') { product = { status: 'ok', undecided: v.undecided, missing: v.missing }; productText = extractContext(v); }
        else {
          product = { status: 'invalid', problems: v.problems };
          const why = [...new Set(v.problems.map((p) => (p.line ? `${p.problem} en la línea ${p.line}` : p.problem)))].join(', ');
          line = `PRODUCT.md se ignora (${why}): se sigue sin contexto de producto`;
        }
      }

      // the brief: the one passed now, else the one an earlier call left in the run
      let briefSource = null;
      if (opts.brief !== undefined) briefSource = path.resolve(cwd, opts.brief);
      else if (info.brief) briefSource = path.join(run, info.brief);
      let brief = { status: 'none', register: null };
      let briefText = '';
      if (briefSource) {
        const raw = readText(briefSource, 'el brief');
        const b = validateBrief(raw, { leakValues: values });
        if (b.status !== 'ok') return { out: { product, brief: { status: 'invalid', register: b.register, problems: b.problems }, text: '', line }, code: 1 };
        brief = { status: 'ok', register: b.register };
        const cut = (s) => (s.length > SECTION_MAX ? `${s.slice(0, SECTION_MAX - 1)}…` : s);
        briefText = `## This screen\nFirst look: ${cut(b.firstLook)}\nDo not touch: ${cut(b.doNotTouch)}`;
      }

      if (product.status === 'ok') fs.copyFileSync(path.join(project, productFile), path.join(run, 'product.md'));
      if (opts.brief !== undefined && briefSource !== path.join(run, 'brief.md')) fs.copyFileSync(briefSource, path.join(run, 'brief.md'));
      info.product = product.status === 'ok' ? 'product.md' : null;
      if (opts.brief !== undefined) info.brief = 'brief.md';
      else if (!('brief' in info)) info.brief = null;
      fs.writeFileSync(runFile, `${JSON.stringify(portable(info, project), null, 2)}\n`);
      return { out: { product, brief, text: [productText, briefText].filter(Boolean).join('\n\n'), line }, code: 0 };
    },
  },

  // The judgment findings the user chose to fix, for the verdict reading (hito 4f, R-4f-7). Nothing is written
  // when there is none: the second reading does not run.
  'verdict-request': {
    spec: { value: ['run', 'chosen'] },
    run(opts, { cwd }) {
      const { project, run } = projectOfRun(cwd, opts);
      need(opts, 'chosen');
      if (!isDir(run)) throw new UsageError(`--run no existe: ${opts.run}`);
      const chosen = list(opts.chosen);
      if (!chosen.length) throw new UsageError('--chosen necesita al menos un id');
      const aud = readJsonIf(path.join(run, 'auditor.json'));
      if (!aud || !Array.isArray(aud.findings)) throw new UsageError('falta auditor.json en el run');
      const findings = [];
      for (const f of aud.findings) {
        if (!f || typeof f.id !== 'string' || !/^J-\d+$/.test(f.id) || !chosen.includes(f.id) || findings.some((x) => x.id === f.id)) continue;
        findings.push({ id: f.id, plain: f.plain, evidence: f.evidence });
      }
      if (!findings.length) return { out: { ok: false, error: 'no-judgment-chosen' }, code: 1 };
      const after = path.join(run, 'after');
      if (!isInsideRunRoot(project, after)) throw new UsageError('--run debe estar dentro de .pignolo-ui/runs/');
      fs.mkdirSync(after, { recursive: true });
      const ids = findings.map((f) => f.id);
      fs.writeFileSync(path.join(after, 'verdict-request.json'), `${JSON.stringify({ v: 1, ids, findings }, null, 2)}\n`);
      return { out: { ids, costLine: '≈ 0.3 USD (opus)' }, code: 0 };
    },
  },

  'auditor-check': {
    spec: { value: ['project', 'run', 'mode'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      const mode = opts.mode ?? 'findings';
      if (!['findings', 'verdict'].includes(mode)) throw new UsageError('--mode debe ser findings o verdict');
      if (mode === 'verdict') {
        // verdict mode (hito 4f): --run is the "after" folder with verdict-request.json and verdicts.json
        const requestFile = path.join(run, 'verdict-request.json');
        const verdictsFile = path.join(run, 'verdicts.json');
        if (!fs.existsSync(requestFile)) throw new UsageError('falta verdict-request.json en el run');
        if (!fs.existsSync(verdictsFile)) throw new UsageError('falta verdicts.json en el run');
        const output = readJson(verdictsFile, 'verdicts.json');
        const res = validateVerdicts({ output, request: readJson(requestFile, 'verdict-request.json'), run, project });
        const verdicts = res.ok ? output.verdicts : null;
        return { out: { ...res, verdicts }, code: res.ok ? 0 : 1 };
      }
      const file = path.join(run, 'auditor.json');
      if (!fs.existsSync(file)) throw new UsageError('falta auditor.json en el run');
      const output = readJson(file, 'auditor.json');
      const judgment = judgmentIds(loadNorms({}).base);
      const res = validateFindings({ output, run, project, catalog: loadCatalog(), judgmentIds: judgment });
      // R-4e-20: the optional one-line `keep` is printed when it is valid; the improve brief pastes it, no script decides with it.
      const keep = res.problems.some((p) => p.problem === 'bad-keep') || typeof output.keep !== 'string' ? null : output.keep;
      return { out: { ...res, keep }, code: res.ok ? 0 : 1 };
    },
  },

  // The register of this screen: the brief's `Register:` line, else DESIGN.md's pignolo.register, else unset (hito 4f).
  register: {
    spec: { value: ['project', 'brief'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      if (opts.brief !== undefined) {
        const text = readText(path.resolve(cwd, opts.brief), '--brief');
        const v = validateBrief(text);
        if (v.status !== 'ok') return { out: { ok: false, problems: v.problems }, code: 1 };
        if (v.register) return { out: { register: v.register, source: 'brief' }, code: 0 };
      }
      const designFile = findDesignFile(project);
      const fromDesign = designFile ? designRegister(fs.readFileSync(designFile, 'utf8')) : null;
      return { out: fromDesign ? { register: fromDesign, source: 'design' } : { register: 'unset', source: 'none' }, code: 0 };
    },
  },

  menu: {
    spec: { value: ['run', 'norms', 'extra-symptoms-file', 'words-file'] },
    run(opts, { cwd }) {
      need(opts, 'run');
      const run = path.resolve(cwd, opts.run);
      if (!isDir(run)) throw new UsageError(`--run no existe: ${opts.run}`);
      let dict = loadSymptoms();
      const warnings = [];
      const extras = [];
      if (opts.norms !== undefined) {
        const { user } = loadNorms({ userFile: path.resolve(cwd, opts.norms) });
        if (user && user.ok) extras.push(...(user.symptoms ?? []));
        else if (user) warnings.push(user.warning);
      }
      if (opts['extra-symptoms-file'] !== undefined) {
        const more = readJson(path.resolve(cwd, opts['extra-symptoms-file']), '--extra-symptoms-file');
        if (Array.isArray(more)) extras.push(...more); else warnings.push('síntomas extra ignorados: debe ser una lista');
      }
      if (extras.length) {
        try { dict = mergeUserSymptoms(dict, extras); } catch (e) { warnings.push(`síntomas del autor ignorados: ${e.message}`); }
      }
      const failed = new Set();
      for (const name of ['ui-check.json', 'browser.json']) {
        const j = readJsonIf(path.join(run, name));
        for (const e of (j && Array.isArray(j.entries) ? j.entries : [])) if (e.status === 'fail') failed.add(e.id);
      }
      // only the findings auditor-check kept pre-tick a symptom
      const aud = readJsonIf(path.join(run, 'auditor.json'));
      if (aud && Array.isArray(aud.findings)) {
        const { project } = projectOfRun(cwd, opts);
        const check = validateFindings({ output: aud, run, project, catalog: loadCatalog(), judgmentIds: judgmentIds(loadNorms({}).base) });
        const dropped = new Set(check.problems.filter((p) => p.problem !== 'bad-keep').map((p) => p.index));
        if (!dropped.has(-1)) aud.findings.forEach((f, i) => { if (!dropped.has(i) && f && typeof f.id === 'string') failed.add(f.id); });
      }
      const out = { menu: buildMenu({ symptoms: dict.symptoms, failedIds: [...failed] }) };
      if (opts['words-file'] !== undefined) {
        out.matched = matchWords(fs.readFileSync(path.resolve(cwd, opts['words-file']), 'utf8'), dict.symptoms);
      }
      if (warnings.length) out.warning = warnings.join('; ');
      return { out, code: 0 };
    },
  },

  'report-skeleton': {
    spec: { value: ['project', 'run', 'implements'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      let out;
      try { out = reportSkeleton({ project, run, implementsPath: opts.implements }); } catch (e) { throw new UsageError(`no se pudo armar el esqueleto: ${e.message}`); }
      return { out, code: 0 };
    },
  },

  'option-model': {
    spec: { value: ['profile'] },
    run(opts) {
      return { out: optionModel(opts.profile), code: 0 };
    },
  },

  'report-line': {
    spec: { value: ['facts'] },
    run(opts, { cwd }) {
      need(opts, 'facts');
      const facts = readJson(path.resolve(cwd, opts.facts), '--facts');
      try { return { out: { line: firstLine(facts) }, code: 0 }; } catch (e) { throw new UsageError(e.message); }
    },
  },

  verdict: {
    spec: { value: ['project', 'run', 'build-ok'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      const ui = readJsonIf(path.join(run, 'ui-check.json'));
      let uiCheck = null;
      if (ui && Array.isArray(ui.entries)) {
        const blockingNew = ui.entries.filter((e) => e.status === 'fail' && e.severity === 'bloquea' && e.scope === 'new').length;
        uiCheck = { exitCode: blockingNew > 0 ? 1 : 0, blockingNew };
        const stale = staleInput(project, ui);
        if (stale) uiCheck.stale = `${stale} cambió después del chequeo`;
      }
      let reportCheck = null;
      const reportFile = path.join(run, 'report.json');
      if (fs.existsSync(reportFile)) {
        try {
          const r = checkReport({ project, run, report: JSON.parse(fs.readFileSync(reportFile, 'utf8')) });
          reportCheck = { exitCode: r.exitCode, retired: r.retired };
        } catch (e) {
          if (!(e instanceof ReportError) && !(e instanceof SyntaxError)) throw e;
          reportCheck = { exitCode: 2, retired: [], reason: e.message };
        }
      }
      let build = { ran: false, declared: declaresBuild(project) };
      if (opts['build-ok'] !== undefined) build = { ran: true, ok: yesNo(opts['build-ok'], 'build-ok') };
      const res = verdict({ uiCheck, reportCheck, build });
      return { out: res, code: res.status === 'terminado' ? 0 : 1 };
    },
  },

  'compare-html': {
    spec: { value: ['run', 'platform', 'screens', 'kind'], flags: ['no-open'] },
    run(opts, { cwd }) {
      need(opts, 'run', 'platform', 'screens');
      const run = path.resolve(cwd, opts.run);
      if (!isDir(run)) throw new UsageError(`--run no existe: ${opts.run}`);
      const linked = runLinkProblem(run);
      if (linked) throw new UsageError(`${path.basename(linked)} es un enlace: se rechaza`);
      if (!['desktop', 'mobile', 'both'].includes(opts.platform)) throw new UsageError('--platform debe ser desktop, mobile o both');
      const kind = kindOf(opts);
      const screens = list(opts.screens);
      const prefix = `${kind}-`;
      const ids = fs.readdirSync(run, { withFileTypes: true })
        .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && e.name.startsWith(prefix) && LETTER.test(e.name.slice(prefix.length)))
        .map((e) => e.name.slice(prefix.length)).sort();
      if (!ids.length) throw new UsageError(`no hay carpetas ${prefix}<letra> en el run`);
      // the frames open copies without the Google Fonts <link> (A4C2-03): the backup asks for nothing
      let copies;
      try { copies = writeLocalCopies({ run, folders: ids.map((id) => `${prefix}${id}`) }); } catch (e) {
        if (e instanceof LocalCopyError) return { out: { ok: false, error: e.message }, code: 1 };
        throw e;
      }
      const html = buildCompareHtml({ options: ids.map((id) => ({ id, screens })), kind, platform: opts.platform, title: 'Comparación de opciones' });
      const out = path.join(run, 'compare.html');
      if (isLink(out)) throw new UsageError('compare.html es un enlace: se rechaza');
      fs.writeFileSync(out, html);
      let opened = false;
      if (!opts['no-open']) { openFile(out, {}); opened = true; }
      return { out: { out, opened, fontsRemoved: copies.removed, line: `fuentes remotas quitadas: ${copies.removed}` }, code: 0 };
    },
  },
};

async function configCommand(argv, { cwd }) {
  const [sub, ...rest] = argv;
  if (!['get', 'set'].includes(sub)) throw new UsageError('config necesita get o set');
  const opts = parse(rest, { value: ['data', 'project', 'key', 'value'] });
  need(opts, 'data');
  const project = projectDir(cwd, opts);
  const data = path.resolve(cwd, opts.data);
  if (sub === 'get') {
    const { repoId, file, config } = readConfig({ data, project });
    return { out: { repoId, file, config }, code: 0 };
  }
  need(opts, 'key', 'value');
  let value = opts.value;
  if (opts.key === 'routes') value = list(opts.value);
  const { repoId, file, config } = writeConfig({ data, project, key: opts.key, value });
  return { out: { repoId, file, config }, code: 0 };
}

// Subcommands the CLI accepts; the skill tests check every call of a skill against this list.
export const SUBCOMMANDS = ['config', ...Object.keys(COMMANDS)];

export async function main(argv, { cwd = process.cwd(), stdout = process.stdout } = {}) {
  try {
    const [name, ...rest] = argv;
    let result;
    if (name === 'config') result = await configCommand(rest, { cwd });
    else {
      const cmd = COMMANDS[name];
      if (!cmd) throw new UsageError(`falta el subcomando: ${SUBCOMMANDS.join(' | ')}`);
      result = await cmd.run(parse(rest, cmd.spec), { cwd });
    }
    stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
    return result.code;
  } catch (e) {
    const known = e instanceof UsageError || e instanceof ConfigError;
    process.stderr.write(`run: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
