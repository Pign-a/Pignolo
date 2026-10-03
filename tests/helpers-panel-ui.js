'use strict';
// Ayudas de los tests de la pestaña UI del panel: un sistema de archivos en memoria con la misma forma que `$.fs`
// (list -> [{ name, kind, size, mtimeMs, isLink }]) y un cargador de los módulos ESM del mod.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HOOKS = path.join(__dirname, '..', 'plugins', 'pignolo-panel', 'hooks');
const load = (name) => import(pathToFileURL(path.join(HOOKS, name)).href);

// files: { 'ruta/relativa': 'texto' }; links: rutas relativas (archivo o carpeta) que son enlaces.
function mem(files, { links = [], root = '/p' } = {}) {
  const abs = (rel) => `${root}/${rel}`;
  const all = Object.keys(files).map((k) => abs(k));
  const dirs = new Set([root]);
  for (const f of all) {
    const parts = f.split('/');
    for (let i = 2; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  const linkSet = new Set(links.map(abs));
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
  return {
    root,
    reads: [],
    async exists(p) { const n = norm(p); return all.includes(n) || dirs.has(n); },
    async list(p) {
      const n = norm(p);
      if (!dirs.has(n)) throw new Error('ENOENT');
      const out = new Map();
      for (const f of all) {
        if (!f.startsWith(n + '/')) continue;
        const rest = f.slice(n.length + 1).split('/');
        const isDir = rest.length > 1;
        out.set(rest[0], { name: rest[0], kind: isDir ? 'dir' : 'file', size: 1, mtimeMs: 0, isLink: linkSet.has(`${n}/${rest[0]}`) });
      }
      for (const d of dirs) {
        if (d.startsWith(n + '/') && !d.slice(n.length + 1).includes('/')) {
          const name = d.slice(n.length + 1);
          out.set(name, { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: linkSet.has(d) });
        }
      }
      return [...out.values()];
    },
    async read(p) {
      const n = norm(p);
      this.reads.push(n);
      const k = Object.keys(files).find((x) => abs(x) === n);
      if (k === undefined) throw new Error('ENOENT');
      return files[k];
    },
  };
}

const PRODUCT_OK = '## Audience\nvendedores de una distribuidora\n\n## First look\nlas ventas del día\n\n## Tone\nundecided\n\n## Not wanted\nundecided\n\n## Do not touch\nundecided\n';
const SENTINEL = 'FRASE-CENTINELA-QUE-NO-DEBE-SALIR';
const auditor = (findings) => JSON.stringify({ findings, notVerified: [], independent: true });

module.exports = { load, mem, PRODUCT_OK, SENTINEL, auditor };
