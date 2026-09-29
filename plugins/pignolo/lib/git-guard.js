'use strict';
// Guardia de shell (spec §11.6). Capa 3, best-effort, contra errores honestos (§1.9):
// no es una frontera de seguridad. La red real son los respaldos fuera del repo.
//
// Cómo decide. El comando se parte en comandos simples (bash: lib/shell-parse.js;
// PowerShell: el AST nativo, lib/ps-ast.js) y cada uno se evalúa sobre su argv ya
// sin comillas. Se quitan los envoltorios conocidos (env, timeout, xargs, ...) y se
// reevalúa lo envuelto; el código literal que se pasa a un shell (bash -c, eval,
// heredoc) se evalúa recursivamente. Lo que ejecuta algo que no se ve como argv
// literal es "no verificable". Cada regla tiene una clase:
//   catastrophic  deny siempre, incluso con PIGNOLO_DISABLED (conjunto catastrófico)
//   deny          deny en todos los modos (no recuperable localmente o pierde trabajo)
//   ask           confirmación (recuperable por reflog y respaldo de refs)
//   unverifiable  deny en auto/bypassPermissions/dontAsk, ask en los demás (§8.3)
//
// Con `cwd`, lee el disco solo para encontrar la raíz del repo y para saber si el
// argumento de `git checkout <x>` es un archivo; sin `cwd` es puro (salvo PowerShell,
// que lanza powershell.exe).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseBash, ParseError, mentionsGit } = require('./shell-parse');
const { parsePsAst, PsUnavailable } = require('./ps-ast');
const { cleanPath, resolveClean, isWithin, isProtectedWrite, FLAG_RE, GIT_DIR_RE } = require('./paths');

const DIRECT = 'ejecutá el comando directamente, con el programa y sus argumentos escritos literalmente';
const RULES = {
  // conjunto catastrófico
  'catastrophic-delete': ['catastrophic', 'borrar o mover .git, ~/.pignolo, ~ o la raíz del repo, o un comodín o variable en esos lugares, no tiene vuelta atrás', 'nombrá rutas concretas fuera de .git y de ~/.pignolo; lo demás lo hace el humano a mano'],
  'protected-path': ['catastrophic', 'nadie escribe en .git, .claude (salvo .claude/worktrees), .gitconfig, ~/.pignolo, ~/.claude/settings*.json ni ~/.claude/plugins', 'usá comandos git; lo que haya que cambiar ahí lo hace el humano'],
  // deny
  'invalid-input': ['deny', 'el comando llegó vacío o no es texto', 'reenviá el comando completo'],
  stash: ['deny', 'git stash sin etiqueta: el stash se comparte entre worktrees y se pierde trabajo', 'commiteá el trabajo (commit WIP) o usá `git stash push -m "<etiqueta>"` y aplicalo por SHA'],
  'checkout-path': ['deny', 'git checkout con ruta sobrescribe cambios sin commitear', 'para ver otra versión usá `git show <ref>:<ruta>`; para descartar, commiteá primero'],
  'checkout-force': ['deny', 'git checkout -f descarta cambios sin commitear', 'commiteá o respaldá y cambiá de rama sin -f'],
  'switch-force': ['deny', 'git switch -f / --discard-changes descarta cambios sin commitear', 'commiteá o respaldá y cambiá de rama sin forzar'],
  restore: ['deny', 'git restore sobre el árbol descarta cambios sin commitear', 'usá `git restore --staged <ruta>` para sacar del índice, o commiteá antes'],
  'reset-hard': ['deny', 'git reset --hard / --merge descarta cambios sin commitear', 'usá `git reset --soft` o `git revert`; si hace falta, commiteá WIP antes'],
  clean: ['deny', 'git clean borra archivos sin seguimiento sin recuperación', 'revisá con `git clean -n` y borrá a mano lo que corresponda'],
  'worktree-remove-force': ['deny', 'git worktree remove --force descarta cambios sin commitear del worktree', 'commiteá o respaldá el worktree y usá `git worktree remove` sin --force'],
  'no-verify': ['deny', '--no-verify / -n saltea los hooks del repo', 'arreglá lo que el hook rechaza; si hay que saltearlo, es decisión del humano'],
  'gc-prune': ['deny', 'git gc --prune / git prune eliminan objetos inalcanzables', 'no hace falta podar; si es imprescindible, lo decide el humano'],
  'reflog-expire': ['deny', 'expirar o borrar el reflog elimina la red de seguridad de commits', 'no se toca el reflog; es la última capa de recuperación'],
  'push-force': ['deny', 'push forzado (--force, -f, +ref, --mirror, --prune) reescribe o borra historia remota', 'hacé un commit nuevo (revert o fix) y push normal'],
  'send-pack': ['deny', 'git send-pack escribe refs remotas sin las comprobaciones de push', 'usá `git push` (pide confirmación)'],
  'fetch-force-head': ['deny', 'git fetch --update-head-ok con un refspec forzado pisa la rama activa', 'usá `git fetch` sin forzar y después `git merge --ff-only`'],
  'config-write': ['deny', 'git config solo escribe claves de una lista corta (user.*, color.*, core.autocrlf, ...)', 'los cambios de configuración de git los hace el humano'],
  'git-config-override': ['deny', 'git -c con una clave que ejecuta programas o toca la protección (alias, hooks, editor, gc, ...)', 'escribí el comando sin -c'],
  'git-env-config': ['deny', 'GIT_CONFIG_* o GIT_EXEC_PATH inyectan configuración que la guardia no ve', 'quitá esas variables del comando'],
  'pignolo-ref': ['deny', 'las refs refs/pignolo/* son los respaldos de pignolo', 'no se tocan; si sobran, lo decide el humano'],
  'update-ref-stdin': ['deny', 'git update-ref --stdin puede borrar o pisar cualquier ref, respaldos incluidos', 'usá `git branch` o `git tag`, o `git update-ref <ref> <valor>` de a una'],
  'read-tree-update': ['deny', 'git read-tree -u reescribe el árbol de trabajo', 'usá `git show <ref>:<ruta>` o commiteá antes'],
  'checkout-index-force': ['deny', 'git checkout-index -f sobrescribe archivos del árbol de trabajo', 'usá `git show <ref>:<ruta>` o commiteá antes'],
  'rm-force': ['deny', 'git rm -f borra archivos con cambios sin commitear', 'usá `git rm --cached` o commiteá antes'],
  'git-C': ['deny', 'con git -C / --git-dir / --work-tree la guardia no ve el otro directorio: `checkout <x>` puede ser un archivo', 'usá `cd <ruta> && git checkout <x>`'],
  'protected-flag': ['deny', 'los flags del interruptor solo los escribe /pignolo:off y /pignolo:on', 'pedile al humano que escriba /pignolo:off o /pignolo:on'],
  'pignolo-launcher': ['deny', 'el launcher de pignolo solo lo invocan los hooks (y /pignolo:status con session-start)', 'pedile al humano que use /pignolo:off, /pignolo:on o /pignolo:status'],
  'dynamic-redirect': ['unverifiable', 'una redirección cuyo destino sale de una variable o sustitución no se puede verificar', 'escribí la ruta de destino literal'],
  // ask
  push: ['ask', 'pignolo pide confirmación: push al remoto'],
  'push-delete': ['ask', 'pignolo pide confirmación: borrado de una rama remota'],
  'branch-delete': ['ask', 'pignolo pide confirmación: borrado de rama (recuperable por reflog)'],
  'branch-force': ['ask', 'pignolo pide confirmación: se pisa o renombra una rama existente (recuperable por reflog)'],
  'tag-delete': ['ask', 'pignolo pide confirmación: borrado de tag'],
  'tag-force': ['ask', 'pignolo pide confirmación: se pisa un tag existente'],
  'merge-main': ['ask', 'pignolo pide confirmación: merge sobre main'],
  'ref-move': ['ask', 'pignolo pide confirmación: se mueve una ref a mano (update-ref, symbolic-ref, checkout -B, switch -C, fetch +ref; recuperable por reflog)'],
  // no verificables
  unparseable: ['unverifiable', 'el comando no se puede analizar (comillas, paréntesis, heredoc o `case` sin cerrar)', 'reescribilo en una forma simple'],
  'too-deep': ['unverifiable', 'demasiados niveles de comandos anidados para verificarlos', 'ejecutá el comando interno directamente'],
  'ps-unavailable': ['unverifiable', 'no se pudo analizar el comando de PowerShell (powershell.exe no arrancó o no lo parseó)', 'reintentá, o usá la herramienta Bash'],
  'dynamic-command': ['unverifiable', 'el programa a ejecutar sale de una variable o una sustitución y no se puede verificar', 'escribí el nombre del programa literal'],
  'dynamic-argument': ['unverifiable', 'un argumento de git que puede ser una opción o una ruta sale de una variable y no se puede verificar', 'escribí los argumentos literales'],
  'hidden-code': ['unverifiable', 'el código a ejecutar sale de una variable, una sustitución, un pipe o Invoke-Expression y no se puede verificar', DIRECT],
  'inline-code': ['unverifiable', 'código inline (node -e, python -c, perl -e, awk, sed e, ...) que lanza procesos o invoca git no se puede verificar', 'guardá el script en un archivo o ejecutá el comando directamente'],
  'quoted-substitution': ['unverifiable', 'una sustitución de comandos (`...` o $(...)) dentro de un argumento entre comillas dobles de -c/-e/-m/--message se ejecuta antes que el comando: si era texto, corre como comando', 'escribí el archivo o el mensaje con Write o con `-F archivo`; no pases texto con backticks por la shell'],
  'git-shell': ['unverifiable', 'ese subcomando u opción de git ejecuta comandos de shell (rebase -x, submodule foreach, bisect run, difftool -x, mergetool, filter-branch, --upload-pack, --receive-pack, --exec)', 'ejecutá cada comando directamente'],
  'unknown-with-git': ['unverifiable', 'un programa desconocido recibe `git` como argumento y puede ejecutarlo', DIRECT],
  'unknown-git-subcommand': ['unverifiable', 'subcomando de git desconocido: puede ser un alias', 'usá el subcomando nativo de git'],
  'git-unknown-option': ['unverifiable', 'opción global de git desconocida o incompleta', 'usá la forma documentada del comando'],
  'ps-sink': ['unverifiable', 'PowerShell arma código en texto ([scriptblock]::Create, InvokeScript, Process::Start, $ExecutionContext) o crea un alias a iex, git o un comando que borra o escribe', DIRECT],
  'ps-encoded': ['unverifiable', 'PowerShell -EncodedCommand no se puede verificar', 'ejecutá el comando en texto plano'],
};

const AUTO_MODES = new Set(['auto', 'bypassPermissions', 'dontAsk']);
const MAX_DEPTH = 4;
const VROOT = '/__cwd__';

// Un comando plantado por familia (spec §8.4), para el canario de SessionStart.
// Todos deben salir con exit 2 a través del launcher real.
const CANARIES = Object.freeze([
  { family: 'catastrophic', handler: 'guard', payload: { tool_name: 'Bash', tool_input: { command: 'rm -rf .git' } } },
  { family: 'git-destructive', handler: 'guard', payload: { tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD' } } },
  { family: 'non-literal', handler: 'guard', payload: { tool_name: 'Bash', permission_mode: 'bypassPermissions', tool_input: { command: 'eval "$PIGNOLO_CANARY_CODE"' } } },
  { family: 'powershell-ast', handler: 'guard', payload: { tool_name: 'PowerShell', permission_mode: 'bypassPermissions', tool_input: { command: "[scriptblock]::Create('exit').Invoke()" } } },
  { family: 'protected-write', handler: 'protect-paths', payload: { tool_name: 'Write', tool_input: { file_path: '.git/config', content: '' } } },
]);

function hit(rule, note) {
  const [cls, reason, alternative = ''] = RULES[rule];
  return { rule, cls, reason, alternative, note: note || '' };
}

// ------------------------------------------------------------ catálogos

const GIT_ENV_NAME = /^GIT_(CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)|CONFIG|EXEC_PATH|ALLOW_PROTOCOL)$/i;
// Variables cuyo valor git (u otro programa) ejecuta como comando: el valor se evalúa
// como código de shell (G7). `GIT_EDITOR=true`, `EDITOR=vim` o un `sed -i` pasan.
const GIT_EXEC_ENV = /^(GIT_EDITOR|EDITOR|VISUAL|GIT_SEQUENCE_EDITOR|GIT_EXTERNAL_DIFF|GIT_SSH_COMMAND|GIT_SSH|GIT_ASKPASS|SSH_ASKPASS|GIT_PAGER|PAGER|GIT_PROXY_COMMAND)$/i;
const LAUNCHER_RE = /(^|\/)hooks\/launcher\.js$/i;
const MAIN = /^(main|master)$/;
// Rama que el handler no pudo leer: merge pide confirmación como si fuera main.
const UNKNOWN_BRANCH = '(desconocida)';

const PROTECTED_CONFIG = /^(alias\..+|core\.(hookspath|fsmonitor|sshcommand|pager|editor|askpass|gitproxy|logallrefupdates|worktree)|sequence\.editor|diff\.external|diff\..+\.(textconv|command)|merge\..+\.driver|pager\..+|filter\..+|credential(\..+)?\.helper|gpg(\..+)?\.program|uploadpack\.packobjectshook|protocol\..+\.allow|include\.path|includeif\..+\.path|gc\..+|clean\.requireforce|remote\..+\.(mirror|receivepack|uploadpack|vcs|push)|interactive\.difffilter|protocol\.allow|(difftool|mergetool|browser|man)\..+\.(cmd|path)|gpg\..+\.[a-z]*command)$/;
const CONFIG_ALLOW = /^(user\.(name|email|signingkey)|color\..+|core\.(autocrlf|eol|filemode|ignorecase|quotepath|longpaths|safecrlf|whitespace|symlinks)|init\.defaultbranch|pull\.(rebase|ff)|push\.(default|autosetupremote)|fetch\.prune|merge\.conflictstyle|rerere\.enabled|diff\.(algorithm|renames|colormoved)|log\.[a-z]+|format\.[a-z]+|branch\.[^.]+\.(remote|merge|rebase|description)|remote\.[^.]+\.url|advice\..+|help\.autocorrect|safe\.directory|commit\.gpgsign|tag\.gpgsign)$/;
const CONFIG_READ_FLAGS = ['get', 'get-all', 'get-regexp', 'get-urlmatch', 'list', 'get-color', 'get-colorbool', 'show-origin', 'show-scope'];
const CONFIG_WRITE_FLAGS = ['unset', 'unset-all', 'add', 'replace-all', 'rename-section', 'remove-section'];

const GIT_GLOBAL_VALUE = new Set(['--namespace', '--super-prefix', '--list-cmds', '--attr-source']);
const GIT_GLOBAL_FLAGS = new Set(['--no-pager', '-P', '-p', '--paginate', '--bare', '--no-replace-objects', '--literal-pathspecs',
  '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--no-optional-locks', '--no-lazy-fetch', '--no-advice',
  '--exec-path', '--html-path', '--man-path', '--info-path', '--version', '-v', '--help', '-h']);

// Subcomandos nativos de git 2.52 (`git --list-cmds=main`) más externos comunes.
// Uno desconocido puede ser un alias: no verificable (sin leer aliases, decisión de simplicidad).
const GIT_BUILTINS = new Set(('add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore '
  + 'check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph commit-tree config '
  + 'count-objects credential credential-cache credential-store daemon describe diagnose diff diff-files diff-index diff-pairs diff-tree '
  + 'difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck fsck-objects '
  + 'gc get-tar-commit-id grep gui hash-object help hook http-backend imap-send index-pack init init-db instaweb interpret-trailers '
  + 'last-modified log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-tree mergetool '
  + 'mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id prune prune-packed pull push '
  + 'range-diff read-tree rebase receive-pack reflog refs remote repack replace replay repo request-pull rerere reset restore rev-list '
  + 'rev-parse revert rm send-email send-pack shortlog show show-branch show-index show-ref sparse-checkout stage stash status stripspace '
  + 'submodule symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info upload-archive upload-pack var '
  + 'verify-commit verify-pack verify-tag version whatchanged worktree write-tree switch subtree svn p4 quiltimport survey pickaxe '
  + 'http-fetch http-push merge-octopus merge-one-file merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs '
  + 'merge-resolve merge-subtree credential-wincred update lfs').split(' '));

// Opciones que toman un valor en el argumento siguiente, por subcomando.
const SPECS = {
  commit: { short: 'mFCct', long: ['message', 'file', 'reuse-message', 'reedit-message', 'template', 'author', 'date', 'fixup', 'squash', 'trailer', 'cleanup', 'pathspec-from-file'] },
  stash: { short: 'm', long: ['message', 'pathspec-from-file'] },
  checkout: { short: 'bB', long: ['orphan', 'conflict', 'pathspec-from-file'] },
  switch: { short: 'cC', long: ['create', 'force-create', 'orphan', 'conflict'] },
  restore: { short: 's', long: ['source', 'pathspec-from-file', 'conflict'] },
  reset: { long: ['pathspec-from-file'] },
  clean: { short: 'e', long: ['exclude'] },
  branch: { short: 'u', long: ['set-upstream-to', 'format', 'sort', 'contains', 'no-contains', 'merged', 'no-merged', 'points-at'] },
  tag: { short: 'mFu', long: ['message', 'file', 'local-user', 'format', 'sort', 'contains', 'no-contains', 'points-at', 'cleanup', 'merged', 'no-merged'] },
  worktree: { short: 'bB', long: ['reason', 'orphan'] },
  push: { short: 'o', long: ['repo', 'receive-pack', 'exec', 'push-option'] },
  fetch: { short: 'jo', long: ['depth', 'deepen', 'shallow-since', 'shallow-exclude', 'upload-pack', 'refmap', 'jobs', 'server-option', 'negotiation-tip', 'filter'] },
  config: { short: 'f', long: ['file', 'blob', 'type', 'default', 'comment', 'value'] },
  'update-ref': { short: 'm' },
  'symbolic-ref': { short: 'm' },
  merge: { short: 'mFsX', long: ['message', 'file', 'strategy', 'strategy-option', 'into-name'] },
  rebase: { short: 'xsX', long: ['exec', 'onto', 'strategy', 'strategy-option'] },
  difftool: { short: 'xt', long: ['extcmd', 'tool'] },
  rm: { long: ['pathspec-from-file'] },
  'read-tree': { long: ['prefix', 'index-output', 'exclude-per-directory'] },
  'checkout-index': { long: ['prefix'] },
};
// Subcomandos donde un argumento dinámico puede esconder una opción destructiva.
const DESTRUCTIVE = new Set(['stash', 'checkout', 'switch', 'restore', 'reset', 'clean', 'branch', 'tag', 'worktree', 'commit',
  'push', 'gc', 'prune', 'reflog', 'config', 'update-ref', 'symbolic-ref', 'read-tree', 'checkout-index', 'rm', 'merge', 'rebase',
  'fetch', 'am', 'send-pack', 'submodule', 'bisect', 'difftool']);

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const PWSH = new Set(['pwsh', 'powershell', 'powershell_ise']);
const INTERP = new Set(['node', 'nodejs', 'bun', 'deno', 'python', 'python3', 'py', 'pypy', 'ruby', 'perl', 'php', 'rscript', 'lua', 'luajit']);
const AWK = new Set(['awk', 'gawk', 'mawk', 'nawk']);
const CD_CMDS = new Set(['cd', 'pushd', 'popd', 'chdir', 'set-location', 'sl', 'push-location', 'pop-location']);
const BASH_KEYWORDS = new Set(['!', '{', '}', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'function', 'done', 'fi', 'esac']);
// Borran o mueven: operandos sujetos al conjunto catastrófico.
const DELETE_CMDS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'del', 'erase', 'rd', 'remove-item', 'ri', 'mv', 'move', 'move-item',
  'mi', 'ren', 'rename', 'rename-item', 'rni', 'rimraf', 'del-cli', 'trash', 'trash-put']);
// Escriben en sus operandos: sujetos a las rutas protegidas.
const WRITE_CMDS = new Set([...DELETE_CMDS, 'cp', 'copy', 'copy-item', 'cpi', 'tee', 'touch', 'ln', 'mkdir', 'md', 'install', 'truncate',
  'set-content', 'sc', 'add-content', 'ac', 'out-file', 'new-item', 'ni', 'clear-content', 'clc', 'tee-object', 'new-symlink']);
// Solo leen: no escriben el flag aunque lo nombren.
const READ_ONLY = new Set(['cat', 'less', 'more', 'head', 'tail', 'ls', 'dir', 'stat', 'file', 'test', '[', '[[', 'wc', 'grep',
  'egrep', 'fgrep', 'rg', 'type', 'echo', 'printf', 'realpath', 'readlink', 'basename', 'dirname', 'get-content', 'gc',
  'get-item', 'gi', 'get-childitem', 'gci', 'test-path', 'select-string', 'sls', 'write-host', 'write-output',
  'resolve-path', 'get-itemproperty', 'gp', 'measure-object', 'diff', 'cmp', 'du', 'tree', 'jq', 'sort', 'uniq', 'cut', 'md5sum',
  'sha1sum', 'sha256sum', 'get-filehash', 'od', 'xxd', 'hexdump', 'strings', 'column', 'nl', 'tr']);
// Programas conocidos que reciben `git` como dato, no como programa a ejecutar.
const INERT = new Set([...READ_ONLY, 'which', 'where', 'where.exe', 'whereis', 'man', 'help', 'get-command', 'gcm', 'get-help',
  'for', 'case', 'select', 'in', 'export', 'declare', 'typeset', 'local', 'readonly', 'set', 'unset', 'true', 'false', ':',
  'gh', 'npm', 'npx', 'pnpm', 'yarn', 'winget', 'choco', 'scoop', 'apt', 'apt-get', 'brew', 'pip', 'pip3', 'hash']);

// Envoltorios que ejecutan su argv (spec §11.6): opciones con valor, posicionales
// a saltar y opción que pasa el comando como texto.
const WRAPPERS = {
  command: { lookup: ['-v', '-V'] }, builtin: {}, noglob: {}, nohup: {}, chronic: {}, unbuffer: {}, winpty: {}, setsid: {},
  exec: { val: ['-a'] }, time: {}, nice: { val: ['-n'] }, stdbuf: { val: ['-i', '-o', '-e'] },
  ionice: { val: ['-c', '-n'], none: ['-p', '-P', '-u'] },
  timeout: { val: ['-s', '-k', '--signal', '--kill-after'], skip: 1 },
  flock: { val: ['-w', '--timeout', '-E', '--conflict-exit-code'], skip: 1, code: /^(-c|--command)$/ },
  sudo: { val: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U', '-T'] }, doas: { val: ['-u', '-C'] },
  strace: { val: ['-o', '-e', '-p', '-s', '-a', '-b', '-E', '-I', '-O', '-P', '-S', '-u', '-X'] },
  script: { val: ['-t', '-T', '-I', '-O', '-B', '-E', '-m'], code: /^(-[a-zA-Z]*c|--command)$/, needsCode: true },
  watch: { val: ['-n', '--interval'], joined: true },
  xargs: { val: ['-I', '-n', '-P', '-L', '-l', '-s', '-d', '-E', '-e', '-a', '--arg-file', '--delimiter', '--max-args', '--max-procs'], appendDyn: true, empty: 'echo' },
  env: { val: ['-u', '--unset', '-C', '--chdir'], code: /^(-S|--split-string|-[a-zA-Z]*S)$/, joinedCode: /^(?:-[iv0]*S|--split-string=)(.+)$/s, assign: true },
  npx: { val: ['-p', '--package'], code: /^(-c|--call)$/, pkg: true }, bunx: { val: ['-p', '--package'], pkg: true }, shx: {},
  wsl: { val: ['-d', '--distribution', '-u', '--user', '--cd', '--shell-type'], joined: true },
};

const SPAWN_RE = /child_process|\bexec(Sync|FileSync|File)?\s*\(|\bspawn(Sync)?\s*\(|subprocess|os\.(system|popen|exec\w*|spawn\w*)|\bsystem\s*\(|\bpopen\b|Deno\.(run|Command)|Bun\.(spawn|\$)|shell_exec|passthru|proc_open|pcntl_exec/;
const SPAWN_PERL_RUBY = /\b(system|exec|spawn)\b|`|\bqx\s*\W|%x\s*\W|IO\.popen|Open3|\bopen\s*\(?\s*["']?\s*\|/;
const AWK_EXEC = /\bsystem\s*\(|\|\s*getline|\|&|print[^;}]*\|/;

// ------------------------------------------------------------ utilidades

function progName(v) {
  return String(v).replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '');
}

function word(value, extra = {}) {
  return { value, quoted: false, startsQuoted: false, dyn: false, dynAt: -1, glob: false, unq: value, kind: null, ...extra };
}
const dynWord = (value = '$?') => word(value, { dyn: true, dynAt: 0 });

function findRoot(cwd) {
  let d = path.resolve(cwd);
  for (let i = 0; i < 64; i++) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

function parseOpts(words, spec = {}) {
  const shortVal = spec.short || '';
  const longVal = spec.long || [];
  const o = { shorts: new Set(), longs: [], positionals: [], dd: false, dynSlot: false };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const v = w.value;
    if (o.dd) { if (w.dyn && w.dynAt === 0) o.dynSlot = true; o.positionals.push(w); continue; }
    if (v === '--' && !w.dyn) { o.dd = true; continue; }
    if (v.startsWith('--') && v.length > 2) {
      const eq = v.indexOf('=');
      const name = eq < 0 ? v.slice(2) : v.slice(2, eq);
      if (w.dyn && w.dynAt < 2 + name.length) { o.dynSlot = true; continue; }
      o.longs.push(name);
      if (eq < 0 && longVal.some((l) => l === name || l.startsWith(name))) i++;
      continue;
    }
    if (v.startsWith('-') && v.length > 1) {
      if (w.dyn && w.dynAt <= 1) { o.dynSlot = true; continue; }
      for (let k = 1; k < v.length; k++) {
        if (w.dyn && k >= w.dynAt) { o.dynSlot = true; break; }
        o.shorts.add(v[k]);
        if (shortVal.includes(v[k])) { if (k === v.length - 1) i++; break; }
      }
      continue;
    }
    // Un valor que empieza con una variable puede ser una opción o una ruta.
    if (w.dyn && w.dynAt === 0) o.dynSlot = true;
    o.positionals.push(w);
  }
  return o;
}

// git acepta prefijos no ambiguos de las opciones largas (--har == --hard).
function longIs(o, name) {
  return o.longs.some((g) => g === name || (g.length > 0 && name.startsWith(g)));
}

// ------------------------------------------------------------ evaluación

function evaluate(command, opts = {}) {
  const cwd = typeof opts.cwd === 'string' && opts.cwd ? opts.cwd : null;
  const home = cleanPath(opts.home || os.homedir());
  const pignoloHome = cleanPath(opts.pignoloHome || path.join(opts.home || os.homedir(), '.pignolo'));
  let root = VROOT;
  if (opts.root !== undefined) root = opts.root ? cleanPath(opts.root) : null;
  else if (cwd) root = findRoot(cwd) ? cleanPath(findRoot(cwd)) : null;
  const ctx = {
    shell: opts.shell === 'powershell' ? 'powershell' : 'bash',
    mode: typeof opts.mode === 'string' ? opts.mode : 'default',
    branch: opts.branch || null,
    psExe: opts.psExe,
    psTimeoutMs: opts.psTimeoutMs, // solo tests: plazo holgado para el parseo con la máquina cargada
    locs: { root, home, pignoloHome, claudeDirs: Array.isArray(opts.claudeDirs) ? opts.claudeDirs : undefined },
    onlyCatastrophic: Boolean(opts.onlyCatastrophic),
    trace: [],
  };
  const found = [];
  if (typeof command !== 'string' || !command.trim()) found.push(hit('invalid-input'));
  else {
    const st = { cwd: cwd ? cleanPath(cwd) : VROOT, cwdReal: cwd, alts: null, pending: null, onMain: false, vars: knownVars(ctx) };
    try {
      script(command, ctx.shell, ctx, found, 0, st);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      found.push(hit('too-deep'));
    }
  }
  const list = opts.onlyCatastrophic ? found.filter((v) => v.cls === 'catastrophic') : found;
  return decide(list, ctx);
}

function decisionOf(v, mode) {
  if (v.cls === 'ask') return 'ask';
  if (v.cls === 'unverifiable') return AUTO_MODES.has(mode) ? 'block' : 'ask';
  return 'block';
}

function decide(found, ctx) {
  const ranked = found.map((v) => ({ ...v, decision: decisionOf(v, ctx.mode) }));
  const pick = ranked.find((v) => v.cls === 'catastrophic') || ranked.find((v) => v.decision === 'block')
    || ranked.find((v) => v.decision === 'ask');
  if (!pick) return { decision: 'allow', rule: null, cls: null, reason: '', alternative: '', catastrophic: false, trace: ctx.trace };
  return { decision: pick.decision, rule: pick.rule, cls: pick.cls, reason: pick.reason, alternative: pick.alternative,
    catastrophic: pick.cls === 'catastrophic', trace: ctx.trace };
}

// Si el texto no se puede analizar, igual se mira si parece un borrado catastrófico
// (para que el conjunto catastrófico siga activo con PIGNOLO_DISABLED).
const TEXT_DELETE = /(^|[\s;&|(`'"])((rm|rmdir|rd|del|erase|remove-item|ri|mv|move|move-item|mi|robocopy)(\.exe)?(\s|$)|find(\.exe)?\s.*\s-(delete|exec(dir)?\s+(rm|mv)))/i;
// Un pipe a un borrador (`gci -Force | Remove-Item`) recibe las rutas de la etapa anterior:
// sin parseo no se sabe cuáles, y en la raíz es catastrófico (M4).
const TEXT_TARGET = /\.git\b|\.pignolo|~|\*|\?|\$|\|\s*(remove-item|ri|rm|rmdir|del|rd|erase|move-item|mi)\b/i;

function script(text, shell, ctx, out, depth, st) {
  if (depth > MAX_DEPTH) { out.push(hit('too-deep')); return; }
  let cmds;
  let extra = [];
  try {
    if (shell === 'powershell') ({ cmds, extra } = psCommands(text, ctx, st));
    else cmds = parseBash(text);
  } catch (e) {
    if (!(e instanceof ParseError) && !(e instanceof PsUnavailable)) throw e;
    out.push(hit(e instanceof PsUnavailable ? 'ps-unavailable' : 'unparseable', e.message));
    // El conjunto catastrófico necesita la forma del comando; sin parseo se mira el texto,
    // también con la guardia encendida: si no, un borrado de .git que no se pudo analizar
    // (powershell.exe vencido) sale ask en los modos interactivos (G6).
    if (TEXT_DELETE.test(text) && TEXT_TARGET.test(text)) out.push(hit('catastrophic-delete', 'texto no analizable'));
    ctx.trace.push(`${'  '.repeat(depth)}[${shell}] no analizable: ${e.message}`);
    return;
  }
  out.push(...extra);
  const states = new Map();
  cmds.forEach((cmd, k) => {
    // PowerShell no corta la línea si Set-Location falla: cada comando es como tras un ';'.
    const s = shell === 'powershell' ? st : scopeState(cmd, st, states);
    settle(s, shell === 'powershell' ? (k ? ';' : null) : cmd.sep);
    const before = out.length;
    analyze(cmd, shell, ctx, out, depth, s);
    const got = out.slice(before).map((v) => v.rule).join(', ');
    ctx.trace.push(`${'  '.repeat(depth)}[${shell}] ${JSON.stringify(cmd.words.map((w) => (w.dyn ? `«${w.value}»` : w.value)))} -> ${got || 'ok'}`);
  });
}

// ------------------------------------------------------------ directorio actual
// Un `cd` mueve el directorio de los comandos que lo siguen por `&&` (si falla, no
// corren). Tras `;`, `||`, `&` o un salto de línea el `cd` pudo fallar o no correr:
// el directorio queda desconocido (`cwd: null`), con los candidatos en `alts` si se
// conocen, y un comodín o una variable en un borrado pasa a ser catastrófico. Cada
// subshell (`( … )`, sustitución) tiene su propio estado, que nace del de afuera; un
// `cd` en un pipeline, en segundo plano o a través de un envoltorio no mueve nada.

function scopeState(cmd, root, states) {
  let cur = root;
  (cmd.scopes || []).forEach((id, k) => {
    if (!states.has(id)) states.set(id, k === 0 ? root : forkState(cur));
    cur = states.get(id);
  });
  return cur;
}

function forkState(p) {
  return { ...p, vars: new Map(p.vars), alts: p.alts && [...p.alts], pending: p.pending && { list: p.pending.list && [...p.pending.list] } };
}

// Directorios posibles: [{ cwd, real }], o null si no se sabe nada.
function possible(st) {
  return st.cwd !== null ? [{ cwd: st.cwd, real: st.cwdReal }] : st.alts;
}

function merge(a, b) {
  if (!a || !b) return null;
  const seen = new Set();
  return [...a, ...b].filter((x) => { const k = `${x.cwd}|${x.real}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function setPossible(st, list) {
  if (list && list.length === 1) { st.cwd = list[0].cwd; st.cwdReal = list[0].real; st.alts = null; return; }
  st.cwd = null;
  st.cwdReal = null;
  st.alts = list && list.length <= 8 ? list : null;
}

function settle(st, sep) {
  if (!st.pending || sep === null || sep === undefined || sep === '&&' || sep === '|') return;
  const all = merge(st.pending.list, possible(st));
  st.pending = null;
  setPossible(st, all);
}

// Argumento de -c/-e/-m/--message (también en grupos como -am, -lc, -ne) con una
// sustitución de comandos dentro de comillas dobles (#81273, #84429, codex #12288).
const TEXT_FLAG = /^-[A-Za-z]*[cem]$|^--message$/;
const TEXT_JOINED = /^(--message=|-m.)/;
function quotedSubstitution(words) {
  return words.some((w, i) => w.dqSub && ((i > 0 && TEXT_FLAG.test(words[i - 1].value) && !words[i - 1].quoted)
    || TEXT_JOINED.test(w.value)));
}

function analyze(cmd, shell, ctx, out, depth, st) {
  const ps = shell === 'powershell';
  for (const r of cmd.redirects) if (r.op.includes('>') && !isDescriptorDup(r)) checkWriteTarget(subst(r.target, st, ps), st, ctx, out);
  const words = cmd.words.map((w) => subst(w, st, ps));
  if (!ps) recordAssignments(words, st);
  runWords(words, cmd, shell, ctx, out, depth, st);
  // Después de las demás reglas: si una más específica encontró algo, esa se informa.
  if (!ps && quotedSubstitution(cmd.words)) out.push(hit('quoted-substitution'));
}

// ------------------------------------------------------------ variables
// Propagación mínima de constantes: una variable asignada con un literal en el
// mismo comando (J=x; rm $J) y unas pocas de entorno que apuntan fuera del repo
// se reemplazan por su valor. Lo demás sigue siendo dinámico.

const ENV_TMP = '/__env__/tmp';
function knownVars(ctx) {
  const v = new Map([['HOME', ctx.locs.home], ['USERPROFILE', ctx.locs.home], ['CLAUDE_JOB_DIR', '/__env__/claude_job_dir'],
    ['TMPDIR', ENV_TMP], ['TEMP', ENV_TMP], ['TMP', ENV_TMP]]);
  if (ctx.shell === 'powershell') {
    for (const [k, val] of [...v]) v.set(`env:${k}`.toLowerCase(), val);
    v.set('home', ctx.locs.home);
    for (const k of ['HOME', 'USERPROFILE', 'CLAUDE_JOB_DIR', 'TMPDIR', 'TEMP', 'TMP']) v.delete(k);
  }
  return v;
}

const BASH_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
const PS_REF = /\$\{([^}]+)\}|\$((?:env:)?[A-Za-z_][A-Za-z0-9_]*)/gi;

function subst(w, st, ps) {
  if (!w || !w.dyn || !st.vars || !st.vars.size) return w;
  let unknown = false;
  let any = false;
  const value = w.value.replace(ps ? PS_REF : BASH_REF, (m, a, b) => {
    const name = ps ? String(a || b).toLowerCase() : (a || b);
    if (!st.vars.has(name)) { unknown = true; return m; }
    any = true;
    return st.vars.get(name);
  });
  if (!any) return w;
  // Quedan partes dinámicas: el valor sigue siendo dinámico desde la primera.
  const rest = value.search(/\$|``|[<>]\(\)/);
  if (unknown || /\$[({'"]|``|[<>]\(\)/.test(value)) return { ...w, value, dynAt: rest < 0 ? 0 : rest };
  // La expansión de llaves ocurre antes que la de variables y solo fuera de comillas.
  const brace = !ps && /\{[^{}]*(,|\.\.)[^{}]*\}/.test(w.unq || '');
  return { ...w, value, dyn: brace, dynAt: brace ? 0 : -1, glob: w.glob || /[*?[]/.test(value) };
}

function recordAssignments(words, st) {
  const all = words.every((w) => /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(w.value) && !w.startsQuoted);
  const decl = words.length > 1 && ['export', 'declare', 'local', 'readonly', 'typeset'].includes(words[0].value);
  if (all || decl) {
    for (const w of decl ? words.slice(1) : words) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/.exec(w.value);
      if (!m) continue;
      if (w.dyn || m[2]) st.vars.delete(m[1]);
      else st.vars.set(m[1], w.value.slice(m[0].length));
    }
  } else if (words[0] && ['for', 'read', 'select'].includes(words[0].value)) {
    for (const w of words.slice(1)) { if (w.value === 'in') break; st.vars.delete(w.value); }
  }
}

// Asignaciones al frente (VAR=x cmd) y palabras clave de bash.
function stripPrefix(words, cmd, out, onExec) {
  while (words.length) {
    const w = words[0];
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\+?=/.exec(w.value);
    if (m && !w.startsQuoted && (!w.dyn || w.dynAt > m[0].length - 1)) {
      if (GIT_ENV_NAME.test(m[1])) out.push(hit('git-env-config'));
      if (onExec && GIT_EXEC_ENV.test(m[1])) onExec(assignedValue(w, m[0].length));
      if (/^GIT_(DIR|WORK_TREE)$/i.test(m[1])) cmd.gitRedirect = true;
      words.shift();
      continue;
    }
    if (!w.quoted && BASH_KEYWORDS.has(w.value)) { if (w.value === '!') cmd.negated = true; words.shift(); continue; }
    break;
  }
  return words;
}

// El valor de una asignación NOMBRE=valor, como palabra (dinámica desde donde lo era).
function assignedValue(w, from) {
  return { ...w, value: w.value.slice(from), dynAt: w.dyn ? Math.max(0, w.dynAt - from) : -1 };
}

function runWords(input, cmd, shell, ctx, out, depth, st) {
  const ps = shell === 'powershell';
  let words = input;
  // Un cd cambia el directorio de esta shell solo si no corre en un subshell propio.
  let inShell = !cmd.noCd && (ps || (!cmd.pipedIn && !cmd.pipeOut && !cmd.async));
  const onExec = (v) => code(v, 'bash', ctx, out, depth, st);
  for (;;) {
    if (!ps) words = stripPrefix(words, cmd, out, onExec);
    if (!words.length) return;
    const first = words[0];
    if (first.kind === 'scriptblock') return; // & { ... }: su contenido se evalúa aparte
    if (first.dyn) { out.push(hit('dynamic-command')); return; }
    const name = progName(first.value);
    // npm exec / npm x / pnpm exec|dlx / yarn exec|dlx: lo mismo que npx (G8).
    if (['npm', 'pnpm', 'yarn'].includes(name) && words[1] && !words[1].dyn && ['exec', 'x', 'dlx'].includes(words[1].value)) {
      words = [word('npx'), ...words.slice(2)];
      continue;
    }
    const spec = WRAPPERS[name];
    if (!spec || (ps && !['wsl', 'npx', 'bunx', 'shx'].includes(name))) break;
    const u = unwrap(name, spec, words.slice(1), out, onExec);
    if (name !== 'command' && name !== 'builtin') inShell = false;
    if (u.done) return;
    if (u.code) { code(u.code, 'bash', ctx, out, depth, st); return; }
    words = u.words;
    // npx rimraf@5 .git: el nombre del paquete sin la versión.
    if (spec.pkg) cmd = { ...cmd, viaPkg: true };
    if (spec.pkg && !words[0].dyn) words = [{ ...words[0], value: words[0].value.replace(/^((?:@[^/@]+\/)?[^@]+)@.*$/, '$1') }, ...words.slice(1)];
  }
  dispatch(words, cmd, shell, ctx, out, depth, st, inShell);
}

// Quita un envoltorio. Devuelve { words } (lo envuelto), { code } (texto a
// evaluar) o { done } (no ejecuta nada más).
function unwrap(name, spec, args, out, onExec) {
  let i = 0;
  let skip = spec.skip || 0;
  let codeWord = null;
  let repl = null; // xargs -I<r>: <r> se reemplaza por la entrada (G8)
  while (i < args.length) {
    const w = args[i];
    const v = w.value;
    if (spec.joinedCode && spec.joinedCode.test(v)) { // env -S'…', --split-string=…
      const text = spec.joinedCode.exec(v)[1];
      codeWord = { ...w, value: text, dynAt: w.dyn ? Math.max(0, w.dynAt - (v.length - text.length)) : -1 };
      i++;
      continue;
    }
    if (w.dyn) break;
    if (v === '--') { i++; break; }
    if (name === 'xargs') {
      if (v === '-I' && args[i + 1]) repl = args[i + 1].value;
      else if (/^-I./.test(v)) repl = v.slice(2);
      else if (/^(-i|--replace)$/.test(v)) repl = '{}';
      else if (/^(-i|--replace=)./.test(v)) repl = v.slice(v.startsWith('-i') ? 2 : 10);
    }
    if (spec.assign && /^[A-Za-z_][A-Za-z0-9_]*=/.test(v)) {
      if (GIT_ENV_NAME.test(v.slice(0, v.indexOf('=')))) out.push(hit('git-env-config'));
      if (onExec && GIT_EXEC_ENV.test(v.slice(0, v.indexOf('=')))) onExec(assignedValue(w, v.indexOf('=') + 1));
      i++;
      continue;
    }
    if (spec.code && spec.code.test(v)) { codeWord = args[i + 1] || dynWord(); i += 2; continue; }
    if (spec.lookup && spec.lookup.includes(v)) return { done: true };
    if (spec.none && spec.none.includes(v)) return { done: true };
    if (v.startsWith('-') && v.length > 1) {
      i += (spec.val || []).includes(v) ? 2 : 1;
      continue;
    }
    if (skip > 0) { skip--; i++; continue; }
    break;
  }
  if (codeWord) return { code: codeWord };
  if (spec.needsCode) return { done: true };
  let rest = args.slice(i);
  if (!rest.length) return spec.empty ? { words: [word(spec.empty)] } : { done: true };
  if (repl) rest = rest.map((w) => (w.value.includes(repl) ? { ...w, dyn: true, dynAt: Math.min(w.dyn ? w.dynAt : Infinity, w.value.indexOf(repl)) } : w));
  if (spec.appendDyn) rest = rest.concat(dynWord());
  if (spec.joined && rest.length > 1 && !rest.some((w) => w.dyn)) return { code: word(rest.map((w) => w.value).join(' ')) };
  return { words: rest };
}

// Código de shell pasado como texto: si es literal se evalúa; si no, no es verificable.
// Si todo el código sale de una variable o sustitución, no es verificable; si solo
// una parte, se analiza el texto (las variables quedan como argumentos dinámicos).
function code(w, shell, ctx, out, depth, st) {
  if (!w || (w.dyn && w.dynAt === 0)) { out.push(hit('hidden-code')); return; }
  script(w.value, shell, ctx, out, depth + 1, { ...st, vars: new Map(st.vars) });
}

function dispatch(words, cmd, shell, ctx, out, depth, st, inShell) {
  const ps = shell === 'powershell';
  const name = progName(words[0].value);
  const args = words.slice(1);
  if (CD_CMDS.has(name)) { if (inShell) changeDir(name, args, st, ctx, Boolean(cmd.negated)); return; }

  if (DELETE_CMDS.has(name)) checkDeleteOperands(ps && cmd.pipedIn && !psPaths(args).length ? operands(args).concat(pipedPaths(cmd)) : operands(args), st, ctx, out);
  if (ps && cmd.pipedIn && (name === 'clear-content' || name === 'clc') && !psPaths(args).length) {
    for (const w of pipedPaths(cmd)) checkWriteTarget(w, st, ctx, out);
  }
  checkLauncher(name, words, st, ctx, out);
  checkPathArgs(name, args, st, ctx, out);
  if (name === 'robocopy' && args.some((w) => /^\/(mir|purge|move|mov)$/i.test(w.value))) {
    checkDeleteOperands(args.filter((w) => !w.value.startsWith('/') || w.dyn), st, ctx, out);
  }
  if (name === 'git' || (name.startsWith('git-') && GIT_BUILTINS.has(name.slice(4)))) { analyzeGit(name, words, cmd, st, ctx, out); return; }
  if (name === 'export' || name === 'declare' || name === 'typeset' || name === 'local' || name === 'readonly') {
    if (args.some((w) => GIT_ENV_NAME.test(w.value.split('=')[0]))) out.push(hit('git-env-config'));
    for (const w of args) {
      const eq = w.value.indexOf('=');
      if (eq > 0 && GIT_EXEC_ENV.test(w.value.slice(0, eq)) && !(w.dyn && w.dynAt < eq)) code(assignedValue(w, eq + 1), 'bash', ctx, out, depth, st);
    }
    return;
  }
  if (name === 'find') { analyzeFind(args, cmd, shell, ctx, out, depth, st); return; }
  if (SHELLS.has(name)) { analyzeShell(args, cmd, ctx, out, depth, st); return; }
  if (PWSH.has(name)) { analyzePwsh(args, cmd, ctx, out, depth, st); return; }
  if (INTERP.has(name)) { analyzeInterp(name, args, cmd, out, st, ctx); return; }
  if (AWK.has(name)) { analyzeAwk(args, out); return; }
  if (name === 'sed') { analyzeSed(args, out, st, ctx); return; }
  if (name === 'dd') { // dd of=<archivo> escribe (G9)
    for (const w of args) if (/^of=./.test(w.value)) writeOperand(assignedValue(w, 3), st, ctx, out);
    return;
  }
  if (name === 'tar' || name === 'bsdtar') { analyzeTar(args, st, ctx, out); return; }
  if (FILE_WRITERS[name]) analyzeFileWriter(FILE_WRITERS[name], args, st, ctx, out);
  if (name === 'cmd') { analyzeCmd(args, ctx, out, depth, st); return; }
  if (!ps && name === 'eval') {
    if (args.length) code(args[0].dyn && args[0].dynAt === 0 ? dynWord() : word(args.map((w) => w.value).join(' ')), 'bash', ctx, out, depth, st);
    return;
  }
  if (!ps && (name === 'source' || name === '.')) {
    const f = args[0];
    if (!f) return;
    if (f.dyn) { out.push(hit('hidden-code')); return; }
    if (/^(-|\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/self\/fd\/\d+)$/.test(f.value)) stdinCode(cmd, 'bash', ctx, out, depth, st);
    return; // un script en un archivo: su contenido está fuera de alcance
  }
  if (!ps && name === 'trap') { if (args[0]) code(args[0], 'bash', ctx, out, depth, st); return; }
  if (!ps && name === 'alias') {
    for (const w of args) {
      const eq = w.value.indexOf('=');
      if (eq > 0) code(w.dyn ? dynWord() : word(w.value.slice(eq + 1)), 'bash', ctx, out, depth, st);
    }
    return;
  }
  if (ps && (name === 'invoke-expression' || name === 'iex')) { out.push(hit('hidden-code')); return; }
  if (ps && ['set-alias', 'new-alias', 'sal', 'nal'].includes(name)) { analyzeSetAlias(args, out); return; }
  if (ps && ['new-item', 'ni', 'set-item', 'si'].includes(name) && args.some((w) => /^alias:/i.test(w.value))) { out.push(hit('ps-sink')); return; }
  if (ps && cmd.pipedIn && ['foreach-object', '%', 'foreach'].includes(name) && /^(delete|moveto)$/i.test(psMemberName(args))) {
    checkDeleteOperands(pipedPaths(cmd), st, ctx, out); // gci -Force | % Delete (M6)
    return;
  }
  if (ps && ['start-process', 'saps', 'start'].includes(name)) { analyzeStartProcess(args, cmd, shell, ctx, out, depth, st); return; }
  // Un paquete que npx ejecuta recibe `git` como dato (npx vercel git connect): su contenido está fuera de alcance.
  if (!INERT.has(name) && !cmd.viaPkg && args.some((w) => !w.dyn && progName(w.value) === 'git')) out.push(hit('unknown-with-git'));
}

function operands(args) {
  const res = [];
  let dd = false;
  for (const w of args) {
    if (w.kind === 'param' || w.kind === 'scriptblock') continue;
    if (!dd && !w.dyn && w.value === '--') { dd = true; continue; }
    if (!dd && !w.dyn && w.value.startsWith('-') && w.value.length > 1) continue;
    res.push(w);
  }
  return res;
}

// ------------------------------------------------------------ rutas

function resolveAt(v, st, ctx) {
  const c = cleanPath(v);
  const abs = c.startsWith('/') || /^[a-z]:(\/|$)/.test(c) || c === '~' || c.startsWith('~/');
  if (!abs && st.cwd === null) return null;
  return resolveClean(v, st.cwd || '/', ctx.locs.home);
}

// Con el directorio desconocido, `v` resuelto contra cada candidato conocido.
function resolveAll(v, st, ctx) {
  const p = resolveAt(v, st, ctx);
  if (p !== null) return [p];
  return (st.alts || []).map((a) => resolveClean(v, a.cwd || '/', ctx.locs.home));
}

function realDirs(st) {
  return st.cwdReal ? [st.cwdReal] : (st.alts || []).map((a) => a.real).filter(Boolean);
}

// Operando de un borrado o movimiento en el conjunto catastrófico (spec §11.6):
// .git (en cualquier lugar), ~/.pignolo, ~, la raíz del repo o un ancestro, o un
// comodín o variable en la raíz, en .git o en ~/.pignolo. El glob no se expande.
function isCatastrophicOperand(w, st, ctx) {
  const v = w.value.replace(/\\/g, '/');
  if (w.dyn || w.glob) {
    const globAt = w.glob ? v.search(/[*?[]/) : v.length;
    const at = w.dyn ? Math.min(w.dynAt, globAt) : globAt;
    if (at <= 0 && w.dyn) return true; // variable al frente: puede ser cualquier ruta
    const prefix = v.slice(0, Math.max(at, 0));
    if (GIT_DIR_RE.test(cleanPath(prefix))) return true;
    const slash = prefix.lastIndexOf('/');
    const dir = slash < 0 ? '.' : (prefix.slice(0, slash) || '/');
    const d = resolveAt(dir, st, ctx);
    return d === null || isCatastrophicTarget(d, ctx);
  }
  const c = cleanPath(v);
  if (GIT_DIR_RE.test(c)) return true;
  if (resolveAt(v, st, ctx) === null && /^\.{1,2}(\/\.{1,2})*\/?$/.test(c)) return true;
  return resolveAll(v, st, ctx).some((p) => isCatastrophicTarget(p, ctx)) || isRepoRootOnDisk(w.value, st, ctx);
}

// Con cwd real, un operando que es la raíz de cualquier repo (tiene .git adentro).
function isRepoRootOnDisk(v, st, ctx) {
  const expanded = /^~([\\/]|$)/.test(v) ? path.join(os.homedir(), v.slice(1)) : v;
  return realDirs(st).some((d) => { try { return fs.existsSync(path.join(path.resolve(d, expanded), '.git')); } catch (e) { return false; } });
}

// `2>&1`, `>&-`: duplica o cierra un descriptor, no escribe un archivo.
function isDescriptorDup(r) {
  return r.op === '>&' && !r.target.dyn && /^(\d+|-)$/.test(r.target.value);
}

// Desde la shell el .claude/** del proyecto no es ruta protegida de escritura (solo
// Edit/Write, §11.6); ~/.claude del usuario sí (G5).
const SHELL_LOCS = (ctx) => ({ ...ctx.locs, claude: false });

function isCatastrophicTarget(p, ctx) {
  const { root, home, pignoloHome } = ctx.locs;
  if (GIT_DIR_RE.test(p) || p === '/') return true;
  if (/(^|\/)\.claude$/.test(p)) return true; // borrar o mover .claude entero
  if (isWithin(p, pignoloHome) || isWithin(pignoloHome, p)) return true;
  if (isWithin(home, p)) return true;
  return Boolean(root) && isWithin(root, p);
}

function checkDeleteOperands(list, st, ctx, out) {
  if (list.some((w) => w.kind !== 'scriptblock' && isCatastrophicOperand(w, st, ctx))) out.push(hit('catastrophic-delete'));
}

function isFlag(p, ctx) {
  return FLAG_RE.test(p) || p === `${ctx.locs.pignoloHome}/disabled`;
}

// Destino de una redirección: flags, rutas protegidas y destinos dinámicos.
function checkWriteTarget(w, st, ctx, out) {
  if (w.dyn) {
    if (/pignolo|disabled/i.test(w.value)) { out.push(hit('protected-flag')); return; }
    // Un destino dinámico que nombra .git sigue siendo deny (conjunto catastrófico).
    if (GIT_DIR_RE.test(cleanPath(w.value))) { out.push(hit('protected-path')); return; }
    const prefix = w.dynAt > 0 ? w.value.slice(0, w.dynAt).replace(/\\/g, '/') : '';
    if (!prefix) { out.push(hit('dynamic-redirect')); return; }
    const slash = prefix.lastIndexOf('/');
    const d = resolveAt(slash < 0 ? '.' : (prefix.slice(0, slash) || '/'), st, ctx);
    if (d === null) { out.push(hit('dynamic-redirect')); return; }
    if (isProtectedWrite(`${d}/x`, SHELL_LOCS(ctx))) out.push(hit('protected-path'));
    else if (/(^|\/)\.?pignolo$/.test(d)) out.push(hit('protected-flag'));
    return;
  }
  const all = resolveAll(w.value, st, ctx);
  if (!all.length) {
    if (/(^|[\\/])\.?disabled$/i.test(w.value)) out.push(hit('protected-flag'));
    if (GIT_DIR_RE.test(cleanPath(w.value))) out.push(hit('protected-path'));
    return;
  }
  if (all.some((p) => isFlag(p, ctx))) out.push(hit('protected-flag'));
  else if (all.some((p) => isProtectedWrite(p, SHELL_LOCS(ctx)))) out.push(hit('protected-path'));
}

// Argumentos de comandos que no solo leen: el flag del interruptor, y las rutas
// protegidas para los comandos que escriben en sus operandos.
function checkPathArgs(name, args, st, ctx, out) {
  if (READ_ONLY.has(name) || name === 'git' || name.startsWith('git-')) return;
  const writes = WRITE_CMDS.has(name);
  // Copiar solo escribe en el destino: leer de una ruta protegida (una transcripción
  // de ~/.claude/projects, .git/config) no es escribirla.
  const dest = COPY_CMDS.has(name) ? copyDest(args) : null;
  if (dest && !args.includes(dest)) checkWriteTarget(dest, st, ctx, out); // --target-directory=<dir>
  for (const w of args) {
    if (w.kind === 'scriptblock' || w.kind === 'param') continue;
    if (dest && w !== dest && !w.dyn && !w.glob) {
      if (resolveAll(w.value, st, ctx).some((p) => isFlag(p, ctx))) { out.push(hit('protected-flag')); return; }
      continue;
    }
    if (w.dyn || w.glob) {
      // El código de un intérprete no se mira por el flag (decisión c, §3.3).
      if (!INTERP.has(name) && /pignolo|disabled/i.test(w.value)) { out.push(hit('protected-flag')); return; }
      continue;
    }
    const all = resolveAll(w.value, st, ctx);
    if (!all.length) {
      if (/(^|[\\/])\.?disabled$/i.test(w.value)) { out.push(hit('protected-flag')); return; }
      continue;
    }
    if (writes && all.some((p) => isProtectedWrite(p, SHELL_LOCS(ctx)))) { out.push(hit('protected-path')); return; }
    if (all.some((p) => isFlag(p, ctx) || (DELETE_CMDS.has(name) && /(^|\/)\.pignolo$/.test(p)))) { out.push(hit('protected-flag')); return; }
  }
}

// Destino de cp/install/ln/Copy-Item: -t/--target-directory/-Destination o el último
// operando; null si no se puede saber (entonces todos los operandos cuentan).
const COPY_CMDS = new Set(['cp', 'copy', 'copy-item', 'cpi', 'install', 'ln']);
function copyDest(args) {
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if (args[i].dyn) continue;
    if (/^(-t|--target-directory|-d|-de|-des|-dest|-desti|-destin|-destina|-destinat|-destinati|-destinatio|-destination)$/i.test(v)) return args[i + 1] || null;
    if (/^--target-directory=/.test(v)) return { ...args[i], value: v.slice(v.indexOf('=') + 1) };
  }
  const ops = operands(args);
  return ops.length > 1 ? ops[ops.length - 1] : null;
}

function checkLauncher(name, words, st, ctx, out) {
  for (const w of words) {
    const p = w.dyn ? null : resolveAt(w.value, st, ctx);
    const isLauncher = p === null ? /(^|[\\/])launcher\.js$/i.test(w.value) : LAUNCHER_RE.test(p);
    if (!isLauncher) continue;
    const statusForm = name === 'node' && words.length === 3 && w === words[1] && words[2].value === 'session-start' && !words[2].dyn;
    if (!statusForm) out.push(hit('pignolo-launcher'));
    return;
  }
}

function changeDir(name, args, st, ctx, negated) {
  const t = args.find((w) => w.kind !== 'param' && !(w.value.startsWith('-') && w.value.length > 1));
  const before = possible(st);
  let next;
  if (name === 'popd' || name === 'pop-location' || (t && (t.dyn || t.glob || t.value === '-'))) next = null;
  else if (!t) next = [{ cwd: ctx.locs.home, real: null }];
  else {
    const home = /^~([\\/]|$)/.test(t.value);
    const abs = resolveAt(t.value, { cwd: null }, ctx) !== null;
    const from = before || (abs ? [{ cwd: '/', real: null }] : null);
    next = from && merge(from.map((c) => ({ cwd: resolveClean(t.value, c.cwd || '/', ctx.locs.home),
      real: c.real && !home ? path.resolve(c.real, t.value) : null })), []);
  }
  // Hasta el próximo `;`, el directorio de antes sigue siendo posible (el cd pudo fallar).
  st.pending = { list: st.pending ? merge(st.pending.list, before) : before };
  // `! cd x`: con `&&`, lo que sigue corre justo cuando el cd falló (M7). Queda desconocido.
  setPossible(st, negated ? merge(before, next) : next);
}

// ------------------------------------------------------------ git

function analyzeGit(name, words, cmd, st, ctx, out) {
  let i = 1;
  let sub;
  let redirected = Boolean(cmd.gitRedirect);
  const cfg = [];
  if (name !== 'git') {
    sub = name.slice(4); // forma con guion: git-stash
  } else {
    for (; i < words.length; i++) {
      const w = words[i];
      const v = w.value;
      // El directorio de -C / --git-dir / --work-tree puede ser dinámico: solo se permiten lecturas.
      if (!w.dyn && (v === '-C' || v === '--git-dir' || v === '--work-tree')) { redirected = true; i++; continue; }
      const dirOpt = /^(-C|--git-dir=|--work-tree=)/.exec(v);
      if (dirOpt && (!w.dyn || w.dynAt >= dirOpt[0].length)) { redirected = true; continue; }
      if (w.dyn) { out.push(hit('dynamic-argument')); return; }
      if (!v.startsWith('-') || v === '-') break;
      if (v === '-c' || v === '--config-env') {
        const nx = words[i + 1];
        if (!nx) { out.push(hit('git-unknown-option')); return; }
        if (nx.dyn) { out.push(hit('git-config-override')); return; }
        cfg.push(nx.value);
        i++;
        continue;
      }
      if (v.startsWith('-c')) { cfg.push(v.slice(2)); continue; }
      if (v.startsWith('--config-env=')) { cfg.push(v.slice('--config-env='.length)); continue; }
      const eq = v.indexOf('=');
      const opt = eq < 0 ? v : v.slice(0, eq);
      if (GIT_GLOBAL_VALUE.has(opt)) {
        if (eq < 0) { if (!words[i + 1]) { out.push(hit('git-unknown-option')); return; } i++; }
        continue;
      }
      if (GIT_GLOBAL_FLAGS.has(opt)) continue;
      out.push(hit('git-unknown-option'));
      return;
    }
    if (cfg.some((kv) => PROTECTED_CONFIG.test(kv.split('=')[0].trim().toLowerCase()))) { out.push(hit('git-config-override')); return; }
    if (i >= words.length) return;
    if (words[i].dyn) { out.push(hit('dynamic-argument')); return; }
    sub = words[i].value;
  }
  if (!GIT_BUILTINS.has(sub)) { out.push(hit('unknown-git-subcommand')); return; }
  const args = words.slice(i + 1);
  const o = parseOpts(args, SPECS[sub]);
  // Con -C / --git-dir / --work-tree todo se evalúa con sus reglas; lo que depende
  // del estado del otro directorio no se puede ver: `checkout <x>` (¿archivo o rama?)
  // se niega y `merge` pide confirmación (no se sabe si la rama es main).
  if (redirected) {
    if (sub === 'checkout' && o.positionals.length && !o.shorts.has('b') && !o.shorts.has('B')) out.push(hit('git-C'));
    if (sub === 'merge') out.push(hit('merge-main'));
  }
  const inner = redirected ? { ...st, cwdReal: null, alts: null } : st;
  // Programas que git ejecuta por opción (G7): --upload-pack, --receive-pack, --exec, clone/ls-remote -u.
  if (longIs(o, 'upload-pack') || longIs(o, 'receive-pack') || (['push', 'archive', 'send-pack'].includes(sub) && longIs(o, 'exec'))
    || (['clone', 'ls-remote'].includes(sub) && o.shorts.has('u'))) out.push(hit('git-shell'));
  for (const r of gitRules(sub, o, args, ctx, inner)) out.push(hit(r));
  // git apply --directory=<dir> escribe los archivos del parche debajo de <dir> (M3).
  if (sub === 'apply') {
    args.forEach((w, k) => {
      if (w.value === '--directory' && !w.dyn && args[k + 1]) writeOperand(args[k + 1], inner, ctx, out);
      else if (w.value.startsWith('--directory=')) writeOperand(assignedValue(w, 12), inner, ctx, out);
    });
  }
  if (o.dynSlot && DESTRUCTIVE.has(sub)) out.push(hit('dynamic-argument'));
}

function gitRules(sub, o, args, ctx, st) {
  const has = (ch) => o.shorts.has(ch);
  const long = (n) => longIs(o, n);
  const pos = o.positionals;
  const r = [];
  switch (sub) {
    case 'stash': {
      if (!args.length) return ['stash'];
      const action = args[0].value.startsWith('-') ? 'push' : args[0].value;
      if (['list', 'show', 'create'].includes(action)) return r;
      if (action === 'push') return has('m') || long('message') ? r : ['stash'];
      if (action === 'apply') {
        const rest = pos.slice(1);
        return rest.length === 1 && /^[0-9a-f]{7,40}$/i.test(rest[0].value) ? r : ['stash'];
      }
      return ['stash'];
    }
    case 'checkout': {
      if (has('f') || long('force')) return ['checkout-force'];
      if (o.dd || has('p') || long('patch') || long('pathspec-from-file') || long('ours') || long('theirs')) return ['checkout-path'];
      if (pos.length > 1) return ['checkout-path'];
      if (pos.length === 1) {
        const p = pos[0];
        if (p.value === '.' || p.glob) return ['checkout-path'];
        if (p.dyn) return ['dynamic-argument'];
        if (realDirs(st).some((d) => fs.existsSync(path.resolve(d, p.value)))) return ['checkout-path'];
        if (MAIN.test(p.value) && !has('b') && !has('B') && !long('orphan')) st.onMain = true;
      }
      if (has('B')) r.push('ref-move');
      return r;
    }
    case 'switch':
      if (has('f') || long('force') || long('discard-changes')) return ['switch-force'];
      if (pos.length && MAIN.test(pos[0].value) && !has('c') && !has('C') && !long('create') && !long('force-create') && !long('orphan')) st.onMain = true;
      if (has('C') || long('force-create')) r.push('ref-move');
      return r;
    case 'restore':
      return (has('S') || long('staged')) && !(has('W') || long('worktree')) ? r : ['restore'];
    case 'reset':
      return long('hard') || long('merge') ? ['reset-hard'] : r;
    case 'clean':
      return has('n') || long('dry-run') ? r : ['clean'];
    case 'branch': {
      const del = has('d') || has('D') || long('delete');
      if (del) return ['branch-delete'];
      return has('f') || long('force') || has('M') || has('C') ? ['branch-force'] : r;
    }
    case 'tag':
      if (has('d') || long('delete')) return ['tag-delete'];
      return has('f') || long('force') ? ['tag-force'] : r;
    case 'worktree':
      return pos.length && pos[0].value === 'remove' && (has('f') || long('force')) ? ['worktree-remove-force'] : r;
    case 'commit':
      return has('n') || long('no-verify') ? ['no-verify'] : r;
    case 'merge':
      if (long('no-verify')) return ['no-verify'];
      return MAIN.test(ctx.branch || '') || ctx.branch === UNKNOWN_BRANCH || st.onMain ? ['merge-main'] : r;
    case 'rebase':
      if (long('no-verify')) return ['no-verify'];
      return has('x') || long('exec') ? ['git-shell'] : r;
    case 'am':
    case 'cherry-pick':
    case 'revert':
      return long('no-verify') ? ['no-verify'] : r;
    case 'push':
      if (long('no-verify')) return ['no-verify'];
      if (has('f') || long('force') || long('force-with-lease') || long('force-if-includes') || long('mirror') || long('prune')) return ['push-force'];
      if (pos.some((w) => w.value.startsWith('+'))) return ['push-force'];
      if (has('d') || long('delete') || pos.slice(1).some((w) => w.value.startsWith(':'))) return ['push-delete'];
      return ['push'];
    case 'send-pack':
      return ['send-pack'];
    case 'fetch': {
      const forced = has('f') || long('force');
      const moves = pos.slice(1).some((w) => w.value.includes(':') && (forced || w.value.startsWith('+')));
      if (!moves) return r;
      return has('u') || long('update-head-ok') ? ['fetch-force-head'] : ['ref-move'];
    }
    case 'gc':
      return long('prune') ? ['gc-prune'] : r;
    case 'prune':
      return ['gc-prune'];
    case 'reflog':
      return pos.length && ['expire', 'delete', 'drop'].includes(pos[0].value) ? ['reflog-expire'] : r;
    case 'refs': // migrate --no-reflog descarta los reflogs (G10)
      return pos.length && pos[0].value === 'migrate' && long('no-reflog') ? ['reflog-expire'] : r;
    case 'config': {
      const c = configRule(o);
      return c ? [c] : r;
    }
    case 'update-ref':
      if (pos.some((w) => /^refs\/pignolo(\/|$)/i.test(w.value))) return ['pignolo-ref'];
      if (long('stdin')) return ['update-ref-stdin'];
      return pos.length ? ['ref-move'] : r;
    case 'symbolic-ref':
      if (pos.some((w) => /^refs\/pignolo(\/|$)/i.test(w.value))) return ['pignolo-ref'];
      return pos.length >= 2 || has('d') || long('delete') ? ['ref-move'] : r;
    case 'read-tree':
      return has('u') ? ['read-tree-update'] : r;
    case 'checkout-index':
      return has('f') || long('force') ? ['checkout-index-force'] : r;
    case 'rm':
      return (has('f') || long('force')) && !long('cached') ? ['rm-force'] : r;
    case 'submodule':
      return pos.length && pos[0].value === 'foreach' ? ['git-shell'] : r;
    case 'bisect':
      return pos.length && pos[0].value === 'run' ? ['git-shell'] : r;
    case 'difftool':
      return has('x') || long('extcmd') ? ['git-shell'] : r;
    case 'mergetool':
    case 'filter-branch':
      return ['git-shell'];
    default:
      return r;
  }
}

// Escritura de git config: solo claves de CONFIG_ALLOW. Lecturas permitidas.
function configRule(o) {
  const has = (ch) => o.shorts.has(ch);
  const long = (n) => o.longs.includes(n);
  if (has('e') || longIs(o, 'edit')) return 'config-write';
  const pos = o.positionals.map((w) => w.value);
  let key;
  if (pos[0] === 'get' || pos[0] === 'list') return null;
  if (['set', 'unset', 'rename-section', 'remove-section'].includes(pos[0])) key = pos[1];
  else if (pos[0] === 'edit') return 'config-write';
  else if (CONFIG_READ_FLAGS.some(long) || has('l')) return null;
  else if (CONFIG_WRITE_FLAGS.some(long)) key = pos[0];
  else if (pos.length >= 2) key = pos[0];
  else return null; // `git config user.name`: lectura
  if (!key) return 'config-write';
  if (o.positionals.some((w) => w.dyn && w.dynAt === 0)) return 'dynamic-argument';
  return CONFIG_ALLOW.test(key.toLowerCase()) && !PROTECTED_CONFIG.test(key.toLowerCase()) ? null : 'config-write';
}

// ------------------------------------------------------- otros programas

function analyzeFind(args, cmd, shell, ctx, out, depth, st) {
  let k = 0;
  while (k < args.length && /^-[HLP]$|^-O\d$|^-D$/.test(args[k].value)) k += args[k].value === '-D' ? 2 : 1;
  const starts = [];
  for (; k < args.length; k++) {
    const v = args[k].value;
    if (!args[k].dyn && (v.startsWith('-') || v === '(' || v === '!' || v === ')')) break;
    starts.push(args[k]);
  }
  if (!starts.length) starts.push(word('.'));
  const expr = args.slice(k);
  if (expr.some((w) => w.value === '-delete')) checkDeleteOperands(starts, st, ctx, out);
  for (let i = 0; i < expr.length; i++) {
    if (!['-exec', '-execdir', '-ok', '-okdir'].includes(expr[i].value)) continue;
    let j = i + 1;
    while (j < expr.length && expr[j].value !== ';' && expr[j].value !== '+') j++;
    // `{}` es cada archivo encontrado debajo de los puntos de partida.
    for (const s of starts) {
      const inner = expr.slice(i + 1, j).map((w) => (w.value.includes('{}')
        ? { ...w, value: `${s.value.replace(/\/+$/, '')}/${w.value}`, dyn: true, dynAt: s.dyn ? 0 : s.value.replace(/\/+$/, '').length + 1 }
        : w));
      if (inner.length) runWords(inner, { ...cmd, redirects: [], pipedIn: false, stdinBody: undefined, noCd: true }, 'bash', ctx, out, depth + 1, st);
    }
    i = j;
  }
}

// Código leído de la entrada estándar: con un heredoc o here-string literal se
// evalúa; de un pipe o de un archivo, no es verificable. Sin entrada, es interactivo.
function stdinCode(cmd, lang, ctx, out, depth, st, check) {
  if (cmd.stdinBody !== undefined) {
    if (check) check(cmd.stdinBody);
    else script(cmd.stdinBody, lang, ctx, out, depth + 1, { ...st });
    return;
  }
  if (cmd.pipedIn || cmd.stdin) out.push(hit('hidden-code'));
}

function analyzeShell(args, cmd, ctx, out, depth, st) {
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    const v = w.value;
    if (w.dyn) { if (/^[<>]\(\)/.test(v)) out.push(hit('hidden-code')); return; } // bash <(...); bash "$f" es un script (fuera de alcance)
    if (v === '--') { if (i + 1 < args.length) return; break; }
    if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(v)) { code(args[i + 1] || dynWord(), 'bash', ctx, out, depth, st); return; }
    if (/^-[a-zA-Z]*s/.test(v)) break;
    if (v.startsWith('-') || v.startsWith('+')) {
      if (['-o', '+o', '-O', '+O', '--rcfile', '--init-file'].includes(v)) i++;
      continue;
    }
    if (/^(\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/self\/fd\/\d+)$/.test(v)) break;
    return; // script en un archivo: su contenido está fuera de alcance
  }
  stdinCode(cmd, 'bash', ctx, out, depth, st);
}

const PS_VALUE_PARAMS = ['executionpolicy', 'workingdirectory', 'windowstyle', 'outputformat', 'inputformat',
  'configurationname', 'configurationfile', 'custompipename', 'settingsfile', 'version', 'psconsolefile'];
const PS_VALUE_ALIASES = ['ex', 'ep', 'wd', 'w', 'o', 'of', 'if', 'inp', 'v'];

function psParam(o, names, aliases) {
  return aliases.includes(o) || names.some((n) => o.length >= 2 && n.startsWith(o));
}

function analyzePwsh(args, cmd, ctx, out, depth, st) {
  for (let i = 0; i < args.length; i++) {
    const m = /^[-/]([A-Za-z]+)$/.exec(args[i].value);
    if (m && !args[i].dyn) {
      const o = m[1].toLowerCase();
      if (psParam(o, ['encodedcommand', 'encodedarguments'], ['e', 'ec', 'ea', 'enc'])) { out.push(hit('ps-encoded')); return; }
      if (psParam(o, ['command', 'commandwithargs'], ['c', 'cwa'])) { pwshScript(args.slice(i + 1), cmd, ctx, out, depth, st); return; }
      if (psParam(o, ['file'], ['f'])) return;
      if (psParam(o, PS_VALUE_PARAMS, PS_VALUE_ALIASES)) i++;
      continue;
    }
    pwshScript(args.slice(i), cmd, ctx, out, depth, st); // un posicional se interpreta como comando
    return;
  }
  stdinCode(cmd, 'powershell', ctx, out, depth, st);
}

function pwshScript(rest, cmd, ctx, out, depth, st) {
  if (!rest.length) { out.push(hit('hidden-code')); return; }
  if (rest.length === 1 && rest[0].value === '-' && !rest[0].dyn) { stdinCode(cmd, 'powershell', ctx, out, depth, st); return; }
  code(rest[0].dyn && rest[0].dynAt === 0 ? dynWord() : word(rest.map((w) => w.value).join(' ')), 'powershell', ctx, out, depth, st);
}

function inlineCheck(name, out, st, ctx) {
  const perlish = name === 'perl' || name === 'ruby' || name === 'php';
  return (text) => {
    if (mentionsGit(text) || SPAWN_RE.test(text) || (perlish && SPAWN_PERL_RUBY.test(text))) out.push(hit('inline-code'));
    if (st && ctx) inlineDeletes(text, st, ctx, out);
  };
}

// APIs de borrado o movimiento en código inline (I1): fs.rmSync, shutil.rmtree, os.remove,
// Path(...).unlink, FileUtils.rm_rf, unlink de perl/php, Deno.remove, Remove-Item...
const DELETE_API = new RegExp([
  String.raw`\b(rmSync|rmdirSync|unlinkSync|renameSync|removeSync|moveSync|emptyDirSync|rmtree|rimraf|remove_tree|removedirs)\b`,
  String.raw`\b(fs|fsp|fsPromises|promises|fse)\.(rm|rmdir|unlink|rename|remove|move|emptyDir)\b`,
  String.raw`\bshutil\.(rmtree|move)\b`, String.raw`\bos\.(remove|unlink|rmdir|rename|replace)\b`,
  String.raw`\.(unlink|rmdir)\s*\(`, String.raw`\bFileUtils\.(rm\w*|remove\w*|mv|move)\b`,
  String.raw`\b(File|Dir|FileUtils)\.(delete|unlink|rename|rmdir)\b`, String.raw`\bDeno\.(remove|rename)(Sync)?\b`,
  String.raw`(^|[^.\w$])(unlink|rmdir|rename)\b(?=\s*\(?\s*['"])`, String.raw`\bRemove-Item\b`,
].join('|'), 'g');
const HOME_EXPR = /^(os\.homedir\(\)|require\(\s*['"](node:)?os['"]\s*\)\.homedir\(\)|Path\.home\(\)|Dir\.home|process\.env\.(HOME|USERPROFILE)|os\.environ\[\s*['"]HOME['"]\s*\]|ENV\[\s*['"]HOME['"]\s*\]|\$ENV\{HOME\}|\$HOME|getenv\(\s*['"]HOME['"]\s*\))/;
const STRING_LIT = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

// Protegido por nombre, esté donde esté en el código: .git, .pignolo, ~ o $HOME solos.
function namesProtected(lit) {
  const c = cleanPath(lit);
  return GIT_DIR_RE.test(c) || /(^|\/)\.pignolo(\/|$)/.test(c) || /^(~|\$HOME|\$\{HOME\})\/?$/.test(lit);
}

function inlineDeletes(text, st, ctx, out) {
  const calls = [...text.matchAll(DELETE_API)];
  if (!calls.length) return;
  const lits = [...text.matchAll(STRING_LIT)].map((m) => m[2]).filter((s) => !/\$\{|#\{/.test(s));
  if (lits.some(namesProtected)) { out.push(hit('catastrophic-delete')); return; }
  let unknown = false;
  for (const m of calls) {
    // Destino: el primer argumento de la llamada, o el receptor de .unlink()/.rmdir().
    const after = text.slice(m.index + m[0].length).replace(/^\s*\(?\s*/, '');
    const before = text.slice(0, m.index);
    const recv = /\.(unlink|rmdir)\s*\($/.test(m[0]) ? /\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\)\s*$/.exec(before) : null;
    const first = recv || /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(after);
    if (HOME_EXPR.test(after)) { out.push(hit('catastrophic-delete')); return; }
    if (!first || /\$\{|#\{/.test(first[2])) { unknown = true; continue; }
    const w = word(first[2].replace(/^\$\{?HOME\}?(?=\/|$)/, '~'), { glob: /[*?[]/.test(first[2]) });
    if (isCatastrophicOperand(w, st, ctx)) { out.push(hit('catastrophic-delete')); return; }
  }
  if (unknown) out.push(hit('inline-code'));
}

function analyzeInterp(name, args, cmd, out, st, ctx) {
  const codes = [];
  let program = false;
  let stdin = false;
  let files = [];
  // perl/ruby -i (también -pi, -i.bak): los archivos se reescriben en el lugar (G9).
  const inPlace = (name === 'perl' || name === 'ruby') && args.some((w) => !w.dyn && /^-[A-Za-z]*i/.test(w.value));
  for (let i = 0; i < args.length && !program; i++) {
    const w = args[i];
    const v = w.value;
    if (w.dyn && !codes.length) { program = true; if (/^[<>]\(\)/.test(v)) out.push(hit('hidden-code')); break; }
    if (name === 'node' || name === 'nodejs' || name === 'bun') {
      if (['-e', '--eval', '-p', '--print', '-pe', '-ep'].includes(v)) { codes.push(args[i + 1]); i++; continue; }
      if (/^--(eval|print)=/.test(v)) { codes.push({ ...w, value: v.slice(v.indexOf('=') + 1) }); continue; }
      if (['-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions', '--env-file', '--input-type'].includes(v)) { i++; continue; }
    } else if (name === 'deno') {
      if (i === 0 && v === 'eval') { codes.push(args[i + 1]); i++; continue; }
    } else if (name.startsWith('py')) {
      const m = /^-[A-Za-z]*c(.*)$/s.exec(v);
      if (m) { codes.push(m[1] ? { ...w, value: m[1] } : args[i + 1]); break; }
      if (v === '-m') { program = true; break; }
      if (['-X', '-W', '-Q'].includes(v)) { i++; continue; }
    } else if (name === 'ruby' || name === 'perl') {
      const m = /^-[A-Za-z0-9]*[eE](.*)$/s.exec(v);
      if (m) { codes.push(m[1] ? { ...w, value: m[1] } : args[i + 1]); if (!m[1]) i++; continue; }
    } else if (name === 'php') {
      if (v === '-r') { codes.push(args[i + 1]); i++; continue; }
    } else if (name === 'rscript' || name.startsWith('lua')) {
      if (v === '-e') { codes.push(args[i + 1]); i++; continue; }
    }
    if (v === '-') { stdin = true; break; }
    if (v.startsWith('-')) continue;
    if (!codes.length) program = true;
    else files = args.slice(i);
    break;
  }
  if (inPlace) for (const w of files) writeOperand(w, st, ctx, out);
  const check = inlineCheck(name, out, st, ctx);
  for (const c of codes) {
    if (!c || (c.dyn && c.dynAt === 0)) { out.push(hit('hidden-code')); return; }
    check(c.value);
  }
  if (!codes.length && (!program || stdin)) stdinCode(cmd, name, null, out, 0, null, check);
}

function analyzeAwk(args, out) {
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if (['-F', '-v', '-f', '--file'].includes(v)) { if (v === '-f' || v === '--file') return; i++; continue; }
    if (v.startsWith('-')) continue;
    if (args[i].dyn) { out.push(hit('hidden-code')); return; }
    if (AWK_EXEC.test(v)) out.push(hit('inline-code'));
    return;
  }
}

// sed: el comando `e` y la bandera `e` de `s///` ejecutan el texto como comando.
function sedExecutes(scriptText) {
  for (const raw of scriptText.split(/[;\n]/)) {
    const piece = raw.trim().replace(/^(\d+|\$|\/(?:\\.|[^/])*\/)(,(\d+|\$|\/(?:\\.|[^/])*\/))?!?\s*/, '').replace(/^\{\s*/, '');
    if (/^e(\s|$)/.test(piece)) return true;
    const m = /^s(.)/.exec(piece);
    if (m) {
      const d = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^s${d}(?:\\\\.|[^${d}\\\\])*${d}(?:\\\\.|[^${d}\\\\])*${d}([a-zA-Z0-9]*)`);
      const f = re.exec(piece);
      if (f && f[1].includes('e')) return true;
    }
  }
  return false;
}

// sed -i (-i.bak, --in-place): los archivos se reescriben en el lugar (G9).
function analyzeSed(args, out, st, ctx) {
  const scripts = [];
  const files = [];
  let explicit = false;
  let inPlace = false;
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    const v = w.value;
    if (v === '-e' || v === '--expression') { explicit = true; if (args[i + 1]) scripts.push(args[i + 1]); i++; continue; }
    if (v.startsWith('--expression=')) { explicit = true; scripts.push({ ...w, value: v.slice(13) }); continue; }
    if (v === '-f' || v === '--file') { explicit = true; i++; continue; }
    if (!w.dyn && (/^-[a-zA-Z]*i/.test(v) || v.startsWith('--in-place'))) inPlace = true;
    if (v.startsWith('-') && v.length > 1) continue;
    if (!explicit && !scripts.length) scripts.push(w);
    else files.push(w);
  }
  if (scripts.some((w) => !w.dyn && sedExecutes(w.value))) out.push(hit('inline-code'));
  if (inPlace) for (const w of files) writeOperand(w, st, ctx, out);
}

// tar -x (x, --extract, --get) escribe en el directorio de -C/--directory (G9).
function analyzeTar(args, st, ctx, out) {
  const extract = args.some((w, i) => !w.dyn && (/^--(extract|get)$/.test(w.value) || /^-[a-zA-Z]*x/.test(w.value) || (i === 0 && /^[a-zA-Z]*x[a-zA-Z]*$/.test(w.value))));
  if (!extract) return;
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if ((v === '-C' || v === '--directory') && args[i + 1]) writeOperand(args[i + 1], st, ctx, out);
    else if (v.startsWith('--directory=')) writeOperand(assignedValue(args[i], 12), st, ctx, out);
  }
}

// Descargas, extractores y parches (M3): el archivo o la carpeta donde escriben.
// file/dir: letras cortas cuyo valor es el archivo o la carpeta destino; val: otras
// letras que toman valor (cortan el grupo); long*: las mismas como opción larga;
// first: el primer posicional es el archivo que se reescribe (patch).
const SEVEN_ZIP = { dir: 'o', joinedOnly: true };
const FILE_WRITERS = {
  curl: { file: 'o', val: 'dDeEFHKmPQruTUwxXYyzAbcCt', longFile: ['output'], longDir: ['output-dir'] },
  wget: { file: 'Ooa', dir: 'P', val: 'eiBtTwlQUDIXAR', longFile: ['output-document', 'output-file', 'append-output'], longDir: ['directory-prefix'] },
  unzip: { dir: 'd', val: 'P' },
  '7z': SEVEN_ZIP, '7za': SEVEN_ZIP, '7zr': SEVEN_ZIP,
  patch: { file: 'or', dir: 'd', val: 'iBDFpVzYg', longFile: ['output', 'reject-file'], longDir: ['directory'], first: true,
    longVal: ['input', 'strip', 'prefix', 'basename-prefix', 'suffix', 'ifdef', 'fuzz', 'version-control', 'quoting-style', 'get'] },
};

function analyzeFileWriter(spec, args, st, ctx, out) {
  const target = (w) => { if (w && !(w.value === '-' && !w.dyn)) writeOperand(w, st, ctx, out); };
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    const v = w.value;
    if (v === '--' && !w.dyn) { positionals.push(...args.slice(i + 1)); break; }
    if (v.startsWith('--')) {
      const eq = v.indexOf('=');
      const name = v.slice(2, eq < 0 ? undefined : eq);
      const isTarget = (spec.longFile || []).includes(name) || (spec.longDir || []).includes(name);
      if (isTarget) target(eq < 0 ? args[i + 1] : assignedValue(w, eq + 1));
      if (eq < 0 && (isTarget || (spec.longVal || []).includes(name))) i++;
      continue;
    }
    if (v.startsWith('-') && v.length > 1) {
      for (let k = 1; k < v.length; k++) {
        const ch = v[k];
        const isTarget = (spec.file || '').includes(ch) || (spec.dir || '').includes(ch);
        if (!isTarget && !(spec.val || '').includes(ch)) { if (spec.joinedOnly) break; continue; }
        const joined = k < v.length - 1;
        if (isTarget) target(joined ? assignedValue(w, k + 1) : (spec.joinedOnly ? null : args[i + 1]));
        if (!joined && !spec.joinedOnly) i++;
        break;
      }
      continue;
    }
    positionals.push(w);
  }
  if (spec.first) target(positionals[0]);
}

// Operando que un programa escribe: literal, se evalúa como destino de una redirección;
// con variable o comodín, solo si nombra .git (no se sabe adónde cae).
function writeOperand(w, st, ctx, out) {
  if (!w.dyn && !w.glob) checkWriteTarget(w, st, ctx, out);
  else if (GIT_DIR_RE.test(cleanPath(w.value))) out.push(hit('protected-path'));
}

function analyzeCmd(args, ctx, out, depth, st) {
  const k = args.findIndex((w) => /^\/[ck]/i.test(w.value));
  if (k < 0) return;
  const first = args[k].value.slice(2);
  // ^ escapa el carácter siguiente en cmd: g^it es git (G8).
  const rest = [first, ...args.slice(k + 1).map((w) => w.value)].filter((x) => x !== '' && x !== '--%').join(' ').replace(/\^([A-Za-z0-9])/g, '$1');
  if (args.slice(k).some((w) => w.dyn) || /%[^%\s]+%/.test(rest)) { out.push(hit('hidden-code')); return; }
  code(word(rest), 'bash', ctx, out, depth, st);
}

function analyzeSetAlias(args, out) {
  const vals = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].kind === 'param') { if (/^-(value|name)$/i.test(args[i].value) && args[i + 1]) { if (/^-value$/i.test(args[i].value)) vals.push(args[i + 1]); i++; } continue; }
    vals.push(args[i]);
  }
  const target = vals.length > 1 ? vals[1] : vals[0];
  if (!target || target.dyn || /^(iex|invoke-.*|git(\.exe)?|.*[\\/]git(\.exe)?|start-process|saps|start|cmd|powershell|pwsh|bash|sh)$/i.test(target.value)) out.push(hit('ps-sink'));
  else if (WRITE_CMDS.has(progName(target.value))) out.push(hit('ps-sink')); // alias a un comando que borra o escribe (G2)
}

// Rutas literales de un cmdlet de PowerShell: posicionales y valores de -Path/-LiteralPath
// (no los de -Filter, -Include, -Destination...).
const PS_PATH_PARAMS = ['path', 'literalpath', 'pspath', 'lp'];
const PS_NONPATH_PARAMS = ['filter', 'include', 'exclude', 'credential', 'stream', 'destination', 'newname', 'depth', 'attributes'];
function psPaths(args) {
  const res = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.kind === 'scriptblock') continue;
    if (w.kind !== 'param') { res.push(w); continue; }
    const p = w.value.slice(1).toLowerCase();
    const next = args[i + 1];
    if (!next || next.kind === 'param' || next.kind === 'scriptblock') continue;
    if (PS_PATH_PARAMS.some((n) => n.startsWith(p))) { res.push(next); i++; } else if (p.length >= 2 && PS_NONPATH_PARAMS.some((n) => n.startsWith(p))) i++;
  }
  return res;
}

// Rutas que un borrado de PowerShell recibe por el pipeline (G2): un string literal,
// o lo que lista el Get-ChildItem/Get-Item de más arriba (a través de Where-Object,
// Select-Object o Sort-Object); si no se sabe de dónde vienen, una ruta dinámica.
const PS_FILTERS = new Set(['where-object', 'where', '?', 'select-object', 'select', 'sort-object', 'sort']);
const PS_CHILDREN = new Set(['get-childitem', 'gci', 'ls', 'dir']);
const PS_ITEMS = new Set(['get-item', 'gi']);
function pipedPaths(cmd) {
  if (cmd.stdinBody !== undefined) return [word(cmd.stdinBody)];
  let p = cmd.prev;
  while (p && !p.words[0].dyn && PS_FILTERS.has(progName(p.words[0].value))) p = p.prev;
  const name = p && !p.words[0].dyn ? progName(p.words[0].value) : '';
  if (!PS_CHILDREN.has(name) && !PS_ITEMS.has(name)) return [dynWord()];
  const paths = psPaths(p.words.slice(1));
  return (paths.length ? paths : [word('.')]).map((w) => (PS_ITEMS.has(name) || w.dyn ? w
    : word(`${w.value.replace(/[\\/]+$/, '')}/*`, { glob: true })));
}

// Objeto sobre el que se llama .Delete() o .MoveTo(): (Get-Item <ruta>) o
// [IO.DirectoryInfo]::new('<ruta>') dan la ruta; cualquier otra cosa es dinámica.
function memberTarget(t) {
  const g = /^expr:\(\s*(?:get-item|gi|get-childitem|gci)\s+(.*)\)$/i.exec(t);
  const lit = g && g[1].split(/\s+/).filter((x) => x && !x.startsWith('-')).map((x) => x.replace(/^(['"])(.*)\1$/, '$2'));
  if (lit && lit.length === 1 && !/[$(`]/.test(lit[0])) return word(lit[0], { glob: /[*?[]/.test(lit[0]) });
  const n = /^expr:\[(?:system\.)?io\.(?:directoryinfo|fileinfo)\]::new\(\s*'([^'$]*)'\s*\)$/i.exec(t);
  return n ? word(n[1]) : dynWord();
}

function analyzeStartProcess(args, cmd, shell, ctx, out, depth, st) {
  let file = null;
  const argList = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.kind === 'param') {
      const p = w.value.toLowerCase();
      if (/^-(filepath|file|f|path)$/.test(p)) { file = args[i + 1]; i++; continue; }
      if (/^-(argumentlist|args|a)$/.test(p)) {
        while (args[i + 1] && args[i + 1].kind !== 'param') { argList.push(args[i + 1]); i++; }
        continue;
      }
      if (/^-(workingdirectory|verb|windowstyle|redirectstandard\w+|credential)$/.test(p)) i++;
      continue;
    }
    if (!file) file = w; else argList.push(w);
  }
  if (!file) return;
  if (file.dyn) { out.push(hit('dynamic-command')); return; }
  const words = [word(file.value)];
  for (const a of argList) {
    if (a.dyn) words.push(a);
    else words.push(...a.value.split(/\s+/).filter(Boolean).map((v) => word(v)));
  }
  runWords(words, { ...cmd, redirects: [], pipedIn: false, stdinBody: undefined, noCd: true }, shell, ctx, out, depth + 1, st);
}

// ------------------------------------------------------------ PowerShell

const PS_SINK_TARGET = /\bscriptblock\b|diagnostics\.process|\$executioncontext|^type:(system\.management\.automation\.)?powershell$/i;
const PS_SINK_MEMBER = /^(invokescript|addscript|newscriptblock)$/i;
const PS_IO_TYPE = /^type:(system\.)?io\.(file|directory)$/i;

// Argumento de un método Delete*: un literal se evalúa como operando de un borrado; con
// variables, $PWD y $HOME se reemplazan y, si queda algo dinámico, solo cuenta si nombra
// .git o .pignolo (un `$db.DeleteRows($n)` no es un borrado de archivos).
function protectedMemberArg(a, st, ctx) {
  if (!a.dyn) return isCatastrophicOperand(a, st, ctx);
  const v = a.value.replace(/\\/g, '/').replace(/^(\$pwd|\$\{pwd\}|\$\((get-location|pwd|gl)\))(?=\/|$)/i, '.')
    .replace(/^(\$home|\$env:(userprofile|home))(?=\/|$)/i, '~');
  if (!v.includes('$')) return isCatastrophicOperand(word(v), st, ctx);
  return GIT_DIR_RE.test(cleanPath(v)) || /(^|\/)\.pignolo(\/|$)/.test(v);
}

// Nombre del miembro de ForEach-Object: -MemberName <x> o el primer posicional.
function psMemberName(args) {
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.kind === 'scriptblock') return '';
    if (w.kind === 'param') {
      if (/^-m(e(m(b(e(r(n(a(me?)?)?)?)?)?)?)?)?$/i.test(w.value)) return args[i + 1] && !args[i + 1].dyn ? args[i + 1].value : '';
      continue;
    }
    return w.dyn ? '' : w.value;
  }
  return '';
}

function psCommands(text, ctx, st) {
  const r = parsePsAst(text, ctx.psTimeoutMs ? { exe: ctx.psExe, timeoutMs: ctx.psTimeoutMs } : { exe: ctx.psExe });
  if (r.errors.length) throw new ParseError(r.errors[0]);
  const extra = [];
  for (const m of r.members) {
    if (m.member === null || PS_SINK_TARGET.test(m.target) || PS_SINK_MEMBER.test(m.member)) { extra.push(hit('ps-sink')); continue; }
    if (PS_IO_TYPE.test(m.target)) {
      if (/^(delete|move)/i.test(m.member)) checkDeleteOperands(m.args, st, ctx, extra);
      else if (/^(write|append|create|copy|replace|open|set)/i.test(m.member)) {
        for (const a of m.args) if (!a.dyn) checkWriteTarget(a, st, ctx, extra);
      }
    } else if (m.member && /^(delete|moveto|copyto)$/i.test(m.member)) {
      // FileSystemInfo.Delete()/MoveTo() sobre un objeto (G2): borrado; destino de MoveTo/CopyTo: escritura.
      if (!/^copyto$/i.test(m.member)) checkDeleteOperands([memberTarget(m.target)], st, ctx, extra);
      if (!/^delete$/i.test(m.member)) for (const a of m.args) if (!a.dyn) checkWriteTarget(a, st, ctx, extra);
    } else if (m.member && /^delete/i.test(m.member) && m.args.some((a) => protectedMemberArg(a, st, ctx))) {
      // Delete* de cualquier tipo ([Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory,
      // FileSystemObject.DeleteFolder) con una ruta protegida como argumento (M6).
      extra.push(hit('catastrophic-delete'));
    }
  }
  // Una variable asignada siempre con el mismo literal se propaga; si no, es dinámica.
  const values = new Map();
  for (const a of r.assigns) {
    if (/^\$env:(GIT_\w+)$/i.test(a.left) && GIT_ENV_NAME.test(a.left.slice(5))) extra.push(hit('git-env-config'));
    if (/^\$env:\w+$/i.test(a.left) && GIT_EXEC_ENV.test(a.left.slice(5))) {
      if (a.value === null) extra.push(hit('hidden-code'));
      else script(a.value, 'bash', ctx, extra, 1, { ...st, vars: new Map(st.vars) });
    }
    if (!a.name) continue;
    const k = a.name.toLowerCase();
    values.set(k, values.has(k) && values.get(k) !== a.value ? null : a.value);
  }
  for (const [k, v] of values) { if (v === null) st.vars.delete(k); else st.vars.set(k, v); }
  return { cmds: r.cmds, extra };
}

// ------------------------------------------------------------ diagnóstico

function explain(command, opts = {}) {
  const v = evaluate(command, opts);
  const lines = [`decisión: ${v.decision}${v.rule ? ` (${v.rule}, ${v.cls})` : ''}`];
  if (v.reason) lines.push(`motivo: ${v.reason}`);
  if (v.alternative) lines.push(`alternativa: ${v.alternative}`);
  lines.push('traza:', ...v.trace.map((t) => `  ${t}`));
  return lines.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const k = argv.indexOf(n); return k >= 0 ? argv.splice(k, 2)[1] : undefined; };
  const shell = opt('--shell');
  const mode = opt('--mode');
  const cwd = opt('--cwd');
  const k = argv.indexOf('--explain');
  if (k < 0 || argv[k + 1] === undefined) {
    process.stderr.write('uso: node git-guard.js --explain "<comando>" [--shell bash|powershell] [--mode <permission_mode>] [--cwd <dir>]\n');
    process.exit(2);
  }
  process.stdout.write(`${explain(argv[k + 1], { shell, mode, cwd })}\n`);
}

module.exports = { evaluate, explain, RULES, CANARIES, AUTO_MODES, UNKNOWN_BRANCH };
