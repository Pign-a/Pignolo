'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pignoloHome } = require('./home');
const { ROLES } = require('./roles');

const PROFILES = ['max', 'balanced', 'economy'];
const PRESENTATIONS = ['ask', 'artifact', 'text'];
const MODELS = ['opus', 'sonnet'];

function configPath(env = process.env) {
  return path.join(pignoloHome(env), 'config.json');
}

function load(env) {
  const file = configPath(env);
  if (!fs.existsSync(file)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('no object');
    return data;
  } catch (_) {
    throw new Error(`config inválida: ${file}`);
  }
}

function withDefaults(raw) {
  const profile = raw.profile ?? 'balanced';
  return {
    profile,
    models: raw.models ?? {},
    presentation: raw.presentation ?? (profile === 'economy' ? 'text' : 'ask'),
    engram: raw.engram ?? false,
    language: raw.language ?? null,
  };
}

// Lo leído del disco se valida como lo que se escribe; un valor desconocido es el
// mismo error que un JSON inválido. writeConfig sigue pudiendo reparar el archivo.
function readConfig({ env = process.env } = {}) {
  const raw = load(env);
  try { validate(raw); } catch (_) { throw new Error(`config inválida: ${configPath(env)}`); }
  return withDefaults(raw);
}

function validate(partial) {
  if ('profile' in partial && !PROFILES.includes(partial.profile)) {
    throw new Error(`perfil inválido: ${partial.profile}`);
  }
  if ('presentation' in partial && !PRESENTATIONS.includes(partial.presentation)) {
    throw new Error(`presentation inválida: ${partial.presentation}`);
  }
  if ('models' in partial) {
    const m = partial.models;
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('models inválido');
    for (const [role, model] of Object.entries(m)) {
      if (!Object.prototype.hasOwnProperty.call(ROLES, role)) throw new Error(`rol desconocido: ${role}`);
      if (!MODELS.includes(model)) throw new Error(`modelo inválido para ${role}: ${model}`);
    }
  }
}

function writeConfig({ env = process.env } = {}, partial = {}) {
  validate(partial);
  const merged = { ...load(env), ...partial };
  const file = configPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  return withDefaults(merged);
}

function resolveModel(role, { profile = 'balanced', models = {} } = {}) {
  if (!Object.prototype.hasOwnProperty.call(ROLES, role)) throw new Error(`rol desconocido: ${role}`);
  return models[role] ?? ROLES[role].models[profile];
}

module.exports = { configPath, readConfig, writeConfig, resolveModel };
