// Run files live under <project>/.pignolo-ui/, where a `git add -f` could carry them into the history. They never
// keep an absolute path, a file:// absolute URL, the home folder or the system user name: paths inside the project
// become relative, the home becomes "~", any other absolute path is cut to its last name.
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BS = String.fromCharCode(92); // the backslash, spelled out so no escaping layer can eat it
const SEP = new RegExp(`[/${BS}${BS}]`);
const ci = process.platform === 'win32' ? 'i' : '';
const SPECIAL = new Set('.*+?^$ {}()|[]'.replace(' ', '').split('').concat(BS));
const escapeRe = (s) => [...s].map((c) => (SPECIAL.has(c) ? BS + c : c)).join('');
const TRAIL = new RegExp(`[/${BS}${BS}]+$`);

function variants(dir) {
  const abs = path.resolve(dir);
  const fwd = abs.split(path.sep).join('/');
  const url = pathToFileURL(abs).href.replace(/\/$/, '');
  const urlAlt = url.replace(/^file:\/\/\//, 'file://');
  return [...new Set([url, urlAlt, abs, fwd].map((v) => v.replace(TRAIL, '')).filter((v) => v.length > 1))]
    .sort((a, b) => b.length - a.length);
}

const isAbs = (s) => /^[A-Za-z]:/.test(s) ? SEP.test(s[2] ?? '') : (s.startsWith('/') || s.startsWith(BS + BS));

export function portable(value, project, { home = os.homedir() } = {}) {
  const re = (v) => new RegExp(`${escapeRe(v)}(?=$|[/${BS}${BS}])`, `${ci}g`);
  const proj = variants(project).map(re);
  const hom = home ? variants(home).map(re) : [];
  // Si el proyecto es carpeta madre del home (p. ej. C:\Users), el home va primero: relativizar antes dejaría ./<usuario>/...
  const rel = home ? path.relative(path.resolve(project), path.resolve(home)) : '';
  const homeInside = Boolean(home) && rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  const fix = (s) => {
    let t = s;
    if (homeInside) {
      for (const r of hom) t = t.replace(r, '~');
      if (t !== s && t.startsWith('~') && !t.includes('\n')) t = t.split(BS).join('/');
    }
    for (const r of proj) t = t.replace(r, '.');
    if (t !== s && t.startsWith('.') && !t.includes('\n')) t = t.split(BS).join('/');
    if (isAbs(t) && !t.includes('\n')) t = t.split(SEP).filter(Boolean).pop() ?? t;
    for (const r of hom) t = t.replace(r, '~');
    return t;
  };
  const walk = (v) => {
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}
