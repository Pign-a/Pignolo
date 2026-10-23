// Configuration loading and shared validation for the measurement harness.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..');
export const DEFAULT_CONFIG = path.join(HARNESS_DIR, 'harness.local.json');
export const DEFAULT_CSV = path.join(REPO_ROOT, 'tests', 'evals', 'pignolo2-runs.csv');
export const DEFAULT_GRADES = path.join(REPO_ROOT, 'tests', 'evals', 'pignolo2-grades.json');
export const DEFAULT_WEIGHTS = { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 };

// Generic process artifacts that would reveal the arm in a diff given to the blind grader.
export const DEFAULT_BLIND_EXCLUDE = ['.claude/', '.superpowers/', '.pignolo/', 'docs/superpowers/', 'docs/pignolo/'];

const REQUIRED = ['sourceRepo', 'privateRoot', 'workRoot', 'configDir', 'model', 'permissionMode', 'perRunCapUsd', 'arms'];

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
    if (!arm || !arm.pluginName || !arm.pluginDir) throw new Error(`el brazo ${a} necesita pluginName y pluginDir`);
  }
  if (!(Number(cfg.perRunCapUsd) > 0)) throw new Error('perRunCapUsd debe ser un número mayor que 0');
  return {
    claudeBin: 'claude',
    claudeArgsPrefix: [],
    extraArgs: [],
    timeoutMs: 30 * 60 * 1000,
    acceptTimeoutMs: 15 * 60 * 1000,
    copyDirs: [],
    seed: 1,
    experiment: 'pignolo2',
    tasks: {},
    blindExcludePaths: DEFAULT_BLIND_EXCLUDE,
    csvPath: DEFAULT_CSV,
    gradesPath: DEFAULT_GRADES,
    ...cfg,
    weights: { ...DEFAULT_WEIGHTS, ...(cfg.weights || {}) },
  };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function check(cfg, { task, arm, rep }) {
  if (typeof task !== 'string' || !ID.test(task)) throw new Error(`id de tarea inválido: ${task}`);
  if (!cfg.arms[arm]) throw new Error(`brazo desconocido: ${arm} (los de la configuración: ${Object.keys(cfg.arms).join(', ')})`);
  const n = Number(rep);
  if (!Number.isInteger(n) || n < 1) throw new Error(`repetición inválida: ${rep}`);
  return { task, arm, rep: n };
}

export function runPaths(cfg, args) {
  const { task, arm, rep } = check(cfg, args);
  const dir = path.join(cfg.workRoot, `${task}-${arm}-${rep}`);
  return { task, arm, rep, dir, repo: path.join(dir, 'repo'), taskDir: path.join(cfg.privateRoot, task) };
}

export const otherArm = (cfg, arm) => Object.keys(cfg.arms).find((a) => a !== arm);
