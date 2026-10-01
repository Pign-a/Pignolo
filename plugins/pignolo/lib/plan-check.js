'use strict';
// Validación mecánica de un plan contra el código (capas 1 a 3 de la investigación
// 2026-09-30): referencias (rutas, símbolos, firmas, comandos), sintaxis de los bloques
// js y rojo de los bloques de test. Sin IA; determinista. Heurística declarada: lee el
// texto del plan, no lo entiende.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TASK_RE = /^###\s+Task\s+([^\s:]+)/;
const FENCE_RE = /^\s*```(\S*)/;
const JS_LANGS = new Set(['js', 'javascript', 'cjs', 'mjs', 'node']);
const SOURCE_EXT_RE = /\.(?:js|cjs|mjs|ts|py)$/;
const PATH_EXT_RE = /\.(?:js|mjs|cjs|json|md|ts|py|sh|yml|yaml|html|css)$/i;
// Funciones de entorno o de librerías de test que un plan nombra sin que vivan en el repo.
const BUILTINS = new Set(['test', 'it', 'describe', 'fit', 'xit', 'xtest', 'fdescribe', 'xdescribe', 'before', 'after',
  'beforeEach', 'afterEach', 'expect', 'assert', 'require', 'String', 'Number', 'Array', 'Object', 'Promise', 'Boolean',
  'Symbol', 'Error', 'RegExp', 'Date', 'Map', 'Set', 'JSON', 'Math', 'parseInt', 'parseFloat', 'setTimeout',
  'setInterval', 'spawn', 'spawnSync', 'execFileSync', 'execSync', 'exec']);
const KEYWORD_RE = /\b(Create|Crear|Modify|Modificar|Test|Consume|Produce|Produces|exporta|exports)\b:?/g;
const PRODUCERS = new Set(['Create', 'Crear', 'Produce', 'Produces', 'exporta', 'exports']);
const PATH_PLANNERS = new Set(['Create', 'Crear', 'Test']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Divide el plan en líneas de prosa y bloques de código, cada uno con su tarea.
function parsePlan(planText) {
  const prose = [];
  const blocks = [];
  let task = null;
  let open = null;
  planText.split(/\r?\n/).forEach((line, i) => {
    if (open) {
      if (/^\s*```\s*$/.test(line)) { blocks.push(open); open = null; } else open.lines.push(line);
      return;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) { open = { task, lang: fence[1].toLowerCase(), lines: [], line: i + 1 }; return; }
    const head = TASK_RE.exec(line);
    if (head) { task = head[1]; return; }
    prose.push({ task, text: line, line: i + 1 });
  });
  if (open) blocks.push(open);
  return { prose, blocks };
}

// Cada `span` de prosa con el tipo de segmento donde cae: 'produce' (Create, Produce,
// exporta), 'plain' u otro. Las líneas más sangradas heredan el tipo de la línea que las
// abre ("`lib/x.js` exporta:" y sus viñetas).
function spansOf(prose) {
  const out = [];
  let inherit = null; // { indent, kind }
  for (const p of prose) {
    const indent = /^\s*/.exec(p.text)[0].length;
    if (inherit && indent <= inherit.indent) inherit = null;
    const kws = [...p.text.matchAll(KEYWORD_RE)].map((m) => ({ pos: m.index, word: m[1] }));
    const re = /`([^`\n]+)`/g;
    let m;
    while ((m = re.exec(p.text))) {
      let word = null;
      for (const k of kws) if (k.pos < m.index) word = k.word;
      let kind = inherit && inherit.indent < indent ? inherit.kind : 'plain';
      if (word) kind = PRODUCERS.has(word) ? 'produce' : 'plain';
      out.push({ task: p.task, value: m[1].trim(), kind, word, line: p.text });
    }
    const last = kws.length ? kws[kws.length - 1].word : null;
    if (last && PRODUCERS.has(last)) inherit = { indent, kind: 'produce' };
  }
  return out;
}

function buildRootIndex(root) {
  const files = [];
  let entries = [];
  try { entries = fs.readdirSync(root, { recursive: true }); } catch (_) { /* raíz ilegible: sin archivos */ }
  for (const e of entries) {
    const rel = String(e).replace(/\\/g, '/');
    if (/(^|\/)(node_modules|\.git)(\/|$)/.test(rel)) continue;
    files.push(rel);
  }
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) {
      let text = '';
      try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { /* directorio u otro */ }
      cache.set(rel, text);
    }
    return cache.get(rel);
  };
  return { files, sources: files.filter((f) => SOURCE_EXT_RE.test(f)), read, exists: (rel) => fs.existsSync(path.join(root, rel)) };
}

// Contenido del primer paréntesis balanceado desde `open` (índice del '(').
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') { depth -= 1; if (depth === 0) return text.slice(open + 1, i); }
  }
  return text.slice(open + 1);
}

// Nombres de un parámetro destructurado `{ a, b = 1, c: d }`; null si no es destructurado.
function destructured(params) {
  const t = params.trim();
  if (!t.startsWith('{')) return null;
  let depth = 0;
  let end = t.length;
  for (let i = 0; i < t.length; i += 1) {
    if ('{[('.includes(t[i])) depth += 1;
    else if ('}])'.includes(t[i])) { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const inner = t.slice(1, end);
  const parts = [];
  let cur = '';
  depth = 0;
  for (const ch of inner) {
    if ('{[('.includes(ch)) depth += 1;
    if ('}])'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim().replace(/^\.\.\./, '').split(/[=:]/)[0].trim()).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
}

function findDefinitions(name, idx) {
  const n = escapeRe(name);
  const any = [
    new RegExp(`function\\s*\\*?\\s+${n}\\s*\\(`), new RegExp(`def\\s+${n}\\s*\\(`),
    new RegExp(`\\b${n}\\s*=(?!=)`), new RegExp(`exports\\.${n}\\b`),
    new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${n}\\b`), new RegExp(`^\\s*(?:async\\s+)?${n}\\s*\\([^)]*\\)\\s*\\{`, 'm'),
    new RegExp(`\\b${n}\\s*:\\s*(?:async\\s*)?(?:function|\\()`),
  ];
  const withParams = [
    new RegExp(`function\\s*\\*?\\s+${n}\\s*\\(`, 'g'), new RegExp(`\\b${n}\\s*=\\s*(?:async\\s*)?\\(`, 'g'),
    new RegExp(`^\\s*(?:async\\s+)?${n}\\s*\\(`, 'gm'), new RegExp(`\\b${n}\\s*:\\s*(?:async\\s*)?(?:function\\s*)?\\(`, 'g'),
  ];
  const found = { file: null, params: [] };
  for (const f of idx.sources) {
    const text = idx.read(f);
    if (!any.some((re) => re.test(text))) continue;
    found.file = found.file || f;
    for (const re of withParams) {
      let m;
      while ((m = re.exec(text))) {
        const d = destructured(balanced(text, m.index + m[0].length - 1));
        if (d) found.params.push({ file: f, names: d });
      }
    }
  }
  return found;
}

function pathLike(v) {
  if (/\s|[(<>*$~|"']/.test(v) || v.startsWith('-') || v.includes('://') || /^([A-Za-z]:|\/)/.test(v)) return false;
  // Sin extensión y sin barra final no se sabe si es archivo, carpeta o rama: no se verifica.
  return PATH_EXT_RE.test(v) || (v.includes('/') && v.endsWith('/'));
}

function pathOk(v, idx, created) {
  const p = v.replace(/:\d+(-\d+)?$/, '').replace(/^\.\//, '');
  if (idx.exists(p)) return true;
  for (const c of created) if (p === c || c.endsWith(`/${p}`) || (c.endsWith('/') && p.startsWith(c))) return true;
  // Un plan suele omitir el prefijo (`lib/x.js` por `plugins/p/lib/x.js`).
  return idx.files.some((f) => f === p || f.endsWith(`/${p}`));
}

function checkSpan(span, ctx) {
  const { idx, created, produced, inCreated, scripts } = ctx;
  const v = span.value;
  const base = { task: span.task };
  const cmd = /^node\s+(.+)$/.exec(v);
  if (cmd) {
    const files = cmd[1].split(/\s+/).filter((a) => !a.startsWith('-') && !/[<>*$"'|]/.test(a) && pathLike(a));
    if (!files.length) return null;
    const missing = files.filter((f) => !pathOk(f, idx, created));
    return { ...base, kind: 'command', value: v, ok: !missing.length, why: missing.length ? `no existe: ${missing.join(', ')}` : 'ok' };
  }
  const npm = /^npm\s+run\s+([\w:.-]+)/.exec(v);
  if (npm) {
    const ok = Boolean(scripts && scripts[npm[1]]);
    return { ...base, kind: 'command', value: v, ok, why: ok ? 'ok' : `package.json no tiene el script "${npm[1]}"` };
  }
  const sym = /^([A-Za-z_$][\w$]*)\(/.exec(v);
  if (sym && /^[a-z]+\([\w-]+\)!?:\s/.test(v)) return null; // mensaje de commit convencional
  if (sym) {
    const name = sym[1];
    if (BUILTINS.has(name)) return null;
    const planNames = destructured(balanced(v, v.indexOf('(')));
    const def = findDefinitions(name, idx);
    if (!def.file) {
      const ok = produced.has(name) || inCreated.has(name);
      return { ...base, kind: 'symbol', value: v, name, ok, why: ok ? 'lo produce el propio plan' : `no hay definición de ${name} en el repo` };
    }
    if (planNames && planNames.length && def.params.length && !produced.has(name)) {
      const matches = def.params.some((p) => planNames.every((n) => p.names.includes(n)));
      if (!matches) {
        const bad = planNames.filter((n) => !def.params[0].names.includes(n));
        return { ...base, kind: 'symbol', value: v, name, bad, ok: false,
          why: `parámetros que la definición no recibe: ${bad.join(', ')} (${def.params[0].file} recibe { ${def.params[0].names.join(', ')} })` };
      }
    }
    return { ...base, kind: 'symbol', value: v, name, ok: true, why: 'ok' };
  }
  if (pathLike(v)) {
    const ok = pathOk(v, idx, created);
    return { ...base, kind: 'path', value: v, ok, why: ok ? 'ok' : 'no existe en el repo ni lo crea el plan' };
  }
  return null;
}

// `inCreated`: símbolos nombrados en una línea que también nombra un archivo que ESA tarea
// marca Create (bloque Files); se dan por definidos ahí, pero solo si el repo no los define
// (si existen, su firma se sigue comparando).
function createdSymbols(spans) {
  const inCreated = new Set();
  const createdBy = new Map(); // tarea -> rutas Create/Crear
  for (const s of spans) {
    if ((s.word === 'Create' || s.word === 'Crear') && pathLike(s.value)) {
      if (!createdBy.has(s.task)) createdBy.set(s.task, new Set());
      createdBy.get(s.task).add(s.value.replace(/^\.\//, ''));
    }
  }
  for (const s of spans) {
    const m = /^([A-Za-z_$][\w$]*)\(/.exec(s.value);
    if (!m) continue;
    const mine = createdBy.get(s.task);
    if (mine && [...mine].some((c) => s.line.includes(c))) inCreated.add(m[1]);
  }
  return inCreated;
}

function producedSymbols(spans, blocks) {
  const out = new Set();
  for (const s of spans) {
    const m = s.kind === 'produce' && /^([A-Za-z_$][\w$]*)\(/.exec(s.value);
    if (m) out.add(m[1]);
  }
  for (const b of blocks) {
    const code = b.lines.join('\n');
    for (const m of code.matchAll(/function\s*\*?\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g)) out.add(m[1] || m[2]);
  }
  return out;
}

// Sin NODE_TEST_CONTEXT: dentro de un `node --test` el runner anidado no corre como runner.
function cleanEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function nodeCheck(code, lang, tmp, n) {
  const file = path.join(tmp, `block-${n}.${lang === 'mjs' ? 'mjs' : 'js'}`);
  fs.writeFileSync(file, code);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (r.status === 0) return null;
  return (r.stderr || (r.error && r.error.message) || 'node --check falló').split(/\r?\n/).filter(Boolean).slice(0, 4).join(' | ').slice(0, 400);
}

function checkPlan({ planText, root, runTests = false, tmpDir = os.tmpdir() }) {
  const { prose, blocks } = parsePlan(planText);
  const spans = spansOf(prose);
  const idx = buildRootIndex(root);
  let scripts = null;
  try { scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {}; } catch (_) { /* sin package.json */ }
  // Rutas que el plan crea: las de Create/Crear/Test y las que cuelgan de "exporta"/"Produce".
  const created = new Set(spans.filter((s) => (PATH_PLANNERS.has(s.word) || s.kind === 'produce') && pathLike(s.value))
    .map((s) => s.value.replace(/^\.\//, '')));
  const ctx = { idx, created, produced: producedSymbols(spans, blocks), inCreated: createdSymbols(spans), scripts };

  const refs = [];
  const seen = new Set();
  for (const span of spans) {
    const ref = checkSpan(span, ctx);
    if (!ref) continue;
    const key = `${ref.task}|${ref.kind}|${ref.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }

  const tmp = fs.mkdtempSync(path.join(tmpDir, 'plan-check-'));
  try {
    const checked = [];
    const outBlocks = [];
    blocks.forEach((b, i) => {
      if (!JS_LANGS.has(b.lang)) return;
      const code = b.lines.join('\n');
      const error = nodeCheck(code, b.lang, tmp, i);
      checked.push({ b, code });
      outBlocks.push({ task: b.task, lang: b.lang, ok: error === null, error });
    });
    let tests = null;
    if (runTests) {
      tests = [];
      // Copia del repo (sin .git ni node_modules): sirve con raíces que no son un repo
      // git y no deja estado de git que limpiar.
      const copy = path.join(tmp, 'copy');
      fs.cpSync(root, copy, { recursive: true, filter: (src) => !/(^|[\\/])(\.git|node_modules)$/.test(src) });
      for (const { b, code } of checked) {
        const first = /^\s*\/\/\s*test:\s*(\S+)/.exec(code);
        if (!first) continue;
        const rel = first[1];
        const target = path.resolve(copy, rel);
        const back = path.relative(copy, target);
        if (back.startsWith('..') || path.isAbsolute(back)) {
          tests.push({ task: b.task, file: rel, red: false, exit: null, tail: 'ruta fuera del repo' });
          continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, code);
        const r = spawnSync(process.execPath, ['--test', rel], { cwd: copy, env: cleanEnv(), encoding: 'utf8', timeout: 60000, windowsHide: true });
        const exit = typeof r.status === 'number' ? r.status : null;
        tests.push({ task: b.task, file: rel, red: exit !== null && exit !== 0, exit, tail: `${r.stdout || ''}${r.stderr || ''}`.slice(-400) });
      }
    }
    return { refs, blocks: outBlocks, tests };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

// Un plan en tarjetas (R-4): un `### Task` con `**Files:**` o `**Interfaces:**` en las 60
// líneas siguientes. plan-check no aplica a un plan en prosa.
function isCardPlan(planText) {
  const lines = String(planText || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^###\s+Task\b/.test(lines[i])) continue;
    for (let j = i + 1; j <= i + 60 && j < lines.length; j += 1) {
      if (/^\s*\*\*(Files|Interfaces):\*\*/.test(lines[j])) return true;
    }
  }
  return false;
}

function problemCount(res) {
  return res.refs.filter((r) => !r.ok).length + res.blocks.filter((b) => !b.ok).length + (res.tests || []).filter((t) => !t.red).length;
}

// Los problemas como hallazgos en el formato de la prueba (task, kind, evidence, keywords).
function toFindings(res) {
  const out = [];
  for (const r of res.refs.filter((x) => !x.ok)) {
    const keywords = r.kind === 'symbol' ? [r.name, ...(r.bad || [])] : [r.value];
    out.push({ task: r.task, kind: `missing-${r.kind}`, evidence: `${r.value}: ${r.why}`, keywords });
  }
  for (const b of res.blocks.filter((x) => !x.ok)) out.push({ task: b.task, kind: 'broken-block', evidence: b.error, keywords: ['node --check'] });
  for (const t of (res.tests || []).filter((x) => !x.red)) {
    out.push({ task: t.task, kind: 'test-cannot-fail', evidence: `el test de ${t.file} no falla contra el código actual (exit ${t.exit})`, keywords: [t.file] });
  }
  return out;
}

module.exports = { checkPlan, problemCount, toFindings, parsePlan, isCardPlan };
