'use strict';
// Ubicar la auto-memoria de Claude Code para un proyecto (R-14, A8-10, A8-14, A8-15). Solo lectura
// de metadatos: nombres de archivo y los settings que fijan la carpeta. NUNCA abre ni lee un archivo
// de la memoria (puede tener rutas, nombres, tokens o datos del dominio); `init` no la migra.
const nodeFs = require('node:fs');
const path = require('node:path');
const { userHomes } = require('./home');
const { mainRoot } = require('./disabled');

const MAX_SLUG = 200;

// Un solo directorio de configuración (A8-10): CLAUDE_CONFIG_DIR si está definida, si no ~/.claude.
function configDir(env = process.env) {
  if (env.CLAUDE_CONFIG_DIR && env.CLAUDE_CONFIG_DIR.trim()) return env.CLAUDE_CONFIG_DIR;
  return path.join(userHomes(env)[0], '.claude');
}

function hash32(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// Cada unidad UTF-16 que no es [A-Za-z0-9] pasa a "-"; recortado a 200 más "-<hash36>" (A8-14).
function memorySlug(absRoot) {
  const slug = String(absRoot).replace(/[^A-Za-z0-9]/g, '-');
  if (slug.length <= MAX_SLUG) return slug;
  return `${slug.slice(0, MAX_SLUG)}-${Math.abs(hash32(String(absRoot))).toString(36)}`;
}

function overrideFrom(fs, file, home) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (_) { return null; }
  const v = data && typeof data === 'object' ? data.autoMemoryDirectory : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  return v.startsWith('~/') || v.startsWith('~\\') ? path.join(home, v.slice(2)) : v;
}

function isDir(fs, p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

function locateAutoMemory({ main, env = process.env, fs = nodeFs } = {}) {
  const root = mainRoot(main); // desde una worktree o un subdirectorio, la raíz canónica (C-01)
  const cfg = configDir(env);
  const home = userHomes(env)[0];
  const candidates = [];
  const local = overrideFrom(fs, path.join(root, '.claude', 'settings.local.json'), home);
  if (local) candidates.push(local);
  const user = overrideFrom(fs, path.join(cfg, 'settings.json'), home);
  if (user) candidates.push(user);
  candidates.push(path.join(cfg, 'projects', memorySlug(root), 'memory'));
  const notes = [];
  if (env.CLAUDE_COWORK_MEMORY_PATH_OVERRIDE || env.CLAUDE_CODE_REMOTE_MEMORY_DIR || env.CLAUDE_CODE_PROJECT_DIR_NAME) notes.push('env-override');
  const tried = [];
  for (const dir of candidates) {
    tried.push(dir);
    if (!isDir(fs, dir)) continue;
    let files = 0;
    try {
      files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /\.md$/i.test(e.name) && e.name !== 'MEMORY.md').length;
    } catch (_) { files = 0; }
    return { dir, tried, files, notes };
  }
  return { dir: null, tried, files: 0, notes };
}

module.exports = { configDir, memorySlug, locateAutoMemory };
