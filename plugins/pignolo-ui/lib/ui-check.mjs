// ui-check runner (spec §5.3, §5.5). Reads the inputs, runs the rules and returns entries;
// it never writes anything (scripts/ui-check.mjs writes <run>/ui-check.json).
//
// runCheck({ project, files, design, base, dom, urls, measures, inject }) -> Promise<{ entries, inputs, exitCode }>
//   measures   { file, entries } of a browser.json (scripts/browser.mjs measure) or null.
//   files/dom  paths relative to `project` (or absolute inside it); `files: []` is valid and
//              runs only the project rules (checkProject).
//   design     path of DESIGN.md or null.   base  git ref or null.
//   inject     { rules, catalog, applyRejections, classifyScope, scopeRun }, each optional;
//              by default the modules on disk. Only tests replace them.
//
// Fixed order: (1) rules (checkFile per file, checkProject once) -> (2) applyRejections(entries,
// design, fileCtxs) -> (3) intentional (never on a floored finding) -> (4) scope: scopeRun gets
// `evaluate(dir, relFiles)`, which runs steps 1-3 with the same rules and catalog over another
// folder, then classifyScope(current, base) -> (5) effective severity -> (6) aggregation of
// unverified entries per (rule, file, reason) and order by file, line and id.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RUN_ROOT } from './run-folder.mjs';
import { loadCatalog } from './catalog.mjs';
import { routeFile } from './route.mjs';
import { stripComments } from './strip-comments.mjs';
import { parseMarkup } from './markup.mjs';
import { walkCss } from './css-walk.mjs';
import { extractClassLists, extractClassListsFromSfc } from './utility-classes.mjs';
import { readTokenSources } from './token-sources.mjs';
import { validateDesign, resolveAliases } from './design-doc.mjs';
import { pass, unverified } from './rules/api.mjs';
import { RULES as DOCUMENT } from './rules/document.mjs';
import { RULES as MOTION } from './rules/motion.mjs';
import { RULES as STRESS } from './rules/stress.mjs';
import { RULES as A11Y_ELEMENT } from './rules/a11y-element.mjs';
import { RULES as CONTENT } from './rules/content.mjs';
import { RULES as STYLE } from './rules/style.mjs';
import { RULES as CONTRAST } from './rules/contrast.mjs';
import { RULES as DEFAULTS } from './rules/defaults.mjs';
import { RULES as REJECTIONS, applyRejections as diskApplyRejections } from './rules/rejections.mjs';
import { scopeRun as diskScopeRun, classifyScope as diskClassifyScope } from './scope.mjs';
import { RULES as SEO_SITE } from './rules/seo-site.mjs';
import { RULES as SEO_PAGE } from './rules/seo-page.mjs';
import { fetchSite } from './site-fetch.mjs';
import { siteFiles } from './site-files.mjs';

const DISK_RULES = [...DOCUMENT, ...A11Y_ELEMENT, ...CONTENT, ...STYLE, ...MOTION, ...STRESS, ...CONTRAST, ...DEFAULTS, ...SEO_SITE, ...SEO_PAGE, ...REJECTIONS];
const SYNTAX = { html: 'html', htm: 'html', jsx: 'jsx', tsx: 'jsx', css: 'css', vue: 'vue', svelte: 'svelte' };
const TAILWIND_CONFIGS = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
const STATUSES = new Set(['pass', 'fail', 'unverified']);
const SEVERITIES = new Set(['bloquea', 'alto', 'medio', 'detalle']);
const NO_SEVERITY = 'finding without catalog rule or severity';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toPosix = (p) => p.split(path.sep).join('/');
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const relTo = (project, p) => toPosix(path.relative(project, path.resolve(project, p)));
const emptyCss = () => ({ rules: [], decls: [], keyframes: [] });

// Mockups are the approved options and the option folders of a run (spec §3.3, §7).
function isMockup(rel) {
  return rel.startsWith('design/approved/') || rel.startsWith('.pignolo-ui/runs/');
}

function readDesign(file, rel, catalog, tokens) {
  const v = validateDesign(fs.readFileSync(file, 'utf8'), { catalog, darkInCss: tokens.darkDetected });
  const data = v.data;
  const pig = data && isMap(data.pignolo) ? data.pignolo : null;
  const aliases = resolveAliases(data && isMap(data.colors) ? data.colors : {}, pig ? pig.aliases : undefined);
  const firstReject = v.findings.find((f) => f.rejects);
  return {
    design: { data, aliases, rel, status: v.status },
    reject: v.reject === true,
    rejectMessage: firstReject ? firstReject.message : null,
    intentional: pig && Array.isArray(pig.intentional) ? pig.intentional.filter((i) => isMap(i) && typeof i.id === 'string') : [],
  };
}

function mergeCss(parts) {
  const css = emptyCss();
  for (const p of parts) {
    css.rules.push(...p.rules);
    css.decls.push(...p.decls);
    css.keyframes.push(...p.keyframes);
  }
  return css;
}

function buildCtx({ dir, rel, isDom, design, tokens, catalog }) {
  const raw = stripBom(fs.readFileSync(path.join(dir, rel), 'utf8'));
  const route = isDom ? routeFile('dom.html') : routeFile(rel);
  const syntax = SYNTAX[route.ext] ?? null;
  const text = syntax ? stripComments(raw, syntax) : raw;
  let markup = null;
  let css = emptyCss();
  let classLists = [];
  if (route.markup) markup = parseMarkup(text, { syntax: route.markup });
  if (route.style === 'css') css = walkCss(text);
  else if (route.style === 'embedded') {
    const styles = markup ? markup.styles : parseMarkup(text, { syntax: 'html' }).styles;
    css = mergeCss(styles.map((s) => walkCss(s.text, { lineOffset: s.line - 1 })));
  }
  if (route.utilities === 'markup' && markup) classLists = extractClassLists(markup);
  else if (route.utilities === 'sfc') classLists = extractClassListsFromSfc(text);
  return {
    file: rel,
    origin: isDom ? 'dom' : 'file',
    text,
    syntax,
    route,
    mockup: !isDom && isMockup(rel),
    isDocument: isDom || Boolean(markup && markup.hasHtmlRoot),
    markup,
    css,
    classLists,
    design,
    tokens,
    catalog,
  };
}

// 'run', { reason } (unverified) or null (the routing table does not send this level here).
function applicability(catRule, ctx) {
  const { route } = ctx;
  if (!catRule) return route.unsupported ? null : 'run';
  if (route.unsupported) return { reason: route.unsupported };
  const sfc = route.utilities === 'sfc' ? { reason: `unsupported extension .${route.ext}` } : null;
  if (catRule.level === 'document') {
    if (ctx.markup) return ctx.isDocument ? 'run' : { reason: 'not a document' };
    return sfc || { reason: 'not a document' };
  }
  if (catRule.level === 'element') return ctx.markup ? 'run' : sfc;
  return route.style ? 'run' : null;
}

// Runs one rule function and normalizes what it returns; never throws.
function callRule(fn, arg, ruleId) {
  let out;
  try {
    out = fn(arg);
  } catch (e) {
    return [unverified(`rule error: ${e && e.message ? e.message : String(e)}`)];
  }
  if (out === undefined || out === null) return [];
  if (!Array.isArray(out)) return [unverified('rule error: the rule did not return a list')];
  return out.map((f) => {
    if (!isMap(f) || !STATUSES.has(f.status)) return unverified(`rule error: invalid finding from ${ruleId}`);
    return f;
  });
}

function withRuleResults(findings, found, ruleId, catRule, file) {
  const resolved = found.map((f) => {
    const e = { ...f, id: typeof f.id === 'string' && f.id ? f.id : ruleId, key: f.key ?? f.reason ?? '' };
    if (file !== undefined) e.file = file;
    else if (typeof f.file !== 'string') delete e.file;
    return e;
  });
  // "Nothing is omitted": an applicable rule that returned nothing passed.
  if (catRule && !resolved.some((f) => f.id === ruleId)) {
    resolved.push({ ...pass('no findings'), id: ruleId, ...(file !== undefined ? { file } : {}) });
  }
  findings.push(...resolved);
}

// Step 3 for one list of entries: a fail of a rule that accepts `intentional` (and is not floor)
// that DESIGN.md lists becomes a pass with the reason. Also used on the browser entries.
function applyIntentional(entries, info, byId) {
  if (!info.intentional.length) return entries;
  const why = new Map();
  for (const item of info.intentional) {
    const r = byId.get(item.id);
    if (r && r.acceptsIntentional && !r.floor && !why.has(item.id)) why.set(item.id, String(item.why ?? ''));
  }
  return entries.map((e) => (e.status === 'fail' && e.floor !== true && why.has(e.id)
    ? { ...e, status: 'pass', reason: `intentional: ${why.get(e.id)}` }
    : e));
}

// Steps 1-3 over `dir` (the project or a materialized base), plus the base severity and the
// fingerprint, so both runs are compared the same way. Files missing in `dir` are skipped.
function evaluateDir({ dir, relFiles, domFiles = [], designRel, rules, catalog, applyRejections, site = null }) {
  const byId = new Map(catalog.rules.map((r) => [r.id, r]));
  const tokens = readTokenSources(dir);
  const designFile = designRel ? path.join(dir, designRel) : null;
  const info = designFile && fs.existsSync(designFile) ? readDesign(designFile, designRel, catalog, tokens) : null;
  const design = info ? info.design : null;

  const ctxs = [];
  for (const rel of relFiles) {
    if (fs.existsSync(path.join(dir, rel))) ctxs.push(buildCtx({ dir, rel, isDom: false, design, tokens, catalog }));
  }
  for (const rel of domFiles) ctxs.push(buildCtx({ dir, rel, isDom: true, design, tokens, catalog }));

  // (1) rules
  const findings = [];
  for (const ctx of ctxs) {
    for (const rule of rules) {
      if (typeof rule.checkFile !== 'function') continue;
      const catRule = byId.get(rule.id);
      const a = applicability(catRule, ctx);
      if (a === null) continue;
      if (a !== 'run') { findings.push({ ...unverified(a.reason), id: rule.id, file: ctx.file }); continue; }
      withRuleResults(findings, callRule(rule.checkFile, ctx, rule.id), rule.id, catRule, ctx.file);
    }
  }
  const pctx = { project: dir, design, tokens, catalog, files: ctxs.map((c) => c.file), ctxs, site };
  for (const rule of rules) {
    if (typeof rule.checkProject !== 'function') continue;
    withRuleResults(findings, callRule(rule.checkProject, pctx, rule.id), rule.id, byId.get(rule.id), undefined);
  }

  // (2) rejections
  let entries = applyRejections(findings, design, ctxs) ?? findings;

  // (3) intentional: only rules that accept it, never a floored finding; a DESIGN.md the
  // validator rejects has its whole list ignored.
  if (info && info.reject) {
    entries = [...entries, {
      id: 'DESIGN-INVALID', status: 'unverified', severity: 'alto', key: 'rejected', file: designRel,
      reason: `DESIGN.md rejected by the validator${info.rejectMessage ? ` (${info.rejectMessage})` : ''}: pignolo.intentional ignored`,
    }];
  } else if (info) {
    entries = applyIntentional(entries, info, byId);
  }

  // base severity (the rule's, else the catalog's); ids outside the catalog must bring one
  return entries.map((e) => {
    const r = byId.get(e.id);
    let out = e;
    if (!SEVERITIES.has(e.severity)) {
      if (r) out = { ...e, severity: r.severity };
      else out = { ...e, status: 'unverified', reason: NO_SEVERITY, severity: 'alto', floor: false, key: NO_SEVERITY };
    }
    return { ...out, fingerprint: `${out.id}|${out.file ?? ''}|${out.key ?? ''}` };
  });
}

// (5) the floor acts only on fails that would block: debt becomes alto. A fail marked
// `floor: true` (a rejection) blocks when new and is alto when debt, whatever it brought.
function effectiveSeverity(e, catRule) {
  if (e.status !== 'fail') return e.severity;
  if (e.floor === true) return e.scope === 'debt' ? 'alto' : 'bloquea';
  if (catRule && catRule.floor && e.severity === 'bloquea' && e.scope === 'debt') return 'alto';
  return e.severity;
}

const ORDER = (a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id);

// (6) one unverified entry per (rule, file, reason) with measure.count; then the order.
function aggregate(entries) {
  const out = [];
  const groups = new Map();
  for (const e of [...entries].sort(ORDER)) {
    if (e.status !== 'unverified') { out.push(e); continue; }
    const k = JSON.stringify([e.id, e.file ?? '', e.reason ?? '']);
    const g = groups.get(k);
    if (g) g.measure.count++;
    else {
      const first = { ...e, measure: { ...(isMap(e.measure) ? e.measure : {}), count: 1 } };
      groups.set(k, first);
      out.push(first);
    }
  }
  return out.sort(ORDER);
}

const FIELDS = ['id', 'status', 'reason', 'severity', 'scope', 'file', 'line', 'selector', 'fingerprint', 'measure'];
const publicEntry = (e) => Object.fromEntries(FIELDS.filter((f) => e[f] !== undefined && e[f] !== null).map((f) => [f, e[f]]));

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// The single list of source files of the scope ruling: the inputs, DESIGN.md and the token
// sources of the current project (CSS, components.json, tailwind.config.*, package.json).
function sourceFilesOf(project, relFiles, designRel) {
  const list = [...relFiles];
  if (designRel) list.push(designRel);
  const tokens = readTokenSources(project);
  for (const s of [...tokens.sources, ...tokens.unverified]) if (s.file && s.file !== '.') list.push(s.file);
  list.push(...siteFiles(project));
  for (const name of ['components.json', 'package.json', ...TAILWIND_CONFIGS]) {
    if (fs.existsSync(path.join(project, name))) list.push(name);
  }
  return [...new Set(list)];
}

// I-3: key of a rendered-page entry that does not depend on the run folder it came from.
const domKey = (e) => {
  const file = e.file ?? '';
  const fp = typeof e.fingerprint === 'string' ? e.fingerprint : '';
  const head = `${e.id}|${file}|`;
  return `${e.id}|${path.posix.basename(file.split('\\').join('/'))}|${fp.startsWith(head) ? fp.slice(head.length) : fp}`;
};

// Multiset of the failures the "before" reading already had; an "after" entry that matches one is debt.
function beforeCounter(before) {
  const counts = new Map();
  for (const e of before ?? []) {
    if (!e || e.status !== 'fail' || typeof e.file !== 'string' || !e.file.startsWith(`${RUN_ROOT}/`)) continue;
    const k = domKey(e);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export async function runCheck({ project, files = [], design = null, base = null, dom = [], urls = [], measures = null, before = null, inject = {} } = {}) {
  const root = path.resolve(project);
  const rules = inject.rules ?? DISK_RULES;
  const catalog = inject.catalog ?? loadCatalog();
  const applyRejections = inject.applyRejections ?? diskApplyRejections;
  const classifyScope = inject.classifyScope ?? diskClassifyScope;
  const scopeRun = inject.scopeRun ?? diskScopeRun;
  const byId = new Map(catalog.rules.map((r) => [r.id, r]));

  const relFiles = files.map((f) => relTo(root, f));
  const domFiles = dom.map((f) => relTo(root, f));
  const designRel = design ? relTo(root, design) : null;
  const evaluate = (dir, rels) => evaluateDir({ dir, relFiles: rels, designRel, rules, catalog, applyRejections });

  const site = urls.length ? await fetchSite({ urls, ...(inject.fetchOptions ?? {}) }) : null;
  const current = evaluateDir({ dir: root, relFiles, domFiles, designRel, rules, catalog, applyRejections, site });
  // (4) scope
  const baseFindings = base
    ? await scopeRun({ project: root, base, relFiles, sourceFiles: sourceFilesOf(root, relFiles, designRel), designRel, evaluate })
    : null;
  const domSet = new Set(domFiles);
  const preexisting = beforeCounter(before);
  const scoped = classifyScope(current, baseFindings ?? null)
    .map((e) => {
      if (!domSet.has(e.file)) return { ...e, scope: e.scope === 'debt' ? 'debt' : 'new' };
      if (e.status === 'fail') {
        const k = domKey(e);
        const left = preexisting.get(k) ?? 0;
        if (left > 0) { preexisting.set(k, left - 1); return { ...e, scope: 'debt' }; }
      }
      return { ...e, scope: 'new' };
    });
  // (5) severity, (6) aggregation and order
  const entries = aggregate(scoped.map((e) => ({ ...e, severity: effectiveSeverity(e, byId.get(e.id)) }))).map(publicEntry);
  // Browser measures (browser.json) come scoped and with their severity: appended as they are.
  if (measures) {
    // Same step 3 as the rules: DESIGN.md intentional, unless the validator rejected the file.
    const designFile = designRel ? path.join(root, designRel) : null;
    const info = designFile && fs.existsSync(designFile) ? readDesign(designFile, designRel, catalog, readTokenSources(root)) : null;
    const browserEntries = info && !info.reject ? applyIntentional(measures.entries, info, byId) : measures.entries;
    entries.push(...browserEntries.map(publicEntry));
  }

  const inputs = [...relFiles, ...domFiles, ...(designRel ? [designRel] : []), ...(measures ? [measures.file] : [])]
    .map((rel) => ({ file: rel, sha256: sha256(path.join(root, rel)) }));
  if (site) {
    for (const r of [...site.pages, site.robots, ...site.sitemaps]) if (r.sha256) inputs.push({ url: r.finalUrl, sha256: r.sha256 });
  }
  const exitCode = entries.some((e) => e.status === 'fail' && e.severity === 'bloquea' && e.scope === 'new') ? 1 : 0;
  return { entries, inputs, exitCode };
}
