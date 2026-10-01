// Project configuration (spec §3.2, §11.2): <data>/<repoId>/project.json, written only by the
// scripts, with closed keys. repoId is the same hash the core uses for its shadow
// (plugins/pignolo/lib/shadow.js): sha256 of the normalized git-common-dir, 16 hex chars.
//
// repoIdFor(project, { run }) -> string      (run: injectable git runner (args, cwd) -> stdout)
// readConfig({ data, project }) -> { repoId, file, config }   (unreadable file -> ConfigError)
// writeConfig({ data, project, key, value }) -> { repoId, file, config }
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isLoopbackUrl } from './site-fetch.mjs';

export class ConfigError extends Error {}

function normPath(p) {
  let r = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') r = r.toLowerCase();
  return r;
}

const defaultRun = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });

export function repoIdFor(project, { run = defaultRun } = {}) {
  let common;
  try {
    common = String(run(['rev-parse', '--path-format=absolute', '--git-common-dir'], project)).trim();
  } catch {
    common = '';
  }
  if (!common) common = path.join(project, '.git');
  return crypto.createHash('sha256').update(normPath(common)).digest('hex').slice(0, 16);
}

const relInside = (v) => typeof v === 'string' && v.trim() !== '' && !path.isAbsolute(v) && !/^[a-zA-Z]:/.test(v)
  && !v.split(/[\\/]/).includes('..');

const VALIDATORS = {
  devUrl: (v) => (typeof v === 'string' && isLoopbackUrl(v) ? null : 'devUrl debe ser una URL local (localhost o 127.x)'),
  routes: (v) => (Array.isArray(v) && v.every(relInside) ? null : 'routes debe ser una lista de rutas relativas dentro del proyecto'),
  referencePath: (v) => (relInside(v) ? null : 'referencePath debe ser una ruta relativa dentro del proyecto'),
  canvasConsent: (v) => (typeof v === 'boolean' ? null : 'canvasConsent debe ser true o false'),
};

function configFile(data, project, opts) {
  const repoId = repoIdFor(project, opts);
  return { repoId, file: path.join(data, repoId, 'project.json') };
}

export function readConfig({ data, project, ...opts }) {
  const { repoId, file } = configFile(data, project, opts);
  if (!fs.existsSync(file)) return { repoId, file, config: {} };
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('not an object');
    return { repoId, file, config };
  } catch (e) {
    throw new ConfigError(`no se pudo leer ${file}: ${e.message}`);
  }
}

export function writeConfig({ data, project, key, value, ...opts }) {
  if (!Object.prototype.hasOwnProperty.call(VALIDATORS, key)) throw new ConfigError(`clave desconocida: ${key}`);
  const problem = VALIDATORS[key](value);
  if (problem) throw new ConfigError(problem);
  const { repoId, file, config } = readConfig({ data, project, ...opts });
  const next = { ...config, [key]: value };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return { repoId, file, config: next };
}
