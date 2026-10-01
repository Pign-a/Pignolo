// run.mjs: thin CLI over lib/ for what the skills would otherwise assert by themselves (spec §3.2,
// §7, §8, §12). Every subcommand prints ONE JSON object on stdout; exit 0 done, 1 refusal or
// finding, 2 usage or own error. JSON input always comes from a file, never inline.
//
//   run.mjs env [--claude-min <x.y.z>]
//   run.mjs init --project <repo> --command new|improve|audit --slug <slug> [--now <ISO>] [--url <local URL> | --file <path>] [--files <a,b>]
//   run.mjs config get|set --data <dir> --project <repo> [--key <k> --value <v>]
//   run.mjs present --data <dir> --project <repo> --presentation auto|local --artifact yes|no --design-type yes|no
//   run.mjs norms --run <run> [--norms <norms.md>]
//   run.mjs check --project <repo> --run <run> [--files <a,b>] [--design <DESIGN.md>] [--base <ref>] [--url <local URL>] [--before <ui-check.json>]
//   run.mjs leak-values --project <repo> --out <file> [--email <mail>]
//   run.mjs git-state --project <repo> --out <file>
//   run.mjs options-check --project <repo> --run <run> --option <A|B|C> [--kind option|direction] --expected <a.html,b.html> --git-before <file>
//   run.mjs discard --run <run> --option <A|B|C> [--kind option|direction]
//   run.mjs auditor-check --project <repo> --run <run>
//   run.mjs menu --run <run> [--norms <file>] [--extra-symptoms-file <json>] [--words-file <txt>]
//   run.mjs report-skeleton --project <repo> --run <run> [--implements <design/approved/flow>]
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
import { readConfig, writeConfig, ConfigError } from '../lib/project-config.mjs';
import { decidePresentation } from '../lib/presentation.mjs';
import { loadNorms, extract, judgmentIds } from '../lib/norms.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { loadSymptoms, mergeUserSymptoms, buildMenu, matchWords } from '../lib/symptoms.mjs';
import { collectLeakValues } from '../lib/leak-values.mjs';
import { gitState, checkOption } from '../lib/option-check.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { findDesignFile } from '../lib/approved.mjs';
import { validateFindings } from '../lib/auditor-output.mjs';
import { firstLine, reportSkeleton, verdict } from '../lib/report-build.mjs';
import { checkReport, ReportError } from '../lib/report-check.mjs';
import crypto from 'node:crypto';
import { isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { buildCompareHtml, openFile } from '../lib/compare-html.mjs';

class UsageError extends Error {}

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

  present: {
    spec: { value: ['data', 'project', 'presentation', 'artifact', 'design-type'] },
    run(opts, { cwd }) {
      need(opts, 'data', 'presentation', 'artifact', 'design-type');
      const project = projectDir(cwd, opts);
      if (!['auto', 'local'].includes(opts.presentation)) throw new UsageError('--presentation debe ser auto o local');
      const { config } = readConfig({ data: path.resolve(cwd, opts.data), project });
      const out = decidePresentation({
        presentation: opts.presentation,
        artifact: yesNo(opts.artifact, 'artifact'),
        designType: yesNo(opts['design-type'], 'design-type'),
        canvasConsent: config.canvasConsent,
      });
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
    spec: { value: ['project', 'out', 'email'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      need(opts, 'out');
      const values = collectLeakValues({ project, email: opts.email });
      const out = path.resolve(cwd, opts.out);
      fs.writeFileSync(out, `${JSON.stringify(values)}\n`);
      return { out: { out, count: values.length }, code: 0 };
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
    spec: { value: ['project', 'run', 'option', 'kind', 'expected', 'git-before'] },
    async run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      const kind = kindOf(opts);
      const letter = optionLetter(opts);
      need(opts, 'expected', 'git-before');
      const expected = list(opts.expected);
      let gitBefore;
      try { gitBefore = fs.readFileSync(path.resolve(cwd, opts['git-before']), 'utf8'); } catch (e) { throw new UsageError(`no se pudo leer --git-before (${e.code || e.message})`); }
      const dir = path.join(run, `${kind}-${letter}`);
      const result = checkOption({ dir, expected, project, gitBefore, ignoreUnder: [`${RUN_ROOT}/`] });
      const files = isDir(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => path.join(dir, f)) : [];
      let contradicted = [];
      if (files.length) {
        const designFile = findDesignFile(project);
        const checked = await runCheck({ project, files, design: designFile });
        contradicted = [...new Set(checked.entries.filter((e) => e.status === 'fail').map((e) => e.id))];
      }
      return { out: { ok: result.ok, problems: result.problems, contradicted }, code: result.ok ? 0 : 1 };
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

  'auditor-check': {
    spec: { value: ['project', 'run'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      const file = path.join(run, 'auditor.json');
      if (!fs.existsSync(file)) throw new UsageError('falta auditor.json en el run');
      const output = readJson(file, 'auditor.json');
      const judgment = judgmentIds(loadNorms({}).base);
      const res = validateFindings({ output, run, project, catalog: loadCatalog(), judgmentIds: judgment });
      return { out: res, code: res.ok ? 0 : 1 };
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
        const dropped = new Set(check.problems.map((p) => p.index));
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
      if (!['desktop', 'mobile', 'both'].includes(opts.platform)) throw new UsageError('--platform debe ser desktop, mobile o both');
      const kind = kindOf(opts);
      const screens = list(opts.screens);
      const prefix = `${kind}-`;
      const ids = fs.readdirSync(run, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith(prefix) && LETTER.test(e.name.slice(prefix.length)))
        .map((e) => e.name.slice(prefix.length)).sort();
      if (!ids.length) throw new UsageError(`no hay carpetas ${prefix}<letra> en el run`);
      const html = buildCompareHtml({ options: ids.map((id) => ({ id, screens })), kind, platform: opts.platform, title: 'Comparación de opciones' });
      const out = path.join(run, 'compare.html');
      fs.writeFileSync(out, html);
      let opened = false;
      if (!opts['no-open']) { openFile(out, {}); opened = true; }
      return { out: { out, opened }, code: 0 };
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
  if (opts.key === 'canvasConsent') value = opts.value === 'true' ? true : opts.value === 'false' ? false : opts.value;
  else if (opts.key === 'routes') value = list(opts.value);
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
