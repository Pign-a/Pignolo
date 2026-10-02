'use strict';
// El mapa `places` de project.md (hito 8d, R-1 a R-4, R-24): tipo -> carpeta de lo que no es código.
const { matchAny } = require('./globs');

const PLACE_KINDS = Object.freeze(['spec', 'plan', 'research', 'reference', 'design', 'private']);
// Sin `reference` (R-4): solo existe si está declarado.
const PLACE_DEFAULTS = Object.freeze({ spec: 'docs/specs/', plan: 'docs/plans/', research: 'docs/research/', design: 'design/', private: 'local/' });
const RECOMMENDED_REFERENCE = 'docs/references/';

const MAX_LEN = 100;
const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const PROTECTED_ROOTS = ['.pignolo', '.git', '.claude', 'node_modules'];
const FRAMEWORK_NAMES = ['src', 'app', 'pages', 'public', 'lib', 'test', 'tests', 'cmd', 'internal', 'packages', 'apps', 'bin', 'build', 'dist'];
const DECLARED_LISTS = ['testPaths', 'highRiskPaths', 'contracts', 'serialPaths'];

// R-24: insensible a mayúsculas salvo en Linux.
const fold = (s) => (process.platform === 'linux' ? s : s.toLowerCase());
const withSlash = (p) => (p.endsWith('/') ? p : `${p}/`);
const samePath = (a, b) => fold(withSlash(String(a))) === fold(withSlash(String(b)));
// `child` está estrictamente dentro de `parent` (la misma ruta no cuenta).
const isInside = (child, parent) => {
  const c = fold(withSlash(String(child)));
  const p = fold(withSlash(String(parent)));
  return c !== p && c.startsWith(p);
};

// R-3: el primer patrón DECLARADO que casa el archivo. Los defaults de test-paths no cuentan.
function declaredPatternFor(config, relFile) {
  if (!config) return null;
  for (const prop of DECLARED_LISTS) {
    if (prop === 'testPaths' && !config.testPathsDeclared) continue;
    const list = Array.isArray(config[prop]) ? config[prop] : [];
    for (const p of list) if (matchAny([p], relFile)) return p;
  }
  return null;
}

const bad = (reason, detail) => (detail === undefined ? { ok: false, reason } : { ok: false, reason, detail });

function validatePlacePath(raw, { config } = {}) {
  if (typeof raw !== 'string' || raw === '') return bad('empty-segment');
  if (raw.startsWith('/')) return bad('absolute');
  if (raw.includes('\\')) return bad('backslash');
  if (/^[A-Za-z]:/.test(raw)) return bad('drive');
  if (raw.length > MAX_LEN) return bad('too-long');
  const body = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  const segs = body.split('/');
  for (const s of segs) {
    if (s === '') return bad('empty-segment');
    if (s === '.' || s === '..') return bad('dot-segment');
    if (/[<>:"|?*]/.test(s)) return bad('bad-char');
    if (/[. ]$/.test(s)) return bad('trailing-dot-or-space');
    if (RESERVED_WIN.test(s.split('.')[0])) return bad('reserved-name');
  }
  const first = segs[0].toLowerCase();
  if (PROTECTED_ROOTS.includes(first)) return bad('inside-protected');
  const path = `${body}/`;
  // Los patrones declarados se aplican archivo por archivo: se prueba un archivo representativo del árbol.
  const pat = declaredPatternFor(config, `${path}x.md`);
  if (pat) return bad('inside-test-paths', pat);
  if (FRAMEWORK_NAMES.includes(first)) return bad('framework-name');
  return { ok: true, path };
}

const REASON_TEXT = {
  absolute: 'es absoluta', backslash: 'usa "\\" (usá "/")', 'dot-segment': 'tiene "." o ".."', 'empty-segment': 'está vacía o tiene "//"',
  drive: 'tiene letra de unidad', 'too-long': 'pasa de 100 caracteres', 'reserved-name': 'usa un nombre reservado de Windows',
  'bad-char': 'tiene caracteres inválidos', 'trailing-dot-or-space': 'termina en punto o espacio', 'inside-protected': 'cae dentro de una carpeta protegida',
  'framework-name': 'es un nombre que reserva un framework', 'inside-test-paths': 'casa un patrón declarado de tests o rutas de riesgo',
};

// Quién pierde en una colisión entre rutas efectivas: la declarada; si las dos lo están, la que contiene a la otra;
// si son la misma, la posterior.
function loser(a, b) {
  if (a.source !== 'declared' && b.source !== 'declared') return null;
  if (a.source !== 'declared') return b;
  if (b.source !== 'declared') return a;
  if (isInside(b.path, a.path)) return a;
  if (isInside(a.path, b.path)) return b;
  return b;
}

function resolvePlaces(config) {
  const declared = (config && config.places) || {};
  const warnings = [];
  const places = {};
  for (const kind of PLACE_KINDS) {
    const def = PLACE_DEFAULTS[kind];
    const raw = declared[kind];
    if (raw !== undefined && raw !== null && raw !== '') {
      const v = validatePlacePath(String(raw), { config });
      if (v.ok) { places[kind] = { kind, path: v.path, source: 'declared' }; continue; }
      warnings.push(`places.${kind}: "${raw}" ${REASON_TEXT[v.reason] || v.reason}${v.detail ? ` (${v.detail})` : ''}: ${def ? `se usa el de por defecto (${def})` : 'se ignora'}`);
    }
    places[kind] = def ? { kind, path: def, source: 'default' } : { kind, path: null, source: 'undeclared' };
  }
  for (let guard = 0; guard < 20; guard += 1) {
    const live = PLACE_KINDS.map((k) => places[k]).filter((p) => p.path);
    let hit = null;
    for (let i = 0; i < live.length && !hit; i += 1) {
      for (let j = i + 1; j < live.length && !hit; j += 1) {
        const a = live[i];
        const b = live[j];
        if (samePath(a.path, b.path) || isInside(a.path, b.path) || isInside(b.path, a.path)) hit = [a, b];
      }
    }
    if (!hit) break;
    const l = loser(hit[0], hit[1]);
    if (!l) break;
    const other = l === hit[0] ? hit[1] : hit[0];
    const how = samePath(l.path, other.path)
      ? `colisiona (case-collision o misma ruta) con places.${other.kind} ("${other.path}")`
      : (isInside(other.path, l.path) ? `"${l.path}" contiene "${other.path}" (places.${other.kind})` : `"${l.path}" está dentro de "${other.path}" (places.${other.kind})`);
    const def = PLACE_DEFAULTS[l.kind];
    warnings.push(`places.${l.kind}: ${how}: ${def ? `se usa el de por defecto (${def})` : 'se ignora'}`);
    places[l.kind] = def ? { kind: l.kind, path: def, source: 'default' } : { kind: l.kind, path: null, source: 'undeclared' };
  }
  return { places, warnings };
}

function placeFor(config, kind) {
  if (!PLACE_KINDS.includes(kind)) {
    const e = new Error(`tipo de lugar desconocido: ${kind} (${PLACE_KINDS.join(', ')})`);
    e.kind = 'unknown-kind';
    throw e;
  }
  return resolvePlaces(config).places[kind];
}

module.exports = {
  PLACE_KINDS, PLACE_DEFAULTS, RECOMMENDED_REFERENCE, validatePlacePath, declaredPatternFor, resolvePlaces, placeFor, samePath, isInside,
};
