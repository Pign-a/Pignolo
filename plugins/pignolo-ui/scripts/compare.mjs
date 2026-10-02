// compare.mjs: structural fingerprints and differences (spec §7.5, A-18). Informative: a
// difference never makes the exit code 1.
//
//   node <root>/scripts/compare.mjs fingerprint --kind mockup|tile (--file <html in project> | --url <local URL>) --out <json> [--project <repo>]
//   node <root>/scripts/compare.mjs distance --a <fp.json> --b <fp.json>
//   node <root>/scripts/compare.mjs options --run <run> --kind mockup|tile --main <screen.html> [--second-round]
//   node <root>/scripts/compare.mjs approved --project <repo> --approved <design/approved/flow> --map <json file> --run <run>
//   node <root>/scripts/compare.mjs heights --run <run> --kind mockup --screens <a.html,b.html> --options <A,B> --platform desktop|mobile|both --out <json inside the run>
//     the real height of each screen at the width of its row, read from the copies in <run>/local/; { "<X>/<screen>@<width>": px }
//
// mockup fingerprints need the browser (one per command, signals handled like browser.mjs); without
// one the result is { unverified: <reason> } with exit 0. Exit 0 done, 2 usage or own error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isLoopbackUrl } from '../lib/site-fetch.mjs';
import { findBrowser } from '../lib/browser-find.mjs';
import { BrowserUnavailable, PageLoadError } from '../lib/browser-session.mjs';
import { isInsideRunRoot, RUN_ROOT } from '../lib/run-folder.mjs';
import { APPROVED_PATH } from '../lib/approved.mjs';
import { createOpener, watchSignals } from './browser.mjs';
import { preflight } from '../lib/browser-run.mjs';
import { fingerprintPage, FINGERPRINT_WIDTH, FINGERPRINT_HEIGHT } from '../lib/fingerprint-page.mjs';
import { mockupDistance, tileDistance, tileFingerprint, pairwise, samePrimary } from '../lib/fingerprint.mjs';
import { writeLocalCopies, pagesToOpen, LocalCopyError } from '../lib/local-copy.mjs';
import { measureHeight, clampHeight } from '../lib/page-height.mjs';
import { sizesFor } from '../lib/canvas.mjs';
import { isLink, runLinkProblem } from '../lib/link-guard.mjs';

class UsageError extends Error {}

const ALLOWED = {
  fingerprint: { value: ['kind', 'file', 'url', 'out', 'project'], flags: [] },
  distance: { value: ['a', 'b'], flags: [] },
  options: { value: ['run', 'kind', 'main'], flags: ['second-round'] },
  approved: { value: ['project', 'approved', 'map', 'run'], flags: [] },
  heights: { value: ['run', 'kind', 'screens', 'options', 'platform', 'out'], flags: [] },
};

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const spec = ALLOWED[cmd];
  if (!spec) throw new UsageError(`falta el subcomando: ${Object.keys(ALLOWED).join(' | ')}`);
  const opts = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new UsageError(`argumento inesperado: ${a}`);
    const key = a.slice(2);
    if (spec.flags.includes(key)) { opts[key] = true; continue; }
    if (!spec.value.includes(key)) throw new UsageError(`opción desconocida ${a} para ${cmd}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} necesita un valor`);
    opts[key] = next;
    i++;
  }
  return opts;
}

const need = (opts, ...keys) => { for (const k of keys) if (opts[k] === undefined) throw new UsageError(`falta --${k}`); };
const readJson = (file, what) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`no se pudo leer ${what}: ${file} (${e.code || e.message})`); }
};
const insideDir = (root, p) => {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

// Source of a page: a local URL or a file inside the project.
function pageSource(project, { file, url }) {
  if ((file === undefined) === (url === undefined)) throw new UsageError('indicá --file o --url (uno de los dos)');
  if (url !== undefined) {
    if (!isLoopbackUrl(url)) throw new UsageError(`--url solo acepta direcciones locales (localhost, 127.0.0.1, ::1): ${url}`);
    return { url, file: null };
  }
  const abs = path.resolve(project, file);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new UsageError(`--file no existe o no es un archivo: ${file}`);
  if (!insideDir(project, abs)) throw new UsageError(`--file está fuera del proyecto: ${file}`);
  return { url: pathToFileURL(abs).href, file: abs };
}

// Runs fn(takeFingerprint) with one browser; returns { unverified } when there is none.
async function withPageFingerprints({ env, browserOptions, stdout, proc }, fn) {
  const found = findBrowser({ env });
  const opener = createOpener({ found, browserOptions });
  const signals = watchSignals({ proc, current: () => opener.state.current, stdout });
  try {
    const result = await opener.open(async (browser) => {
      // viewport: { width, height } of the page; the fingerprints keep their own
      const take = async (url, viewport = { width: FINGERPRINT_WIDTH, height: FINGERPRINT_HEIGHT }, measure = fingerprintPage) => {
        const down = await preflight(url);
        if (down) return { unverified: `la página no cargó: ${down}` };
        const page = await browser.newPage();
        try {
          await page.setViewport(viewport);
          await page.setMedia({ theme: 'light' });
          await page.navigate(url);
          await page.waitReady();
          return await measure(page);
        } catch (e) {
          if (e instanceof PageLoadError) return { unverified: `la página no cargó: ${e.message}` };
          throw e;
        }
      };
      return fn(take);
    });
    return { result, cleanup: opener.state.cleanup };
  } catch (e) {
    if (e instanceof BrowserUnavailable) return { unverified: e.message, cleanup: opener.state.cleanup };
    throw e;
  } finally {
    signals.dispose();
  }
}

const cleanupInfo = (cleanup) => {
  if (!cleanup) return { cleanup: null };
  return { cleanup, ...(cleanup.profileRemoved ? {} : { leftoverProfile: cleanup.profile }) };
};

function print(stdout, obj) { stdout.write(`${JSON.stringify(obj, null, 2)}\n`); }

async function cmdFingerprint(opts, ctx) {
  need(opts, 'kind', 'out');
  if (!['mockup', 'tile'].includes(opts.kind)) throw new UsageError('--kind debe ser mockup o tile');
  const project = path.resolve(ctx.cwd, opts.project ?? '.');
  const src = pageSource(project, opts);
  const out = path.resolve(ctx.cwd, opts.out);
  if (opts.kind === 'tile') {
    if (!src.file) throw new UsageError('un style tile se lee de un archivo: usá --file');
    const fp = tileFingerprint(fs.readFileSync(src.file, 'utf8'));
    fs.writeFileSync(out, `${JSON.stringify(fp, null, 2)}\n`);
    print(ctx.stdout, { out, fingerprint: fp });
    return 0;
  }
  const r = await withPageFingerprints(ctx, (take) => take(src.url));
  const value = r.result ?? { unverified: r.unverified };
  fs.writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`);
  print(ctx.stdout, { out, ...(value.unverified ? { unverified: value.unverified } : { fingerprint: value }), ...cleanupInfo(r.cleanup) });
  return 0;
}

function cmdDistance(opts, ctx) {
  need(opts, 'a', 'b');
  const a = readJson(path.resolve(ctx.cwd, opts.a), '--a');
  const b = readJson(path.resolve(ctx.cwd, opts.b), '--b');
  if (a.unverified || b.unverified) { print(ctx.stdout, { unverified: a.unverified || b.unverified }); return 0; }
  if (a.kind !== b.kind) throw new UsageError('las dos huellas deben ser del mismo tipo (mockup o tile)');
  print(ctx.stdout, a.kind === 'tile' ? tileDistance(a, b) : mockupDistance(a, b));
  return 0;
}

function optionDirs(run, kind) {
  const prefix = kind === 'tile' ? 'direction-' : 'option-';
  const dirs = {};
  for (const e of fs.readdirSync(run, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith(prefix)) dirs[e.name.slice(prefix.length).toUpperCase()] = path.join(run, e.name);
  }
  return dirs;
}

// The fingerprints open COPIES without the Google Fonts <link> (A4C2-03): the browser never asks for a
// remote font. Returns { <letter>: <path under <run>/local/> }.
export function localOptionFiles({ run, dirs, letters, main }) {
  const folders = letters.map((l) => path.basename(dirs[l]));
  for (const l of letters) if (!fs.existsSync(path.join(dirs[l], main))) throw new UsageError(`falta ${main} en la opción ${l}`);
  try { writeLocalCopies({ run, folders }); } catch (e) {
    if (e instanceof LocalCopyError) throw new UsageError(e.message);
    throw e;
  }
  const files = {};
  letters.forEach((l, i) => { files[l] = pagesToOpen({ run, folders: [folders[i]], screens: [main] })[0]; });
  return files;
}

async function cmdOptions(opts, ctx) {
  need(opts, 'run', 'kind', 'main');
  if (!['mockup', 'tile'].includes(opts.kind)) throw new UsageError('--kind debe ser mockup o tile');
  const run = path.resolve(ctx.cwd, opts.run);
  if (!fs.existsSync(run)) throw new UsageError(`--run no existe: ${opts.run}`);
  const dirs = optionDirs(run, opts.kind);
  const letters = Object.keys(dirs).sort();
  if (letters.length < 2) throw new UsageError('hacen falta al menos dos opciones para comparar');
  const files = localOptionFiles({ run, dirs, letters, main: opts.main });
  let fps = {};
  let cleanup = null;
  let unverified = null;
  if (opts.kind === 'tile') {
    for (const l of letters) fps[l] = tileFingerprint(fs.readFileSync(files[l], 'utf8'));
  } else {
    const r = await withPageFingerprints(ctx, async (take) => {
      const got = {};
      for (const l of letters) got[l] = await take(pathToFileURL(files[l]).href);
      return got;
    });
    cleanup = r.cleanup;
    if (r.result) {
      fps = r.result;
      const bad = Object.values(fps).find((f) => f.unverified);
      if (bad) unverified = bad.unverified;
    } else unverified = r.unverified;
  }
  if (unverified) {
    print(ctx.stdout, { pairs: [], regenerate: null, warn: [], unverified, ...cleanupInfo(cleanup) });
    return 0;
  }
  const pairs = pairwise(fps, opts.kind === 'tile' ? tileDistance : mockupDistance);
  const same = pairs.filter((p) => p.coincide);
  let regenerate = null;
  const warn = [];
  if (same.length) {
    const best = opts.kind === 'tile' ? same[0] : same.reduce((m, p) => (p.distance < m.distance ? p : m));
    if (opts['second-round']) warn.push(...same.map((p) => `${p.a} y ${p.b} son muy parecidas`));
    else regenerate = [best.a, best.b].sort()[1];
  }
  print(ctx.stdout, { pairs, regenerate, warn, ...cleanupInfo(cleanup) });
  return 0;
}

// The real height of each screen at the width of its row. The browser opens the COPIES without remote font links.
async function cmdHeights(opts, ctx) {
  need(opts, 'run', 'kind', 'screens', 'options', 'platform', 'out');
  if (opts.kind !== 'mockup') throw new UsageError('--kind debe ser mockup: solo las opciones de mockup van al lienzo');
  const run = path.resolve(ctx.cwd, opts.run);
  if (!fs.existsSync(run) || !fs.statSync(run).isDirectory()) throw new UsageError(`--run no existe: ${opts.run}`);
  const screens = opts.screens.split(',').map((x) => x.trim()).filter(Boolean);
  const letters = opts.options.split(',').map((x) => x.trim()).filter(Boolean);
  if (!screens.length || !screens.every((x) => /^[a-z0-9][a-z0-9-]*\.html$/.test(x))) throw new UsageError('--screens debe listar pantallas como inicio.html');
  if (!letters.length || !letters.every((x) => /^[A-Z]$/.test(x))) throw new UsageError('--options debe listar letras mayúsculas (A,B,C)');
  let sizes;
  try { sizes = sizesFor(opts.platform); } catch { throw new UsageError('--platform debe ser desktop, mobile o both'); }
  const out = path.resolve(ctx.cwd, opts.out);
  if (!insideDir(run, out)) throw new UsageError('--out debe estar dentro de la carpeta de la corrida');
  if (isLink(out)) throw new UsageError('--out es un enlace: se rechaza');
  // the real folder of --out must be inside the real run: a junction or a symlink in between takes the write outside
  if (runLinkProblem(run)) throw new UsageError('--run es o está dentro de un enlace: se rechaza');
  let realRun;
  let realOutDir;
  try { realRun = fs.realpathSync.native(run); realOutDir = fs.realpathSync.native(path.dirname(out)); } catch { throw new UsageError('la carpeta de --out no existe'); }
  const rel = path.relative(realRun, realOutDir);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new UsageError('--out pasa por un enlace que sale de la corrida: se rechaza');
  const folders = letters.map((l) => `option-${l}`);
  for (const l of letters) for (const sc of screens) if (!fs.existsSync(path.join(run, `option-${l}`, sc))) throw new UsageError(`falta ${sc} en la opción ${l}`);
  try { writeLocalCopies({ run, folders }); } catch (e) {
    if (e instanceof LocalCopyError) throw new UsageError(e.message);
    throw e;
  }
  const opened = [];
  const r = await withPageFingerprints(ctx, async (take) => {
    const got = {};
    opened.length = 0;
    for (const l of letters) {
      for (const size of sizes) {
        for (const sc of screens) {
          const file = pagesToOpen({ run, folders: [`option-${l}`], screens: [sc] })[0];
          opened.push(path.relative(run, file).split(path.sep).join('/'));
          const h = await take(pathToFileURL(file).href, { width: size.w, height: size.h }, measureHeight);
          if (h && h.unverified) return { unverified: h.unverified };
          const v = clampHeight(h);
          // a screen that could not be measured keeps the default size: it is left out, not guessed
          if (v !== null) got[`${l}/${sc}@${size.w}`] = v;
        }
      }
    }
    return got;
  });
  const value = r.result ?? { unverified: r.unverified };
  if (value.unverified) {
    // no file: the build uses the sizes of R-3
    print(ctx.stdout, { unverified: value.unverified, ...cleanupInfo(r.cleanup) });
    return 0;
  }
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, out);
  print(ctx.stdout, { out, heights: value, count: Object.keys(value).length, opened: [...new Set(opened)].sort(), ...cleanupInfo(r.cleanup) });
  return 0;
}

function differences(a, b) {
  const out = [];
  if (JSON.stringify(a.blocks) !== JSON.stringify(b.blocks)) out.push({ kind: 'blocks', a: a.blocks, b: b.blocks });
  if (JSON.stringify(a.headings) !== JSON.stringify(b.headings)) out.push({ kind: 'headings', a: a.headings, b: b.headings });
  if (a.columns !== b.columns) out.push({ kind: 'columns', a: a.columns, b: b.columns });
  if (!samePrimary(a.primary, b.primary)) out.push({ kind: 'primary', a: a.primary, b: b.primary });
  return out;
}

async function cmdApproved(opts, ctx) {
  need(opts, 'project', 'approved', 'map', 'run');
  const project = path.resolve(ctx.cwd, opts.project);
  const run = path.resolve(ctx.cwd, opts.run);
  if (!isInsideRunRoot(project, run)) throw new UsageError(`--run debe estar dentro de ${RUN_ROOT}/ del proyecto`);
  if (!APPROVED_PATH.test(opts.approved)) throw new UsageError('--approved debe ser design/approved/<flujo>');
  const dir = path.join(project, ...opts.approved.split('/'));
  const manifest = readJson(path.join(dir, 'manifest.json'), 'manifest.json del aprobado');
  const map = readJson(path.resolve(ctx.cwd, opts.map), '--map');
  const screens = (Array.isArray(manifest.files) ? manifest.files : []).map((f) => f.path);
  const targets = {};
  for (const s of screens) {
    if (typeof map[s] !== 'string') throw new UsageError(`--map no tiene la pantalla ${s}`);
    targets[s] = /^https?:/i.test(map[s]) ? pageSource(project, { url: map[s] }).url : pageSource(project, { file: map[s] }).url;
  }
  const r = await withPageFingerprints(ctx, async (take) => {
    const rows = [];
    for (const s of screens) {
      const a = await take(pathToFileURL(path.join(dir, s)).href);
      const b = await take(targets[s]);
      const un = a.unverified || b.unverified;
      rows.push(un ? { screen: s, differences: [], unverified: un } : { screen: s, differences: differences(a, b) });
    }
    return rows;
  });
  const rows = r.result ?? screens.map((s) => ({ screen: s, differences: [], unverified: r.unverified }));
  const out = path.join(run, 'compare-approved.json');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ screens: rows }, null, 2)}\n`);
  print(ctx.stdout, { out, screens: rows, ...cleanupInfo(r.cleanup) });
  return 0;
}

export async function main(argv, { cwd = process.cwd(), env = process.env, browserOptions = {}, stdout = process.stdout, proc = process } = {}) {
  try {
    const opts = parseArgs(argv);
    const ctx = { cwd, env, browserOptions, stdout, proc };
    if (opts.cmd === 'fingerprint') return await cmdFingerprint(opts, ctx);
    if (opts.cmd === 'distance') return cmdDistance(opts, ctx);
    if (opts.cmd === 'options') return await cmdOptions(opts, ctx);
    if (opts.cmd === 'heights') return await cmdHeights(opts, ctx);
    return await cmdApproved(opts, ctx);
  } catch (e) {
    process.stderr.write(`compare: ${e instanceof UsageError ? e.message : `error interno (${e.stack || e.message})`}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
