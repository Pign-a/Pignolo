// Blind pack for the author's vote on ui runs. For every (arm, repetition) of a scenario that has a scored run, copies the screenshots and
// the screen HTML under neutral labels (A, B, C...), in an order shuffled with the config seed, into <privateRoot>/ui-blind/<scenario>/.
// The key (label to task/arm/repetition and what was found) goes to <privateRoot>/ui-blind-keys/<scenario>.json, OUTSIDE the pack.
//
// pack.json (the only index the voting page reads; labels, files and nothing else):
//   { "version": 1, "scenario": "<id>", "options": [ { "label": "A", "screens": [
//       { "id": "screen-1", "html": "A/screens/screen-1/index.html",
//         "shots": [ { "width": 1280, "file": "A/shots/screen-1-1280.png" }, { "width": 390, "file": "A/shots/screen-1-390.png" } ] } ] } ] }
// Paths are relative to the pack folder, with forward slashes. Screens are renamed screen-1, screen-2... (the order of the run's own
// slugs): a slug chosen by an arm could give it away.
// What names the arm or the plugin (comments, <meta name="generator">, paths under .pignolo, the plugin names) is stripped from the HTML,
// CSS and SVG of the pack; what was found is reported (and kept in the key file), never silent.
import fs from 'node:fs';
import path from 'node:path';
import { runPaths, assertArmAllowed } from './config.mjs';
import { shuffle } from './blind.mjs';
import { removeTreeSafe } from './fsutil.mjs';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const TEXT_EXT = /\.(html?|css|svg)$/i;
const SKIP = new Set(['.git', 'node_modules', '.pignolo-ui']);
const slash = (p) => String(p).replace(/\\/g, '/');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const uiPackDir = (cfg, scenario) => path.join(cfg.privateRoot, 'ui-blind', scenario);
export const uiPackKeyFile = (cfg, scenario) => path.join(cfg.privateRoot, 'ui-blind-keys', `${scenario}.json`);

// Terms that would name the arm: the plugin names of every arm, the folders the plugins write, and cfg.blindLeakTerms.
export function leakTerms(cfg) {
  const terms = [...Object.values(cfg.arms).map((a) => a.pluginName), '.pignolo', 'pignolo', ...(cfg.blindLeakTerms || [])].filter(Boolean);
  return [...new Set(terms.map((t) => String(t)))].sort((a, b) => b.length - a.length);
}

// Strips what names an arm from a text file. Returns { text, found: [{ type, term }] }.
// html/svg: every <!-- comment --> and every <meta name="generator"> goes (a comment is the usual place for a note about the method);
// css and <style> blocks: a /* comment */ that names a term goes; any other mention of a term is replaced by "redacted" (a valid class name, so the page keeps working).
export function sanitizeText(text, terms) {
  const found = [];
  const has = (chunk, term) => chunk.toLowerCase().includes(term.toLowerCase());
  const noteTerms = (type, chunk) => { for (const t of terms) if (has(chunk, t)) found.push({ type, term: t }); };
  let out = String(text);
  out = out.replace(/<!--[\s\S]*?-->/g, (c) => { noteTerms('comment', c); return ''; });
  out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']?generator["']?[^>]*>/gi, (c) => { found.push({ type: 'meta-generator', term: terms.find((t) => has(c, t)) || '(generator)' }); return ''; });
  out = out.replace(/\/\*[\s\S]*?\*\//g, (c) => { if (!terms.some((t) => has(c, t))) return c; noteTerms('css-comment', c); return ''; });
  for (const t of terms) {
    const re = new RegExp(escapeRe(t), 'gi');
    if (re.test(out)) { found.push({ type: 'text', term: t }); out = out.replace(new RegExp(escapeRe(t), 'gi'), 'redacted'); }
  }
  return { text: out, found };
}

// Relative references that leave the folder a screen is copied from (they would break in the pack): ../x in src, href, url() and @import.
function escapingRefs(text) {
  const refs = new Set();
  const re = /(?:\b(?:src|href|poster)\s*=\s*["']|url\(\s*["']?|@import\s+["'])(\.\.[\\/][^"')\s]*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) refs.add(m[1]);
  return [...refs];
}

function copyScreen({ from, to, singleFile, terms, leaks, label, screenId }) {
  fs.mkdirSync(to, { recursive: true });
  const refs = [];
  const copy = (src, dest, rel) => {
    const st = fs.lstatSync(src);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      if (SKIP.has(path.basename(src))) return;
      fs.mkdirSync(dest, { recursive: true });
      for (const n of fs.readdirSync(src).sort()) copy(path.join(src, n), path.join(dest, n), `${rel}/${n}`);
      return;
    }
    for (const t of terms) if (path.basename(src).toLowerCase().includes(t.toLowerCase())) leaks.push({ label, screen: screenId, file: rel, type: 'file-name', term: t });
    if (TEXT_EXT.test(src)) {
      const r = sanitizeText(fs.readFileSync(src, 'utf8'), terms);
      for (const f of r.found) leaks.push({ label, screen: screenId, file: rel, ...f });
      refs.push(...escapingRefs(r.text));
      fs.writeFileSync(dest, r.text);
    } else fs.copyFileSync(src, dest);
  };
  if (singleFile) copy(from, path.join(to, 'index.html'), 'index.html');
  else copy(from, to, '.');
  return refs;
}

// opts.reps: repetitions to include (default [1]); opts.arms: which arms (default every configured arm); opts.force: rebuild an existing pack.
export function uiPack(cfg, { scenario, reps = [1], arms = null, force = false }) {
  const tasks = Object.entries(cfg.tasks || {}).filter(([, t]) => t && t.kind === 'ui' && t.scenario === scenario).map(([id]) => id).sort();
  if (!tasks.length) throw new Error(`ninguna tarea de la configuración es de interfaz con el escenario ${scenario} (kind "ui", scenario "${scenario}")`);
  const repList = [...new Set(reps.map(Number))].sort((a, b) => a - b);
  if (!repList.length || repList.some((r) => !Number.isInteger(r) || r < 1)) throw new Error('--reps necesita una lista de enteros, por ejemplo 1,2,3');
  const packDir = uiPackDir(cfg, scenario);
  const keyFile = uiPackKeyFile(cfg, scenario);
  if ((fs.existsSync(packDir) || fs.existsSync(keyFile)) && !force) {
    throw new Error(`ya existe ${fs.existsSync(packDir) ? packDir : keyFile}; usá --force para regenerar el paquete (se rehace desde las corridas)`);
  }
  const armList = arms && arms.length ? arms : Object.keys(cfg.arms).sort();

  const runs = [];
  const skipped = [];
  for (const task of tasks) {
    for (const arm of armList) {
      for (const rep of repList) {
        const id = `${task}/${arm}/${rep}`;
        try { assertArmAllowed(cfg, task, arm); } catch { continue; }
        const { dir, repo } = runPaths(cfg, { task, arm, rep });
        if (!fs.existsSync(dir)) continue;
        const um = readJson(path.join(dir, 'ui_measures.json'));
        if (!um) { skipped.push({ run: id, reason: 'sin ui_measures.json (corré accept o uiscore)' }); continue; }
        const metrics = readJson(path.join(dir, 'metrics.json'));
        const invalid = metrics && Array.isArray(metrics.invalidReasons) ? metrics.invalidReasons.filter((r) => !(metrics.censored && r === 'no_changes')) : [];
        if (invalid.length) { skipped.push({ run: id, reason: `inválida: ${invalid.join(';')}` }); continue; }
        const shown = (um.screens || []).filter((s) => !s.error);
        if (!shown.length) { skipped.push({ run: id, reason: 'sin pantallas' }); continue; }
        const changes = readJson(path.join(dir, 'changes.json'));
        const tree = changes && changes.measuredTree && fs.existsSync(changes.measuredTree) ? changes.measuredTree : repo;
        runs.push({ task, arm, rep, dir, tree, screens: shown, timestamp: metrics ? metrics.finishedAt || null : null });
      }
    }
  }
  if (!runs.length) throw new Error(`no hay corridas de interfaz puntuadas del escenario ${scenario} para armar el paquete (brazos: ${armList.join(', ')}; repeticiones: ${repList.join(', ')})${skipped.length ? `; salteadas: ${skipped.map((s) => `${s.run} (${s.reason})`).join(', ')}` : ''}`);
  if (runs.length > LABELS.length) throw new Error('demasiadas corridas para etiquetar');

  const terms = leakTerms(cfg);
  const order = shuffle(runs, cfg.seed);
  removeTreeSafe(packDir);
  fs.mkdirSync(packDir, { recursive: true });
  const leaks = [];
  const key = { version: 1, scenario, seed: cfg.seed, createdAt: new Date().toISOString(), labels: {}, leaks, externalRefs: [], skipped };
  const pack = { version: 1, scenario, options: [] };
  order.forEach((r, i) => {
    const label = LABELS[i];
    const option = { label, screens: [] };
    key.labels[label] = { task: r.task, arm: r.arm, rep: r.rep, timestamp: r.timestamp, screens: {}, rule: null };
    r.screens.forEach((s, k) => {
      const id = `screen-${k + 1}`;
      key.labels[label].screens[id] = s.slug;
      const src = path.join(r.tree, ...s.file.split('/'));
      const screen = { id, html: null, shots: [] };
      if (fs.existsSync(src)) {
        const folderCopy = /^design\/screens\/[^/]+\/index\.html$/.test(s.file);
        const to = path.join(packDir, label, 'screens', id);
        const refs = copyScreen({ from: folderCopy ? path.dirname(src) : src, to, singleFile: !folderCopy, terms, leaks, label, screenId: id });
        for (const ref of refs) key.externalRefs.push({ label, screen: id, ref });
        screen.html = `${label}/screens/${id}/index.html`;
      }
      for (const shot of s.shots || []) {
        const from = path.join(r.dir, ...String(shot.file).split('/'));
        if (!fs.existsSync(from)) continue;
        const rel = `${label}/shots/${id}-${shot.width}.png`;
        fs.mkdirSync(path.join(packDir, label, 'shots'), { recursive: true });
        fs.copyFileSync(from, path.join(packDir, rel));
        screen.shots.push({ width: shot.width, file: rel });
      }
      option.screens.push(screen);
    });
    pack.options.push(option);
  });
  fs.writeFileSync(path.join(packDir, 'pack.json'), `${JSON.stringify(pack, null, 2)}\n`);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, `${JSON.stringify(key, null, 2)}\n`);
  return {
    scenario, packDir, keyFile, options: pack.options.length, labels: pack.options.map((o) => o.label), leaksFound: leaks.length > 0, leaks,
    externalRefs: key.externalRefs, skipped,
  };
}
