'use strict';
// Detección del proyecto para /pignolo:init (R-5, R-6, R-8, R-9, R-11, R-17). Solo lectura:
// no ejecuta nada del proyecto; el contenido de un archivo solo se lee en los manifiestos
// (package.json, pyproject, requirements, pubspec). Cada valor lleva su fuente en `sources`.
const nodeFs = require('node:fs');
const path = require('node:path');
const { matchGlob } = require('./globs');

const STACKS = Object.freeze(['node', 'python', 'go', 'rust', 'flutter', 'docs', 'script']);
const PLACEHOLDERS = [/no test specified/i, /echo\s+"?Error/i];
const SKIP_DIRS = new Set(['node_modules', '.git', '.pignolo', '.venv', 'venv', '__pycache__', 'target', 'dist', 'build', '.next', '.dart_tool', 'vendor']);
const MAX_FILES = 20000;
const MAX_DEPTH = 8;
const SCRIPT_EXT = /\.(?:sh|bash|ps1|py|js|mjs|rb|pl|bat|cmd)$/;
const DOC_EXT = /\.(?:md|mdx|rst)$/i;

function isInstallerPlaceholder(cmd) {
  return typeof cmd === 'string' && PLACEHOLDERS.some((re) => re.test(cmd));
}

// Lista de archivos (rutas con "/"), sin seguir enlaces: un enlace que sale del repo se descarta.
function listFiles(root, fs) {
  const out = [];
  let realRoot = root;
  try { realRoot = fs.realpathSync(root); } catch (_) { /* se usa la ruta tal cual */ }
  const walk = (dir, rel, depth) => {
    if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), r, depth + 1);
      } else if (e.isSymbolicLink()) {
        try {
          const real = fs.realpathSync(path.join(dir, e.name));
          const inside = real === realRoot || real.startsWith(realRoot + path.sep);
          if (inside && fs.statSync(real).isFile()) out.push(r);
        } catch (_) { /* enlace roto: se descarta */ }
      } else if (e.isFile()) out.push(r);
    }
  };
  walk(root, '', 0);
  return out;
}

const anyMatch = (files, pattern) => files.some((f) => matchGlob(pattern, f));

// Candidatas que apuntan a algo que existe, sin duplicar.
const present = (files, candidates) => candidates.filter((p) => anyMatch(files, p));

const rootFile = (files, re) => files.filter((f) => !f.includes('/') && re.test(f));

function readText(fs, root, rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { return null; }
}

function detectNode({ files, root, fs, d }) {
  const pkgText = readText(fs, root, 'package.json');
  if (pkgText === null) return null;
  let pkg;
  try { pkg = JSON.parse(pkgText); } catch (_) {
    d.warnings.push('package.json ilegible: no se deduce nada de él');
    return null;
  }
  if (pkg === null || typeof pkg !== 'object') { d.warnings.push('package.json ilegible: no se deduce nada de él'); return null; }
  const has = (f) => files.includes(f);
  let pm = 'npm';
  let lock = null;
  if (has('pnpm-lock.yaml')) { pm = 'pnpm'; lock = 'pnpm-lock.yaml'; } else if (has('yarn.lock')) { pm = 'yarn'; lock = 'yarn.lock'; } else if (has('bun.lock') || has('bun.lockb')) { pm = 'bun'; lock = has('bun.lock') ? 'bun.lock' : 'bun.lockb'; } else if (has('package-lock.json')) lock = 'package-lock.json';
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const testScript = typeof scripts.test === 'string' ? scripts.test : null;
  const realTest = testScript !== null && testScript.trim() !== '' && !isInstallerPlaceholder(testScript);
  if (testScript !== null && !realTest) d.warnings.push(`scripts.test de package.json es el placeholder del instalador ("${testScript}"): no cuenta como compuerta`);
  const run = (s) => `${pm} run ${s}`;
  const runners = [];
  const mentions = (name) => deps[name] !== undefined || (testScript !== null && new RegExp(`\\b${name}\\b`).test(testScript));
  for (const r of ['vitest', 'jest']) if (mentions(r)) runners.push(r);
  if (testScript !== null && /\bnode\s+(?:--\S+\s+)*--test\b/.test(testScript)) runners.push('node-test');
  if (mentions('playwright') || deps['@playwright/test']) runners.push('playwright');
  if (mentions('cypress')) runners.push('cypress');
  const installs = { npm: 'npm ci', pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --frozen-lockfile', bun: 'bun install --frozen-lockfile' };
  const mutation = deps['@stryker-mutator/core'] !== undefined ? 'stryker' : null;
  return {
    stack: 'node', pm, manifest: 'package.json', realTest, hasLint: !!scripts.lint, hasTypecheck: !!scripts.typecheck, hasBuild: !!scripts.build,
    cmd: run, depsInstall: lock ? installs[pm] : null, runners, mutationTool: mutation, packageTestIsReal: realTest,
  };
}

function detectPython({ files, root, fs }) {
  const manifests = files.filter((f) => !f.includes('/') && (f === 'pyproject.toml' || f === 'pytest.ini' || f === 'setup.cfg' || /^requirements.*\.txt$/.test(f)));
  if (!manifests.length) return null;
  const text = manifests.map((m) => readText(fs, root, m) || '').join('\n');
  const mentions = (name) => new RegExp(`(^|[^A-Za-z0-9_-])${name}([^A-Za-z0-9_-]|$)`, 'm').test(text);
  const has = (f) => files.includes(f);
  let depsInstall = null;
  if (has('uv.lock')) depsInstall = 'uv sync --frozen';
  else if (has('poetry.lock')) depsInstall = 'poetry install';
  else if (has('requirements.txt')) depsInstall = 'pip install -r requirements.txt';
  let lint = null;
  if (has('ruff.toml') || mentions('ruff')) lint = 'ruff check .';
  else if (has('mypy.ini') || mentions('mypy')) lint = 'mypy .';
  const runners = ['pytest'];
  if (mentions('pytest-randomly')) runners.push('pytest-randomly');
  return {
    stack: 'python', pm: has('uv.lock') ? 'uv' : has('poetry.lock') ? 'poetry' : 'pip', manifest: manifests[0], realTest: true, lint, depsInstall, runners,
    mutationTool: mentions('mutmut') ? 'mutmut' : null,
  };
}

function detectGo({ files }) {
  if (!files.includes('go.mod')) return null;
  return { stack: 'go', manifest: 'go.mod', realTest: true, depsInstall: null, runners: ['go'], mutationTool: null };
}

function detectRust({ files }) {
  if (!files.includes('Cargo.toml')) return null;
  return { stack: 'rust', manifest: 'Cargo.toml', realTest: true, depsInstall: null, runners: ['cargo'], mutationTool: files.includes('.cargo/mutants.toml') ? 'cargo-mutants' : null };
}

function detectFlutter({ files, root, fs }) {
  if (!files.includes('pubspec.yaml')) return null;
  const text = readText(fs, root, 'pubspec.yaml') || '';
  const flutter = /^flutter:/m.test(text) || /^\s+sdk:\s*flutter/m.test(text);
  return { stack: 'flutter', manifest: 'pubspec.yaml', realTest: true, dart: !flutter, depsInstall: flutter ? 'flutter pub get' : 'dart pub get', runners: [flutter ? 'flutter' : 'dart'], mutationTool: null };
}

const TEST_CANDIDATES = {
  node: ['**/*.test.*', '**/*.spec.*', '__tests__/', '__mocks__/', '**/__snapshots__/', 'test/', 'tests/', 'e2e/', 'cypress/', 'playwright/', '**/fixtures/'],
  python: ['tests/', 'test_*.py', '*_test.py', 'conftest.py', '**/fixtures/'],
  go: ['*_test.go', 'testdata/'],
  rust: ['tests/'],
  flutter: ['test/', 'integration_test/', '**/goldens/'],
};
// Patrones que cuentan como "hay al menos un test" por stack (las listas de datos como fixtures no).
const TEST_PRESENCE = {
  node: ['**/*.test.*', '**/*.spec.*', '__tests__/', 'test/', 'tests/', 'e2e/'],
  python: ['tests/', 'test_*.py', '*_test.py'],
  go: ['*_test.go'],
  rust: ['tests/'],
  flutter: ['test/', 'integration_test/'],
};

const PROTECTED_CONFIG = [/^vitest\.config\.[cm]?[jt]s$/, /^jest\.config\.[cm]?[jt]s$/, /^jest\.config\.json$/, /^playwright\.config\.[cm]?[jt]s$/, /^cypress\.config\.[cm]?[jt]s$/,
  /^pytest\.ini$/, /^tox\.ini$/, /^\.coveragerc$/, /^conftest\.py$/, /^stryker\.conf(?:ig)?\.[cm]?(?:js|json)$/, /^stryker\.config\.[cm]?js$/];

const RUNNER_CONFIG = { vitest: /^vitest\.config\./, jest: /^jest\.config\./ };

function runnerExcludes(runners, files) {
  const out = [];
  for (const runner of runners) {
    const cfg = (re) => rootFile(files, re)[0] || null;
    if (runner === 'vitest') out.push({ runner, walksDotDirs: 'yes', file: cfg(RUNNER_CONFIG.vitest) || 'vitest.config.ts', snippet: "test: { exclude: [...configDefaults.exclude, '.pignolo/**'] }" });
    else if (runner === 'jest') out.push({ runner, walksDotDirs: 'yes', file: cfg(RUNNER_CONFIG.jest) || 'jest.config.js', snippet: "testPathIgnorePatterns: ['/node_modules/', '/.pignolo/']" });
    else if (runner === 'pytest') out.push({ runner, walksDotDirs: 'unknown', file: cfg(/^pytest\.ini$/) || 'pytest.ini', snippet: 'norecursedirs = .pignolo' });
    else if (runner === 'go') out.push({ runner, walksDotDirs: 'no', file: null, snippet: 'go ignora los directorios que empiezan con "."' });
    else if (runner === 'flutter' || runner === 'dart') out.push({ runner, walksDotDirs: 'no', file: null, snippet: 'solo mira test/' });
    else if (runner === 'node-test' || runner === 'cargo') out.push({ runner, walksDotDirs: 'unknown', file: null, snippet: 'sin medir: ver tests/manual/hito-8.md punto 6' });
  }
  return out;
}

function mutationFor(tool, stackInfo, files) {
  if (!tool) return null;
  const snip = "mutate: process.env.PIGNOLO_MUTATE_FILES?.split('\\n')";
  if (tool === 'stryker') {
    const cfg = rootFile(files, /^stryker\.conf(?:ig)?\.[cm]?(?:js|json)$/)[0] || null;
    return { tool, command: 'npx stryker run', configFile: cfg || 'stryker.config.mjs', configSnippet: snip, thresholdFile: cfg };
  }
  if (tool === 'mutmut') return { tool, command: 'mutmut run', configFile: files.includes('pyproject.toml') ? 'pyproject.toml' : 'setup.cfg', configSnippet: 'paths_to_mutate: leer los archivos de PIGNOLO_MUTATE_FILES (uno por línea)', thresholdFile: null };
  if (tool === 'cargo-mutants') return { tool, command: 'cargo mutants --file $PIGNOLO_MUTATE_FILES', configFile: '.cargo/mutants.toml', configSnippet: 'pasar cada archivo de PIGNOLO_MUTATE_FILES con --file', thresholdFile: '.cargo/mutants.toml' };
  return null;
}

function detectProject({ root, run, fs = nodeFs } = {}) {
  const d = {
    root, stacks: [], packageManager: null, type: null, gates: {}, testPaths: [], protectedTestConfig: [], highRiskPaths: [], contracts: [],
    serialPaths: [], costPaths: [], visiblePaths: [], depsInstall: null, domainRules: [], runners: [], runnerExcludes: [], mutation: null,
    seedPlan: { runner: null, flag: null, reason: 'pending-task-3' }, sources: {}, warnings: [],
  };
  let files = null;
  if (typeof run === 'function') {
    try {
      const out = run(['ls-files', '-co', '--exclude-standard'], { cwd: root });
      const set = new Set(String(out).split('\n').filter(Boolean));
      // ls-files incluye todo lo rastreado; se descartan los directorios pesados y los enlaces se validan con el recorrido.
      files = [...set].filter((f) => !f.split('/').some((s) => SKIP_DIRS.has(s)));
      const walked = new Set(listFiles(root, fs));
      files = files.filter((f) => walked.has(f));
      for (const f of walked) if (!set.has(f)) files.push(f);
    } catch (_) { files = null; }
  }
  if (files === null) files = listFiles(root, fs);
  files = [...new Set(files)].sort();
  const ctx = { files, root, fs, d };

  const infos = [detectNode(ctx), detectPython(ctx), detectGo(ctx), detectRust(ctx), detectFlutter(ctx)].filter(Boolean);
  d.stacks = infos.map((i) => i.stack);
  const nonDoc = files.filter((f) => !DOC_EXT.test(f));
  if (!infos.length) {
    if (files.length && nonDoc.length === 0) { d.stacks.push('docs'); d.type = 'docs'; d.sources.type = 'solo hay archivos .md/.mdx/.rst y ningún manifiesto'; } else if (nonDoc.length === 1 && SCRIPT_EXT.test(nonDoc[0])) { d.stacks.push('script'); d.type = 'script'; d.sources.type = nonDoc[0]; } else d.warnings.push('sin manifiesto reconocido: `type` queda sin declarar');
  }

  const main = infos[0] || null;
  if (infos.length > 1) d.warnings.push(`hay varios stacks (${d.stacks.join(', ')}): las compuertas salen del primero (${main.stack})`);
  if (main) {
    d.packageManager = main.pm || null;
    if (main.stack === 'node') d.packageManager = main.pm;
    d.depsInstall = main.depsInstall;
    if (main.depsInstall) d.sources.depsInstall = main.manifest;
    d.runners = [...new Set(infos.flatMap((i) => i.runners))];
  }

  // testPaths: solo lo que existe.
  const tp = [];
  for (const i of infos) {
    for (const p of present(files, TEST_CANDIDATES[i.stack] || [])) { if (!tp.includes(p)) tp.push(p); }
  }
  d.testPaths = tp;
  if (tp.length) d.sources.testPaths = 'archivos existentes que calzan';
  if (infos.some((i) => i.stack === 'rust')) d.warnings.push('Rust: los #[cfg(test)] en línea no se pueden globar; solo se declara tests/');

  // type y compuertas (R-6).
  if (main) {
    const hasTests = infos.some((i) => present(files, TEST_PRESENCE[i.stack] || []).length > 0);
    const mainHas = present(files, TEST_PRESENCE[main.stack] || []).length > 0;
    const code = (hasTests && main.realTest && mainHas) ? 'code-tested' : 'code-untested';
    d.type = code;
    d.sources.type = main.manifest;
    if (main.stack === 'node') {
      if (main.realTest && !mainHas) d.warnings.push('hay script de test pero ningún test: type queda code-untested');
      const { cmd } = main;
      const edit = main.hasTypecheck ? cmd('typecheck') : main.hasLint ? cmd('lint') : null;
      if (edit) { d.gates['on-edit'] = edit; d.sources['gates.on-edit'] = 'package.json scripts'; }
      if (code === 'code-tested') {
        const onDone = [cmd('test'), ...(main.hasTypecheck ? [cmd('typecheck')] : [])];
        d.gates['on-done'] = onDone.join(' && ');
        d.gates['pre-merge'] = [...onDone, ...(main.hasLint ? [cmd('lint')] : []), ...(main.hasBuild ? [cmd('build')] : [])].join(' && ');
        d.sources['gates.on-done'] = 'package.json scripts.test';
        d.sources['gates.pre-merge'] = 'package.json scripts';
      }
    } else {
      const table = {
        python: { edit: main.lint, done: 'python -m pytest -q', merge: main.lint ? `python -m pytest -q && ${main.lint}` : 'python -m pytest -q' },
        go: { edit: 'go vet ./...', done: 'go test ./...', merge: 'go vet ./... && go test ./...' },
        rust: { edit: 'cargo check', done: 'cargo test', merge: 'cargo clippy -- -D warnings && cargo test' },
        flutter: main.dart
          ? { edit: 'dart analyze', done: 'dart test', merge: 'dart analyze && dart test' }
          : { edit: 'flutter analyze', done: 'flutter test', merge: 'flutter analyze && flutter test' },
      }[main.stack];
      if (table.edit) { d.gates['on-edit'] = table.edit; d.sources['gates.on-edit'] = main.manifest; }
      if (code === 'code-tested') {
        d.gates['on-done'] = table.done; d.gates['pre-merge'] = table.merge;
        d.sources['gates.on-done'] = main.manifest; d.sources['gates.pre-merge'] = main.manifest;
      } else d.warnings.push(`${main.stack}: hay manifiesto pero ningún test: type queda code-untested`);
    }
  }

  // Protección de la configuración de tests (R-8, R-10).
  const prot = [];
  for (const f of files) if (!f.includes('/') && PROTECTED_CONFIG.some((re) => re.test(f))) prot.push(f);
  if (infos.some((i) => i.stack === 'flutter') && files.includes('analysis_options.yaml')) prot.push('analysis_options.yaml');
  const nodeInfo = infos.find((i) => i.stack === 'node');
  if (nodeInfo && nodeInfo.realTest) prot.push('package.json');
  d.protectedTestConfig = [...new Set(prot)];
  if (prot.length) d.sources.protectedTestConfig = 'archivos de configuración del runner que existen';

  d.highRiskPaths = present(files, ['auth/', 'payments/', 'billing/', 'migrations/', 'prisma/', '.github/workflows/', 'Dockerfile', 'docker-compose*.yml', '.env*']);
  if (d.highRiskPaths.length) d.sources.highRiskPaths = 'rutas que existen en el repo';
  const contracts = [];
  for (const p of ['openapi*.yaml', 'openapi*.yml', 'openapi*.json', 'swagger*.yaml', 'swagger*.yml', 'swagger*.json', 'schema.graphql', 'prisma/schema.prisma']) {
    if (p.includes('*')) for (const f of files.filter((x) => matchGlob(p, x))) contracts.push(f);
    else if (files.includes(p)) contracts.push(p);
  }
  if (files.some((f) => f.endsWith('.proto'))) contracts.push('**/*.proto');
  d.contracts = [...new Set(contracts)];
  if (d.contracts.length) d.sources.contracts = 'archivos de contrato que existen';
  const locks = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'uv.lock', 'poetry.lock', 'Cargo.lock', 'go.sum', 'pubspec.lock'].filter((f) => files.includes(f));
  d.serialPaths = [...locks, ...present(files, ['migrations/'])];
  if (d.serialPaths.length) d.sources.serialPaths = 'lockfiles y migraciones que existen';
  d.costPaths = present(files, ['terraform/', '**/*.tf', 'infra/', 'serverless.yml']);
  if (d.costPaths.length) d.sources.costPaths = 'infraestructura que existe';
  d.visiblePaths = present(files, ['src/app/', 'app/routes/', 'src/pages/', 'public/', 'locales/', 'i18n/', 'messages/', 'lib/**/screens/']);
  if (d.visiblePaths.length) d.sources.visiblePaths = 'rutas visibles que existen';

  // domain-rules: solo las rutas, nunca el contenido (R-17).
  d.domainRules = files.filter((f) => f === 'CLAUDE.md' || f === 'AGENTS.md' || f === 'CONTRIBUTING.md'
    || /^\.claude\/rules\/[^/]+\.md$/.test(f) || /^docs\/sessions\/[^/]+\.md$/.test(f) || /^docs\/rules\/[^/]+\.md$/.test(f));
  if (d.domainRules.length) d.sources.domainRules = 'rutas existentes (sin leer su contenido)';

  d.runnerExcludes = runnerExcludes(d.runners, files);
  const tool = infos.map((i) => i.mutationTool).find(Boolean) || null;
  d.mutation = mutationFor(tool, main, files);
  d.seedPlan.runner = d.runners.find((r) => !['playwright', 'cypress', 'pytest-randomly'].includes(r)) || null;
  return d;
}

module.exports = { detectProject, isInstallerPlaceholder, STACKS };
