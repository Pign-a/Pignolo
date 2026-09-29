'use strict';
// .pignolo/.gitignore: agrega solo las líneas que faltan (comparación exacta por línea),
// en LF y sin tocar las demás.
const fs = require('node:fs');
const path = require('node:path');

function ensureIgnored(root, entries) {
  const dir = path.join(root, '.pignolo');
  const file = path.join(dir, '.gitignore');
  fs.mkdirSync(dir, { recursive: true });
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const have = new Set(text.split(/\r?\n/));
  const missing = [...new Set(entries)].filter((e) => !have.has(e));
  if (missing.length === 0) return false;
  const sep = text === '' || text.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(file, `${text}${sep}${missing.join('\n')}\n`);
  return true;
}

module.exports = { ensureIgnored };
