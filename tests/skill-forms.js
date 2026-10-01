'use strict';
// Ayudas para los tests de forma de las skills de carriles (hito 3b). No es un test.
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT } = require('./helpers');
const { parseFrontmatter } = require('../plugins/pignolo/lib/yaml-lite');

// Verbos que aceptan hoy los scripts que las skills operan.
const VERBS = {
  'run.js': ['start', 'task', 'renew', 'status', 'end'],
  'ledger.js': ['validate', 'plan', 'judgment', 'refute', 'build', 'repro', 'round', 'next', 'frozen', 'save'],
  'setup.js': ['check', 'models', 'permissions', 'config', 'conflicts'],
  'init.js': ['detect', 'preview', 'apply', 'verify'],
};

function readSkill(name) {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8');
  return { text, ...parseFrontmatter(text) };
}

// Todo script y plantilla que la skill nombra existe, y todo verbo de run/ledger/setup es real.
function brokenReferences(text) {
  const out = [];
  for (const m of text.matchAll(/(?:\$\{CLAUDE_PLUGIN_ROOT\}|<P>)\/((?:scripts|templates)\/[\w.-]+)/g)) {
    if (!fs.existsSync(path.join(PLUGIN_ROOT, m[1]))) out.push(m[1]);
  }
  for (const m of text.matchAll(/\b(run\.js|ledger\.js|setup\.js|init\.js)"? ([a-z][a-z-]*)/g)) {
    if (!VERBS[m[1]].includes(m[2])) out.push(`${m[1]} ${m[2]}`);
  }
  return out;
}

module.exports = { readSkill, brokenReferences, VERBS };
