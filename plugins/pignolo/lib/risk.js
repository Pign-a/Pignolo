'use strict';
// Piso de riesgo (spec §4.2, hito 3a Task 3): tripwires de ruta y de contenido.
// Es un piso, no detecta todo costo: el modelo solo puede subir.
const path = require('node:path');
const { matchGlob, matchAny } = require('./globs');
const { DEFAULT_TEST_PATHS } = require('./project-config');

const T = (id, kind, category) => Object.freeze({ id, kind, category });
const TRIPWIRES = Object.freeze([
  T('manifest', 'path', 'dependencies'),
  T('iac-ci', 'path', 'irreversible'),
  T('migration', 'path', 'irreversible'),
  T('deletion', 'path', 'irreversible'),
  T('env', 'path', 'security'),
  T('high-risk', 'path', 'security'),
  T('claude-config', 'path', 'security'),
  T('pii', 'content', 'security'),
  T('contracts', 'path', 'contract'),
  T('exported-signature', 'content', 'contract'),
  T('cost-paths', 'path', 'costs'),
  T('ai-model', 'content', 'costs'),
  T('paid-sdk', 'content', 'costs'),
  T('polling', 'content', 'costs'),
  T('retry-concurrency', 'content', 'costs'),
  T('log-level', 'content', 'costs'),
  T('visible-paths', 'path', 'scope'),
  T('ui-undeclared', 'path', 'scope'),
]);
const CATEGORY = Object.fromEntries(TRIPWIRES.map((t) => [t.id, t.category]));

const MANIFEST = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
  'requirements*.txt', 'pyproject.toml', 'poetry.lock', 'Pipfile', 'Pipfile.lock', 'go.mod', 'go.sum', 'Cargo.toml',
  'Cargo.lock', 'Gemfile', 'Gemfile.lock', 'composer.json', 'composer.lock', 'pubspec.yaml', 'pubspec.lock', 'pom.xml',
  'build.gradle', 'build.gradle.kts', '*.csproj'];
const IAC_CI = ['.github/workflows/**', '.gitlab-ci.yml', '.circleci/**', 'azure-pipelines.yml', 'Jenkinsfile', 'Dockerfile*',
  'docker-compose*.yml', 'compose*.yml', '*.tf', '*.tfvars', 'Chart.yaml', 'serverless.yml', 'vercel.json', 'netlify.toml',
  'fly.toml'];
const ENV = ['.env', '.env.*'];
const MIGRATION = ['migrations/', 'migrate/', 'prisma/migrations/**'];
const CLAUDE_CONFIG = ['.claude/**', 'CLAUDE.md', '.pignolo/project.md'];
const UI_EXT = ['*.tsx', '*.jsx', '*.vue', '*.svelte', '*.html', '*.css', '*.scss'];

// Los patrones con "/" se anclan a la ruta completa; los demás miden el nombre del archivo.
function matchPath(patterns, p) {
  const base = path.posix.basename(p);
  return patterns.some((g) => (g.includes('/') ? matchGlob(g, p) : matchGlob(g, base)));
}

const CONTENT = {
  'ai-model': [/['"`](claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+|o[134](-mini|-pro)?|gemini-[a-z0-9.-]+|mistral-[a-z0-9.-]+|llama-?\d[a-z0-9.-]*)['"`]/i],
  'paid-sdk': [
    /@anthropic-ai\/|@google\/(generative-ai|genai)|@aws-sdk\/|@sendgrid\//,
    /(require\(|from\s+|import\s+)['"]?(openai|anthropic|cohere|stripe|twilio)\b/,
    /\bapi\.(anthropic|openai|stripe)\.com\b|\bgenerativelanguage\.googleapis\.com\b/,
  ],
  polling: [/\bsetInterval\s*\(/, /\b(node-)?cron\b/, /@Scheduled\b/, /\bschedule\s*\(/, /\bpoll(ing)?\b/i],
  'retry-concurrency': [/\bretr(y|ies)\b/i, /\bbackoff\b/i, /\bPromise\.all(Settled)?\s*\(/, /\bconcurrency\b/i, /\bp-limit\b/,
    /\bnew\s+Worker\s*\(/, /\bThreadPool/],
  'log-level': [/\bLOG_LEVEL\b/, /\blogLevel\b/, /\.setLevel\s*\(/, /\blevel\s*:\s*['"](debug|trace)['"]/, /\bconsole\.debug\s*\(/],
};

// Nombre exportado de una línea con forma de firma, o null.
function exportName(text, file) {
  let m = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|interface|type|enum)\s+(\w+)/.exec(text);
  if (m) return m[1];
  if (/module\.exports/.test(text)) return 'module.exports';
  m = /^\s*exports\.(\w+)\s*=/.exec(text);
  if (m) return m[1];
  if (/\.pyi?$/.test(file)) {
    m = /^(?:def|class)\s+(\w+)/.exec(text);
    if (m) return m[1];
  }
  return null;
}

function normalize(config) {
  const c = config || {};
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    found: c.found === true,
    testPaths: Array.isArray(c.testPaths) && c.testPaths.length ? c.testPaths : [...DEFAULT_TEST_PATHS],
    contracts: list(c.contracts),
    highRiskPaths: list(c.highRiskPaths),
    costPaths: list(c.costPaths),
    visiblePaths: list(c.visiblePaths),
    piiPatterns: list(c.piiPatterns).map((p) => new RegExp(p)),
  };
}

const LEVELS = ['low', 'medium', 'high'];
const LANES = ['trivial', 'daily', 'plan'];
const LANE_OF = { low: 'trivial', medium: 'daily', high: 'daily' };

function assessRisk({ files = [], lines = [], config } = {}) {
  const cfg = normalize(config);
  const hits = [];
  const hit = (tripwire, p, detail, line) => {
    const h = { tripwire, category: CATEGORY[tripwire], path: p, detail };
    if (line !== undefined) h.line = line;
    hits.push(h);
  };
  let lane = 'trivial';
  const raise = (l) => { if (LANES.indexOf(l) > LANES.indexOf(lane)) lane = l; };

  for (const { path: p, status } of files) {
    if (matchPath(MANIFEST, p)) hit('manifest', p, 'manifiesto o lockfile');
    if (matchPath(IAC_CI, p)) hit('iac-ci', p, 'infraestructura o CI');
    if (matchPath(ENV, p)) hit('env', p, 'archivo de entorno');
    if (matchPath(MIGRATION, p) || (matchGlob('db/', p) && p.endsWith('.sql'))) hit('migration', p, 'migración');
    if (status === 'D') hit('deletion', p, 'archivo borrado');
    if (matchPath(CLAUDE_CONFIG, p)) hit('claude-config', p, 'configuración de Claude o de pignolo');
    if (matchAny(cfg.contracts, p)) hit('contracts', p, 'ruta de contratos');
    if (matchAny(cfg.highRiskPaths, p)) hit('high-risk', p, 'ruta de alto riesgo');
    if (matchAny(cfg.costPaths, p)) hit('cost-paths', p, 'ruta con costo');
    if (matchAny(cfg.visiblePaths, p)) hit('visible-paths', p, 'ruta visible al usuario');
    if (cfg.visiblePaths.length === 0 && matchPath(UI_EXT, p)) {
      hit('ui-undeclared', p, 'UI sin visible-paths declarado');
      raise('plan');
    }
  }

  const isTest = (p) => matchAny(cfg.testPaths, p);
  const removed = new Map(); // ruta -> nombres de firmas quitadas
  for (const l of lines) {
    if (l.sign !== '-' || isTest(l.path)) continue;
    const n = exportName(l.text, l.path);
    if (n) {
      if (!removed.has(l.path)) removed.set(l.path, new Set());
      removed.get(l.path).add(n);
    }
  }
  for (const l of lines) {
    if (cfg.piiPatterns.length && l.sign === '+') {
      const re = cfg.piiPatterns.find((r) => r.test(l.text));
      if (re) hit('pii', l.path, `coincide con pii-patterns: ${re.source}`, l.line);
    }
    if (isTest(l.path)) continue;
    if (l.sign === '-') {
      if (exportName(l.text, l.path)) hit('exported-signature', l.path, 'firma exportada quitada o cambiada', l.line);
      continue;
    }
    if (l.sign !== '+') continue;
    for (const [id, res] of Object.entries(CONTENT)) {
      if (res.some((r) => r.test(l.text))) hit(id, l.path, l.text.trim().slice(0, 120), l.line);
    }
    const n = exportName(l.text, l.path);
    if (n && removed.get(l.path)?.has(n)) hit('exported-signature', l.path, `firma de ${n} cambiada`, l.line);
  }

  let level;
  let reserved = false;
  if (hits.length) {
    level = 'high';
    reserved = true;
    raise('daily');
  } else if (cfg.found && files.length <= 1 && lines.length <= 10) {
    level = 'low';
  } else {
    level = 'medium'; // sin project.md: piso conservador
  }
  raise(LANE_OF[level]);
  const categories = [...new Set(hits.map((h) => h.category))];
  return { level, reserved, laneFloor: lane, hits, categories };
}

function maxRisk(a, b) {
  const pick = (list, x, y) => (list.indexOf(x) >= list.indexOf(y) ? x : y);
  const seen = new Set();
  const hits = [];
  for (const h of [...a.hits, ...b.hits]) {
    const k = JSON.stringify([h.tripwire, h.path, h.line, h.detail]);
    if (!seen.has(k)) { seen.add(k); hits.push(h); }
  }
  return {
    level: pick(LEVELS, a.level, b.level),
    reserved: Boolean(a.reserved || b.reserved),
    laneFloor: pick(LANES, a.laneFloor, b.laneFloor),
    hits,
    categories: [...new Set([...a.categories, ...b.categories])],
  };
}

module.exports = { TRIPWIRES, assessRisk, maxRisk };
