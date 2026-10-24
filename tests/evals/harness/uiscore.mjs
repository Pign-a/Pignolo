// Scoring of a ui run (free: no tokens). Run by `accept` for ui tasks and alone as `run.mjs uiscore`. It never touches metrics.json.
//
//   (a) renders each screen at 1280 and 390 into <run>/shots/<slug>-<width>.png with the ui-audit browser library;
//   (b) runs the EXISTING ui-check (plugins/pignolo/ui-audit/lib/ui-check.mjs, the library behind scripts/ui-check.mjs) over the
//       screen files with the BASE design.md (the identity every arm started from), from here and not from the agent: <run>/ui_check.json;
//   (c) injected-JS measures per screen: <run>/ui_measures.json (see uimeasure.mjs).
// No browser (env PIGNOLO_UI_BROWSER, same discovery as ui-audit) or one that does not start: "browser_missing" / "browser_failed" is
// recorded and the measures that need it stay "not_verified". Nothing is ever filled in with a guess.
// The CSV columns are in ui_measures.json under `columns`.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runPaths, assertArmAllowed, isUiTask, taskConfig, REPO_ROOT, UI_FIXTURE_DIR } from './config.mjs';
import { findScreens } from './ui.mjs';
import { measureScreen, designColorTokens, NOT_VERIFIED } from './uimeasure.mjs';
import { removeTreeSafe } from './fsutil.mjs';

export const UI_AUDIT_LIB = path.join(REPO_ROOT, 'plugins', 'pignolo', 'ui-audit', 'lib');
export const UI_COLUMNS = ['ui_screens', 'ui_native_widgets', 'ui_interactive', 'ui_states_ok', 'ui_primary_buttons', 'ui_font_sizes', 'ui_check_findings', 'ui_not_verified'];

const imp = (f) => import(pathToFileURL(path.join(UI_AUDIT_LIB, f)).href);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const slash = (p) => String(p).replace(/\\/g, '/');

// The design.md every arm started from: the one at the base commit of the tree (the agent may have edited its copy), else the fixture.
function baseDesign(tree) {
  const r = spawnSync('git', ['show', 'base:design.md'], { cwd: tree, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (r.status === 0 && r.stdout.trim()) return { text: r.stdout, source: 'base' };
  return { text: fs.readFileSync(path.join(UI_FIXTURE_DIR, 'design.md'), 'utf8'), source: 'fixture' };
}

function copyDesignTree(from, to) {
  fs.cpSync(from, to, {
    recursive: true, dereference: false,
    filter: (src) => !['.git', 'node_modules', '.pignolo-ui'].includes(path.basename(src)),
  });
}

// The existing ui-check over the screens, in a scratch project made of a copy of design/ and the base design.md, so the instrument is
// the same in every arm and nothing is written into the agent's tree. Returns { report, findings } or throws.
async function runUiCheck({ tree, screens, design, check, scratchRoot }) {
  const project = path.join(scratchRoot, 'ui-check-project');
  removeTreeSafe(project);
  fs.mkdirSync(project, { recursive: true });
  try {
    if (fs.existsSync(path.join(tree, 'design'))) copyDesignTree(path.join(tree, 'design'), path.join(project, 'design'));
    fs.writeFileSync(path.join(project, 'design.md'), design.text);
    const files = screens.map((s) => s.rel);
    const result = await check({ project, files, design: path.join(project, 'design.md'), base: null, dom: [], urls: [], measures: null, before: null });
    const entries = result.entries || [];
    return {
      report: { files, designSource: design.source, inputs: result.inputs, exitCode: result.exitCode, entries },
      findings: entries.filter((e) => e.status === 'fail').length,
      unverified: entries.filter((e) => e.status === 'unverified').length,
    };
  } finally {
    removeTreeSafe(project);
  }
}

// Sum of a measure over the screens; "not_verified" if any screen lacks it (a partial sum would look like a measurement).
const total = (screens, key, how = 'sum') => {
  if (!screens.length) return null;
  const vals = screens.map((s) => (s.measures ? s.measures[key] : NOT_VERIFIED));
  if (vals.some((v) => typeof v !== 'number')) return null;
  return how === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0);
};

// What goes to the CSV. null (an empty cell) when it could not be computed.
export function uiColumns(result) {
  const s = result.screens || [];
  const notVerified = new Set();
  if (result.browser && (result.browser.status === 'browser_missing' || result.browser.status === 'browser_failed')) notVerified.add(result.browser.status);
  if (!s.length) notVerified.add('no_screens');
  for (const screen of s) for (const k of Object.keys(screen.notVerified || {})) notVerified.add(k);
  if (s.length && (result.uiCheck === null || (result.uiCheck && result.uiCheck.error))) notVerified.add('ui_check');
  return {
    ui_screens: s.length,
    ui_native_widgets: total(s, 'native_widgets'),
    ui_interactive: total(s, 'interactive'),
    ui_states_ok: total(s, 'states_ok'),
    // The worst screen: the most buttons sharing the most prominent fill, the most distinct font sizes.
    ui_primary_buttons: total(s, 'primary_buttons', 'max'),
    ui_font_sizes: total(s, 'font_sizes', 'max'),
    ui_check_findings: result.uiCheck && !result.uiCheck.error ? result.uiCheck.findings : null,
    ui_not_verified: [...notVerified].sort().join(';'),
  };
}

export async function scoreUi(cfg, args, deps = {}) {
  const { task, arm, rep, dir, repo } = runPaths(cfg, args);
  assertArmAllowed(cfg, task, arm);
  if (!isUiTask(cfg, task)) throw new Error(`la tarea ${task} no es de interfaz (kind "ui"): uiscore no aplica`);
  if (!fs.existsSync(path.join(repo, '.git'))) throw new Error(`no hay corrida preparada en ${repo}`);
  const changes = readJson(path.join(dir, 'changes.json'));
  const tree = changes && changes.measuredTree && fs.existsSync(changes.measuredTree) ? changes.measuredTree : repo;
  const errors = [];
  const guard = async (label, fn, fallback = null) => { try { return await fn(); } catch (e) { errors.push(`${label}: ${e && e.message ? e.message : e}`); return fallback; } };

  const libs = deps.libs || {};
  const need = async (name, file, key) => libs[name] || (await imp(file))[key];
  const found = findScreens(tree);
  const out = {
    version: 1, task, arm, rep, scenario: taskConfig(cfg, task).scenario, scoredAt: new Date().toISOString(),
    tree: slash(path.relative(dir, tree) || '.'), screensRule: found.rule, truncatedScreens: found.truncated,
    browser: { status: 'browser_missing', reason: null, product: null },
    screens: found.screens.map((s) => ({ slug: s.slug, file: s.rel, shots: [], measures: null, notVerified: {}, error: null })),
    uiCheck: null, designSource: null, errors,
  };

  // (b) ui-check: no browser needed
  const design = await guard('diseño base', () => baseDesign(tree));
  if (design) out.designSource = design.source;
  if (design && found.screens.length) {
    const check = deps.runCheck || (await guard('ui-check', () => need('runCheck', 'ui-check.mjs', 'runCheck')));
    if (check) {
      const r = await guard('ui-check', () => runUiCheck({ tree, screens: found.screens, design, check, scratchRoot: dir }), null);
      if (r) {
        fs.writeFileSync(path.join(dir, 'ui_check.json'), `${JSON.stringify({ ...r.report, findings: r.findings, unverified: r.unverified }, null, 2)}\n`);
        out.uiCheck = { file: 'ui_check.json', findings: r.findings, unverified: r.unverified };
      } else out.uiCheck = { error: errors[errors.length - 1] };
    } else out.uiCheck = { error: errors[errors.length - 1] };
  }

  // (a) + (c): the browser
  if (!found.screens.length) {
    out.browser = { status: 'not_needed', reason: 'no screens', product: null };
  } else {
    const find = deps.findBrowser || (await guard('navegador', () => need('findBrowser', 'browser-find.mjs', 'findBrowser')));
    const open = deps.openBrowser || (await guard('navegador', () => need('openBrowser', 'browser-session.mjs', 'openBrowser')));
    const where = find ? find({ env: deps.env || process.env }) : { path: null, reason: errors[errors.length - 1] || 'the browser library could not be loaded' };
    if (!where.path || !open) {
      out.browser = { status: 'browser_missing', reason: where.reason || 'the browser library could not be loaded', product: null };
    } else {
      const toks = await guard('tokens de design.md', async () => {
        const [splitFrontmatter, parseYaml, parseColor] = await Promise.all([
          libs.splitFrontmatter || imp('design-doc.mjs').then((m) => m.splitFrontmatter),
          libs.parseYaml || imp('yaml-subset.mjs').then((m) => m.parseYaml),
          libs.parseColor || imp('color.mjs').then((m) => m.parseColor),
        ]);
        return designColorTokens(design ? design.text : '', { splitFrontmatter, parseYaml, parseColor });
      }, { tokens: [], reason: 'no se pudieron leer los tokens' });
      let browser = null;
      try {
        browser = await open({ executable: where.path });
        out.browser = { status: 'ok', reason: null, product: browser.product || null, source: where.source || null };
      } catch (e) {
        out.browser = { status: 'browser_failed', reason: e && e.message ? e.message : String(e), product: null };
      }
      if (browser) {
        try {
          const tab = await browser.newPage();
          const shotsDir = path.join(dir, 'shots');
          for (const s of out.screens) {
            try {
              const r = await measureScreen({ browser, tab, url: pathToFileURL(path.join(tree, ...s.file.split('/'))).href, slug: s.slug, shotsDir, tokens: toks.tokens });
              s.shots = r.shots.map((x) => ({ width: x.width, file: `shots/${x.file}` }));
              s.measures = r.measures;
              s.notVerified = r.notVerified;
              if (toks.reason && !toks.tokens.length) s.notVerified.off_token_colors = toks.reason;
            } catch (e) {
              s.error = e && e.message ? e.message : String(e);
              errors.push(`pantalla ${s.slug}: ${s.error}`);
              s.notVerified = { screen: s.error };
            }
          }
        } catch (e) {
          errors.push(`navegador: ${e && e.message ? e.message : e}`);
          out.browser = { ...out.browser, status: 'browser_failed', reason: e && e.message ? e.message : String(e) };
        } finally {
          try { await browser.close(); } catch (e) { errors.push(`cerrar el navegador: ${e.message}`); }
        }
      }
    }
  }

  out.columns = uiColumns(out);
  fs.writeFileSync(path.join(dir, 'ui_measures.json'), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

// The CSV columns of a scored ui run (empty when the run has none).
export function uiScoreColumns(measures) {
  return measures && measures.columns ? { ...measures.columns } : {};
}
