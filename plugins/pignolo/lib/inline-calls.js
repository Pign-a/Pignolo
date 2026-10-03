'use strict';
// Escáner de código inline (T7, R-9): ¿el texto de un `node -e` / `python -c` / heredoc usa procesos fuera de sus
// literales de cadena y comentarios, y nombra git en algún lado? Un `spawnSync('git', …)` dentro de una cadena que
// solo se guarda en un archivo no es una llamada; `eval('…execSync("git …")…')`, `require('child_process')['execSync']`
// y `{execSync: run}` sí lo son, aunque la llamada no tenga la forma `spawn('git'…)`.
const { mentionsGit } = require('./shell-parse');

const SPAWN_RE = /child_process|\bexec(Sync|FileSync|File)?\s*\(|\bspawn(Sync)?\s*\(|subprocess|os\.(system|popen|exec\w*|spawn\w*)|\bsystem\s*\(|\bpopen\b|Deno\.(run|Command)|Bun\.(spawn|\$)|shell_exec|passthru|proc_open|pcntl_exec/;
const SPAWN_PERL_RUBY = /\b(system|exec|spawn)\b|`|\bqx\s*\W|%x\s*\W|IO\.popen|Open3|\bopen\s*\(?\s*["']?\s*\|/;
// Sumideros: evalúan texto como código.
const SINK_RE = /\b(eval|Function|instance_eval|class_eval|module_eval)\b|\bvm\.|\bcompile\s*\(/;
// Módulos de procesos nombrados como literal de require / import / __import__.
const PROC_MODULE = /^(node:)?(child_process|cluster)$|^(subprocess|os|pty|posix|commands|popen2)$/;
const LOADER_BEFORE = /(\brequire|\b__import__|\bimport_module|\bimport)\s*\(\s*$|\bfrom\s+$|\bimport\s+$/;
// require(…), __import__(…), import(…) con algo que no es un solo literal: puede cargar cualquier módulo.
const LOADER_OPAQUE = /\b(require|__import__|import_module|import)\s*\(\s*(?!""\s*[,)])/;

// Primer argumento de una llamada a proceso armado con + (o . en Perl/PHP): no se puede saber qué programa corre.
const CONCAT_CMD = /\b(?:exec\w*|spawn\w*|system|popen|shell_exec|passthru)\s*\(\s*(?:""\s*[+.]|[A-Za-z_$][\w$.]*\s*\+)/;

const JS = new Set(['js', 'ts']);
const HASH = new Set(['py', 'rb', 'pl', 'php']);

// Recorre el texto saltando literales y comentarios. Devuelve { outside, procModule } o null si no puede
// tokenizar (comillas sin cerrar, plantilla con `${`, f-string, `#{` de Ruby...).
function scan(text, lang) {
  let outside = '';
  let procModule = false;
  const n = text.length;
  let i = 0;
  const backtickIsCode = lang === 'rb' || lang === 'pl' || lang === 'php';
  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (JS.has(lang) || lang === 'php') {
      if (two === '//') { while (i < n && text[i] !== '\n') i++; continue; }
      if (two === '/*') { const e = text.indexOf('*/', i + 2); if (e < 0) return null; outside += ' '; i = e + 2; continue; }
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
      if (LOADER_BEFORE.test(outside) && PROC_MODULE.test(body)) procModule = true;
      outside += '""';
      i = j + q.length;
      continue;
    }
    outside += c;
    i++;
  }
  return { outside, procModule };
}

function langOf(name) {
  if (['node', 'nodejs', 'bun', 'deno'].includes(name)) return 'js';
  if (name.startsWith('py')) return 'py';
  if (name === 'ruby') return 'rb';
  if (name === 'perl') return 'pl';
  if (name === 'php') return 'php';
  return null; // lua, Rscript...: sin escáner, búsqueda ingenua
}

// { deny, why }: niega si el texto usa procesos fuera de literales Y nombra git en cualquier lado.
// Sin escáner o con texto que no se puede tokenizar, cae a la búsqueda ingenua: git nombrado o una llamada a proceso.
function inlineCallsGit(text, lang) {
  const raw = String(text);
  // Búsqueda ingenua (la de antes de T7, más los sumideros): git nombrado, una llamada a proceso o un sumidero.
  const naive = (why) => ({ deny: mentionsGit(raw) || SPAWN_RE.test(raw) || SINK_RE.test(raw) || SPAWN_PERL_RUBY.test(raw), why });
  if (!lang) return naive('naive');
  const s = scan(raw, lang);
  if (!s) return naive('unscannable');
  const perlish = lang === 'rb' || lang === 'pl' || lang === 'php';
  const procs = s.procModule || SPAWN_RE.test(s.outside) || SINK_RE.test(s.outside) || LOADER_OPAQUE.test(s.outside) || (perlish && SPAWN_PERL_RUBY.test(s.outside));
  if (!procs) return { deny: false, why: 'no-procs' };
  if (mentionsGit(raw)) return { deny: true, why: 'procs-and-git' };
  // El comando armado por partes ('g'+'it stash') no nombra git en el texto: un primer argumento que es una concatenación se niega.
  if (CONCAT_CMD.test(s.outside)) return { deny: true, why: 'concatenated-command' };
  return { deny: false, why: 'procs-no-git' };
}

module.exports = { inlineCallsGit, langOf, scan };
