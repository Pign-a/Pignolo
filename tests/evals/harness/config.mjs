// Configuration loading and shared validation for the measurement harness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..');
export const DEFAULT_CONFIG = path.join(HARNESS_DIR, 'harness.local.json');
export const DEFAULT_CSV = path.join(REPO_ROOT, 'tests', 'evals', 'pignolo2-runs.csv');
export const DEFAULT_GRADES = path.join(REPO_ROOT, 'tests', 'evals', 'pignolo2-grades.json');
export const DEFAULT_EXPERIMENT = 'pignolo2';
export const DEFAULT_WEIGHTS = { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 };

export const DEFAULT_MODEL_FACTOR = { opus: 5, sonnet: 1, haiku: 0.33 };
// Plugins that Claude Code loads in every session whatever the configuration (the first real run listed three of them).
// They load identically for both arms, so they are recorded but are not contamination. Patterns: * is any text.
export const DEFAULT_NEUTRAL_PLUGINS = ['cc-plugin-*'];
// Content Claude Code itself puts in the config dir when it runs logged in with the account (account skills and plugins it
// syncs, and the data folder of each plugin). Identical in both arms, so declared instead of blocked.
export const DEFAULT_NEUTRAL_CONFIG_PATHS = ['skills/synced', 'plugins/synced', 'plugins/data'];
// Arm ids: A, B, or variants such as AF and BF (the same plugin invoked on purpose). The plugin of an arm is its pluginName, not its id.
export const ARM_ID = /^[A-Z][A-Z0-9]{0,3}$/;
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Process notes and project documents that would reveal the arm (or add noise) in a diff given to the
// blind grader. Applied as git pathspec excludes to the blind diff and to the code-only counts.
// A trailing "/" is a folder; a name without "/" matches at any depth.
export const DEFAULT_BLIND_EXCLUDE = [
  '.claude/', '.superpowers/', '.pignolo/', 'docs/superpowers/', 'docs/pignolo/', 'docs/sessions/', 'docs/research/',
  'roadmap.md', 'security.md', 'design.md', 'CLAUDE.md', '.gitignore', '.worktrees/',
];

// Top-level entries of node_modules that tools write while working (caches); not a change of dependencies.
export const DEFAULT_NM_IGNORE = ['.vite', '.vitest', '.cache', '.turbo', '.parcel-cache', '.eslintcache'];

const REQUIRED = ['sourceRepo', 'privateRoot', 'workRoot', 'configDir', 'model', 'permissionMode', 'perRunCapUsd', 'totalCapUsd', 'arms'];

export function validateCopyDirs(list) {
  for (const rel of list || []) {
    const bad = typeof rel !== 'string' || !rel.trim() || rel.trim() === '.' || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)
      || rel.split(/[\\/]/).some((seg) => seg === '..' || seg === '.' || seg === '');
    if (bad) throw new Error(`copyDirs: ruta no permitida: ${JSON.stringify(rel)} (debe ser relativa, sin "." ni ".." ni vacía)`);
  }
  return list || [];
}

const normPath = (p) => path.resolve(String(p)).replace(/[\\/]+$/, '').toLowerCase();
const isInside = (child, parent) => {
  const c = normPath(child);
  const p = normPath(parent);
  return c === p || c.startsWith(p + path.sep);
};

export function loadConfig(file = DEFAULT_CONFIG) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`no se encontró la configuración ${file}; copiá harness.example.json a harness.local.json y completala`);
    }
    throw e;
  }
  let cfg;
  try { cfg = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { throw new Error(`configuración inválida (${file}): ${e.message}`); }
  for (const k of REQUIRED) {
    if (cfg[k] === undefined || cfg[k] === null || cfg[k] === '') throw new Error(`falta "${k}" en la configuración ${file}`);
  }
  for (const a of Object.keys(cfg.arms)) {
    const arm = cfg.arms[a];
    if (!ARM_ID.test(a)) throw new Error(`id de brazo inválido: ${a} (una mayúscula y hasta 3 mayúsculas o dígitos más, por ejemplo A, B, AF)`);
    if (!arm || !arm.pluginName || !arm.pluginDir) throw new Error(`el brazo ${a} necesita pluginName y pluginDir`);
    if (arm.promptPrefix !== undefined && typeof arm.promptPrefix !== 'string') throw new Error(`el promptPrefix del brazo ${a} tiene que ser un texto`);
  }
  // Pairs [control, variant]: each summary rule is evaluated once per pair. By default A against B, or the first two arms.
  const armIds = Object.keys(cfg.arms);
  const pairs = cfg.pairs !== undefined ? cfg.pairs : [armIds.includes('A') && armIds.includes('B') ? ['A', 'B'] : armIds.slice(0, 2)];
  if (!Array.isArray(pairs) || !pairs.length || pairs.some((p) => !Array.isArray(p) || p.length !== 2 || p[0] === p[1] || !armIds.includes(p[0]) || !armIds.includes(p[1]))) {
    throw new Error(`pairs (pares) debe ser una lista de [control, variante] con brazos configurados (los de la configuración: ${armIds.join(', ')})`);
  }
  if (!(Number(cfg.perRunCapUsd) > 0)) throw new Error('perRunCapUsd debe ser un número mayor que 0');
  if (!(Number(cfg.totalCapUsd) > 0)) throw new Error('totalCapUsd debe ser un número mayor que 0');
  if (cfg.effort !== undefined && !EFFORTS.includes(cfg.effort)) throw new Error(`effort debe ser uno de: ${EFFORTS.join(', ')}`);
  // The accept/full commands run through the shell: a "%" in the path would be expanded by cmd.
  if (String(cfg.workRoot).includes('%')) throw new Error('workRoot no puede contener "%" (cmd lo expande en los comandos de aceptación)');
  const folders = [['workRoot', cfg.workRoot], ['privateRoot', cfg.privateRoot], ['sourceRepo', cfg.sourceRepo]];
  for (const [na, a] of folders) {
    for (const [nb, b] of folders) {
      if (na !== nb && isInside(a, b)) throw new Error(`${na} no puede estar dentro de ${nb} (ni a la inversa): el agente podría alcanzar ${nb} desde la corrida`);
    }
  }
  validateCopyDirs(cfg.copyDirs);
  return {
    claudeBin: 'claude',
    claudeArgsPrefix: [],
    extraArgs: [],
    timeoutMs: 30 * 60 * 1000,
    acceptTimeoutMs: 15 * 60 * 1000,
    copyDirs: [],
    seed: 1,
    experiment: DEFAULT_EXPERIMENT,
    tasks: {},
    effort: 'medium',
    extraEnvAllow: [],
    trackProcesses: true,
    nmIgnore: DEFAULT_NM_IGNORE,
    neutralPlugins: DEFAULT_NEUTRAL_PLUGINS,
    neutralConfigPaths: DEFAULT_NEUTRAL_CONFIG_PATHS,
    blindExcludePaths: DEFAULT_BLIND_EXCLUDE,
    csvPath: DEFAULT_CSV,
    gradesPath: DEFAULT_GRADES,
    ...cfg,
    weights: { ...DEFAULT_WEIGHTS, ...(cfg.weights || {}) },
    modelFactor: { ...DEFAULT_MODEL_FACTOR, ...(cfg.modelFactor || {}) },
    // The experiment named in the file; a --experiment flag changes cfg.experiment but not this.
    baseExperiment: cfg.experiment || DEFAULT_EXPERIMENT,
    pairs,
    arms: Object.fromEntries(Object.entries(cfg.arms).map(([id, a]) => [id, { ...a, promptPrefix: a.promptPrefix || '' }])),
    graderSpendPath: cfg.graderSpendPath || path.join(cfg.privateRoot, 'grader-spend.csv'),
  };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function check(cfg, { task, arm, rep }) {
  if (typeof task !== 'string' || !ID.test(task)) throw new Error(`id de tarea inválido: ${task}`);
  if (typeof arm !== 'string' || !ARM_ID.test(arm)) throw new Error(`id de brazo inválido: ${arm}; brazo desconocido (los de la configuración: ${Object.keys(cfg.arms).join(', ')})`);
  if (!cfg.arms[arm]) throw new Error(`brazo desconocido: ${arm} (los de la configuración: ${Object.keys(cfg.arms).join(', ')})`);
  const n = Number(rep);
  if (!Number.isInteger(n) || n < 1) throw new Error(`repetición inválida: ${rep}`);
  return { task, arm, rep: n };
}

// Runs of the configured experiment live in <workRoot>/<task>-<arm>-<rep>; runs of any other experiment (calibration)
// live in <workRoot>/<experiment>/<task>-<arm>-<rep>, so a calibration run can never take the folder of a real one.
export function runPaths(cfg, args) {
  const { task, arm, rep } = check(cfg, args);
  const base = cfg.baseExperiment || cfg.experiment;
  let root = cfg.workRoot;
  if (cfg.experiment && cfg.experiment !== base) {
    if (!ID.test(cfg.experiment)) throw new Error(`nombre de experimento inválido: ${cfg.experiment}`);
    root = path.join(cfg.workRoot, cfg.experiment);
  }
  const dir = path.join(root, `${task}-${arm}-${rep}`);
  return { task, arm, rep, dir, repo: path.join(dir, 'repo'), taskDir: path.join(cfg.privateRoot, task) };
}

// The other plugin: the first arm whose pluginName differs from this arm's (AF and A share a plugin, so AF's other is B).
export const otherArm = (cfg, arm) => Object.keys(cfg.arms).find((a) => cfg.arms[a].pluginName !== cfg.arms[arm].pluginName);
