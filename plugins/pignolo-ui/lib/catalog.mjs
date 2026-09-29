// Rule catalog (spec §5.1): catalog/rules.json is the single source.
//
// loadCatalog(file?) -> { catalogVersion, note, rules }
// checkCatalog(catalog) -> [problem strings]; [] when the catalog is sound:
//   duplicate ids; a §5.1 field missing or invalid; checker outside ui-check|design-md|browser;
//   class script with checker browser or class browser with another checker; related/conflicts
//   ids that do not exist; two conflicting rules present at once (on a shared platform);
//   a floor rule that accepts intentional; a source without a version or a consultation date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATALOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog', 'rules.json');

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

export function loadCatalog(file = CATALOG_FILE) {
  return JSON.parse(stripBom(fs.readFileSync(file, 'utf8')));
}

const ENUMS = {
  class: ['script', 'browser', 'agent'],
  level: ['document', 'element', 'style'],
  platform: ['D', 'M', 'D+M'],
  severity: ['bloquea', 'alto', 'medio', 'detalle'],
  checker: ['ui-check', 'design-md', 'browser'],
};
const VERSIONED = /\b(\d+\.\d+|\d{4}-\d{2}-\d{2})\b/;
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const platforms = (p) => (p === 'D+M' ? ['D', 'M'] : [p]);

export function checkCatalog(catalog) {
  const problems = [];
  const rules = catalog && Array.isArray(catalog.rules) ? catalog.rules : null;
  if (!rules) return ['catalog has no rules list'];
  const byId = new Map();
  for (const r of rules) {
    const id = r && r.id;
    if (!isStr(id) || !/^[A-Z0-9]+-\d{2}$/.test(id)) { problems.push(`invalid id ${JSON.stringify(id)}`); continue; }
    if (byId.has(id)) problems.push(`duplicate id ${id}`);
    else byId.set(id, r);
    if (!isStr(r.criterion)) problems.push(`${id}: criterion is missing or empty`);
    for (const [field, values] of Object.entries(ENUMS)) {
      if (!values.includes(r[field])) problems.push(`${id}: ${field} must be one of ${values.join('|')}`);
    }
    for (const field of ['floor', 'acceptsIntentional']) {
      if (typeof r[field] !== 'boolean') problems.push(`${id}: ${field} must be true or false`);
    }
    for (const field of ['related', 'conflicts']) {
      if (!Array.isArray(r[field]) || !r[field].every(isStr)) problems.push(`${id}: ${field} must be a list of ids`);
    }
    if (!isStr(r.source)) problems.push(`${id}: source is missing or empty`);
    else if (!VERSIONED.test(r.source)) problems.push(`${id}: source has no version or date`);
    if (r.class === 'script' && r.checker === 'browser') problems.push(`${id}: class script with checker browser`);
    if (r.class === 'browser' && ENUMS.checker.includes(r.checker) && r.checker !== 'browser') problems.push(`${id}: class browser with checker ${r.checker}`);
    if (r.floor === true && r.acceptsIntentional === true) problems.push(`${id}: floor rule accepts intentional`);
  }
  const reported = new Set();
  for (const [id, r] of byId) {
    for (const field of ['related', 'conflicts']) {
      if (!Array.isArray(r[field])) continue;
      for (const other of r[field]) {
        if (!byId.has(other)) { problems.push(`${id}: ${field} ${other} does not exist`); continue; }
        if (field !== 'conflicts') continue;
        const pair = [id, other].sort().join(' and ');
        const o = byId.get(other);
        const shared = platforms(r.platform).some((p) => platforms(o.platform).includes(p));
        if (shared && !reported.has(pair)) { reported.add(pair); problems.push(`${pair} conflict and are both present`); }
      }
    }
  }
  return problems;
}
