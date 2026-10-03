'use strict';
// Escáner de código inline (T7, R-9; invertido a lista blanca en la pasada de arreglos RT2-01 a RT2-04): el código
// de un `node -e` / `python -c` / heredoc pasa solo si se puede probar que no lanza procesos ni carga módulos
// capaces de hacerlo. Lo que no se reconoce (comillas dentro de una regex, `q()` o `s///` de perl, plantillas con
// `${}`, heredocs) cae a la búsqueda ingenua de `main`: se niega si nombra git o hace una llamada a proceso.

const { mentionsGit } = require('./shell-parse');

// Búsqueda ingenua (la de antes de T7, más los sumideros).
const SPAWN_RE = /child_process|\bexec(Sync|FileSync|File)?\s*\(|\bspawn(Sync)?\s*\(|subprocess|os\.(system|popen|exec\w*|spawn\w*)|\bsystem\s*\(|\bpopen\b|Deno\.(run|Command)|Bun\.(spawn|\$)|shell_exec|passthru|proc_open|pcntl_exec/;
const SPAWN_PERL_RUBY = /\b(system|exec|spawn)\b|`|\bqx\s*\W|%x\s*\W|IO\.popen|Open3|\bopen\s*\(?\s*["']?\s*\|/;
// Sumideros: evalúan texto como código.
const SINK_RE = /\b(eval|Function|instance_eval|class_eval|module_eval)\b|\bvm\.|\bcompile\s*\(/;

// Mención (en el texto crudo, también dentro de cadenas y armada a partes en el texto) de una API o biblioteca que
// lanza procesos, de git como módulo o del lib/git de pignolo.
const PROC_MENTION = new RegExp([
  String.raw`child_process|\bexec(?!Path|Argv)\w+|(?<![.\w])exec(?!\w)|\bspawn\w*|\bfork\w*|subprocess|\bpty\b|pexpect|plumbum|\bsh\.|execa`,
  String.raw`cross-spawn|\bzx\b|shelljs|GitPython|simple-git|isomorphic-git|nodegit|dulwich|pygit2|\bgit\s*\.\s*(Repo|cmd)`,
  String.raw`lib[\\/]+git(?![\w-])|\bos\.(system|popen|startfile|posix_spawn\w*)`,
  String.raw`Deno\.(run|Command)|Bun\.(spawn|\$)|Start-Process|\bsaps\b|Invoke-Expression|\biex\b|Invoke-Command|ShellExecute|WScript\.Shell`,
  String.raw`\bsystem\s*\(|\bpopen\b|shell_exec|passthru|proc_open|pcntl_|IO\.popen|Open3|\bPTY\b|\bsyscall\b|\bqx\b|%x\b`,
  String.raw`ctypes|cffi|\bFiddle\b|\bdlopen\b|process\.binding|process\.dlopen|process\.mainModule|module\.constructor|worker_threads|\bcluster\b`,
  String.raw`importlib|__import__|__builtins__|__dict__|sys\.modules|\bbuiltins\b|\bglobals\s*\(|\bvars\s*\(|\bgetattr\s*\(`,
].join('|'), 'i');
// Tocar .git o el estado de pignolo como ruta (leer o escribir) no es un cálculo.
const PATH_MENTION = /(^|[^\w])\.git(?![\w-])|\.gitconfig|refs[\\/]+pignolo/i;
// APIs de archivos (nombres de método o de módulo), para saber si el código toca rutas.
const FILE_API = /\b(readFile\w*|writeFile\w*|append\w*|create\w*Stream|copy\w*|mkdir\w*|symlink\w*|link\w*|chmod\w*|truncate\w*|utimes\w*|open\w*|rm\w*|rename\w*|unlink\w*|readdir\w*|stat\w*|access\w*|exists\w*|Path|pathlib|shutil|File|Dir|FileUtils|Deno|Bun|write\w*|read\w*|fs|fsp|fse|promises|IO|glob|walk\w*|scandir|listdir|touch|put\w*|file_\w+|fopen|file)\b/;
// Sumideros: evalúan texto como código.
const SINK_OUTSIDE = SINK_RE;

// Módulos que cargar es inocuo (no lanzan procesos). Cualquier otro require / import cuenta como uso de procesos.
const SAFE_MODULES = {
  js: new Set(['fs', 'fs/promises', 'path', 'url', 'util', 'crypto', 'assert', 'os', 'buffer', 'events', 'querystring', 'string_decoder', 'zlib', 'stream', 'timers', 'timers/promises', 'perf_hooks', 'readline', 'http', 'https', 'tty', 'v8']),
  py: new Set(['json', 're', 'pathlib', 'math', 'sys', 'datetime', 'hashlib', 'base64', 'collections', 'itertools', 'functools', 'string', 'textwrap', 'time', 'random', 'urllib.parse', 'os', 'os.path', 'io', 'shutil', 'glob', 'tempfile', 'sqlite3', 'pprint', 'html', 'unicodedata', 'calendar', 'heapq', 'bisect', 'struct', 'codecs', 'argparse', 'csv', 'decimal', 'fractions', 'statistics', 'typing', 'dataclasses', 'enum', 'copy', 'operator', 'uuid', 'zlib', 'binascii']),
  rb: new Set(['json', 'set', 'date', 'time', 'digest', 'base64', 'pathname', 'securerandom', 'ostruct', 'optparse', 'csv', 'bigdecimal', 'uri']),
  pl: new Set(['strict', 'warnings', 'utf8', 'List::Util', 'Data::Dumper', 'File::Basename', 'File::Spec', 'Cwd', 'Time::HiRes', 'MIME::Base64', 'Digest::MD5', 'Digest::SHA', 'JSON::PP', 'feature', 'constant']),
  php: new Set([]),
};
const isSafeModule = (lang, name) => (SAFE_MODULES[lang] || new Set()).has(name.replace(/^node:/, ''));
const LOADER_BEFORE = /(\brequire(?:_relative|_once)?|\b__import__|\bimport_module|\bimport|\binclude(?:_once)?|\bload|\buse)\s*\(?\s*$|\bfrom\s+$/;
// require(…), __import__(…), import(…) con algo que no es un solo literal puede cargar cualquier módulo; un `require`
// sin llamada directa (const r = require; r('child_'+'process')) también.
const LOADER_OPAQUE = /\b(require|__import__|import_module|import)\s*\(\s*(?!""\s*[,)])|\brequire\b(?!\s*\(\s*""\s*[,)])(?!\s+"")/;
// Módulos nombrados sin comillas: import a, b / from a import b (py), use X (perl).
const BARE_IMPORT = /\b(?:import|from)\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/g;
const BARE_USE = /\buse\s+([A-Za-z][\w:]*)/g;
function bareImportsUnsafe(outside, lang) {
  if (lang === 'py') {
    for (const m of outside.matchAll(BARE_IMPORT)) {
      for (const part of m[1].split(',')) if (!isSafeModule('py', part.trim().split(/\s+/)[0])) return true;
    }
    if (/\bfrom\s+\./.test(outside) || /\bimport\s*\*/.test(outside)) return true;
  }
  if (lang === 'pl') {
    for (const m of outside.matchAll(BARE_USE)) if (!isSafeModule('pl', m[1])) return true;
  }
  return false;
}
const COMPUTED_MEMBER = /\[\s*""\s*\+/;

const JS_REGEX_AFTER = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|in|of|delete|void|throw|new|else|do))\s*$/;
const JS = new Set(['js', 'ts']);
const HASH = new Set(['py', 'rb', 'pl', 'php']);

// Recorre el texto saltando literales y comentarios. Devuelve { outside, procModule } o null si no puede
// tokenizar (comillas sin cerrar, plantilla con `${`, f-string, `#{` de Ruby...).
function scan(text, lang) {
  let outside = '';
  let kept = ''; // el texto sin comentarios (las cadenas se quedan)
  let procModule = false;
  const n = text.length;
  let i = 0;
  const backtickIsCode = lang === 'rb' || lang === 'pl' || lang === 'php';
  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (JS.has(lang) || lang === 'php') {
      if (two === '//') { while (i < n && text[i] !== '\n') i++; continue; }
      if (two === '/*') { const e = text.indexOf('*/', i + 2); if (e < 0) return null; outside += ' '; kept += ' '; i = e + 2; continue; }
    }
    if (HASH.has(lang) && c === '#' && (i === 0 || /[\s;]/.test(text[i - 1]))) { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === "'" || c === '"' || (c === '`' && !backtickIsCode)) {
      let q = c;
      let start = i + 1;
      if (lang === 'py' && text.startsWith(c.repeat(3), i)) { q = c.repeat(3); start = i + 3; }
      if (lang === 'py') { // f-string: la expresión de adentro es código
        const pre = /([A-Za-z]{1,2})$/.exec(outside);
        if (pre && /f/i.test(pre[1])) return null;
      }
      let j = start;
      let body = '';
      for (;;) {
        if (j >= n) return null;
        if (text[j] === '\\') { body += text.slice(j, j + 2); j += 2; continue; }
        if (text.startsWith(q, j)) break;
        body += text[j];
        j++;
      }
      if (c === '`' && JS.has(lang) && body.includes('${')) return null;
      if (c === '"' && lang === 'rb' && body.includes('#{')) return null;
      if (c === '"' && lang === 'pl' && /[@$]\{/.test(body)) return null;
      if (c === '"' && lang === 'php' && /\{\$|\$\{/.test(body)) return null;
      if (LOADER_BEFORE.test(outside) && !isSafeModule(lang, body)) procModule = true;
      outside += '""';
      kept += text.slice(i, j + q.length);
      i = j + q.length;
      continue;
    }
    outside += c;
    kept += c;
    i++;
  }
  return { outside, kept, procModule };
}

// ¿Hay una forma de cita que el escáner no sabe seguir? Una regex de JS con comilla adentro, q()/qq()/s///tr/ y
// `=~` de perl, `?"` y %q() de ruby, heredocs. Ante eso no se tokeniza: búsqueda ingenua (RT2-04).
function ambiguousQuoting(raw, lang) {
  if (JS.has(lang)) {
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== '/' || raw[i + 1] === '/' || raw[i + 1] === '*' || raw[i - 1] === '*') continue;
      if (JS_REGEX_AFTER.test(raw.slice(0, i)) || /[)\]}]\s*$/.test(raw.slice(0, i))) return true; // regex (o ¿división?): sus comillas no se siguen
    }
    return false;
  }
  if (lang === 'rb' || lang === 'pl' || lang === 'php') {
    if (/<<\s*["'~-]?[A-Za-z_]|<<</.test(raw)) return true; // heredoc
    if (/=~|!~/.test(raw)) return true;
    if (/(?<![\w$@%&.:>-])(?:q|qq|qw|qr|qx|m|s|tr|y)\s*[^\w\s$@%,;)=]/.test(raw)) return true;
    if (/%[qQwWrRiIxs]?[({[<|!/]/.test(raw)) return true;
    if (/\?["']/.test(raw)) return true;
    if (lang === 'pl' && /\b(split|grep|map|join)\s*[/{]/.test(raw)) return true;
  }
  return false;
}

function langOf(name) {
  if (['node', 'nodejs', 'bun', 'deno'].includes(name)) return 'js';
  if (name.startsWith('py')) return 'py';
  if (name === 'ruby') return 'rb';
  if (name === 'perl') return 'pl';
  if (name === 'php') return 'php';
  return null; // lua, Rscript...: sin escáner, búsqueda ingenua
}

// { deny, why }. Pasa solo con prueba de que no lanza procesos: ninguna mención de la lista (PROC_MENTION, también
// en cadenas), ningún sumidero ni cargador opaco, ningún módulo fuera de la lista blanca, ninguna ruta .git o
// .pignolo y, si se nombra el launcher, ningún cargador. Si no se puede tokenizar con certeza, búsqueda ingenua.
function inlineCallsGit(text, lang, extraNames) {
  const raw = String(text);
  const naive = (why) => ({ deny: mentionsGit(raw) || Boolean(extraNames && extraNames.test(raw)) || SPAWN_RE.test(raw) || SINK_RE.test(raw) || SPAWN_PERL_RUBY.test(raw) || PROC_MENTION.test(raw) || PATH_MENTION.test(raw), why });
  if (!lang) return naive('naive');
  if (ambiguousQuoting(raw, lang)) return naive('ambiguous-quoting');
  const s = scan(raw, lang);
  if (!s) return naive('unscannable');
  // Una mención dentro de un comentario no hace nada; en una cadena, sí cuenta (puede armarse o evaluarse).
  if (PROC_MENTION.test(s.kept)) return { deny: true, why: 'process-mention' };
  const perlish = lang === 'rb' || lang === 'pl' || lang === 'php';
  if (s.procModule || SINK_OUTSIDE.test(s.outside) || LOADER_OPAQUE.test(s.outside) || bareImportsUnsafe(s.outside, lang) || COMPUTED_MEMBER.test(s.outside) || SPAWN_RE.test(s.outside) || (perlish && SPAWN_PERL_RUBY.test(s.outside))) return { deny: true, why: 'procs' };
  // Nombrar `.git` solo cuenta si el código toca archivos (console.log('.git') no es tocarlo).
  if (PATH_MENTION.test(s.kept) && FILE_API.test(s.outside)) return { deny: true, why: 'protected-path' };
  if (extraNames && extraNames.test(raw) && /\b(require|import|load|source|include|runpy|run_path)\b/.test(s.outside)) return { deny: true, why: 'launcher-loader' };
  return { deny: false, why: 'no-procs' };
}

module.exports = { inlineCallsGit, langOf, scan };
