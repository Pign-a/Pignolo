'use strict';
// Clasificador de "solo lectura por estructura" (D-G3, R-7): lo consulta el launcher SOLO cuando vence el
// plazo interno de un hook de comando (guard, scope-gate). Lista cerrada y conservadora: ante la duda, false
// (el launcher niega, como antes). No ejecuta nada ni mira el disco. Solo depende de ./shell-parse.
const { parseBash, ParseError } = require('./shell-parse');

const PROGS = new Set(['ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'stat', 'du', 'basename', 'dirname', 'realpath', 'readlink', 'echo', 'printf',
  'true', 'false', 'test', '[', 'cd', 'grep', 'egrep', 'fgrep', 'rg', 'sort', 'cut', 'tr', 'nl', 'column', 'diff', 'cmp', 'md5sum', 'sha1sum',
  'sha256sum', 'od', 'hexdump', 'strings', 'jq', 'which', 'find']);

const GIT_READ = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'rev-list', 'ls-files', 'ls-tree', 'cat-file', 'blame', 'shortlog',
  'describe', 'merge-base', 'show-ref', 'name-rev', 'diff-tree', 'diff-index', 'diff-files', 'grep']);
// Opciones de git que escriben un archivo o ejecutan un programa. Git acepta abreviaturas únicas (`--out`): se rechaza todo
// prefijo de estos nombres.
const GIT_BAD_LONG = ['output', 'ext-diff', 'textconv', 'exec', 'open-files-in-pager'];
const FIND_BAD = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls']);
const RG_BAD_LONG = ['pre', 'pre-glob', 'hostname-bin', 'search-zip'];
const SORT_BAD_LONG = ['output', 'compress-program'];

const progName = (v) => String(v).replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '');

// ¿`arg` es una opción larga que es (o abrevia) alguna de `bad`?
function badLong(arg, bad) {
  if (!arg.startsWith('--') || arg.length === 2) return false;
  const name = arg.slice(2).split('=')[0];
  return bad.some((b) => b.startsWith(name));
}

// Opciones de git sobre los argumentos que siguen al subcomando.
function gitArgsOk(args) {
  return !args.some((a) => badLong(a, GIT_BAD_LONG) || /^-O/.test(a));
}

function gitOk(words) {
  let i = 1;
  if (words[i] === '--no-pager') i++;
  const sub = words[i];
  if (!sub) return false;
  const rest = words.slice(i + 1);
  if (GIT_READ.has(sub)) return gitArgsOk(rest);
  if (sub === 'branch') return rest.every((a) => ['-a', '-r', '-v', '-vv', '--show-current', '--list'].includes(a));
  if (sub === 'tag') return rest.length > 0 && rest.every((a) => a === '-l' || a === '--list');
  if (sub === 'stash') return (rest[0] === 'list' || rest[0] === 'show') && gitArgsOk(rest.slice(1));
  if (sub === 'worktree') return rest.length === 1 && rest[0] === 'list';
  if (sub === 'remote') return rest.length === 1 && (rest[0] === '-v' || rest[0] === '--verbose');
  return false;
}

function progArgsOk(name, args) {
  if (name === 'find') return !args.some((a) => FIND_BAD.has(a));
  if (name === 'rg') return !args.some((a) => badLong(a, RG_BAD_LONG) || (/^-[A-Za-z]+$/.test(a) && a.includes('z')));
  if (name === 'sort') return !args.some((a) => badLong(a, SORT_BAD_LONG) || (/^-[^-]/.test(a) && a.includes('o')));
  return true;
}

// Redirecciones permitidas: duplicar descriptores, tirar a /dev/null y leer de un archivo.
function redirectsOk(redirects) {
  return redirects.every((r) => {
    if (r.target && r.target.dyn) return false;
    const t = r.target ? r.target.value : '';
    if (r.op === '>&') return /^[12]$/.test(t);
    if (r.op === '>') return t === '/dev/null';
    if (r.op === '<') return true;
    return false;
  });
}

function bashReadOnly(command) {
  let cmds;
  try {
    cmds = parseBash(command);
  } catch (e) {
    if (e instanceof ParseError) return false;
    throw e;
  }
  if (!cmds.length) return false;
  return cmds.every((c) => {
    if (c.sub || c.async || (c.scopes && c.scopes.length !== 1) || c.stdin === 'heredoc' || c.stdin === 'herestring' || c.stdinBody) return false;
    if (!c.words.length || c.words.some((w) => w.dyn)) return false;
    if (!redirectsOk(c.redirects)) return false;
    const name = progName(c.words[0].value);
    const args = c.words.slice(1).map((w) => w.value);
    if (name === 'git') return gitOk(c.words.map((w) => w.value));
    return PROGS.has(name) && progArgsOk(name, args);
  });
}

// PowerShell, sin AST: el comando entero tiene que casar con la forma de un solo comando de la lista, con argumentos de
// caracteres simples o cadenas sin `$` ni comilla invertida. Sin `|`, `;`, `&`, `>`, `<`, `(`, `{`, `@`.
const PS_ARG = '(?:[-A-Za-z0-9_.:/\\\\*?=,%+~#]+|\'[^\'$`]*\'|"[^"$`]*")';
const PS_CMD = new RegExp(`^\\s*(?:Get-ChildItem|Get-Content|Get-Item|Get-Location|Test-Path|Select-String|Resolve-Path|Write-Output|Write-Host)(?:\\s+${PS_ARG})*\\s*$`, 'i');
const PS_GIT = new RegExp(`^\\s*git(?:\\.exe)?(?:\\s+--no-pager)?\\s+(${[...GIT_READ].join('|')})((?:\\s+${PS_ARG})*)\\s*$`, 'i');
const PS_UNC = /(^|\s)(\\\\|\/\/)/;

function powershellReadOnly(command) {
  if (PS_UNC.test(command)) return false;
  if (PS_CMD.test(command)) return true;
  const m = PS_GIT.exec(command);
  if (!m) return false;
  const args = (m[2].match(/\S+/g) || []).map((a) => a.replace(/^['"]|['"]$/g, ''));
  return gitArgsOk(args);
}

// ¿El comando solo lee, por su estructura? `shell`: 'bash' | 'powershell'. Texto no cadena o vacío: false.
function isReadOnlyByStructure(command, shell) {
  if (typeof command !== 'string' || !command.trim()) return false;
  try {
    return shell === 'powershell' ? powershellReadOnly(command) : bashReadOnly(command);
  } catch (_) { return false; }
}

module.exports = { isReadOnlyByStructure };
