// Local backup without network (A4C2-03, R-19). compare.html puts <iframe src> on option files and
// compare.mjs opens them with file://, so reading through stripRemoteFonts is not enough: the browser
// opens the file as it is. The backup therefore works on COPIES:
//   <run>/local/<folder>/<screen>.html = stripRemoteFonts(original)
// The originals are never touched (the canvas needs their fonts).
//
// writeLocalCopies({ run, folders }) -> { written: [{ folder, file }], removed: number }
// pagesToOpen({ run, folders, screens }) -> string[]      only paths under <run>/local/
import fs from 'node:fs';
import path from 'node:path';
import { stripRemoteFonts } from './remote-fonts.mjs';
import { isLink, linkProblem } from './link-guard.mjs';
import { screenProblems } from './approved.mjs';

export class LocalCopyError extends Error {}

const FOLDER = /^(?:option|direction|explore)-[A-Za-z0-9]{1,3}$/;

export function writeLocalCopies({ run, folders }) {
  const root = path.join(run, 'local');
  if (fs.existsSync(root) || isLink(root)) {
    if (linkProblem(root)) throw new LocalCopyError('<run>/local es un enlace: no se escribe a través de él');
  }
  const written = [];
  let removed = 0;
  for (const folder of folders) {
    if (!FOLDER.test(folder)) throw new LocalCopyError(`carpeta inválida: ${folder}`);
    const from = path.join(run, folder);
    if (!fs.existsSync(from)) continue;
    if (linkProblem(from) || !fs.statSync(from).isDirectory()) throw new LocalCopyError(`${folder} no es una carpeta común`);
    const to = path.join(root, folder);
    if (isLink(to) || (fs.existsSync(to) && linkProblem(to))) throw new LocalCopyError(`local/${folder} es un enlace: no se escribe a través de él`);
    fs.mkdirSync(to, { recursive: true });
    if (linkProblem(root) || linkProblem(to)) throw new LocalCopyError('la carpeta local resuelve fuera del run');
    for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.toLowerCase().endsWith('.html')) continue;
      const out = path.join(to, ent.name);
      if (isLink(out)) throw new LocalCopyError(`local/${folder}/${ent.name} es un enlace`);
      const stripped = stripRemoteFonts(fs.readFileSync(path.join(from, ent.name), 'utf8').replace(/\r\n/g, '\n'));
      // the backup page opens this file in a browser: nothing remote and no script may be left in the copy
      const bad = screenProblems(stripped.html, { allowFonts: false }).find((p) => p.problem === 'remote-resource' || p.problem === 'script');
      if (bad) throw new LocalCopyError(`${folder}/${ent.name}: ${bad.problem}: no se arma el respaldo local con recursos remotos ni scripts`);
      fs.writeFileSync(out, stripped.html);
      removed += stripped.removed;
      written.push({ folder, file: ent.name });
    }
  }
  return { written, removed };
}

export function pagesToOpen({ run, folders, screens }) {
  const out = [];
  for (const folder of folders) for (const screen of screens) out.push(path.join(run, 'local', folder, screen));
  return out;
}
