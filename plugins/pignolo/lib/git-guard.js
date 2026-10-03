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
const { inlineCallsGit, langOf } = require('./inline-calls');
const { parsePsAst, PsUnavailable } = require('./ps-ast');
const { cleanPath, resolveClean, isWithin, isProtectedWrite, FLAG_RE, GIT_DIR_RE } = require('./paths');
const { lockedAt } = require('./sabotage');

const DIRECT = 'ejecutá el comando directamente, con el programa y sus argumentos escritos literalmente';
const RULES = {
  // conjunto catastrófico
  'catastrophic-delete': ['catastrophic', 'borrar o mover .git, ~/.pignolo, ~ o la raíz del repo, o un comodín o variable en esos lugares, no tiene vuelta atrás', 'nombrá rutas concretas fuera de .git y de ~/.pignolo; lo demás lo hace el humano a mano'],
  'protected-path': ['catastrophic', 'nadie escribe en .git, .claude (salvo .claude/worktrees), .gitconfig, ~/.pignolo, ~/.claude/settings*.json ni ~/.claude/plugins', 'usá comandos git; lo que haya que cambiar ahí lo hace el humano'],
  // deny
  'invalid-input': ['deny', 'el comando llegó vacío o no es texto', 'reenviá el comando completo'],
  stash: ['deny', 'git stash sin etiqueta: el stash se comparte entre worktrees y se pierde trabajo', 'commiteá el trabajo (commit WIP, solo código por ruta, sin git add -f) o usá `git stash push -m "<etiqueta>"` y aplicalo por SHA'],
  'checkout-path': ['deny', 'git checkout con ruta sobrescribe cambios sin commitear', 'para ver otra versión usá `git show <ref>:<ruta>`; para descartar, commiteá primero (solo código, por ruta, sin git add -f)'],
  'checkout-force': ['deny', 'git checkout -f descarta cambios sin commitear', 'commiteá (solo código, por ruta, sin git add -f) o respaldá y cambiá de rama sin -f'],
  'switch-force': ['deny', 'git switch -f / --discard-changes descarta cambios sin commitear', 'commiteá (solo código, por ruta, sin git add -f) o respaldá y cambiá de rama sin forzar'],
  restore: ['deny', 'git restore sobre el árbol descarta cambios sin commitear', 'usá `git restore --staged <ruta>` para sacar del índice, o commiteá antes (solo código, por ruta, sin git add -f)'],
  'reset-hard': ['deny', 'git reset --hard / --merge descarta cambios sin commitear', 'usá `git reset --soft` o `git revert`; si hace falta, commiteá WIP antes (solo código, por ruta, sin git add -f)'],
  clean: ['deny', 'git clean borra archivos sin seguimiento sin recuperación', 'revisá con `git clean -n` y borrá a mano lo que corresponda'],
  'worktree-remove-force': ['deny', 'git worktree remove --force descarta cambios sin commitear del worktree', 'commiteá (solo código, por ruta, sin git add -f) o respaldá el worktree y usá `git worktree remove` sin --force'],
  'add-force': ['deny', 'git add -f/--force (y update-index --add) agrega al índice archivos que el proyecto ignora a propósito (por ejemplo .pignolo-ui/ guarda datos personales del autor)', 'agregá solo código por ruta, sin git add -f; si querías resguardar trabajo, commiteá solo esas rutas de código, sin git add -f, y dejá lo ignorado fuera'],
  'no-verify': ['deny', '--no-verify / -n saltea los hooks del repo', 'arreglá lo que el hook rechaza; si hay que saltearlo, es decisión del humano'],
  'gc-prune': ['deny', 'git gc --prune / git prune eliminan objetos inalcanzables', 'no hace falta podar; si es imprescindible, lo decide el humano'],
  'reflog-expire': ['deny', 'expirar o borrar el reflog elimina la red de seguridad de commits', 'no se toca el reflog; es la última capa de recuperación'],
  'push-force': ['deny', 'push forzado (--force, -f, +ref, --mirror, --prune) reescribe o borra historia remota', 'hacé un commit nuevo (revert o fix) y push normal'],
  'send-pack': ['deny', 'git send-pack escribe refs remotas sin las comprobaciones de push', 'usá `git push`'],
  'fetch-force-head': ['deny', 'git fetch --update-head-ok con un refspec forzado pisa la rama activa', 'usá `git fetch` sin forzar y después `git merge --ff-only`'],
  'config-write': ['deny', 'git config solo escribe claves de una lista corta (user.*, color.*, core.autocrlf, ...)', 'los cambios de configuración de git los hace el humano'],
  'git-config-override': ['deny', 'git -c con una clave que ejecuta programas o toca la protección (alias, hooks, editor, gc, ...)', 'escribí el comando sin -c'],
  'git-config-unknown': ['unverifiable', 'git -c con una clave fuera de la lista corta: muchas claves de git ejecutan programas y la guardia no las puede verificar todas', 'escribí el comando sin -c, o con una clave de la lista (user.*, color.*, core.autocrlf, core.safecrlf, ...)'],
  'git-env-config': ['deny', 'GIT_CONFIG_* o GIT_EXEC_PATH inyectan configuración que la guardia no ve', 'quitá esas variables del comando'],
  'pignolo-ref': ['deny', 'las refs refs/pignolo/* son los respaldos de pignolo', 'no se tocan; si sobran, lo decide el humano'],
  'update-ref-stdin': ['deny', 'git update-ref --stdin puede borrar o pisar cualquier ref, respaldos incluidos', 'usá `git branch` o `git tag`, o `git update-ref <ref> <valor>` de a una'],
  'read-tree-update': ['deny', 'git read-tree -u reescribe el árbol de trabajo', 'usá `git show <ref>:<ruta>` o commiteá antes (solo código, por ruta, sin git add -f)'],
  'checkout-index-force': ['deny', 'git checkout-index -f sobrescribe archivos del árbol de trabajo', 'usá `git show <ref>:<ruta>` o commiteá antes (solo código, por ruta, sin git add -f)'],
  'rm-force': ['deny', 'git rm -f borra archivos con cambios sin commitear', 'usá `git rm --cached` o commiteá antes (solo código, por ruta, sin git add -f)'],
  'git-C': ['deny', 'con git -C / --git-dir / --work-tree la guardia no ve el otro directorio: `checkout <x>` puede ser un archivo', 'usá `cd <ruta> && git checkout <x>`'],
  'protected-flag': ['deny', 'los flags del interruptor solo los escribe /pignolo:off y /pignolo:on', 'pedile al humano que escriba /pignolo:off o /pignolo:on'],
  'pignolo-launcher': ['deny', 'el launcher de pignolo solo lo invocan los hooks (y /pignolo:status con session-start)', 'pedile al humano que use /pignolo:off, /pignolo:on o /pignolo:status'],
  'pignolo-run': ['deny', 'un subagente no opera el flujo de pignolo (scripts/run.js): solo el hilo principal lo registra, lo renueva o lo cierra', 'respondé BLOCKED o NEEDS_CONTEXT y nombrá lo que haga falta cambiar en el flujo'],
  'pignolo-plan': ['deny', 'un subagente no opera el plan ni el estado de pignolo (plan.js, plan-audit.js, approved.js, close-session.js, state-index.js): solo el hilo principal', 'respondé BLOCKED o NEEDS_CONTEXT y nombrá lo que haga falta cambiar en el plan'],
  'pignolo-init': ['deny', 'un subagente no opera init.js ni places.js: solo el hilo principal y con el sí del humano', 'respondé BLOCKED o NEEDS_CONTEXT y nombrá lo que haga falta cambiar en project.md'],
  'pignolo-holdout': ['deny', 'solo el hilo principal y el validator ejecutan el holdout de pignolo (scripts/holdout.js)', 'el holdout lo corre el validator; pedile el resultado al hilo principal'],
  'pignolo-queue': ['deny', 'la cola de integración (scripts/queue.js) la opera solo el hilo principal o el integrator; el resto de los subagentes solo puede correr queue.js status', 'la cola la opera el integrator; pedile la integración al hilo principal'],
  'pignolo-worktree-tools': ['deny', 'solo el hilo principal crea worktrees de tarea, etiqueta contratos y aplica la limpieza (worktree.js create|tag-contract, cleanup.js apply)', 'pedile al hilo principal que lo haga; podés leer con worktree.js list o cleanup.js report'],
  'pignolo-protected-refs': ['deny', 'int/*, queue/*, cp/* y contract/* solo las escriben la cola y el hilo principal (git switch/checkout, tag, branch, update-ref, push, fetch o commit/merge sobre esas ramas)', 'trabajá en la rama de tu tarea y pedí la integración al hilo principal'],
  'subagent-main': ['deny', 'un subagente no hace push ni merge sobre main/master: lo hace solo el hilo principal', 'terminá tu tarea y respondé (handback); el hilo principal hace el push o el merge'],
  'snapshot-required': ['deny', 'este comando sobrescribe trabajo sin commitear y solo pasa con una instantánea previa; la instantánea falló', 'reintentá, o commiteá el trabajo como WIP antes (solo código, por ruta, sin git add -f)'],
  'sabotage-lock': ['deny', 'hay un sabotaje en curso o interrumpido en este worktree (candado pignolo-sabotage.json en su git-dir): el árbol puede tener el código saboteado y git commit / git add lo guardarían', `corré \`node "${path.join(__dirname, '..', 'scripts', 'sabotage.js').split(path.sep).join('/')}" --recover\``],
  // ask
  'push-delete': ['ask', 'pignolo pide confirmación: borrado de una rama remota'],
  'branch-delete': ['ask', 'pignolo pide confirmación: borrado de rama (recuperable por reflog)'],
  'branch-force': ['ask', 'pignolo pide confirmación: se pisa o renombra una rama existente (recuperable por reflog)'],
  'tag-delete': ['ask', 'pignolo pide confirmación: borrado de tag'],
  'tag-force': ['ask', 'pignolo pide confirmación: se pisa un tag existente'],
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
// Sin distinguir mayúsculas: en Windows y macOS `git switch Main` saca la rama main (R5).
const MAIN = /^(main|master)$/i;

const PROTECTED_CONFIG = /^(alias\..+|core\.(hookspath|fsmonitor|sshcommand|pager|editor|askpass|gitproxy|logallrefupdates|worktree)|sequence\.editor|diff\.external|diff\..+\.(textconv|command)|merge\..+\.driver|pager\..+|filter\..+|credential(\..+)?\.helper|gpg(\..+)?\.program|uploadpack\.packobjectshook|protocol\..+\.allow|include\.path|includeif\..+\.path|gc\..+|clean\.requireforce|remote\..+\.(mirror|receivepack|uploadpack|vcs|push)|interactive\.difffilter|protocol\.allow|(difftool|mergetool|browser|man)\..+\.(cmd|path)|gpg\..+\.[a-z]*command)$/;
const CONFIG_ALLOW = /^(user\.(name|email|signingkey)|color\..+|core\.(autocrlf|eol|filemode|ignorecase|quotepath|longpaths|safecrlf|whitespace|symlinks)|init\.defaultbranch|pull\.(rebase|ff)|push\.(default|autosetupremote)|fetch\.prune|merge\.conflictstyle|rerere\.enabled|diff\.(algorithm|renames|colormoved)|log\.[a-z]+|format\.[a-z]+|branch\.[^.]+\.(remote|merge|rebase|description)|remote\.[^.]+\.url|advice\..+|help\.autocorrect|safe\.directory|commit\.gpgsign|tag\.gpgsign)$/;
// git -c solo pasa con claves de CONFIG_ALLOW o de esta lista (inofensivas para una sola
// corrida); cualquier otra es no verificable (M1): hay decenas de claves que ejecutan programas.
const OVERRIDE_ALLOW = /^(i18n\..+|diff\.(noprefix|mnemonicprefix|renamelimit|context|interhunkcontext|indentheuristic)|merge\.(ff|renames|renamelimit|verbosity)|status\.[a-z]+|grep\.[a-z]+|pack\.threads|core\.(abbrev|precomposeunicode|preloadindex|untrackedcache))$/;
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

// env: `-C <dir>`, `-C<dir>` (con -i/-v/-0 antes) y `--chdir[=<dir>]` (también abreviado: `--c`, `--ch`...).
const ENV_CHDIR_LONG = /^--c(?:h(?:d(?:i(?:r)?)?)?)?(?:=(.*))?$/s;
const ENV_CHDIR_SHORT = /^-[iv0]*C(.*)$/s;

const SPAWN_RE = /child_process|\bexec(Sync|FileSync|File)?\s*\(|\bspawn(Sync)?\s*\(|subprocess|os\.(system|popen|exec\w*|spawn\w*)|\bsystem\s*\(|\bpopen\b|Deno\.(run|Command)|Bun\.(spawn|\$)|shell_exec|passthru|proc_open|pcntl_exec/;
const SPAWN_PERL_RUBY = /\b(system|exec|spawn)\b|`|\bqx\s*\W|%x\s*\W|IO\.popen|Open3|\bopen\s*\(?\s*["']?\s*\|/;
const AWK_EXEC = /\bsystem\s*\(|\|\s*getline|\|&/;
const AWK_PRINT_PIPE = /print[^;}]*\|/; // se mira sin el contenido de las comillas: `print $2 "|" $3` no es un pipe

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
  // vals: lo que consumen las opciones con valor (git switch -c <rama>, branch -u ...): los nombres que escribe la regla de refs protegidas.
  const o = { shorts: new Set(), longs: [], positionals: [], vals: [], dd: false, dynSlot: false };
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
      if (eq >= 0) o.vals.push(v.slice(eq + 1));
      else if (longVal.some((l) => l === name || l.startsWith(name))) { if (words[i + 1]) o.vals.push(words[i + 1].value); i++; }
      continue;
    }
    if (v.startsWith('-') && v.length > 1) {
      if (w.dyn && w.dynAt <= 1) { o.dynSlot = true; continue; }
      for (let k = 1; k < v.length; k++) {
        if (w.dyn && k >= w.dynAt) { o.dynSlot = true; break; }
        o.shorts.add(v[k]);
        if (shortVal.includes(v[k])) {
          if (k === v.length - 1) { if (words[i + 1]) o.vals.push(words[i + 1].value); i++; } else o.vals.push(v.slice(k + 1));
          break;
        }
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
    psExe: opts.psExe,
    psTimeoutMs: opts.psTimeoutMs, // solo tests: plazo holgado para el parseo con la máquina cargada
    locs: { root, home, pignoloHome, claudeDirs: Array.isArray(opts.claudeDirs) ? opts.claudeDirs : undefined },
    onlyCatastrophic: Boolean(opts.onlyCatastrophic),
    collect: Array.isArray(opts.collect) ? opts.collect : null, // solo gitCommands: una entrada por `git`
    discard: false, // algún comando de la línea puede descartar trabajo (T2, D-G4)
    discardDirs: new Set(), // directorios reales de esos puntos
    discardUnknown: false, // alguno de esos puntos corre en un directorio que no se conoce
    statPath: typeof opts.statPath === 'function' ? opts.statPath : diskStat(), // costura de disco (T1): 'file' | 'dir' | null
    subagent: Boolean(opts.subagent), // el payload trae agent_id
    agentType: typeof opts.agentType === 'string' ? opts.agentType : null, // agent_type del payload
    namesLauncher: LAUNCHER_TEXT.test(String(command)), // la línea nombra el launcher (T4, H4)
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
  if (Array.isArray(opts.rules)) opts.rules.push(...found.map((v) => v.rule));
  const list = opts.onlyCatastrophic ? found.filter((v) => v.cls === 'catastrophic') : found;
  const v = decide(list, ctx);
  // Lo que la guardia no puede clasificar (unverifiable, ask) lleva instantánea igual que lo que descarta.
  const blind = found.some((f) => f.cls === 'unverifiable' || f.cls === 'ask');
  v.snapshot = ctx.discard || blind ? 'before' : 'none';
  v.snapshotDirs = [...ctx.discardDirs];
  v.snapshotUnknown = ctx.discardUnknown || (blind && !ctx.discard);
  return v;
}

// Lista cerrada de lo que puede descartar trabajo (D-G4, R-8): se marca en el punto donde ocurre, con el
// directorio real de ese punto (H7). El indicador vive en ctx (compartido en la recursión), no en st (que se copia).
function markDiscard(ctx, st) {
  ctx.discard = true;
  const dirs = realDirs(st);
  if (dirs.length) for (const d of dirs) ctx.discardDirs.add(d);
  else ctx.discardUnknown = true;
}
const DISCARD_PROGS = new Set([...DELETE_CMDS, 'cp', 'copy', 'copy-item', 'cpi', 'tee', 'install', 'truncate', 'ln', 'set-content', 'sc',
  'out-file', 'clear-content', 'clc', 'tee-object', 'new-item', 'ni', 'dd', 'robocopy', 'xcopy', 'rsync', 'curl', 'wget', 'unzip', '7z', '7za', '7zr', 'patch']);
const DISCARD_GIT = new Set(['checkout', 'switch', 'restore', 'reset', 'clean', 'stash', 'rm', 'read-tree', 'checkout-index', 'worktree', 'rebase',
  'merge', 'pull', 'cherry-pick', 'revert', 'am', 'apply', 'mv', 'submodule', 'bisect', 'sparse-checkout', 'filter-branch']);
const DISCARD_FIND = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls']);

// Costura de disco: 'file' | 'dir' | null para un valor resuelto contra los directorios reales del estado.
function diskStat() {
  return (value, st) => {
    for (const d of realDirs(st)) {
      try {
        const s = fs.statSync(path.resolve(d, value));
        return s.isDirectory() ? 'dir' : 'file';
      } catch (_) { /* no existe en este directorio */ }
    }
    return null;
  };
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
  markPipeTails(cmds, shell);
  const states = new Map();
  let offFrom = null; // estado del comando anterior si cambió a una rama literal que no es main (switchedTo)
  cmds.forEach((cmd, k) => {
    // PowerShell no corta la línea si Set-Location falla: cada comando es como tras un ';'.
    const s = shell === 'powershell' ? st : scopeState(cmd, st, states);
    settle(s, shell === 'powershell' ? (k ? ';' : null) : cmd.sep);
    // Con `&&` lo que sigue corre solo si el cambio de rama anduvo: HEAD ya no está en main (R7). Con cualquier otro
    // separador el cambio pudo fallar y HEAD seguir donde estaba: onMain no se baja.
    if (offFrom === s && shell !== 'powershell' && cmd.sep === '&&') s.onMain = false;
    const before = out.length;
    analyze(cmd, shell, ctx, out, depth, s);
    offFrom = s.offNext ? s : null;
    s.offNext = false;
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
  // El subshell hereda el directorio pero no la certeza del cd de afuera (cd-chain, conservador a propósito).
  return { ...p, sureReal: null, vars: new Map(p.vars), alts: p.alts && [...p.alts], pending: p.pending && { list: p.pending.list && [...p.pending.list], sure: false } };
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
  st.sureReal = null;
  if (list && list.length === 1) { st.cwd = list[0].cwd; st.cwdReal = list[0].real; st.alts = null; return; }
  st.cwd = null;
  st.cwdReal = null;
  st.alts = list && list.length <= 8 ? list : null;
}

function settle(st, sep) {
  if (!st.pending || sep === null || sep === undefined || sep === '&&' || sep === '|') return;
  const all = merge(st.pending.list, possible(st));
  const sure = sep === ';' ? st.pending.sure : null;
  st.pending = null;
  setPossible(st, all);
  // Cada `cd` de la cadena iba a una carpeta literal que existe: no falla, y lo que sigue por `;` corre en la última (cd-chain).
  if (sure) st.sureReal = sure;
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
  for (const r of cmd.redirects) {
    if (!r.op.includes('>') || isDescriptorDup(r)) continue;
    const target = subst(r.target, st, ps);
    checkWriteTarget(target, st, ctx, out);
    // `>>` agrega y `> /dev/null` no escribe: no descartan nada.
    if (!r.op.includes('>>') && !/^(\/dev\/null|nul|\$null)$/i.test(target.value)) markDiscard(ctx, st);
  }
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
      if (/^GIT_(DIR|WORK_TREE)$/i.test(m[1])) st.gitEnv = true; // puede salir exportada (R4): se supone que sí
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

// Expansión de llaves de bash en literal: `{-f,origin}` son DOS palabras (`-f`, `origin`) y la regla de cada opción tiene
// que verlas. Solo palabras donde la llave es lo único dinámico y sin comillas dentro. Lo que no se puede expandir (rango
// raro, más de BRACE_CAP palabras) queda dinámico desde la llave, y los destinos que miran `dyn` lo niegan.
const BRACE_CAP = 64;
function braceExpand(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let depth = 0;
    let last = i + 1;
    let end = -1;
    const parts = [];
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) { end = j; break; } } else if (s[j] === ',' && depth === 1) { parts.push(s.slice(last, j)); last = j + 1; }
    }
    if (end < 0) continue;
    parts.push(s.slice(last, end));
    let items = parts;
    if (parts.length === 1) {
      const m = /^(-?\d+)\.\.(-?\d+)$/.exec(parts[0]) || /^([A-Za-z])\.\.([A-Za-z])$/.exec(parts[0]);
      if (!m) continue;
      const num = /\d/.test(m[1]);
      const a = num ? Number(m[1]) : m[1].charCodeAt(0);
      const b = num ? Number(m[2]) : m[2].charCodeAt(0);
      if (Math.abs(b - a) >= BRACE_CAP) throw new RangeError('llaves');
      items = [];
      for (let k = a; a <= b ? k <= b : k >= b; k += a <= b ? 1 : -1) items.push(num ? String(k) : String.fromCharCode(k));
    }
    const pre = s.slice(0, i);
    const post = s.slice(end + 1);
    const res = [];
    for (const it of items) for (const x of braceExpand(it + post)) res.push(pre + x);
    if (res.length > BRACE_CAP) throw new RangeError('llaves');
    return res;
  }
  return [s];
}

function spliceBraces(words) {
  if (!words.some((w) => w.braceOnly && w.value === w.unq)) return words;
  const res = [];
  for (const w of words) {
    if (!(w.braceOnly && w.value === w.unq)) { res.push(w); continue; }
    let parts;
    try { parts = braceExpand(w.value); } catch (e) { res.push(w); continue; }
    for (const x of parts) res.push({ ...w, value: x, unq: x, dyn: false, dynAt: -1, brace: false, braceOnly: false, glob: w.glob || /[*?[]/.test(x) });
  }
  return res;
}

function runWords(input, cmd, shell, ctx, out, depth, st) {
  const ps = shell === 'powershell';
  let words = ps ? input : spliceBraces(input);
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
    if (u.chdir) st = stateIn(st, ctx, u.chdir);
    if (u.gitRedirect) cmd = { ...cmd, gitRedirect: true };
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
  let chdir = null; // env -C <dir> / --chdir=<dir>: el comando envuelto corre en <dir> (R5)
  let gitRedirect = false; // env GIT_DIR=… / GIT_WORK_TREE=…: git trabaja en otro repo (R4)
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
    if (name === 'env') {
      const longDir = ENV_CHDIR_LONG.exec(v);
      const shortDir = longDir ? null : ENV_CHDIR_SHORT.exec(v);
      if (longDir && longDir[1] !== undefined) { chdir = assignedValue(w, v.indexOf('=') + 1); i++; continue; }
      if (longDir || (shortDir && !shortDir[1])) { chdir = args[i + 1] || dynWord(); i += 2; continue; }
      if (shortDir) { chdir = assignedValue(w, v.indexOf('C') + 1); i++; continue; }
    }
    if (name === 'xargs') {
      if (v === '-I' && args[i + 1]) repl = args[i + 1].value;
      else if (/^-I./.test(v)) repl = v.slice(2);
      else if (/^(-i|--replace)$/.test(v)) repl = '{}';
      else if (/^(-i|--replace=)./.test(v)) repl = v.slice(v.startsWith('-i') ? 2 : 10);
    }
    if (spec.assign && /^[A-Za-z_][A-Za-z0-9_]*=/.test(v)) {
      if (GIT_ENV_NAME.test(v.slice(0, v.indexOf('=')))) out.push(hit('git-env-config'));
      if (/^GIT_(DIR|WORK_TREE)=/i.test(v)) gitRedirect = true;
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
  if (codeWord) return { code: codeWord, chdir, gitRedirect };
  if (spec.needsCode) return { done: true };
  let rest = args.slice(i);
  if (!rest.length) return spec.empty ? { words: [word(spec.empty)] } : { done: true };
  if (repl) rest = rest.map((w) => (w.value.includes(repl) ? { ...w, value: w.value.split(repl).join('{}'), dyn: true, dynAt: Math.min(w.dyn ? w.dynAt : Infinity, w.value.indexOf(repl)) } : w));
  if (spec.appendDyn) rest = rest.concat(dynWord());
  if (spec.joined && rest.length > 1 && !rest.some((w) => w.dyn)) return { code: word(rest.map((w) => w.value).join(' ')) };
  return { words: rest, chdir, gitRedirect };
}

// Código de shell pasado como texto: si es literal se evalúa; si no, no es verificable.
// Si todo el código sale de una variable o sustitución, no es verificable; si solo
// una parte, se analiza el texto (las variables quedan como argumentos dinámicos).
function code(w, shell, ctx, out, depth, st) {
  if (!w || (w.dyn && w.dynAt === 0)) { out.push(hit('hidden-code')); return; }
  script(w.value, shell, ctx, out, depth + 1, { ...st, vars: new Map(st.vars) });
}

// D-G6 (2026-10-03, reemplaza la primera versión): solo correr tests va sin instantánea; cualquier otro script
// (node x.js, npm run <otro>, make <otro>, python x.py, bash x.sh, ./x) la toma: un script propio puede borrar
// trabajo sin commitear, los tests casi nunca. Tabla cerrada; lo que no está en ella toma instantánea.
const TEST_CMDS = [
  ['npm', 'test'], ['npm', 't'], ['npm', 'run', 'test'], ['npm', 'run-script', 'test'],
  ['pnpm', 'test'], ['pnpm', 't'], ['pnpm', 'run', 'test'], ['yarn', 'test'], ['yarn', 'run', 'test'],
  ['bun', 'test'], ['deno', 'test'], ['make', 'test'], ['pytest'], ['py.test'],
  ['go', 'test'], ['cargo', 'test'], ['dotnet', 'test'], ['mvn', 'test'], ['gradle', 'test'], ['gradlew', 'test'],
];
// Gestores y constructores: fuera de la tabla corren un script del proyecto (o escriben), salvo estos subcomandos de solo lectura.
const RUNNER_READS = new Set(['-v', '--version', 'version', 'help', '--help', 'ls', 'list', 'view', 'info', 'outdated', 'why', 'whoami', 'root', 'bin', 'prefix', 'env', 'doc', 'vet', 'fmt']);
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'npx', 'make', 'gmake', 'go', 'cargo', 'dotnet', 'mvn', 'gradle', 'gradlew', 'just', 'task', 'rake', 'ant', 'bun', 'deno']);
const SCRIPT_FILE = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|php|ps1|bat|cmd)$/i;
function isTestRun(name, args) {
  const a = args.map((w) => w.value);
  if (TEST_CMDS.some((t) => t[0] === name && t.slice(1).every((x, i) => a[i] === x))) return true;
  if (name === 'node' || name === 'nodejs') return a.includes('--test');
  if (name === 'python' || name === 'python3' || name === 'py' || name === 'pypy') return a[0] === '-m' && ['pytest', 'unittest'].includes(a[1]);
  return false;
}
function runsOwnScript(name, words) {
  const args = words.slice(1);
  if (isTestRun(name, args)) return false;
  if (/^\.{1,2}[\\/]/.test(words[0].value) || (/[\\/]/.test(words[0].value) && SCRIPT_FILE.test(words[0].value))) return true;
  if (INTERP.has(name)) return !args.length || !args.every((w) => /^(-v|-V|--version|-h|--help)$/.test(w.value));
  if (SHELLS.has(name)) return !args.some((w) => /^-[a-zA-Z]*c/.test(w.value)) && args.some((w) => !w.value.startsWith('-'));
  if (RUNNERS.has(name)) return !(args[0] && RUNNER_READS.has(args[0].value));
  return false;
}

function dispatch(words, cmd, shell, ctx, out, depth, st, inShell) {
  const ps = shell === 'powershell';
  const name = progName(words[0].value);
  const args = words.slice(1);
  if (CD_CMDS.has(name)) { if (inShell) changeDir(name, args, st, ctx, Boolean(cmd.negated), cmd); return; }
  if (DISCARD_PROGS.has(name) || runsOwnScript(name, words)) markDiscard(ctx, st);

  if (DELETE_CMDS.has(name)) checkDeleteOperands(ps && cmd.pipedIn && !psPaths(args).length ? operands(args).concat(pipedPaths(cmd)) : operands(args), st, ctx, out);
  if (ps && cmd.pipedIn && (name === 'clear-content' || name === 'clc') && !psPaths(args).length) {
    for (const w of pipedPaths(cmd)) checkWriteTarget(w, st, ctx, out);
  }
  checkLauncher(name, words, st, ctx, out, cmd);
  checkRunScript(name, words, st, ctx, out);
  checkHoldoutScript(name, words, st, ctx, out);
  checkToolScripts(name, words, st, ctx, out);
  if ((name === 'claude' || name === 'claude-code') && claudePluginOff(args)) out.push(hit('protected-flag'));
  checkPathArgs(name, args, st, ctx, out);
  if (name === 'robocopy' && args.some((w) => /^\/(mir|purge|move|mov)$/i.test(w.value))) {
    checkDeleteOperands(args.filter((w) => !w.value.startsWith('/') || w.dyn), st, ctx, out);
  }
  if (name === 'git' || (name.startsWith('git-') && GIT_BUILTINS.has(name.slice(4)))) { analyzeGit(name, words, cmd, st, ctx, out); return; }
  if (name === 'export' || name === 'declare' || name === 'typeset' || name === 'local' || name === 'readonly') {
    if (args.some((w) => GIT_ENV_NAME.test(w.value.split('=')[0]))) out.push(hit('git-env-config'));
    if (args.some((w) => /^GIT_(DIR|WORK_TREE)(=|$)/i.test(w.value))) st.gitEnv = true;
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
  if (AWK.has(name)) { analyzeAwk(args, out, st, ctx); return; }
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
    // eval corre en la shell actual y su texto se analiza sobre una copia: un cd de adentro mueve el directorio de lo que sigue (RT1-02).
    if (args.some((w) => w.dyn || SHELL_CD.test(w.value))) dirLost(st);
    return;
  }
  if (!ps && (name === 'source' || name === '.')) {
    const f = args[0];
    if (!f) return;
    if (f.dyn) { out.push(hit('hidden-code')); return; }
    if (/^(-|\/dev\/stdin|\/dev\/fd\/\d+|\/proc\/self\/fd\/\d+)$/.test(f.value)) {
      stdinCode(cmd, 'bash', ctx, out, depth, st);
      if (!cmd.stdinBody || SHELL_CD.test(cmd.stdinBody)) dirLost(st); // corre en la shell actual (RT1-02)
    }
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
    markDiscard(ctx, st);
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

// Destino dinámico (T5, R-10): se niega solo si la parte literal nombra algo protegido; si no, pasa.
// .pignolo o un nombre base disabled / .disabled son el interruptor (protected-flag); .git, .gitconfig, .claude,
// settings*.json, hooks.json y plugins/ son escritura protegida (protected-path: apagan la guardia en la
// sesión siguiente).
const DYN_FLAG = /(^|\/)(\.pignolo(\/|$)|\.?disabled$)/i;
// Nombres que, aunque aparezcan solo en el literal o en el nombre de una variable, hacen sospechoso un destino dinámico.
const DYN_SENSITIVE = /(^|[^\w])\.git(?![\w-])|\.gitconfig|\.pignolo|(^|\/)pignolo(\/|$)|CLAUDE_(?!JOB_DIR)|\bGIT_|XDG_CONFIG|\.claude|settings[^/]*\.json|hooks\.json|(^|\/)plugins(\/|$)|(^|\/)\.?disabled$|(^|\/)git\/(config|hooks)|\bAPPDATA\b/i;
const DYN_PROTECTED = /(^|\/)(\.gitconfig$|\.claude(\/|$)|settings[^/]*\.json$|hooks\.json$|plugins\/)/i;
// Destino de una redirección: flags, rutas protegidas y destinos dinámicos.
function checkWriteTarget(w, st, ctx, out) {
  if (w.dyn) {
    // Lista blanca (RT2-05): pasa solo si la parte dinámica es una variable simple ($X, ${X}, $env:X) y ni lo literal ni
    // el nombre de la variable nombran nada protegido. Una sustitución, una expansión con valor por defecto o con
    // operador, aritmética, ANSI-C o backtick no se pueden leer: se niega.
    const dv = String(w.value);
    if (/\$[({']|`|[<>]\(|\$\{(?![A-Za-z_]\w*\})/.test(dv)) { out.push(hit(/\.pignolo|disabled/i.test(dv) ? 'protected-flag' : 'protected-path')); return; }
    const lit = cleanPath(w.value);
    if (/(^|[\\/])[^\\/]*\.?disabled$/i.test(dv) && cwdIsPignolo(st, ctx)) { out.push(hit('protected-flag')); return; }
    if (DYN_FLAG.test(lit)) { out.push(hit('protected-flag')); return; }
    if (DYN_SENSITIVE.test(dv.replace(/\\/g, '/'))) { out.push(hit(/\.pignolo|disabled/i.test(dv) ? 'protected-flag' : 'protected-path')); return; }
    // Un destino dinámico que nombra .git sigue siendo deny (conjunto catastrófico).
    if (GIT_DIR_RE.test(lit) || DYN_PROTECTED.test(lit)) { out.push(hit('protected-path')); return; }
    const prefix = w.dynAt > 0 ? w.value.slice(0, w.dynAt).replace(/\\/g, '/') : '';
    if (!prefix) return;
    const slash = prefix.lastIndexOf('/');
    const d = resolveAt(slash < 0 ? '.' : (prefix.slice(0, slash) || '/'), st, ctx);
    if (d === null) return;
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

// ¿Puede esta palabra con comodín o variable nombrar el flag (`.pignolo/disabled` o `.pignolo/.disabled`, en el
// proyecto o en el HOME)? Se compara segmento por segmento: un comodín no cruza `/` y puede casar un nombre con
// punto; un tramo con variable, `..`, `~`, una raíz o una unidad cuenta como `**` (cualquier cantidad de tramos).
// Un patrón de un solo tramo no llega, y uno que es solo variables tampoco (necesita un tramo que nombre algo).
const FLAG_PATHS = [['.pignolo', 'disabled'], ['.pignolo', '.disabled'], ['pignolo', 'disabled'], ['pignolo', '.disabled']]; // como FLAG_RE
function globSegment(seg) {
  return new RegExp('^' + [...seg.replace(/\[[^\]]*\]/g, '?')].map((c) => (c === '*' ? '[^/]*' : c === '?' ? '[^/]' : c.replace(/[\\^$.+(){}|\]-]/g, '\\$&'))).join('') + '$', 'i');
}
function flagReachable(w, inPignolo) {
  let segs = String(w.value).replace(/^[A-Za-z-]+=/, '').replace(/\\/g, '/').split('/');
  const lead = segs[0] === '' || segs[0] === '~' || /^[A-Za-z]:$/.test(segs[0]) || /[$`]/.test(segs[0]) || segs.find((s) => s !== '' && s !== '.') === '..';
  segs = segs.filter((s) => s !== '' && s !== '.').map((s) => (s === '..' || s === '~' || /^[A-Za-z]:$/.test(s) || /[$`]/.test(s) || s.includes('{}') ? '**' : s));
  if (lead && segs[0] !== '**') segs.unshift('**');
  // El cwd conocido es .pignolo (tras `cd .pignolo`): un patrón relativo cuelga de ahí (RT2-06c).
  else if (inPignolo) segs.unshift('.pignolo');
  segs = segs.filter((s, i) => !(s === '**' && segs[i - 1] === '**'));
  if (!segs.some((s) => s !== '**')) return false;
  const res = segs.map((s) => (s === '**' ? null : globSegment(s)));
  // Un tramo literal solo cuenta si casa con un nombre real del flag (`real`): los ancestros no se conocen (''
  // casa con todo), pero `$W/keep/$f` no llega al flag solo porque `keep` pudiera ser el directorio del proyecto.
  const match = (i, t, j, real) => {
    if (i === res.length) return j === t.length && real;
    if (res[i] === null) { for (let k = j; k <= t.length; k++) if (match(i + 1, t, k, real)) return true; return false; }
    if (j >= t.length) return false;
    if (t[j] === '') return match(i + 1, t, j + 1, real);
    return res[i].test(t[j]) && match(i + 1, t, j + 1, true);
  };
  // Las partes de un nombre armado en una subexpresión (Join-Path .pignolo '.disabled') no son tramos: si el texto
  // nombra pignolo y disabled, cuenta.
  if (/[$()]/.test(String(w.value)) && /pignolo/i.test(w.value) && /disabled/i.test(w.value)) return true;
  // Los ancestros del flag no se conocen; el patrón tiene que cubrir al menos hasta `.pignolo`.
  return FLAG_PATHS.some((t) => { const full = ['', '', '', '', ...t]; for (let j = 0; j <= full.length - 2; j++) if (match(0, full, j, false)) return true; return false; });
}

// ¿El directorio actual (cualquiera de los posibles) es .pignolo, el del proyecto o el del HOME?
function cwdIsPignolo(st, ctx) {
  return resolveAll('.', st, ctx).some((p) => /(^|\/)\.?pignolo$/.test(p));
}

// Argumentos de comandos que no solo leen: el flag del interruptor, y las rutas
// protegidas para los comandos que escriben en sus operandos.
function checkPathArgs(name, args, st, ctx, out) {
  if (READ_ONLY.has(name) || name === 'git' || name.startsWith('git-')) return;
  const writes = WRITE_CMDS.has(name);
  // Copiar solo escribe en el destino: leer de una ruta protegida (una transcripción
  // de ~/.claude/projects, .git/config) no es escribirla.
  const dest = COPY_CMDS.has(name) ? copyDest(args, name) : null;
  if (dest && !args.includes(dest)) checkWriteTarget(dest, st, ctx, out); // --target-directory=<dir>
  for (const w of args) {
    if (w.kind === 'scriptblock' || w.kind === 'param') continue;
    // T5 (RT2-05): el destino dinámico de cp/install/ln/tee/mv/Set-Content... pasa solo si es una variable simple.
    if (w.dyn && !/^[<>]\(/.test(w.value) && DYN_DEST_CMDS.has(name) && (!dest || w === dest) && !(MOVE_CMDS.has(name) && w !== mvDest(args))) {
      const before = out.length;
      checkWriteTarget(w, st, ctx, out);
      if (out.length > before) return;
    }
    if (dest && w !== dest && !w.dyn && !w.glob) {
      if (resolveAll(w.value, st, ctx).some((p) => isFlag(p, ctx))) { out.push(hit('protected-flag')); return; }
      continue;
    }
    if (w.dyn || w.glob) {
      // T6 (R-11): solo programas que escriben o borran, de cp/install/ln solo el destino (las fuentes se leen;
      // en mv la fuente se borra, así que cuenta), y solo si el patrón puede alcanzar el flag.
      if (dest && w !== dest) continue;
      // La lista de escritores es la de lo que no se sabe inocuo (RT2-06): un programa desconocido con un comodín que
      // alcanza el flag se niega; solo los inertes conocidos pasan.
      if (INERT.has(name) || INTERP.has(name) || SHELLS.has(name) || PWSH.has(name)) continue; // el código de un intérprete lo mira el escáner inline
      if (flagReachable(w, cwdIsPignolo(st, ctx))) { out.push(hit('protected-flag')); return; }
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
// Programas cuyo operando (o su destino) se escribe: un destino dinámico pasa solo como variable simple (T5).
const MOVE_CMDS = new Set(['mv', 'move', 'move-item', 'mi']);
const DYN_DEST_CMDS = new Set([...COPY_CMDS, 'tee', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'new-item', 'ni', 'tee-object', 'truncate', ...MOVE_CMDS]);
function mvDest(args) { const ops = operands(args); return ops.length > 1 ? ops[ops.length - 1] : null; }

function copyDest(args, name) {
  const psCopy = name === 'copy-item' || name === 'cpi' || name === 'copy';
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if (args[i].dyn) continue;
    if (/^(-t|--target-directory)$/.test(v)) return args[i + 1] || null;
    // -d / -Destination son del Copy-Item de PowerShell; en cp, install y ln `-d` / `-D` son opciones sin valor (RT2-06).
    if (psCopy && /^(-d|-de|-des|-dest|-desti|-destin|-destina|-destinat|-destinati|-destinatio|-destination)$/i.test(v)) return args[i + 1] || null;
    if (/^--target-directory=/.test(v)) return { ...args[i], value: v.slice(v.indexOf('=') + 1) };
  }
  const ops = operands(args);
  return ops.length > 1 ? ops[ops.length - 1] : null;
}

// Leer el launcher pasa solo con una lista blanca de lectores (T4, RT2-07); cualquier otro programa que lo reciba
// (un intérprete, una shell, un envoltorio que no se desarma como yarn / nvm / volta / pm2, cp, ln...) o un comodín
// que lo alcance se niega. `node --check` solo mira la sintaxis (R-18). Los lectores no ejecutan sus operandos; un
// `for`, un `test` o un `echo` tampoco.
const LAUNCHER_READERS = new Set(['cat', 'type', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'findstr', 'wc',
  'get-content', 'gc', 'select-string', 'sls', 'diff', 'cmp', 'sha1sum', 'sha256sum', 'sha512sum', 'md5sum', 'file', 'stat', 'ls', 'dir',
  'get-childitem', 'gci', 'for', 'case', 'select', 'test', '[', '[[', 'echo', 'printf', 'basename', 'dirname', 'realpath', 'readlink']);
const LAUNCHER_GIT_READS = new Set(['show', 'diff', 'log', 'blame', 'add', 'status', 'ls-files', 'cat-file', 'grep']);
const LAUNCHER_TEXT = /launcher\.js/i;
// Un comodín o una variable que puede casar con `launcher.js` en el último tramo (con algún carácter literal) y cuyo
// directorio es hooks o desconocido.
function globReachesLauncher(w) {
  if (!w.glob && !w.dyn) return false;
  const segs = String(w.value).replace(/\\/g, '/').split('/');
  const last = segs.pop().replace(/\$\{?[A-Za-z_]\w*\}?|\$\(\)|\$/g, '*');
  if (!/[*?[]/.test(last) || !/[^*?[\]]/.test(last.replace(/\[[^\]]*\]/g, ''))) return false;
  if (!globSegment(last).test('launcher.js')) return false;
  return segs.length === 0 || segs.some((x) => x === '' || x === '.' || x === '..' || x === '~' || /[$*?[]/.test(x) || /^hooks$/i.test(x) || /^[A-Za-z]:$/.test(x) || globSegment(x).test('hooks'));
}
function launcherReadOk(name, words, w) {
  const args = words.slice(1);
  if (name === 'rg' && args.some((x) => /^--pre/.test(x.value))) return false;
  if ((name === 'rg' || name === 'grep' || name === 'egrep' || name === 'fgrep') && args.some((x) => /^--(pre|exec)/.test(x.value))) return false;
  if (LAUNCHER_READERS.has(name)) return true;
  if (name === 'find') return !words.some((x) => DISCARD_FIND.has(x.value) || /^-(exec|ok)/.test(x.value));
  if (name === 'git') {
    const sub = args[0];
    return Boolean(sub) && !sub.dyn && LAUNCHER_GIT_READS.has(sub.value) && !args.some((x) => /^--(output|ext-diff|open-files-in-pager|exec)/.test(x.value));
  }
  if (name === 'sed') {
    const flags = args.filter((x) => !x.dyn && /^-[A-Za-z-]/.test(x.value));
    if (!flags.length || !flags.some((x) => /^-[A-Za-z]*n/.test(x.value) && !x.value.startsWith('--')) || flags.some((x) => /^(--in-place|-[A-Za-z]*[iesf]|--expression|--file|--script)/.test(x.value))) return false;
    const script = args.find((x) => !x.dyn && !x.value.startsWith('-'));
    return Boolean(script) && script !== w && /^(\d+|\$)?(,(\d+|\$))?p$|^\/[^/;{}]*\/p$/.test(script.value);
  }
  if (AWK.has(name)) {
    if (args.some((x) => x.dyn || /^-(f|i|e|E)|^--(file|include|source|exec|load)/.test(x.value))) return false;
    const script = args.find((x) => !x.value.startsWith('-'));
    return Boolean(script) && script !== w && !/system|getline|[|>]|close\s*\(|fflush/.test(script.value);
  }
  return false;
}
// Un lector del launcher pasa solo si su salida va a la terminal (M3): sin redirección de salida y sin tubería hacia
// algo que no sea otro lector de la lista blanca; si no, `cat launcher > copia.js` o `| tee copia.js` lo copiarían.
const LAUNCHER_TAIL_EXTRA = new Set(['cut', 'tr', 'nl', 'select-object', 'measure-object', 'out-host', 'out-string', 'format-table', 'ft', 'format-list', 'fl']);
function markPipeTails(cmds, shell) {
  cmds.forEach((c, k) => {
    const tail = [];
    if (shell === 'powershell') {
      let cur = c;
      for (let nxt = cmds.find((x) => x.prev === cur); nxt && !tail.includes(nxt); nxt = cmds.find((x) => x.prev === cur)) { tail.push(nxt); cur = nxt; }
    } else {
      for (let j = k + 1; j < cmds.length && cmds[j].pipedIn && cmds[j - 1].pipeOut; j++) tail.push(cmds[j]);
    }
    c.tail = tail;
  });
}
function launcherOutToTerminal(cmd) {
  if (!cmd) return true;
  const outputs = (r) => r.op.includes('>') && !isDescriptorDup(r) && !(!r.target.dyn && /^(\/dev\/null|nul|\$null)$/i.test(r.target.value));
  if ((cmd.lredirs || cmd.redirects || []).some(outputs)) return false;
  return (cmd.tail || []).every((t) => {
    if (!t.words.length || t.redirects.some(outputs)) return false;
    const n = progName(t.words[0].value);
    return !t.words[0].dyn && (LAUNCHER_TAIL_EXTRA.has(n) || (n !== 'for' && n !== 'case' && launcherReadOk(n, t.words, null)));
  });
}
function checkLauncher(name, words, st, ctx, out, cmd) {
  const isLauncher = (w) => {
    if (globReachesLauncher(w)) return true;
    const p = w.dyn ? null : resolveAt(w.value, st, ctx);
    return p === null ? /(^|[\\/])launcher\.js$/i.test(w.value) : LAUNCHER_RE.test(p);
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!isLauncher(w)) continue;
    if (i > 0 && launcherReadOk(name, words, w) && launcherOutToTerminal(cmd)) return;
    const statusForm = name === 'node' && words.length === 3 && w === words[1] && words[2].value === 'session-start' && !words[2].dyn;
    // node --check <launcher>: sin otra opción (un -r precargaría código) y con el launcher como último operando.
    const checkForm = (name === 'node' || name === 'nodejs') && i > 1 && i === words.length - 1 &&
      words.slice(1, i).every((x) => !x.dyn && (x.value === '--check' || x.value === '-c'));
    if (!statusForm && !checkForm) out.push(hit('pignolo-launcher'));
    return;
  }
  // H4: la línea nombra el launcher y un intérprete o una shell corre un script que no se ve (palabra dinámica,
  // `-` o stdin): `node "$(echo …/launcher.js)" toggle` apagaría la guardia.
  if (ctx.namesLauncher && (INTERP.has(name) || SHELLS.has(name) || PWSH.has(name))) {
    const args = words.slice(1);
    const script = args.find((w) => w.dyn || w.value === '-' || !w.value.startsWith('-'));
    if (!script || script.dyn || script.value === '-') out.push(hit('pignolo-launcher'));
  }
}

// Un subagente no ejecuta scripts/run.js de pignolo (end, task --test-authorization o
// start --replace apagarían el handback-gate): solo el hilo principal opera el flujo.
// Se reconoce el run.js de este plugin o uno bajo un directorio `pignolo` (copias del caché);
// el run.js de un proyecto cualquiera no. Solo cuando se ejecuta, no cuando se lee.
const PIGNOLO_RUN_JS = `${cleanPath(path.join(__dirname, '..'))}/scripts/run.js`;
const RUN_JS_RE = /(^|\/)pignolo\/(?:[^/]+\/)*scripts\/run(?:\.js)?$/;
function checkRunScript(name, words, st, ctx, out) {
  if (!ctx.subagent) return;
  const argv = words.slice(1);
  const evalFlag = argv.some((w) => !w.dyn && NODE_CODE_FLAG.test(w.value));
  if (name === 'node' || name === 'nodejs') {
    // `node --check <script>` solo mira la sintaxis: leer no se niega (G21).
    // Solo vale como opción de node (antes del script): `state-index.js --check` es del script.
    const leading = [];
    for (const w of argv) { if (w.dyn || !w.value.startsWith('-')) break; leading.push(w.value); }
    if (!evalFlag && leading.some((v) => v === '--check' || v === '-c')) return;
    if (evalFlag && argv.some((w) => namesStateScript(w.value))) { out.push(hit('pignolo-plan')); return; }
    if (evalFlag && argv.some((w) => namesInitScript(w.value))) { out.push(hit('pignolo-init')); return; }
    if (evalFlag && argv.some((w) => namesSetupScript(w.value)) && argv.some((w) => w.value === '--apply')) { out.push(hit('pignolo-init')); return; }
  }
  const executes = (w) => w === words[0] || INTERP.has(name);
  for (const w of words) {
    if (!executes(w)) continue;
    let is;
    if (w.dyn) is = /(^|[\\/])scripts[\\/]run(?:\.js)?$/i.test(w.value);
    else {
      const p = resolveAt(w.value, st, ctx);
      const c = p === null ? cleanPath(w.value) : p;
      is = c === PIGNOLO_RUN_JS || c === PIGNOLO_RUN_JS.slice(0, -3) || RUN_JS_RE.test(c);
    }
    if (is) { out.push(hit('pignolo-run')); return; }
    if (isPlanScript(w, st, ctx)) { out.push(hit('pignolo-plan')); return; }
    if (isInitScript(w, st, ctx)) { out.push(hit('pignolo-init')); return; }
    // setup.js cambia permisos solo con --apply (retired, permissions): sin él es de lectura y pasa.
    if (isSetupScript(w, st, ctx) && argv.some((a) => !a.dyn && a.value === '--apply')) { out.push(hit('pignolo-init')); return; }
  }
}

// plan.js, plan-audit.js y approved.js escriben el estado del plan; close-session.js y
// state-index.js, el de .pignolo/state/ (hito 6, Task 8): solo el hilo principal (R-14).
// Detección más estrecha que la de run.js (plan.js es un nombre común en cualquier proyecto): la
// ruta de este plugin, la caché del plugin (.claude/plugins/cache/<mercado>/pignolo/<versión>/),
// plugins/pignolo/scripts/, o una palabra que empieza con CLAUDE_PLUGIN_ROOT (también ${env:...}).
// No entran next.js, approved-verify.js, plan-check.js ni present.js.
const PLAN_SCRIPT = '(?:plan|plan-audit|approved|close-session|state-index)(?:\\.js)?';
const PLAN_JS_LITERAL = new RegExp(`(?:^|/)(?:plugins/pignolo|\\.claude/plugins/cache/[^/]+/pignolo/[^/]+)/scripts/${PLAN_SCRIPT}$`);
const PLAN_JS_DYN = new RegExp(`^\\$(?:\\{(?:env:)?CLAUDE_PLUGIN_ROOT\\}|(?:env:)?CLAUDE_PLUGIN_ROOT)[\\\\/]scripts[\\\\/]${PLAN_SCRIPT}$`, 'i');
const PLAN_JS_OWN = new RegExp(`^${cleanPath(path.join(__dirname, '..')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/scripts/${PLAN_SCRIPT}$`);
// `node -e|-p|--eval|--print|-r|--require|--import` con una palabra que nombra uno de los scripts
// de estado bajo la ruta del plugin los ejecuta al cargarlos (corren su main). Cargar la lib con
// require(...) es un límite declarado (spec §8.3): no se cubre.
const NODE_CODE_FLAG = /^(?:-e|-p|-pe|-r|--eval|--print|--require|--import)(?:=|$)/;
const OWN_PLUGIN_ROOT = cleanPath(path.join(__dirname, '..')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EVAL_STATE_SCRIPT = new RegExp(`(?:pignolo/(?:[^/]+/)*|CLAUDE_PLUGIN_ROOT\\}?/|${OWN_PLUGIN_ROOT}/)scripts/(?:run|holdout|${PLAN_SCRIPT})(?![\\w-])`, 'i');
const namesStateScript = (value) => EVAL_STATE_SCRIPT.test(value.replace(/\\+/g, '/').replace(/\/+/g, '/'));
function isPlanScript(w, st, ctx) {
  if (w.dyn) return PLAN_JS_DYN.test(w.value);
  const p = resolveAt(w.value, st, ctx);
  const c = p === null ? cleanPath(w.value) : p;
  return PLAN_JS_LITERAL.test(c) || PLAN_JS_OWN.test(c);
}

// init.js y places.js (/pignolo:init) escriben project.md, .git/config y .claude/settings.local.json: solo el hilo
// principal y con el sí del humano. Misma detección anclada al plugin que isPlanScript (el
// scripts/init.js de un proyecto cualquiera pasa) y solo cuando se EJECUTA: checkRunScript mira
// el argv del intérprete, así que `cat`, `grep` o `Get-Content` sobre el script no lo casan.
const INIT_JS_LITERAL = /(?:^|\/)(?:plugins\/pignolo|\.claude\/plugins\/cache\/[^/]+\/pignolo\/[^/]+)\/scripts\/(?:init|places)(?:\.js)?$/;
const INIT_JS_DYN = /^\$(?:\{(?:env:)?CLAUDE_PLUGIN_ROOT\}|(?:env:)?CLAUDE_PLUGIN_ROOT)[\\/]scripts[\\/](?:init|places)(?:\.js)?$/i;
const INIT_JS_OWN = new RegExp(`^${cleanPath(path.join(__dirname, '..')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/scripts/(?:init|places)(?:\\.js)?$`);
// init.js cargado con `node -e|-p|-r` también corre su main (la lib init-actions es un límite declarado, §8.3).
const EVAL_INIT_SCRIPT = new RegExp(`(?:pignolo/(?:[^/]+/)*|CLAUDE_PLUGIN_ROOT\\}?/|${OWN_PLUGIN_ROOT}/)scripts/(?:init|places)(?![\\w-])`, 'i');
const namesInitScript = (value) => EVAL_INIT_SCRIPT.test(value.replace(/\\+/g, '/').replace(/\/+/g, '/'));
function isInitScript(w, st, ctx) {
  if (w.dyn) return INIT_JS_DYN.test(w.value);
  const hits = (c) => INIT_JS_LITERAL.test(c) || INIT_JS_OWN.test(c);
  const p = resolveAt(w.value, st, ctx);
  if (p !== null) return hits(p);
  // Directorio desconocido (un cd tras ';' o un salto de línea pudo correr o no): vale cualquier candidato conocido (I-3).
  if (resolveAll(w.value, st, ctx).some(hits)) return true;
  // Sin candidatos (cd dinámico): la forma pelada que ejecuta el script de un cd a scripts/ se niega.
  return !st.alts && /^(?:\.[\/])?(?:init|places)(?:\.js)?$/.test(w.value);
}

// setup.js con --apply (retired, permissions) cambia settings.json: mismo freno que init.js, solo para esas formas.
const SETUP_JS_LITERAL = /(?:^|\/)(?:plugins\/pignolo|\.claude\/plugins\/cache\/[^/]+\/pignolo\/[^/]+)\/scripts\/setup(?:\.js)?$/;
const SETUP_JS_DYN = /^\$(?:\{(?:env:)?CLAUDE_PLUGIN_ROOT\}|(?:env:)?CLAUDE_PLUGIN_ROOT)[\\/]scripts[\\/]setup(?:\.js)?$/i;
const SETUP_JS_OWN = new RegExp(`^${cleanPath(path.join(__dirname, '..')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/scripts/setup(?:\\.js)?$`);
const EVAL_SETUP_SCRIPT = new RegExp(`(?:pignolo/(?:[^/]+/)*|CLAUDE_PLUGIN_ROOT\\}?/|${OWN_PLUGIN_ROOT}/)scripts/setup(?![\\w-])`, 'i');
const namesSetupScript = (value) => EVAL_SETUP_SCRIPT.test(value.replace(/\\+/g, '/').replace(/\/+/g, '/'));
function isSetupScript(w, st, ctx) {
  if (w.dyn) return SETUP_JS_DYN.test(w.value);
  const hits = (c) => SETUP_JS_LITERAL.test(c) || SETUP_JS_OWN.test(c);
  const p = resolveAt(w.value, st, ctx);
  if (p !== null) return hits(p);
  if (resolveAll(w.value, st, ctx).some(hits)) return true;
  return !st.alts && /^(?:\.[\/])?setup(?:\.js)?$/.test(w.value);
}

// El holdout (scripts/holdout.js) lo ejecutan solo el hilo principal y el validator: el
// implementer no ve los tests de aceptación. Misma detección que checkRunScript.
const PIGNOLO_HOLDOUT_JS = `${cleanPath(path.join(__dirname, '..'))}/scripts/holdout.js`;
const HOLDOUT_JS_RE = /(^|\/)pignolo\/(?:[^/]+\/)*scripts\/holdout(?:\.js)?$/;
function checkHoldoutScript(name, words, st, ctx, out) {
  if (!ctx.subagent || ctx.agentType === 'pignolo:validator') return;
  const executes = (w) => w === words[0] || INTERP.has(name);
  for (const w of words) {
    if (!executes(w)) continue;
    let is;
    if (w.dyn) is = /(^|[\\/])scripts[\\/]holdout(?:\.js)?$/i.test(w.value);
    else {
      const p = resolveAt(w.value, st, ctx);
      const c = p === null ? cleanPath(w.value) : p;
      is = c === PIGNOLO_HOLDOUT_JS || c === PIGNOLO_HOLDOUT_JS.slice(0, -3) || HOLDOUT_JS_RE.test(c);
    }
    if (is) { out.push(hit('pignolo-holdout')); return; }
  }
}

// La cola (scripts/queue.js), las worktrees de tarea (scripts/worktree.js) y la limpieza (scripts/cleanup.js) de pignolo
// (hito 7a, R-13, R-21). Detección ESTRUCTURAL: solo cuando se EJECUTA (el argv del intérprete o el programa mismo), nunca
// un grep del texto del comando: un `cat`, `grep`, `head`, `sed -n`, `Get-Content` o `Select-String` sobre el script, o un
// `git show HEAD:plugins/pignolo/scripts/queue.js`, pasan. Anclada a la ruta del plugin (como pignolo-plan): el
// scripts/cleanup.js de un proyecto cualquiera, corrido con una variable, no es el de pignolo.
const TOOL_NAMES = '(queue|worktree|cleanup)(?:\\.js)?';
const TOOL_JS_LITERAL = new RegExp(`(?:^|/)(?:plugins/pignolo|\\.claude/plugins/cache/[^/]+/pignolo/[^/]+)/scripts/${TOOL_NAMES}$`);
const TOOL_JS_DYN = new RegExp(`^\\$(?:\\{(?:env:)?CLAUDE_PLUGIN_ROOT\\}|(?:env:)?CLAUDE_PLUGIN_ROOT)[\\\\/]scripts[\\\\/]${TOOL_NAMES}$`, 'i');
const TOOL_JS_OWN = new RegExp(`^${cleanPath(path.join(__dirname, '..')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/scripts/${TOOL_NAMES}$`);
// `node -e|-p|--eval|--print` con el script bajo la ruta del plugin dentro del código: lo carga y corre su main.
const EVAL_TOOL_SCRIPT = new RegExp(`(?:pignolo/(?:[^/]+/)*|CLAUDE_PLUGIN_ROOT\\}?/|${cleanPath(path.join(__dirname, '..')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/)(?:scripts/(queue|worktree|cleanup)|lib/(queue|branch-cleanup|worktrees))(?![\\w-])`, 'i');
const EVAL_LIB_TOOL = { queue: 'queue', 'branch-cleanup': 'cleanup', worktrees: 'worktree' };
// Subcomandos de solo lectura de cada script: los puede correr cualquier subagente.
const TOOL_READ = { queue: 'status', worktree: 'list', cleanup: 'report' };

function toolOf(w, st, ctx) {
  if (w.dyn) { const m = TOOL_JS_DYN.exec(w.value); return m ? m[1].toLowerCase() : null; }
  const p = resolveAt(w.value, st, ctx);
  const c = p === null ? cleanPath(w.value) : p;
  const m = TOOL_JS_LITERAL.exec(c) || TOOL_JS_OWN.exec(c);
  return m ? m[1].toLowerCase() : null;
}

// El primer operando posicional tras el script, saltando `--cwd <valor>` (A7-21). Solo cuenta un literal; uno dinámico,
// ausente, desconocido o con `--cwd` mal formado se niega (nunca se lee como `list`).
function subcommandAfter(words, idx) {
  for (let j = idx + 1; j < words.length; j++) {
    const x = words[j];
    if (x.dyn) return { kind: 'dynamic' };
    if (x.value === '--cwd') {
      const nx = words[j + 1];
      if (!nx || nx.dyn || nx.value.startsWith('-')) return { kind: 'bad' };
      j++;
      continue;
    }
    if (x.value.startsWith('--cwd=')) { if (x.value.length === 6) return { kind: 'bad' }; continue; }
    if (x.value.startsWith('-')) return { kind: 'bad' };
    return { kind: 'literal', value: x.value };
  }
  return { kind: 'none' };
}

function checkToolScripts(name, words, st, ctx, out) {
  if (!ctx.subagent) return;
  const deny = (tool) => { out.push(hit(tool === 'queue' ? 'pignolo-queue' : 'pignolo-worktree-tools')); };
  const argv = words.slice(1);
  // Los candidatos a script: el programa mismo o, de un intérprete, su primer operando y lo que precarga.
  const cands = [];
  if (!INTERP.has(name)) cands.push(0);
  else {
    const evalFlag = argv.some((w) => !w.dyn && NODE_CODE_FLAG.test(w.value));
    const leading = [];
    for (const w of argv) { if (w.dyn || !w.value.startsWith('-')) break; leading.push(w.value); }
    // `node --check <script>` solo mira la sintaxis: leer no se niega.
    if ((name === 'node' || name === 'nodejs') && !evalFlag && leading.some((v) => v === '--check' || v === '-c')) return;
    if (evalFlag) {
      for (const w of argv) { const m = EVAL_TOOL_SCRIPT.exec(w.value.replace(/\\+/g, '/').replace(/\/+/g, '/')); if (m) { deny(m[1] ? m[1].toLowerCase() : EVAL_LIB_TOOL[m[2].toLowerCase()]); return; } }
    }
    // Cualquier operando del intérprete que sea la ruta de una herramienta (como el holdout): una opción de node con valor
    // propio (`--title x`) no oculta el script (I3).
    for (let i = 1; i < words.length; i++) cands.push(i);
  }
  for (const i of cands) {
    const w = words[i];
    const tool = toolOf(w, st, ctx);
    if (!tool) continue;
    const sub = subcommandAfter(words, i);
    if (sub.kind === 'literal' && sub.value === TOOL_READ[tool]) return; // lectura: pasa
    if (tool === 'queue' && ctx.agentType === 'pignolo:integrator') return; // el integrator opera la cola
    deny(tool);
    return;
  }
}

// int/*, queue/*, cp/* y contract/* solo las escriben la cola y el hilo principal (R-13, A7-20): a un subagente se le niega
// escribirlas con git plano. Las lecturas (log, show, tag -l, branch --list) pasan.
const PROT_BRANCH = /^(?:refs\/heads\/)?(?:int|queue)\/./;
const PROT_TAG = /^(?:refs\/tags\/)?(?:cp|contract)\/./;
const PROT_FULL = /^refs\/(?:heads\/(?:int|queue)|tags\/(?:cp|contract))\/./;
// Solo estas opciones ponen a git en modo lista (los operandos son patrones): -v, -a, -r, --sort y --format NO (I1).
const BRANCH_READ_SHORTS = ['l'];
const BRANCH_READ_LONGS = ['list', 'show-current', 'merged', 'no-merged', 'contains', 'no-contains', 'points-at'];
const TAG_READ_SHORTS = ['l', 'n', 'v'];
const TAG_READ_LONGS = ['list', 'verify', 'contains', 'no-contains', 'points-at', 'merged', 'no-merged'];
const HEAD_VERBS = new Set(['merge', 'reset', 'rebase', 'cherry-pick', 'commit', 'pull', 'revert', 'am']);

// Rama de HEAD de un directorio, leyendo el disco (sin git): sube hasta `.git` (carpeta o archivo `gitdir:`).
function headBranchOf(dir) {
  try {
    let d = path.resolve(dir);
    // Un directorio que todavía no existe (`git worktree add w main && cd w`) no es el repo de más arriba: ilegible (R5).
    if (!fs.statSync(d).isDirectory()) return null;
    for (let i = 0; i < 64; i++) {
      const dot = path.join(d, '.git');
      let s = null;
      try { s = fs.statSync(dot); } catch (_) { s = null; }
      if (s) {
        let gitDir = dot;
        if (s.isFile()) {
          const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dot, 'utf8'));
          if (!m) return null;
          gitDir = path.resolve(d, m[1].trim());
        }
        const r = /^ref:\s*refs\/heads\/(.+)$/m.exec(fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8'));
        return r ? r[1].trim() : null;
      }
      const up = path.dirname(d);
      if (up === d) return null;
      d = up;
    }
  } catch (_) { return null; }
  return null;
}

const refspecWrites = (v) => {
  const s = v.replace(/^\+/, '');
  const i = s.indexOf(':');
  if (i < 0) return false;
  const dst = s.slice(i + 1);
  return PROT_BRANCH.test(dst) || PROT_TAG.test(dst) || PROT_FULL.test(dst);
};

// Directorios donde se evalúa la rama de HEAD: el cwd real, o el de `-C <dir>` resuelto contra él. null: con -C /
// --git-dir / --work-tree no se pudo resolver (variable, sin cwd conocido): un verbo que depende de HEAD se niega.
function headDirs(st, redir) {
  const base = st.sureReal || realDirs(st);
  if (!redir) return base;
  if (redir.unresolved) return null;
  let dirs = base;
  for (const d of redir.dirs) {
    if (path.isAbsolute(d)) dirs = [path.resolve(d)];
    else if (dirs.length) dirs = dirs.map((x) => path.resolve(x, d));
    else return null;
  }
  return dirs;
}

function protectsRefs(sub, o, st, redir) {
  const pos = o.positionals.map((w) => w.value);
  const hasShort = (list) => list.some((c) => o.shorts.has(c));
  const hasLong = (list) => list.some((n) => o.longs.includes(n));
  if (HEAD_VERBS.has(sub)) {
    const dirs = headDirs(st, redir);
    if (dirs === null) return true;
    if (sub === 'pull' && pos.slice(1).some(refspecWrites)) return true;
    if (sub === 'rebase' && PROT_BRANCH.test(pos[1] || '')) return true; // git rebase <upstream> <rama>: la saca y la reescribe
    return dirs.some((d) => /^(?:int|queue)\//.test(headBranchOf(d) || ''));
  }
  switch (sub) {
    case 'switch':
    case 'checkout': {
      // Con flag de crear, el operando es el punto de partida: solo cuenta el nombre creado.
      const creates = hasShort(['c', 'C', 'b', 'B']) || hasLong(['create', 'force-create', 'orphan']);
      return (creates ? o.vals : [...(pos.length ? [pos[0]] : []), ...o.vals]).some((x) => PROT_BRANCH.test(x));
    }
    case 'worktree': {
      if (pos[0] !== 'add') return false;
      if (o.vals.some((x) => PROT_BRANCH.test(x))) return true; // -b/-B <rama>
      return !hasShort(['b', 'B']) && !hasLong(['detach', 'orphan']) && PROT_BRANCH.test(pos[2] || '');
    }
    case 'symbolic-ref':
      return PROT_FULL.test(pos[0] || '') || (pos[0] === 'HEAD' && PROT_FULL.test(pos[1] || ''));
    case 'tag':
      if (hasShort(TAG_READ_SHORTS) || hasLong(TAG_READ_LONGS)) return false;
      return pos.some((x) => PROT_TAG.test(x));
    case 'branch': {
      if (hasShort(BRANCH_READ_SHORTS) || hasLong(BRANCH_READ_LONGS)) return false;
      const names = hasShort(['d', 'D', 'm', 'M', 'c', 'C']) || hasLong(['delete', 'move', 'copy']) ? pos : pos.slice(0, 1);
      return names.some((x) => PROT_BRANCH.test(x));
    }
    case 'update-ref':
      return pos.length > 0 && PROT_FULL.test(pos[0]);
    case 'push':
      // push --delete / -d: los operandos tras el remoto son nombres a borrar, no refspecs.
      if (hasShort(['d']) || hasLong(['delete'])) return pos.slice(1).some((x) => PROT_BRANCH.test(x) || PROT_TAG.test(x) || PROT_FULL.test(x));
      return pos.slice(1).some(refspecWrites);
    case 'fetch':
      return pos.slice(1).some(refspecWrites);
    default:
      return false;
  }
}

// `claude plugin disable|uninstall|remove pignolo` (y `plugin marketplace remove pignolo`)
// apaga pignolo en las sesiones siguientes: es cosa del humano, como el interruptor (M8).
function claudePluginOff(args) {
  const pos = args.filter((w) => w.dyn || !w.value.startsWith('-'));
  if (!pos[0] || pos[0].dyn || !/^plugins?$/.test(pos[0].value)) return false;
  let k = 1;
  if (pos[k] && !pos[k].dyn && pos[k].value === 'marketplace') k++;
  if (!pos[k] || pos[k].dyn || !/^(disable|uninstall|remove|rm)$/.test(pos[k].value)) return false;
  return pos.slice(k + 1).some((w) => w.dyn || /^pignolo(@|$)/i.test(w.value));
}

// Directorios posibles después de pasar a `t` desde los de `before` (null: no se sabe).
function dirsAfter(t, before, ctx) {
  const home = /^~([\\/]|$)/.test(t.value);
  const abs = resolveAt(t.value, { cwd: null }, ctx) !== null;
  const from = before || (abs ? [{ cwd: '/', real: null }] : null);
  return from && merge(from.map((c) => ({ cwd: resolveClean(t.value, c.cwd || '/', ctx.locs.home),
    real: c.real && !home ? path.resolve(c.real, t.value) : null })), []);
}

// Copia del estado con otro directorio, para un solo comando que corre en él sin mover el de la shell: `env -C <dir>`,
// `env --chdir=<dir>`, `Start-Process -WorkingDirectory <dir>` (R5). Un directorio dinámico o ausente queda desconocido.
function stateIn(st, ctx, dir) {
  const f = forkState(st);
  f.moved = true;
  const lost = !dir || dir.dyn || dir.glob || dir.value === '-' || dir.value === '';
  setPossible(f, lost ? null : dirsAfter(dir, possible(st), ctx));
  return f;
}

// Texto de shell con un cd (o pushd/popd/chdir) como comando: corrido en la shell actual, mueve el directorio.
const SHELL_CD = /(^|[\s;&|(){}`])(cd|pushd|popd|chdir)([\s;&|)}]|$)/;

// Código que corre en la shell actual y no se puede seguir: el directorio queda desconocido (RT1-02).
function dirLost(st) {
  st.moved = true;
  if (st.pending) st.pending.sure = false;
  setPossible(st, null);
}

function changeDir(name, args, st, ctx, negated, cmd) {
  st.moved = true; // gitCommands: un comando git posterior corre en otro directorio
  const t = args.find((w) => w.kind !== 'param' && !(w.value.startsWith('-') && w.value.length > 1));
  const before = possible(st);
  // Un `cd` a una carpeta literal que existe no falla (cd-chain): se mira antes de moverlo, contra el directorio real de ahora.
  const prior = st.pending;
  // Solo es seguro un cd con un único operando literal, sin opciones ni redirecciones: con un argumento de más, una opción
  // inválida o una redirección que no abre, el cd falla aunque la carpeta exista (RT1-01).
  const plain = args.length === 1 && args[0] === t && Boolean(cmd) && Array.isArray(cmd.redirects) && cmd.redirects.length === 0;
  const sure = plain && !negated && name !== 'popd' && name !== 'pop-location' && Boolean(t) && !t.dyn && !t.glob && t.value !== '-' && !/^~/.test(t.value)
    && st.cwd !== null && Boolean(st.cwdReal) && ctx.statPath(t.value, st) === 'dir' && (!prior || Boolean(prior.sure));
  let next;
  if (name === 'popd' || name === 'pop-location' || (t && (t.dyn || t.glob || t.value === '-'))) next = null;
  else if (!t) next = [{ cwd: ctx.locs.home, real: null }];
  else next = dirsAfter(t, before, ctx);
  // Hasta el próximo `;`, el directorio de antes sigue siendo posible (el cd pudo fallar).
  st.pending = { list: st.pending ? merge(st.pending.list, before) : before, sure: false };
  // `! cd x`: con `&&`, lo que sigue corre justo cuando el cd falló (M7). Queda desconocido.
  setPossible(st, negated ? merge(before, next) : next);
  if (sure && next && next.length === 1 && next[0].real) st.pending.sure = [next[0].real];
}

// ------------------------------------------------------------ git

function analyzeGit(name, words, cmd, st, ctx, out) {
  let i = 1;
  let sub;
  // GIT_DIR / GIT_WORK_TREE puestas en este comando (cmd.gitRedirect) o antes en la línea (st.gitEnv): git trabaja en otro repo.
  const envRedirect = Boolean(cmd.gitRedirect || st.gitEnv);
  let redirected = envRedirect;
  // Los -C literales (en orden) y si algún directorio no se puede resolver: lo usa la regla de refs protegidas (I1).
  const redir = { dirs: [], unresolved: envRedirect };
  const lost = () => { if (ctx.collect) ctx.collect.push({ sub: null, incomplete: true }); };
  const cfg = [];
  let cfgUnknown = false;
  const done = () => { if (cfgUnknown) out.push(hit('git-config-unknown')); };
  if (name !== 'git') {
    sub = name.slice(4); // forma con guion: git-stash
  } else {
    for (; i < words.length; i++) {
      const w = words[i];
      const v = w.value;
      // El directorio de -C / --git-dir / --work-tree puede ser dinámico: solo se permiten lecturas.
      if (!w.dyn && (v === '-C' || v === '--git-dir' || v === '--work-tree')) {
        redirected = true;
        const nx = words[i + 1];
        if (v === '-C' && nx && !nx.dyn) redir.dirs.push(nx.value); else redir.unresolved = true;
        i++;
        continue;
      }
      const dirOpt = /^(-C|--git-dir=|--work-tree=)/.exec(v);
      if (dirOpt && (!w.dyn || w.dynAt >= dirOpt[0].length)) { redirected = true; redir.unresolved = true; continue; }
      if (w.dyn) { lost(); out.push(hit('dynamic-argument')); return; }
      if (!v.startsWith('-') || v === '-') break;
      if (v === '-c' || v === '--config-env') {
        const nx = words[i + 1];
        if (!nx) { lost(); out.push(hit('git-unknown-option')); return; }
        if (nx.dyn) { lost(); out.push(hit('git-config-override')); return; }
        cfg.push(nx.value);
        i++;
        continue;
      }
      if (v.startsWith('-c')) { cfg.push(v.slice(2)); continue; }
      if (v.startsWith('--config-env=')) { cfg.push(v.slice('--config-env='.length)); continue; }
      const eq = v.indexOf('=');
      const opt = eq < 0 ? v : v.slice(0, eq);
      if (GIT_GLOBAL_VALUE.has(opt)) {
        if (eq < 0) { if (!words[i + 1]) { lost(); out.push(hit('git-unknown-option')); return; } i++; }
        continue;
      }
      if (GIT_GLOBAL_FLAGS.has(opt)) continue;
      lost();
      out.push(hit('git-unknown-option'));
      return;
    }
    const keys = cfg.map((kv) => kv.split('=')[0].trim().toLowerCase());
    if (keys.some((k) => PROTECTED_CONFIG.test(k))) { out.push(hit('git-config-override')); return; }
    // Después de las reglas del subcomando: si una más específica niega, esa se informa.
    if (keys.some((k) => !CONFIG_ALLOW.test(k) && !OVERRIDE_ALLOW.test(k))) cfgUnknown = true;
    if (i >= words.length) { done(); return; }
    if (words[i].dyn) { lost(); out.push(hit('dynamic-argument')); done(); return; }
    sub = words[i].value;
  }
  if (!GIT_BUILTINS.has(sub)) { lost(); out.push(hit('unknown-git-subcommand')); done(); return; }
  if (sub === 'stage') sub = 'add'; // git stage es un sinónimo de git add: mismas reglas
  const args = words.slice(name === 'git' ? i + 1 : 1); // la forma con guion (git-push) no tiene subcomando entre los operandos
  const o = parseOpts(args, SPECS[sub]);
  if (ctx.collect) {
    ctx.collect.push({
      sub, args: args.map((w) => w.value), positionals: o.positionals.map((w) => w.value),
      shorts: [...o.shorts], longs: [...o.longs],
      onMain: Boolean(st.onMain), cwdChanged: Boolean(st.moved || redirected),
      dirs: redir.dirs.slice(), dirsUnknown: redir.unresolved, // los -C literales (en orden) y si hay otro directorio que no se pudo resolver
    });
  }
  // Con -C / --git-dir / --work-tree todo se evalúa con sus reglas; lo que depende
  // del estado del otro directorio no se puede ver: `checkout <x>` (¿archivo o rama?) se niega.
  if (redirected) {
    if (sub === 'checkout' && o.positionals.length && !o.shorts.has('b') && !o.shorts.has('B')) out.push(hit('git-C'));
  }
  const inner = redirected ? { ...st, cwdReal: null, alts: null } : st;
  if (DISCARD_GIT.has(sub) && !(sub === 'stash' && args[0] && ['list', 'show', 'create'].includes(args[0].value))) markDiscard(ctx, inner);
  // Programas que git ejecuta por opción (G7): --upload-pack, --receive-pack, --exec, clone/ls-remote -u.
  if (longIs(o, 'upload-pack') || longIs(o, 'receive-pack') || (['push', 'archive', 'send-pack'].includes(sub) && longIs(o, 'exec'))
    || (['clone', 'ls-remote'].includes(sub) && o.shorts.has('u'))) out.push(hit('git-shell'));
  for (const r of gitRules(sub, o, args, ctx, inner, st, redirected ? redir : null, cfg)) out.push(hit(r));
  // Con un candado de sabotaje en el worktree (§11.6), commit y add guardarían el código
  // saboteado. Un existsSync por directorio: sin git, dentro del plazo de 3 s.
  if ((sub === 'commit' || sub === 'add') && realDirs(st).some((d) => lockedAt(d))) out.push(hit('sabotage-lock'));
  // git apply --directory=<dir> escribe los archivos del parche debajo de <dir> (M3).
  if (sub === 'apply') {
    args.forEach((w, k) => {
      if (w.value === '--directory' && !w.dyn && args[k + 1]) writeOperand(args[k + 1], inner, ctx, out);
      else if (w.value.startsWith('--directory=')) writeOperand(assignedValue(w, 12), inner, ctx, out);
    });
  }
  if (o.dynSlot && DESTRUCTIVE.has(sub)) out.push(hit('dynamic-argument'));
  done();
}

// Un subagente no tiene razón para forzar lo ignorado (D7): add -f/--force y update-index --add/--cacheinfo. -n/--dry-run no agrega nada.
function forcesIgnored(sub, o) {
  if (sub === 'update-index') return longIs(o, 'add') || longIs(o, 'cacheinfo');
  if (sub !== 'add') return false;
  if (o.shorts.has('n') || longIs(o, 'dry-run')) return false;
  return o.shorts.has('f') || longIs(o, 'force');
}

function gitRules(sub, o, args, ctx, st, realSt, redir, cfg = []) {
  const base = gitRulesBase(sub, o, args, ctx, st);
  if (!ctx.subagent) return base;
  const extra = [];
  if (protectsRefs(sub, o, realSt || st, redir)) extra.push('pignolo-protected-refs');
  if (touchesMain(sub, o, realSt || st, redir, cfg)) extra.push('subagent-main');
  if (forcesIgnored(sub, o)) extra.push('add-force');
  return extra.length ? [...base, ...extra] : base;
}

// Solo el hilo principal hace push y merge sobre main/master (decisión del autor, 2026-10-02). Solo se llama para un
// subagente y falla cerrado: una rama de HEAD ilegible (HEAD suelto, sin repo, -C sin resolver) cuenta como main.
const MAIN_REF = /^(?:refs\/heads\/|heads\/)?(?:main|master)$/i;
function headOnMain(st, redir) {
  if (st.onMain) return true;
  const dirs = headDirs(st, redir);
  if (dirs === null || !dirs.length) return true;
  return dirs.some((d) => { const b = headBranchOf(d); return b === null || MAIN_REF.test(b); });
}

// Fuera de todo repo (el directorio existe y ningún `.git` lo cubre) un verbo de HEAD solo da error de git: no mueve main. Un
// directorio que no existe o que no se lee sigue contando como main (cerrado).
function outsideRepo(dir) {
  try {
    let d = path.resolve(dir);
    if (!fs.statSync(d).isDirectory()) return false;
    for (let i = 0; i < 64; i++) {
      try { fs.statSync(path.join(d, '.git')); return false; } catch (_) { /* sigue hacia arriba */ }
      const up = path.dirname(d);
      if (up === d) return true;
      d = up;
    }
  } catch (_) { return false; }
  return false;
}
// Como headOnMain para pull/rebase/cherry-pick/reset: sin repo en ninguno de los directorios no hay rama que mover.
function headVerbOnMain(st, redir) {
  if (st.onMain) return true;
  const dirs = headDirs(st, redir);
  if (dirs === null || !dirs.length) return true;
  return dirs.some((d) => { const b = headBranchOf(d); return b === null ? !outsideRepo(d) : MAIN_REF.test(b); });
}

// `push.default` distinto de simple/current hace que un push sin refspec lleve más que la rama actual (matching: todas las
// que coinciden; upstream: la rama que HEAD siga, que puede ser main) (R4). Sin `=` o con valor que no se lee: no verificable.
const SAFE_PUSH_DEFAULT = /^(simple|current)$/i;
function unsafePushDefault(kv) {
  const eq = kv.indexOf('=');
  if (kv.slice(0, eq < 0 ? undefined : eq).trim().toLowerCase() !== 'push.default') return false;
  return eq < 0 || !SAFE_PUSH_DEFAULT.test(kv.slice(eq + 1).trim());
}

// `git config push.default <valor no seguro>`: lo deja escrito para un `git push` posterior (también de otra llamada).
function setsUnsafePushDefault(o) {
  const pos = o.positionals;
  const k = pos.findIndex((w) => !w.dyn && w.value.toLowerCase() === 'push.default');
  return k >= 0 && Boolean(pos[k + 1]) && (pos[k + 1].dyn || !SAFE_PUSH_DEFAULT.test(pos[k + 1].value));
}

// Verbos que mueven la rama de HEAD como un merge (R6): con HEAD en main (o ilegible) un subagente no los corre.
// `commit`, `revert` y `am` quedan fuera a propósito (decisión pendiente del autor, G62).
const MERGE_LIKE = new Set(['pull', 'rebase', 'cherry-pick', 'reset']);
// Un refspec `src:main` (sin `+`: con `+` ya pide confirmación `ref-move`/`fetch-force-head`) que escribe main local.
const refspecToMain = (v) => {
  if (v.startsWith('+')) return false;
  const i = v.indexOf(':');
  // Un comodín en el destino puede alcanzar main (`refs/heads/*:refs/heads/*`, `x:ma*`).
  return i >= 0 && (MAIN_REF.test(v.slice(i + 1)) || /[*?[]/.test(v.slice(i + 1)));
};
function touchesMainRef(sub, o, st, redir) {
  const pos = o.positionals;
  if (sub === 'fetch' || sub === 'pull') {
    // pos[0] es el remoto; el resto, refspecs. Uno dinámico en fetch no se puede leer: cerrado.
    const specs = longIs(o, 'repo') ? pos : pos.slice(1);
    if (sub === 'fetch' && specs.some((w) => w.dyn)) return true;
    if (specs.some((w) => refspecToMain(w.value))) return true;
    return sub === 'pull' && headVerbOnMain(st, redir);
  }
  if (sub === 'worktree') return Boolean(pos[0] && pos[0].value === 'add' && o.shorts.has('B') && (o.vals.some((x) => MAIN_REF.test(x)) || pos.some((w) => w.dyn)));
  if (sub === 'rebase') {
    // `rebase <upstream> main`: saca main y lo reescribe aunque HEAD esté en otra rama.
    if (pos[1] && (pos[1].dyn || MAIN_REF.test(pos[1].value))) return true;
    return headVerbOnMain(st, redir);
  }
  if (sub === 'reset') {
    if (longIs(o, 'hard') || longIs(o, 'merge')) return false; // ya tiene su regla (reset-hard)
    // Sin operando, solo `HEAD` o con `--` (rutas) no mueve la rama.
    const revs = pos.filter((w) => w.dyn || w.value.toUpperCase() !== 'HEAD');
    if (o.dd || !revs.length) return false;
    return headVerbOnMain(st, redir);
  }
  return headVerbOnMain(st, redir); // cherry-pick
}

function touchesMain(sub, o, st, redir, cfg) {
  if (sub === 'merge') return headOnMain(st, redir);
  if (MERGE_LIKE.has(sub) || sub === 'fetch' || sub === 'worktree') return touchesMainRef(sub, o, st, redir);
  if (sub === 'config') return setsUnsafePushDefault(o);
  if (sub !== 'push') return false;
  if (cfg.some(unsafePushDefault)) return true;
  const pos = o.positionals;
  if (pos.some((w) => w.dyn)) return true;
  // --branches empuja todas las ramas locales, como --all (R4).
  if (longIs(o, 'all') || longIs(o, 'branches')) return true;
  // Con --repo=<remoto> el primer operando ya es un refspec.
  const specs = (longIs(o, 'repo') ? pos : pos.slice(1)).map((w) => w.value.replace(/^\+/, ''));
  if (!specs.length) return longIs(o, 'tags') ? false : headOnMain(st, redir);
  return specs.some((x) => {
    // Un comodín puede alcanzar main (`refs/heads/*`, `m*:m*`).
    if (/[*?[]/.test(x)) return true;
    const dst = x.includes(':') ? x.slice(x.indexOf(':') + 1) : x;
    if (dst === '') return true; // `:` empuja las ramas que coinciden
    if (dst === 'HEAD' || dst === '@') return x === 'HEAD' || x === '@' ? headOnMain(st, redir) : false;
    return MAIN_REF.test(dst);
  });
}

// Qué sabe la guardia de HEAD después de un `checkout`/`switch` a `name` (R5, R7). main (o la rama anterior, `-` y `@{-N}`,
// que puede ser main) deja HEAD en main para lo que sigue. Una rama literal que no es main lo saca de main solo si lo que
// sigue corre únicamente cuando el cambio anduvo (`&&`): `script` lee `offNext` y baja `onMain` entonces.
function switchedTo(st, name) {
  if (MAIN_REF.test(name) || name === '-' || /^@\{-\d+\}$/.test(name)) st.onMain = true;
  // Solo un nombre simple (rama, etiqueta o commit) es un cambio real. HEAD, @, `main~0`, `@{0}`, `^` y todo lo que no se sabe
  // interpretar pueden dejar HEAD donde estaba: se sigue considerando main (RR1).
  else if (/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(name) && !/^(?:head|fetch_head|orig_head|merge_head)$/i.test(name) && !name.includes('..')) st.offNext = true;
  else st.onMain = true;
}

function gitRulesBase(sub, o, args, ctx, st) {
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
        if (ctx.statPath(p.value, st)) return ['checkout-path'];
        if (!has('b') && !has('B') && !long('orphan')) switchedTo(st, p.value);
      }
      if (has('B')) r.push('ref-move');
      return r;
    }
    case 'switch':
      if (has('f') || long('force') || long('discard-changes')) return ['switch-force'];
      if (pos.length && !has('c') && !has('C') && !long('create') && !long('force-create') && !long('orphan')) switchedTo(st, pos[0].value);
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
      return r;
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
      return r;
    case 'remote':
      // `remote add --mirror[=push]` escribe remote.<n>.mirror=true (lo mismo que `git config remote.x.mirror true`, que se
      // niega): el `git push <n>` siguiente es un push --mirror. Solo `--mirror=fetch` es inofensivo (R2).
      if (pos.length && pos[0].value === 'add' && long('mirror') && !(o.vals.includes('fetch') && !o.vals.includes('push'))) return ['push-force'];
      return r;
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
  if (expr.some((w) => DISCARD_FIND.has(w.value))) markDiscard(ctx, st);
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
      if (inner.length) runWords(inner, { ...cmd, lredirs: cmd.lredirs || cmd.redirects, redirects: [], pipedIn: false, stdinBody: undefined, noCd: true }, 'bash', ctx, out, depth + 1, st);
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
  const lang = langOf(name);
  return (text) => {
    if (inlineCallsGit(text, lang, LAUNCHER_TEXT).deny) out.push(hit('inline-code')); // T7 (R-9): uso de procesos fuera de literales y git nombrado
    if (st && ctx) inlineDeletes(text, st, ctx, out);
  };
}

// APIs de borrado o movimiento en código inline (I1): fs.rmSync, shutil.rmtree, os.remove,
// Path(...).unlink, FileUtils.rm_rf, unlink de perl/php, Deno.remove, Remove-Item...
// rm/rmdir/unlink/rename cuentan como método de cualquier receptor (`require('fs/promises').rm`,
// `f.rm` tras `import()`) y `rm(` suelto (desestructurado de fs).
const DELETE_API = new RegExp([
  String.raw`\b(rmSync|rmdirSync|unlinkSync|renameSync|removeSync|moveSync|emptyDirSync|rmtree|rimraf|remove_tree|removedirs)\b`,
  String.raw`\b(fs|fsp|fsPromises|promises|fse)\.(rm|rmdir|unlink|rename|remove|move|emptyDir)\b`,
  String.raw`\bshutil\.(rmtree|move)\b`, String.raw`\bos\.(remove|unlink|rmdir|rename|replace)\b`,
  String.raw`\.(rm|rmdir|unlink|rename)\s*\(`, String.raw`(^|[^.\w$])rm\s*\(`, String.raw`\bFileUtils\.(rm\w*|remove\w*|mv|move)\b`,
  String.raw`\b(File|Dir|FileUtils)\.(delete|unlink|rename|rmdir)\b`, String.raw`\bDeno\.(remove|rename)(Sync)?\b`,
  String.raw`(^|[^.\w$])(unlink|rmdir|rename)\b(?=\s*\(?\s*(['"]|__DIR__\b|getcwd\s*\())`, String.raw`\bRemove-Item\b`,
].join('|'), 'g');
// Raíces calculadas: el cwd (que es la raíz o está dentro del repo) y el HOME, en node,
// python, ruby, perl, php y deno. Cuentan cuando son el argumento entero del borrado, quizá
// envueltas en funciones que no cambian la ruta o suben (ROOT_WRAP), con `.resolve()` o
// `.parent` detrás, o con literales agregados (`+ '/'`, `/ '..'`, `join(cwd, '..')`).
const ROOT_ENV = String.raw`(HOME|USERPROFILE|PWD)`;
const ROOT_EXPR = new RegExp('^(' + [
  String.raw`(require\(\s*['"](node:)?os['"]\s*\)|os)\.homedir\(\)`, String.raw`process\.cwd\(\)`, String.raw`__dirname\b`, String.raw`__DIR__\b`,
  String.raw`Deno\.cwd\(\)`, String.raw`(pathlib\.)?Path\.(home|cwd)\(\)`, String.raw`os\.getcwdb?\(\)`, String.raw`os\.curdir\b`,
  String.raw`Dir\.(home|pwd|getwd)\b`, String.raw`(Cwd::)?(getcwd|cwd)\(\)`, String.raw`(require\(\s*['"](node:)?path['"]\s*\)|path)\.resolve\(\s*\)`,
  String.raw`process\.env\.${ROOT_ENV}\b`, String.raw`process\.env\[\s*['"]${ROOT_ENV}['"]\s*\]`,
  String.raw`os\.environ\[\s*['"]${ROOT_ENV}['"]\s*\]`, String.raw`os\.environ\.get\(\s*['"]${ROOT_ENV}['"]\s*\)`,
  String.raw`(os\.)?getenv\(\s*['"]${ROOT_ENV}['"]\s*\)`, String.raw`ENV(\.fetch\(|\[)\s*['"]${ROOT_ENV}['"]\s*[\])]`,
  String.raw`\$ENV\{${ROOT_ENV}\}`, String.raw`\$HOME\b`, String.raw`Deno\.env\.get\(\s*['"]${ROOT_ENV}['"]\s*\)`,
].join('|') + ')');
const HOME_ROOT = /home|HOME|USERPROFILE/;
const ROOT_WRAP = /^(str|String|Path|pathlib\.Path|(require\(\s*['"](node:)?path['"]\s*\)|path)\.(resolve|normalize|join|dirname)|os\.path\.(abspath|realpath|normpath|expanduser|join|dirname)|File\.(expand_path|realpath)|fs\.realpathSync|realpath)\(\s*(?!\))/;
const LIT_AT = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/;
const STRING_LIT = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

// Destino de un borrado a partir del texto de su primer argumento: un literal o una raíz
// calculada, quizá envueltos y con literales agregados. Devuelve las rutas a evaluar y si
// salen de una raíz calculada, o null si el destino no se conoce.
function inlineTarget(arg, bare) {
  let rest = arg.replace(/^[A-Za-z_]\w*\s*=(?![=>])\s*/, ''); // argumento con nombre: rmtree(path=…)
  let depth = 0;
  for (let m; (m = ROOT_WRAP.exec(rest)); depth++) rest = rest.slice(m[0].length);
  const r = ROOT_EXPR.exec(rest);
  const lit = r ? null : LIT_AT.exec(rest);
  if (!r && (!lit || /\$\{|#\{/.test(lit[2]))) return null;
  let p = r ? (HOME_ROOT.test(r[0]) ? '~' : '.') : lit[2].replace(/^\$\{?HOME\}?(?=\/|$)/, '~');
  const paths = [];
  rest = rest.slice((r || lit)[0].length);
  for (;;) {
    let m;
    if ((m = /^\s*(\.(resolve|absolute|expanduser|realpath)\(\s*\)|\.parent\b)/.exec(rest))) {
      if (m[1] === '.parent') p += '/..';
    } else if ((m = /^\s*([+/,])\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/.exec(rest)) && (m[1] !== ',' || depth > 0)) {
      if (/\$\{|#\{/.test(m[3])) return null;
      if (m[1] === '+') p += m[3];
      else { p += `/${m[3]}`; if (/^([\\/]|[A-Za-z]:)/.test(m[3])) paths.push(m[3]); } // join/resolve con una absoluta
    } else if (depth > 0 && (m = /^\s*\)/.exec(rest))) depth--;
    else break;
    rest = rest.slice(m[0].length);
  }
  // Fin del argumento; sin paréntesis (perl/ruby) también `or`, `and`, `if`, `unless`, `||`, `&&`, `?`.
  const end = bare ? /^\s*([,);?]|$|\|\||&&|(or|and|if|unless)\b)/ : /^\s*([,);]|$)/;
  if (depth > 0 || !end.test(rest)) return null;
  return { paths: [p, ...paths], computed: Boolean(r) };
}

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
    // Destino: el primer argumento de la llamada, o el receptor de Path(…).unlink()/.rmdir().
    const tail = text.slice(m.index + m[0].length);
    const bare = !/\($/.test(m[0]) && !/^\s*\(/.test(tail); // perl/ruby sin paréntesis
    const after = tail.replace(/^\s*\(?\s*/, '');
    const before = text.slice(0, m.index);
    const recv = /\.(unlink|rmdir)\s*\($/.test(m[0]) ? /\b(pathlib\.)?(Pure|Posix|Windows)?Path\(\s*(['"])((?:\\.|(?!\3)[^\\])*)\3\s*\)\s*$/.exec(before) : null;
    const t = recv && !/\$\{|#\{/.test(recv[4]) ? { paths: [recv[4]], computed: false } : inlineTarget(after, bare);
    // `.rename(` en un receptor cualquiera suele no ser de archivos (pandas `df.rename(columns=…)`):
    // con destino desconocido no cuenta; con un literal o una raíz calculada, sí.
    if (!t) { if (!/^\.rename\s*\($/.test(m[0])) unknown = true; continue; }
    if (t.paths.some((p) => isCatastrophicOperand(word(p, { glob: /[*?[]/.test(p) }), st, ctx))) { out.push(hit('catastrophic-delete')); return; }
    // Mismo trato que `rm` desde la shell: ~/.claude/plugins, ~/.claude/settings*.json, ~/.pignolo/**.
    if (t.paths.some((p) => resolveAll(p, st, ctx).some((q) => isProtectedWrite(q, SHELL_LOCS(ctx))))) { out.push(hit('protected-path')); return; }
    if (t.computed) unknown = true; // subruta de una raíz calculada: no verificable
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
      const m = /^-[A-Za-z]*?c(.*)$/s.exec(v); // perezoso: en -cexec(…) el código empieza en la primera c
      if (m) { codes.push(m[1] ? { ...w, value: m[1] } : args[i + 1]); break; }
      if (v === '-m') { program = true; break; }
      if (['-X', '-W', '-Q'].includes(v)) { i++; continue; }
    } else if (name === 'ruby' || name === 'perl') {
      const m = /^-[A-Za-z0-9]*?[eE](.*)$/s.exec(v); // perezoso: -esystem(…) es -e + system(…)
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
  if (inPlace) markDiscard(ctx, st);
  if (inPlace) for (const w of files) writeOperand(w, st, ctx, out);
  if (codes.length || ((!program || stdin) && !isTestRun(name, args))) markDiscard(ctx, st); // todo código inline (H9); `node --test` sin ruta no es código inline (D-G6)
  const check = inlineCheck(name, out, st, ctx);
  for (const c of codes) {
    if (!c || (c.dyn && c.dynAt === 0)) { out.push(hit('hidden-code')); return; }
    check(c.value);
  }
  if (!codes.length && (!program || stdin)) stdinCode(cmd, name, null, out, 0, null, check);
}

function analyzeAwk(args, out, st, ctx) {
  if (args.some((w, i) => !w.dyn && /^-i/.test(w.value) && /^inplace/.test((w.value.length > 2 ? w.value.slice(2) : (args[i + 1] || {}).value) || ''))) markDiscard(ctx, st);
  for (let i = 0; i < args.length; i++) {
    const v = args[i].value;
    if (['-F', '-v', '-f', '--file'].includes(v)) { if (v === '-f' || v === '--file') return; i++; continue; }
    if (v.startsWith('-')) continue;
    if (args[i].dyn) { out.push(hit('hidden-code')); return; }
    if (AWK_EXEC.test(v) || AWK_PRINT_PIPE.test(v.replace(/"(?:\\.|[^"\\])*"/g, '""'))) out.push(hit('inline-code'));
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
  if (inPlace) markDiscard(ctx, st);
  if (inPlace) for (const w of files) writeOperand(w, st, ctx, out);
}

// tar -x (x, --extract, --get) escribe en el directorio de -C/--directory (G9).
function analyzeTar(args, st, ctx, out) {
  const extract = args.some((w, i) => !w.dyn && (/^--(extract|get)$/.test(w.value) || /^-[a-zA-Z]*x/.test(w.value) || (i === 0 && /^[a-zA-Z]*x[a-zA-Z]*$/.test(w.value))));
  if (!extract) return;
  markDiscard(ctx, st);
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
  // En Git Bash la forma que funciona es `cmd //c` (MSYS convierte `/c` en una ruta): una o dos barras (R3).
  // Las opciones de cmd pueden ir pegadas (`/d/c`, `/q/d/c`, `//s//c`) y el comando pegado a /c (RR2): se pelan una por una;
  // si una palabra de opciones esconde un /c o /k tras algo que no se reconoce, falla cerrado.
  let k = -1;
  let first = '';
  for (let i = 0; i < args.length && k < 0; i++) {
    let s = args[i].value;
    if (!/^\/{1,2}/.test(s)) continue;
    let m;
    while ((m = /^\/{1,2}(?:[dqsaux]|[efvt]:[^/\s]*)(?=\/|$)/i.exec(s))) s = s.slice(m[0].length);
    if ((m = /^\/{1,2}[ckr]/i.exec(s))) { k = i; first = s.slice(m[0].length); }
    else if (/\/{1,2}[ckr]/i.test(s.slice(1))) { out.push(hit('hidden-code')); return; }
  }
  if (k < 0) return;
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
  let workDir = null; // -WorkingDirectory: el proceso corre en ese directorio (R5)
  const argList = [];
  for (let i = 0; i < args.length; i++) {
    const w = args[i];
    if (w.kind === 'param') {
      const p = w.value.toLowerCase();
      if (p.length >= 3 && '-workingdirectory'.startsWith(p)) { workDir = args[i + 1] || dynWord(); i++; continue; }
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
  runWords(words, { ...cmd, lredirs: cmd.lredirs || cmd.redirects, redirects: [], pipedIn: false, stdinBody: undefined, noCd: true }, shell, ctx, out, depth + 1, workDir ? stateIn(st, ctx, workDir) : st);
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
    if (PS_IO_TYPE.test(m.target) && !/^(read|exists|get|enum)/i.test(m.member || '')) markDiscard(ctx, st);
    else if (m.member && /^(delete|moveto|copyto)/i.test(m.member)) markDiscard(ctx, st);
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
    if (/^\$env:GIT_(DIR|WORK_TREE)$/i.test(a.left)) st.gitEnv = true; // (R4)
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

// ------------------------------------------------------------ git para otros hooks (R-14)

// Reglas que significan "no se supo qué corre": quien llama falla cerrado (devuelve null).
const BLIND = new Set(['invalid-input', 'unparseable', 'ps-unavailable', 'too-deep', 'dynamic-command', 'hidden-code', 'ps-sink', 'ps-encoded']);

// Una entrada por cada `git` del comando, con la misma tokenización y el mismo estado que
// `evaluate`: [{ sub, args, positionals, shorts, longs, onMain, cwdChanged }]. `onMain`: un
// checkout/switch a main/master ya ocurrió antes en el comando; `cwdChanged`: un cd, pushd,
// Set-Location o `git -C` lo precede. `null` si no se pudo analizar (también un git cuyo
// subcomando o cuyas opciones salen de una variable).
function gitCommands(command, opts = {}) {
  const collect = [];
  const rules = [];
  evaluate(command, { shell: opts.shell, psExe: opts.psExe, psTimeoutMs: opts.psTimeoutMs, cwd: opts.cwd, collect, rules });
  if (rules.some((r) => BLIND.has(r)) || collect.some((c) => c.incomplete)) return null;
  return collect;
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

const DISCARD = { progs: DISCARD_PROGS, git: DISCARD_GIT, find: DISCARD_FIND, tests: TEST_CMDS };

module.exports = { evaluate, explain, gitCommands, RULES, CANARIES, AUTO_MODES, DISCARD };
