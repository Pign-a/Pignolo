'use strict';
// CLI del piso de riesgo (spec §4.2).
// Uso: node risk.js (--files-from <archivo> [--deleted <ruta>]... | --diff <base>) [--cwd <dir>] [--ref <sha>]
const fs = require('node:fs');
const path = require('node:path');
const { assessRisk } = require('../lib/risk');
const { readProjectConfig } = require('../lib/project-config');
const { workingTree, changedFiles, addedLines } = require('../lib/changes');

const { gitRun, isGitFailure } = require('../lib/git');

const CLI_TIMEOUT_MS = 10000; // la CLI no corre bajo el plazo de 3 s de un hook

// HEAD existe (el repo tiene commits). Solo un fallo de git dice que no; un plazo vencido se propaga.
function hasHead(cwd) {
  try {
    gitRun(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], cwd, { timeout: CLI_TIMEOUT_MS });
    return true;
  } catch (e) {
    if (isGitFailure(e)) return false;
    throw e;
  }
}

const USAGE = 'uso: node risk.js (--files-from <archivo> [--deleted <ruta>]... | --diff <base>) [--cwd <dir>] [--ref <sha>]\n';

function parseArgs(argv) {
  const o = { deleted: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!['--files-from', '--deleted', '--diff', '--cwd', '--ref'].includes(k) || v === undefined) return null;
    i += 1;
    if (k === '--deleted') o.deleted.push(v);
    else o[k.slice(2).replace('-f', 'F')] = v;
  }
  if ((o.filesFrom === undefined) === (o.diff === undefined)) return null;
  if (o.diff !== undefined && (o.deleted.length || o.diff.startsWith('-'))) return null;
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o) {
    process.stderr.write(USAGE);
    return 2;
  }
  const cwd = path.resolve(o.cwd || process.cwd());
  // project.md desde el commit (HEAD o --ref); la copia de trabajo solo en un repo sin commits.
  let config;
  if (o.ref) config = readProjectConfig({ root: cwd, ref: o.ref, timeoutMs: CLI_TIMEOUT_MS });
  else if (hasHead(cwd)) config = readProjectConfig({ root: cwd, ref: 'HEAD', timeoutMs: CLI_TIMEOUT_MS });
  else config = readProjectConfig({ root: cwd });
  let files;
  let lines = [];
  if (o.filesFrom !== undefined) {
    const list = fs.readFileSync(o.filesFrom, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    files = [...list.map((p) => ({ path: p, status: 'M' })), ...o.deleted.map((p) => ({ path: p, status: 'D' }))];
  } else {
    const tree = workingTree({ cwd });
    files = changedFiles({ cwd, base: o.diff, tree, sizes: false }).map(({ path: p, status }) => ({ path: p, status }));
    lines = addedLines({ cwd, base: o.diff, tree });
  }
  const result = assessRisk({ files, lines, config });
  process.stdout.write(`${JSON.stringify({ ...result, config: { found: config.found, warnings: config.warnings } })}\n`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  process.stderr.write(`pignolo risk: ${e.message}\n`);
  process.exitCode = 1;
}
