#!/usr/bin/env node
// Armador de brazos de las pruebas del flujo de pantallas de `ui` (docs/specs/2026-10-24-ui-flujo-design.md, sección 12).
//   node tests/evals/ui-arms.mjs build --arm <id> --src <carpeta del plugin> --out <carpeta> [--force]
// Copia el plugin a --out y arma el brazo QUITANDO pasos: de un paso desactivado no queda nada (su línea en SKILL.md,
// su archivo de referencia y cualquier mención de su nombre de archivo). No gasta nada: solo copia y edita texto.
//
// Brazos de valor (invocación forzada de /pignolo:ui):
//   U0  nada de la sección "Building screens" (equivale al 1.0.0 de la skill ui; con un --src 1.0.0 solo copia)
//   U1  Brief
//   U2  Brief + Pattern sheet (con la carpeta references/patterns/ tal como viene)
//   U3  Brief + Pattern sheet + Critique (el flujo publicado)
//   U2S como U2, pero exige las 15 fichas semilla en la carpeta
//   U2R como U2, SIN las fichas semilla (los patrones se investigan solo bajo demanda)
// Brazos de activación (fase 0), todos sobre la base 1.0.0 (sin la sección ni la línea de work):
//   A0  base 1.0.0 (con un --src 1.0.0 es el árbol sin tocar)
//   A1  A0 + frases de construcción en la description de ui
//   A2  A1 + la línea de work que apunta a ui
//   A3  A0 + las 4 reglas núcleo de UI dentro de work, sin apuntar a ui
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SEED_COUNT = 15;

// La línea que `work` lleva en el plugin publicado. El test comprueba que sea idéntica a la de work/SKILL.md.
export const WORK_LINE = 'When the request creates or redesigns a screen, panel, navigation or interface component, follow the screen-building section of `/pignolo:ui` for that part, because interfaces built without it come out overloaded and flat.';
export const CORE_RULES = 'When the change builds interface: one primary action per view; hover and focus-visible states on everything interactive; never native select or date inputs, use the catalog\'s; each panel states its purpose and its primary action.';
export const DESC_EXTRA = ' Also use when the user asks to build a screen: \'hacé la pantalla de\', \'armá el dashboard\', \'construí el panel\', \'build the screen\', \'make the settings page\'.';
const WORK_ANCHOR = '\n\n## At a milestone';

const STEPS = {
  brief: {
    line: 'references/brief.md',
    files: ['skills/ui/references/brief.md'],
    dirs: [],
    tokens: [/brief\.md/, /design\/screens/],
  },
  patterns: {
    line: 'references/patterns.md',
    files: ['skills/ui/references/patterns.md'],
    dirs: ['skills/ui/references/patterns'],
    tokens: [/patterns\.md/, /references\/patterns/, /design\/patterns/],
  },
  critique: {
    line: 'references/critique.md',
    files: ['skills/ui/references/critique.md'],
    dirs: [],
    tokens: [/critique\.md/],
  },
};
const ALL_STEPS = Object.keys(STEPS);
const SECTION_TOKENS = [/Building screens/, /screen-building/];

// section: la sección existe (U1..U3); workLine: 'keep' | 'remove' | 'add'; coreRules; desc; seeds: 'keep' | 'require' | 'remove'
export const ARMS = {
  U0: { on: [], section: false, workLine: 'remove' },
  U1: { on: ['brief'], section: true, workLine: 'keep' },
  U2: { on: ['brief', 'patterns'], section: true, workLine: 'keep' },
  U3: { on: ['brief', 'patterns', 'critique'], section: true, workLine: 'keep' },
  U2S: { on: ['brief', 'patterns'], section: true, workLine: 'keep', seeds: 'require' },
  U2R: { on: ['brief', 'patterns'], section: true, workLine: 'keep', seeds: 'remove' },
  A0: { on: [], section: false, workLine: 'remove' },
  A1: { on: [], section: false, workLine: 'remove', desc: true },
  A2: { on: [], section: false, workLine: 'add', desc: true },
  A3: { on: [], section: false, workLine: 'remove', coreRules: true },
};

const TEXT_EXT = new Set(['.md', '.json', '.html', '.js', '.mjs', '.css', '.txt', '.yml', '.yaml', '.svg']);

function readText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), eol: raw.includes('\r\n') ? '\r\n' : '\n' };
}
function writeText(file, text, eol) {
  fs.writeFileSync(file, eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc.sort();
}

export function treeSha256(dir) {
  const h = crypto.createHash('sha256');
  for (const rel of walk(dir)) {
    h.update(rel);
    h.update('\0');
    h.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex'));
    h.update('\n');
  }
  return h.digest('hex');
}

// Nunca borra fuera de --out: toda eliminación pasa por aquí.
function safeRemove(out, target, removed, kind) {
  const abs = path.resolve(target);
  if (!isInside(out, abs)) throw new Error(`se negó a borrar fuera de --out: ${abs}`);
  if (!fs.existsSync(abs)) return false;
  fs.rmSync(abs, { recursive: true, force: true });
  removed[kind].push(path.relative(out, abs).split(path.sep).join('/'));
  return true;
}

function prepareOut(src, out, force) {
  if (path.parse(out).root === out) throw new Error('--out no puede ser una raíz de disco');
  if (out === src || isInside(out, src)) throw new Error('--out no puede ser --src ni contenerlo');
  if (isInside(src, out)) throw new Error('--out no puede estar dentro de --src');
  if (fs.existsSync(out)) {
    if (!fs.statSync(out).isDirectory()) throw new Error('--out existe y no es una carpeta');
    const children = fs.readdirSync(out);
    if (children.length > 0) {
      if (!force) throw new Error('--out existe y no está vacío (usar --force para vaciarlo)');
      for (const c of children) fs.rmSync(path.join(out, c), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(out, { recursive: true });
  }
}

function removeStepLine(skillPath, step, removed) {
  const { text, eol } = readText(skillPath);
  const lines = text.split('\n');
  const keep = lines.filter((l) => !l.includes(step.line));
  const n = lines.length - keep.length;
  if (n !== 1) throw new Error(`SKILL.md de ui: ${step.line} aparece en ${n} líneas (se espera 1)`);
  removed.lines.push({ file: 'skills/ui/SKILL.md', text: lines.find((l) => l.includes(step.line)).trim() });
  writeText(skillPath, keep.join('\n'), eol);
}

// Quita la sección entera y renumera las siguientes; devuelve false si la skill no la trae (árbol 1.0.0).
function removeSection(skillPath, removed) {
  const { text, eol } = readText(skillPath);
  const m = text.match(/^## (\d+)\. Building screens\n/m);
  if (!m) return false;
  const start = m.index;
  const rest = text.slice(start + m[0].length);
  const next = rest.search(/^## \d+\./m);
  const end = next === -1 ? text.length : start + m[0].length + next;
  const before = text.slice(0, start);
  const after = text.slice(end).replace(/^## (\d+)\./gm, (_, n) => `## ${Number(n) - 1}.`);
  removed.sections.push(`ui/SKILL.md: ## ${m[1]}. Building screens`);
  writeText(skillPath, before + after, eol);
  return true;
}

function removeWorkLine(workPath, removed) {
  const { text, eol } = readText(workPath);
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => /screen-building section of `\/pignolo:ui`/.test(l));
  if (idx === -1) return false;
  removed.lines.push({ file: 'skills/work/SKILL.md', text: lines[idx].trim() });
  // la línea es un párrafo propio: se va con su renglón en blanco anterior
  const out = lines.slice(0, idx - 1).concat(lines.slice(idx + 1));
  writeText(workPath, out.join('\n'), eol);
  return true;
}

function addToWork(workPath, paragraph, added, what) {
  const { text, eol } = readText(workPath);
  if (!text.includes(WORK_ANCHOR)) throw new Error('work/SKILL.md: no se encontró la sección "At a milestone"');
  writeText(workPath, text.replace(WORK_ANCHOR, `\n\n${paragraph}${WORK_ANCHOR}`), eol);
  added.push(what);
}

function extendDescription(skillPath, added) {
  const { text, eol } = readText(skillPath);
  const m = text.match(/^description: "(.*)"$/m);
  if (!m) throw new Error('ui/SKILL.md: la description no está en una línea entre comillas dobles');
  if (m[1].includes('hacé la pantalla de')) throw new Error('la description de ui ya trae las frases de construcción');
  const next = `description: "${m[1]}${DESC_EXTRA}"`;
  if (next.length - 'description: '.length - 2 > 1536) throw new Error('la description pasaría de 1536 caracteres');
  writeText(skillPath, text.replace(m[0], () => next), eol);
  added.push('skills/ui/SKILL.md: description + frases de construcción');
}

function scanForLeftovers(out, patterns) {
  const hits = [];
  for (const rel of walk(out)) {
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) continue;
    const text = fs.readFileSync(path.join(out, rel), 'utf8');
    for (const re of patterns) if (re.test(text)) hits.push(`${rel}: ${re}`);
    for (const re of patterns) if (re.test(rel)) hits.push(`${rel} (nombre): ${re}`);
  }
  return hits;
}

export function buildArm({ arm, src, out, force = false }) {
  const spec = ARMS[arm];
  if (!spec) throw new Error(`brazo desconocido: ${arm} (válidos: ${Object.keys(ARMS).join(', ')})`);
  const srcAbs = path.resolve(src);
  const outAbs = path.resolve(out);
  const uiSkill = path.join(srcAbs, 'skills', 'ui', 'SKILL.md');
  if (!fs.existsSync(uiSkill) || !fs.existsSync(path.join(srcAbs, 'skills', 'work', 'SKILL.md'))) {
    throw new Error('--src no parece la carpeta del plugin (faltan skills/ui y skills/work)');
  }
  const srcHasSection = /^## \d+\. Building screens$/m.test(readText(uiSkill).text);
  if (spec.section && !srcHasSection) throw new Error(`el brazo ${arm} necesita un --src con la sección "Building screens"`);

  prepareOut(srcAbs, outAbs, force);
  fs.cpSync(srcAbs, outAbs, { recursive: true });

  const removed = { files: [], dirs: [], lines: [], sections: [] };
  const added = [];
  const ui = path.join(outAbs, 'skills', 'ui', 'SKILL.md');
  const work = path.join(outAbs, 'skills', 'work', 'SKILL.md');

  if (!spec.section) {
    removeSection(ui, removed);
    for (const k of ALL_STEPS) {
      for (const f of STEPS[k].files) safeRemove(outAbs, path.join(outAbs, f), removed, 'files');
      for (const d of STEPS[k].dirs) safeRemove(outAbs, path.join(outAbs, d), removed, 'dirs');
    }
  } else {
    for (const k of ALL_STEPS.filter((s) => !spec.on.includes(s))) {
      removeStepLine(ui, STEPS[k], removed);
      for (const f of STEPS[k].files) safeRemove(outAbs, path.join(outAbs, f), removed, 'files');
      for (const d of STEPS[k].dirs) safeRemove(outAbs, path.join(outAbs, d), removed, 'dirs');
    }
  }

  const patternsDir = path.join(outAbs, 'skills', 'ui', 'references', 'patterns');
  if (spec.seeds === 'require') {
    const n = fs.existsSync(patternsDir)
      ? fs.readdirSync(patternsDir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').length : 0;
    if (n !== SEED_COUNT) throw new Error(`U2S pide ${SEED_COUNT} fichas semilla y hay ${n}`);
  }
  if (spec.seeds === 'remove') {
    const ref = path.join(outAbs, 'skills', 'ui', 'references', 'patterns.md');
    const { text, eol } = readText(ref);
    const lines = text.split('\n');
    const keep = lines.filter((l) => !l.includes('references/patterns/'));
    if (keep.length === lines.length) throw new Error('patterns.md no tiene la línea de las fichas del plugin');
    removed.lines.push(...lines.filter((l) => l.includes('references/patterns/')).map((l) => ({ file: 'skills/ui/references/patterns.md', text: l.trim() })));
    writeText(ref, keep.join('\n'), eol);
    safeRemove(outAbs, patternsDir, removed, 'dirs');
  }

  const hasLine = /screen-building section of `\/pignolo:ui`/.test(readText(work).text);
  if (spec.workLine === 'remove') removeWorkLine(work, removed);
  if (spec.workLine === 'add') {
    if (hasLine) removeWorkLine(work, removed);
    addToWork(work, WORK_LINE, added, 'skills/work/SKILL.md: línea que apunta a ui');
  }
  if (spec.coreRules) addToWork(work, CORE_RULES, added, 'skills/work/SKILL.md: 4 reglas núcleo de UI');
  if (spec.desc) extendDescription(ui, added);

  // De un paso desactivado no puede quedar nada en todo el árbol.
  const disabled = spec.section ? ALL_STEPS.filter((s) => !spec.on.includes(s)) : ALL_STEPS;
  const patterns = disabled.flatMap((k) => STEPS[k].tokens);
  if (!spec.section && spec.workLine !== 'add') patterns.push(...SECTION_TOKENS);
  if (spec.seeds === 'remove') patterns.push(/references\/patterns\//);
  const leftovers = scanForLeftovers(outAbs, patterns);
  if (leftovers.length) throw new Error(`quedaron restos de pasos desactivados:\n${leftovers.join('\n')}`);

  return {
    arm,
    src: srcAbs,
    out: outAbs,
    srcHadSection: srcHasSection,
    removed,
    added,
    files: walk(outAbs).length,
    treeSha256: treeSha256(outAbs),
  };
}

function parseArgs(argv) {
  const o = { cmd: argv[0], force: false };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--force') o.force = true;
    else if (a === '--arm') o.arm = argv[++i];
    else if (a === '--src') o.src = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else throw new Error(`argumento desconocido: ${a}`);
  }
  if (o.cmd !== 'build') throw new Error('uso: ui-arms.mjs build --arm <id> --src <plugin> --out <dir> [--force]');
  if (!o.arm || !o.src || !o.out) throw new Error('faltan --arm, --src o --out');
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(buildArm(o), null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 2;
  }
}
