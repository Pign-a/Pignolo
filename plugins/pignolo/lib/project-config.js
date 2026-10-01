'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withDeadline, isGitFailure } = require('./git');
const { parseFrontmatter, YamlLiteError } = require('./yaml-lite');

const PROJECT_MD = '.pignolo/project.md';
// Anclados (A8D-01): `*test*` y `*spec*` sin ancla casaban cualquier segmento (docs/specs/, docs/research/latest.md).
// Un proyecto con otra convención declara sus `test-paths` en project.md: lo declarado se respeta tal cual.
const DEFAULT_TEST_PATHS = Object.freeze(['**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/test_*.py', '__tests__/', '__snapshots__/', '__mocks__/', 'fixtures/', 'test/', 'tests/']);
const TYPES = Object.freeze(['code-tested', 'code-untested', 'docs', 'script']);
const GATE_KEYS = ['on-edit', 'on-done', 'pre-merge', 'live-check', 'mutation'];
const LIST_KEYS = {
  'test-paths': 'testPaths',
  'protected-test-config': 'protectedTestConfig',
  'high-risk-paths': 'highRiskPaths',
  contracts: 'contracts',
  'serial-paths': 'serialPaths',
  'cost-paths': 'costPaths',
  'visible-paths': 'visiblePaths',
  'pii-patterns': 'piiPatterns',
  'domain-rules': 'domainRules',
};
const PRESENTATIONS = ['ask', 'artifact', 'text'];
const SCALAR_KEYS = { 'deps-install': 'depsInstall', language: 'language', profile: 'profile' };
const KNOWN = new Set(['type', 'gates', 'mutation', 'presentation', 'canvas-consent', ...Object.keys(LIST_KEYS), ...Object.keys(SCALAR_KEYS)]);

const invalid = (msg) => new Error(`project.md inválido: ${msg}`);

function emptyConfig() {
  return {
    found: false, conservative: true, type: null, gates: {},
    testPaths: [...DEFAULT_TEST_PATHS], testPathsDeclared: false,
    protectedTestConfig: [PROJECT_MD], highRiskPaths: [], contracts: [], serialPaths: [],
    costPaths: [], visiblePaths: [], piiPatterns: [], depsInstall: null, domainRules: [],
    mutation: false, language: null, profile: null, presentation: null, canvasConsent: false, warnings: [],
  };
}

function asList(key, v) {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'object') throw invalid(`${key}: se esperaba una lista`);
  return [String(v)];
}

function buildConfig(text) {
  let data;
  try {
    ({ data } = parseFrontmatter(text));
  } catch (e) {
    if (e instanceof YamlLiteError) throw invalid(e.message);
    throw e;
  }
  const c = emptyConfig();
  c.found = true;
  c.conservative = false;

  if (data.type !== undefined && data.type !== null) {
    if (!TYPES.includes(data.type)) throw invalid(`type "${data.type}" no es ninguno de ${TYPES.join(' | ')}`);
    c.type = data.type;
  }
  if (data.gates !== undefined && data.gates !== null) {
    if (typeof data.gates !== 'object' || Array.isArray(data.gates)) throw invalid('gates: se esperaba un mapa (on-edit, on-done, pre-merge, live-check, mutation)');
    for (const [k, v] of Object.entries(data.gates)) {
      if (!GATE_KEYS.includes(k)) c.warnings.push(`gates: clave desconocida "${k}" (se ignora)`);
      else if (typeof v !== 'string' || v.trim() === '') c.warnings.push(`gates.${k}: se esperaba un comando (se ignora)`);
      else c.gates[k] = v;
    }
  }
  if (data.mutation !== undefined && data.mutation !== null) {
    if (typeof data.mutation !== 'boolean') throw invalid('mutation: se esperaba true o false');
    c.mutation = data.mutation;
  }
  // Claves aditivas de la presentación (R-9): un valor inválido es un aviso, no un error.
  if (data.presentation !== undefined && data.presentation !== null) {
    if (PRESENTATIONS.includes(data.presentation)) c.presentation = data.presentation;
    else c.warnings.push(`presentation: "${data.presentation}" no es ninguno de ${PRESENTATIONS.join(' | ')} (se ignora)`);
  }
  if (data['canvas-consent'] !== undefined && data['canvas-consent'] !== null) {
    if (typeof data['canvas-consent'] === 'boolean') c.canvasConsent = data['canvas-consent'];
    else c.warnings.push('canvas-consent: se esperaba true o false (se ignora)');
  }
  for (const [key, prop] of Object.entries(LIST_KEYS)) c[prop] = asList(key, data[key]);
  for (const [key, prop] of Object.entries(SCALAR_KEYS)) {
    const v = data[key];
    if (v !== undefined && v !== null && typeof v !== 'object') c[prop] = String(v);
  }
  // {seed} solo lo expande la compuerta en sus comandos de nivel (D-8-3); la mutación recibe archivos, no semilla.
  if (c.gates.mutation && c.gates.mutation.includes('{seed}')) c.warnings.push('gates.mutation: {seed} no se expande (la mutación recibe PIGNOLO_MUTATE_FILES, no una semilla)');
  if (c.depsInstall && c.depsInstall.includes('{seed}')) c.warnings.push('deps-install: {seed} no se expande (solo en los comandos de compuerta)');
  for (const key of Object.keys(data)) if (!KNOWN.has(key)) c.warnings.push(`clave desconocida "${key}" (se ignora)`);

  for (const p of c.piiPatterns) {
    try { new RegExp(p); } catch (_) { throw invalid(`pii-patterns: "${p}" no es una regex válida`); }
  }
  c.testPathsDeclared = data['test-paths'] !== undefined && data['test-paths'] !== null && c.testPaths.length > 0;
  if (!c.testPathsDeclared) {
    c.testPaths = [...DEFAULT_TEST_PATHS];
    c.warnings.push(`test-paths sin declarar: se usan los de por defecto (${DEFAULT_TEST_PATHS.join(', ')})`);
  }
  if (!c.protectedTestConfig.includes(PROJECT_MD)) c.protectedTestConfig.push(PROJECT_MD);
  return c;
}

function notFound() {
  const c = emptyConfig();
  c.warnings.push('sin .pignolo/project.md: modo conservador; corré /pignolo:init');
  return c;
}

function readProjectConfig({ root, ref, timeoutMs = 1000, run } = {}) {
  let text;
  if (ref) {
    if (String(ref).startsWith('-')) throw new Error(`ref inválida: ${ref}`);
    const git = run || withDeadline(root, timeoutMs);
    try {
      git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root });
    } catch (e) {
      // Solo un fallo de git dice que la ref no existe; un plazo vencido (o git ausente) no.
      if (isGitFailure(e)) throw new Error(`la ref ${ref} no existe en ${root}: ${e.message}`);
      throw new Error(`no se pudo leer la ref ${ref} en ${root} (plazo vencido o git no disponible): ${e.message}`);
    }
    try {
      text = git(['show', `${ref}:${PROJECT_MD}`], { cwd: root });
    } catch (e) {
      if (isGitFailure(e)) return notFound(); // la ref existe pero no tiene el archivo
      throw new Error(`no se pudo leer ${PROJECT_MD} en ${ref} (plazo vencido o git no disponible): ${e.message}`);
    }
  } else {
    try {
      text = fs.readFileSync(path.join(root, PROJECT_MD), 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return notFound();
      throw e;
    }
  }
  return buildConfig(text);
}

module.exports = { readProjectConfig, DEFAULT_TEST_PATHS, TYPES };
