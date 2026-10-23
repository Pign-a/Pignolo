// audit.mjs: thin CLI over lib/ for what the audit would otherwise assert by itself. Every subcommand
// prints ONE JSON object on stdout; exit 0 done, 1 finding, 2 usage or own error. JSON input always
// comes from a file, never inline.
//
//   audit.mjs env [--claude-min <x.y.z>]
//   audit.mjs init --project <repo> --command audit --slug <slug> [--now <ISO>] [--url <local URL> | --file <path>] [--files <a,b>]
//   audit.mjs config get|set --data <dir> --project <repo> [--key <k> --value <v>]
//   audit.mjs norms --run <run> [--norms <norms.md>]
//   audit.mjs check --project <repo> --run <run> [--files <a,b>] [--design <design.md>] [--base <ref>] [--url <local URL>] [--before <ui-check.json>]
//   audit.mjs auditor-check --project <repo> --run <run>
//   audit.mjs report-skeleton --project <repo> --run <run>
//   audit.mjs report-line --facts <json file>
//
// The measures live in their own scripts: browser.mjs (measure | capture | dom), ui-check.mjs,
// report-check.mjs and design-md.mjs (validate). Nothing here publishes anything.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isLoopbackUrl } from '../lib/site-fetch.mjs';
import { envReport } from '../lib/env-check.mjs';
import { initRun } from '../lib/run-init.mjs';
import { readConfig, writeConfig, ConfigError } from '../lib/project-config.mjs';
import { loadNorms, extract, judgmentIds } from '../lib/norms.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { validateFindings } from '../lib/auditor-output.mjs';
import { firstLine, reportSkeleton } from '../lib/report-build.mjs';
import { RUN_ROOT } from '../lib/run-folder.mjs';

class UsageError extends Error {}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---- argument parsing -------------------------------------------------------------------

function parse(argv, spec) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (!spec.value.includes(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: ${spec.value.map((k) => `--${k}`).join(', ')}`);
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
      // the optional one-line `keep` is printed when it is valid; no script decides with it.
      const keep = res.problems.some((p) => p.problem === 'bad-keep') || typeof output.keep !== 'string' ? null : output.keep;
      return { out: { ...res, keep }, code: res.ok ? 0 : 1 };
    },
  },

  'report-skeleton': {
    spec: { value: ['project', 'run'] },
    run(opts, { cwd }) {
      const project = projectDir(cwd, opts);
      const run = runDirOf(cwd, project, opts);
      let out;
      try { out = reportSkeleton({ project, run }); } catch (e) { throw new UsageError(`no se pudo armar el esqueleto: ${e.message}`); }
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
    process.stderr.write(`audit: ${known ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
