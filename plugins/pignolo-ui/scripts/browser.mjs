// browser.mjs: CDP driver over --remote-debugging-pipe (spec §11). Run only by the main thread.
//
// node <root>/scripts/browser.mjs <capture|measure|dom> --project <repo> --run <folder in .pignolo-ui/runs/>
//   (--url <local URL> | --file <HTML file in the project>) [--design <DESIGN.md>]
//   [--platform desktop|mobile|both] [--dark] [--before <browser.json>]
//
// --url accepts only localhost, 127.0.0.0/8 and [::1] (nothing remote at run time, spec §0);
// the browser is the installed Chrome or Edge (PIGNOLO_UI_BROWSER forces the path).
// Widths and themes (§11.3) come from --platform/--dark, else from DESIGN.md and the project CSS.
//   capture  <run>/captures/<width>-<theme>-<n>.png (viewport crops, at most 3 per width) and
//            <run>/captures.json { version, browser, url, finalUrl, degraded, cleanup, captures, unverified }
//   measure  <run>/browser.json { version, browser, url, finalUrl, degraded, cleanup, plan, entries } with
//            B1-B4 as entries of the ui-check shape; --before makes its fails debt.
//   dom      <run>/dom-<width>.html (rendered DOM, for ui-check --dom) and <run>/dom.json
// cleanup = { graceful, killed, profileRemoved, profile } (null without a browser); a profile that
// could not be removed is also printed as leftoverProfile. Ctrl+C (SIGINT) or SIGTERM kills the
// browser, tries to remove the profile and prints { interrupted, cleanup, leftoverProfile? }.
// Prints { out, degraded, ... } on stdout. Exit codes: 0 done (what could not be measured is
// `unverified`, never a pass); 1 measure found a new `bloquea`; 2 usage or own error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureRunRoot, isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { isLoopbackUrl } from '../lib/site-fetch.mjs';
import { findBrowser } from '../lib/browser-find.mjs';
import { openBrowser, BrowserUnavailable } from '../lib/browser-session.mjs';
import { shotPlan, planFromProject } from '../lib/shot-plan.mjs';
import { measurePage, capturePage, dumpDom } from '../lib/browser-run.mjs';

class UsageError extends Error {}
const COMMANDS = ['capture', 'measure', 'dom'];
const VALUE_OPTS = new Set(['project', 'run', 'url', 'file', 'design', 'platform', 'before']);
const FLAGS = new Set(['dark']);

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new UsageError(`falta el subcomando: ${COMMANDS.join(' | ')}`);
  const opts = { command };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (FLAGS.has(key)) { opts[key] = true; continue; }
    if (!VALUE_OPTS.has(key)) throw new UsageError(`opción desconocida ${a}; opciones válidas: ${[...VALUE_OPTS, ...FLAGS].map((k) => `--${k}`).join(', ')}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    if (opts[key] !== undefined) throw new UsageError(`--${key} se indicó más de una vez`);
    opts[key] = next;
    i++;
  }
  return opts;
}

const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

function pageUrl(opts, project, cwd) {
  if ((opts.url === undefined) === (opts.file === undefined)) throw new UsageError('indicá --url o --file (uno de los dos)');
  if (opts.url !== undefined) {
    if (!isLoopbackUrl(opts.url)) throw new UsageError(`--url solo acepta direcciones locales (localhost, 127.0.0.1, ::1): ${opts.url}`);
    return opts.url;
  }
  const file = path.resolve(cwd, opts.file);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new UsageError(`--file no existe o no es un archivo: ${opts.file}`);
  if (!inside(project, file)) throw new UsageError(`--file está fuera del proyecto: ${opts.file}`);
  return pathToFileURL(file).href;
}

function readBefore(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!json || !Array.isArray(json.entries)) throw new Error('no entries');
    return json;
  } catch (e) {
    throw new UsageError(`--before no es un browser.json legible: ${file} (${e.code || e.message})`);
  }
}

// SIGINT/SIGTERM: kill the browser tree, remove the profile and say what is left (never prune).
// current() -> the open browser or null. Returns { dispose, settled } (settled: the handler's last run).
export function watchSignals({ proc = process, current, stdout = process.stdout, exit = (code) => process.exit(code) }) {
  const guard = { settled: null, dispose: () => { proc.off('SIGINT', onInt); proc.off('SIGTERM', onTerm); } };
  const handle = (signal, code) => {
    guard.settled = (async () => {
      const browser = current();
      const cleanup = browser ? { ...(await browser.close({ graceful: false })), profile: browser.profile } : null;
      const leftover = cleanup && !cleanup.profileRemoved ? { leftoverProfile: cleanup.profile } : {};
      stdout.write(`${JSON.stringify({ interrupted: signal, cleanup, ...leftover }, null, 2)}\n`);
      exit(code);
    })();
  };
  const onInt = () => handle('SIGINT', 130);
  const onTerm = () => handle('SIGTERM', 143);
  proc.on('SIGINT', onInt);
  proc.on('SIGTERM', onTerm);
  return guard;
}

// browserOptions: extra options for openBrowser (tests); stdout: where the result is printed.
export async function main(argv, { cwd = process.cwd(), env = process.env, browserOptions = {}, stdout = process.stdout, proc = process } = {}) {
  let signals = null;
  try {
    const opts = parseArgs(argv);
    if (opts.project === undefined) throw new UsageError('falta --project <raíz del repo>');
    const project = path.resolve(cwd, opts.project);
    if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) throw new UsageError(`--project no es una carpeta existente: ${opts.project}`);
    if (opts.run === undefined) throw new UsageError(`falta --run <carpeta de la corrida dentro de ${RUN_ROOT}/runs/>`);
    const run = path.resolve(cwd, opts.run);
    if (!isInsideRunRoot(project, run) || !inside(path.join(project, RUN_ROOT, 'runs'), run)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/runs/ del proyecto`);
    const url = pageUrl(opts, project, cwd);
    const design = opts.design !== undefined ? path.resolve(cwd, opts.design) : null;
    if (design && !fs.existsSync(design)) throw new UsageError(`--design no existe: ${opts.design}`);
    if (opts.platform !== undefined && !['desktop', 'mobile', 'both'].includes(opts.platform)) throw new UsageError('--platform debe ser desktop, mobile o both');
    const fromProject = planFromProject({ project, design });
    const plan = shotPlan({ platform: opts.platform ?? fromProject.platform, dark: opts.dark === true || fromProject.dark });
    const before = opts.before !== undefined ? readBefore(path.resolve(cwd, opts.before)) : null;
    if (before && opts.command !== 'measure') throw new UsageError('--before solo vale con measure');

    const found = findBrowser({ env });
    // cleanup of the browser (§11.1) goes into the JSON: a profile that could not be removed is
    // said, with its path, instead of staying behind in silence.
    let cleanup = null;
    let current = null;
    signals = watchSignals({ proc, current: () => current, stdout });
    const open = async (fn) => {
      if (!found.path) throw new BrowserUnavailable(`no browser: ${found.reason}`);
      let browser;
      try {
        browser = await openBrowser({ executable: found.path, ...browserOptions });
      } catch (e) {
        // A browser that did not start still had a profile: say whether it could be removed.
        if (e instanceof BrowserUnavailable && e.cleanup) cleanup = { ...e.cleanup, profile: e.profile };
        throw e;
      }
      current = browser;
      try {
        return await fn(browser);
      } finally {
        cleanup = { ...(await browser.close()), profile: browser.profile };
        current = null;
      }
    };

    ensureRunRoot(project); // .pignolo-ui/.gitignore before the first write (spec §3.2)
    fs.mkdirSync(run, { recursive: true });
    const head = { version: 1 };
    let out;
    let summary;
    let exitCode = 0;
    if (opts.command === 'measure') {
      const r = await measurePage({ url, plan, open, before, page: opts.file !== undefined ? path.relative(project, path.resolve(cwd, opts.file)).split(path.sep).join('/') : undefined });
      out = path.join(run, 'browser.json');
      fs.writeFileSync(out, `${JSON.stringify({ ...head, browser: r.browser, url, finalUrl: r.finalUrl, degraded: r.degraded, cleanup, plan, entries: r.entries }, null, 2)}\n`);
      const count = (s) => r.entries.filter((e) => e.status === s).length;
      const blockingNew = r.entries.filter((e) => e.status === 'fail' && e.severity === 'bloquea' && e.scope === 'new').length;
      exitCode = blockingNew ? 1 : 0;
      summary = { counts: { pass: count('pass'), fail: count('fail'), unverified: count('unverified'), blockingNew } };
    } else if (opts.command === 'capture') {
      const r = await capturePage({ url, plan, open, outDir: path.join(run, 'captures') });
      out = path.join(run, 'captures.json');
      fs.writeFileSync(out, `${JSON.stringify({ ...head, browser: r.browser, url, finalUrl: r.finalUrl, degraded: r.degraded, cleanup, captures: r.captures, unverified: r.unverified }, null, 2)}\n`);
      summary = { captures: r.captures.length, unverified: r.unverified.length };
    } else {
      const r = await dumpDom({ url, plan, open, outDir: run });
      out = path.join(run, 'dom.json');
      fs.writeFileSync(out, `${JSON.stringify({ ...head, browser: r.browser, url, finalUrl: r.finalUrl, degraded: r.degraded, cleanup, doms: r.doms, unverified: r.unverified }, null, 2)}\n`);
      summary = { doms: r.doms.map((d) => d.path), unverified: r.unverified.length };
    }
    const degraded = JSON.parse(fs.readFileSync(out, 'utf8')).degraded ?? null;
    const leftover = cleanup && !cleanup.profileRemoved ? { leftoverProfile: cleanup.profile } : {};
    stdout.write(`${JSON.stringify({ out, degraded, ...leftover, ...summary, exitCode }, null, 2)}\n`);
    return exitCode;
  } catch (e) {
    process.stderr.write(`browser: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  } finally {
    signals?.dispose();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
