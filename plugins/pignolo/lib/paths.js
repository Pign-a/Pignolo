'use strict';
// Normalización de rutas para compararlas contra los flags del interruptor y las
// rutas protegidas. Windows ignora los puntos y espacios al final de cada
// componente, y 'archivo:stream' o 'archivo::$DATA' escriben sobre el mismo
// 'archivo'. Todo se compara en minúsculas y con '/'; '/c/x' (Git Bash) es 'c:/x'.
// Límite declarado: no resuelve nombres cortos 8.3 (PIGNOL~1) ni enlaces simbólicos.
const path = require('node:path');

const FLAG_RE = /(^|\/)\.?pignolo\/\.?disabled$/;
const PIGNOLO_DIR_RE = /(^|\/)\.pignolo$/;
const GIT_DIR_RE = /(^|\/)\.git(\/|$)/;
const CLAUDE_DIR_RE = /(^|\/)\.claude(\/|$)/;
const CLAUDE_WORKTREES_RE = /(^|\/)\.claude\/worktrees(\/|$)/;

function cleanPath(p) {
  const s = String(p).replace(/\\/g, '/').replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
  return s.split('/').map((seg, i) => {
    let c = seg;
    if (i === 0 && /^[A-Za-z]:$/.test(c)) return c.toLowerCase();
    const colon = c.indexOf(':');
    if (colon >= 0 && !(i === 0 && colon === 1)) c = c.slice(0, colon);
    if (c !== '.' && c !== '..') c = c.replace(/[. ]+$/, '');
    return c.toLowerCase();
  }).join('/');
}

function isAbsoluteClean(p) {
  return p.startsWith('/') || /^[a-z]:(\/|$)/.test(p) || p.startsWith('~');
}

// Resuelve `p` contra `base` (ambas crudas) y devuelve la forma normalizada.
// Con `home`, '~' y '~/x' se expanden.
function resolveClean(p, base, home) {
  let c = cleanPath(p);
  if (home && (c === '~' || c.startsWith('~/'))) c = cleanPath(home) + c.slice(1);
  const joined = isAbsoluteClean(c) ? c : `${cleanPath(base).replace(/\/+$/, '')}/${c}`;
  const n = path.posix.normalize(joined);
  return n.length > 1 ? n.replace(/\/+$/, '') : n;
}

// `p` es `dir` o está adentro (ambas limpias).
function isWithin(p, dir) {
  if (!p || !dir) return false;
  if (dir === '/') return true;
  return p === dir || p.startsWith(`${dir}/`);
}

// Rutas que nadie escribe (spec §8.3, §11.6): .git/**, .claude/** salvo
// .claude/worktrees/, .gitconfig, ~/.pignolo/** y, de la configuración de Claude Code
// del usuario (`claudeDirs`, por defecto ~/.claude), lo que apaga o cambia la guardia en
// las sesiones siguientes: settings*.json y los plugins instalados (plugins/**). El
// resto de ~/.claude sí se escribe (memoria, planes, CLAUDE_JOB_DIR en jobs/, skills y
// reglas que pide el humano) y leerlo (las transcripciones de projects/) no se toca.
// Con `claude: false` (la shell) el .claude/** del proyecto queda afuera: ahí solo se
// protege por Edit/Write, y desde la shell solo borrar o mover .claude (catastrófico).
const USER_CLAUDE_PROTECTED = /^\/(settings[^/]*\.json|plugins)(\/|$)/;

function isProtectedWrite(p, { home, pignoloHome, claudeDirs, claude = true } = {}) {
  if (GIT_DIR_RE.test(p)) return true;
  if (/(^|\/)\.gitconfig$/.test(p)) return true;
  if (pignoloHome && isWithin(p, cleanPath(pignoloHome))) return true;
  const user = (claudeDirs || (home ? [`${home}/.claude`] : [])).map(cleanPath).find((d) => isWithin(p, d));
  if (user) return USER_CLAUDE_PROTECTED.test(p.slice(user.length));
  return claude && CLAUDE_DIR_RE.test(p) && !CLAUDE_WORKTREES_RE.test(p);
}

module.exports = { cleanPath, resolveClean, isWithin, isProtectedWrite, FLAG_RE, PIGNOLO_DIR_RE, GIT_DIR_RE };
