'use strict';
// Tokenizador de bash para la guardia de shell (spec §11.6). PowerShell usa el
// AST nativo (lib/ps-ast.js).
// Una sola pasada de izquierda a derecha que respeta comillas y escapes, une
// continuaciones de línea, separa subcomandos, guarda el cuerpo de heredocs y
// here-strings en `stdinBody` del comando que los lee (sus sustituciones sin
// comillas sí se ejecutan y se extraen) y extrae el contenido de $(...) y `...`
// como subcomandos aparte con `sub: true`.
//
// Salida: lista plana de subcomandos { words, redirects, sub, pipedIn, stdin, stdinBody, call, raw,
// sep, scopes, pipeOut, async }. `sep` es el operador que lo precede (';', '&&', '||',
// '|', '&' o null); `scopes`, la cadena de subshells que lo contienen (cada ( … ) y
// cada sustitución abre uno; el primero es la shell del comando); `pipeOut` y
// `async`, que lo sigue un '|' o un '&' (corre en un subshell propio).
// Cada palabra es { value (sin comillas), quoted, startsQuoted, dyn, dynAt, glob, kind, dqSub }:
// `dyn` indica que parte del valor sale de una variable o sustitución, a partir
// de la posición `dynAt`; `dqSub`, que tiene una sustitución de comandos dentro de
// comillas dobles. Ante algo que no puede parsear, lanza ParseError.

class ParseError extends Error {}

function newWord() {
  return { value: '', quoted: false, startsQuoted: false, dyn: false, dynAt: -1, glob: false, unq: '', kind: null, dqSub: false };
}

function newCmd(sub) {
  return { words: [], redirects: [], sub, pipedIn: false, stdin: null, call: null, start: -1, raw: '', pending: null };
}

function markDyn(wd) {
  if (!wd.dyn) { wd.dyn = true; wd.dynAt = wd.value.length; }
}

// Menciona git como programa: una palabra cuyo nombre base es git o git.exe.
const GIT_TOKEN = /(?:^|[\s"'`(){}[\];|&=,@<>])(?:[^\s"'`(){}[\];|&<>]*[\\/])?git(?:\.exe|\.cmd)?(?=$|[\s"'`(){}[\];|&,<>])/i;
function mentionsGit(text) {
  return GIT_TOKEN.test(String(text));
}

let SCOPES = 0;

// Arma el manejo común de palabras y subcomandos de una secuencia. `st.sep` y
// `st.scopes` llevan el operador y los subshells vigentes a las sustituciones.
function sequence(st, out, sub) {
  const q = { cmd: newCmd(sub), word: null, sep: st.sep === undefined ? null : st.sep, scopes: [...(st.scopes || []), ++SCOPES] };
  st.scopes = q.scopes;
  q.w = () => {
    if (!q.word) {
      q.word = newWord();
      if (q.cmd.start < 0) q.cmd.start = st.i;
    }
    return q.word;
  };
  q.flush = (heredocs) => {
    const wd = q.word;
    if (!wd) return;
    if (!wd.dyn && /\{[^{}]*(,|\.\.)[^{}]*\}/.test(wd.unq)) markDyn(wd); // expansión de llaves
    if (q.cmd.pending) {
      const op = q.cmd.pending;
      q.cmd.pending = null;
      if (op === '<<' || op === '<<-') heredocs.push({ delim: wd.value, quoted: wd.quoted, strip: op === '<<-', cmd: q.cmd });
      else if (op === '<<<') q.cmd.stdinBody = wd.value;
      else q.cmd.redirects.push({ op, target: wd });
    } else {
      q.cmd.words.push(wd);
    }
    q.word = null;
  };
  // `keep`: el paréntesis cierra el comando pero no es un operador.
  q.end = (op, heredocs, keep) => {
    q.flush(heredocs);
    if (q.cmd.pending) throw new ParseError('redirección sin destino');
    if (q.cmd.words.length || q.cmd.redirects.length) {
      q.cmd.raw = st.s.slice(q.cmd.start, st.i);
      Object.assign(q.cmd, { sep: q.sep, scopes: q.scopes, pipeOut: op === '|', async: op === '&' });
      out.push(q.cmd);
    }
    q.cmd = newCmd(sub);
    if (op === '|') q.cmd.pipedIn = true;
    if (!keep) q.sep = op;
    st.sep = q.sep;
  };
  q.scope = (open) => {
    q.scopes = open ? [...q.scopes, ++SCOPES] : q.scopes.slice(0, -1);
    st.scopes = q.scopes;
  };
  q.redirect = (op) => {
    if (q.word && /^(\d+|\*)$/.test(q.word.value) && !q.word.quoted) q.word = null; // descriptor
    if (q.cmd.start < 0) q.cmd.start = st.i;
    return op;
  };
  return q;
}

// ------------------------------------------------------------------ bash

function parseBash(src) {
  const out = [];
  bashSeq({ s: src, i: 0 }, null, out, false);
  return out;
}

function bashSeq(st, term, out, sub) {
  const s = st.s;
  const saved = { sep: st.sep, scopes: st.scopes };
  const q = sequence(st, out, sub);
  const heredocs = [];
  let depth = 0;
  while (st.i < s.length) {
    const c = s[st.i];
    const n = s[st.i + 1];
    if (c === ' ' || c === '\t' || c === '\r') { q.flush(heredocs); st.i++; continue; }
    if (c === '\n') {
      q.end(';', heredocs);
      st.i++;
      if (heredocs.length) readHeredocs(st, heredocs.splice(0), out);
      continue;
    }
    if (c === '#' && !q.word) { while (st.i < s.length && s[st.i] !== '\n') st.i++; continue; }
    if (c === '\\') {
      if (n === '\n') { st.i += 2; continue; }
      if (n === '\r' && s[st.i + 2] === '\n') { st.i += 3; continue; }
      if (n === undefined) throw new ParseError('barra invertida al final');
      const wd = q.w();
      wd.value += n;
      wd.quoted = true;
      st.i += 2;
      continue;
    }
    if (c === "'") {
      const wd = q.w();
      if (!wd.value && !wd.quoted) wd.startsQuoted = true;
      const j = s.indexOf("'", st.i + 1);
      if (j < 0) throw new ParseError('comilla simple sin cerrar');
      wd.value += s.slice(st.i + 1, j);
      wd.quoted = true;
      st.i = j + 1;
      continue;
    }
    if (c === '"') {
      const wd = q.w();
      if (!wd.value && !wd.quoted) wd.startsQuoted = true;
      st.i++;
      bashDq(st, wd, out, true);
      continue;
    }
    if (c === '$' && bashDollar(st, q.w(), out, false)) continue;
    if (c === '`') { bashBacktick(st, q.w(), out); continue; }
    if (c === ';') { q.end(';', heredocs); st.i += n === ';' ? 2 : 1; continue; }
    if (c === '&') {
      if (n === '&') { q.end('&&', heredocs); st.i += 2; continue; }
      if (n === '>') {
        q.flush(heredocs);
        const op = s[st.i + 2] === '>' ? '&>>' : '&>';
        q.cmd.pending = q.redirect(op);
        st.i += op.length;
        continue;
      }
      q.end('&', heredocs);
      st.i++;
      continue;
    }
    if (c === '|') {
      if (n === '|') { q.end('||', heredocs); st.i += 2; continue; }
      q.end('|', heredocs);
      st.i += n === '&' ? 2 : 1;
      continue;
    }
    if (c === '<' || c === '>') {
      if (n === '(') { // sustitución de proceso
        const wd = q.w();
        markDyn(wd);
        wd.value += `${c}()`;
        st.i += 2;
        bashSeq(st, ')', out, true);
        continue;
      }
      q.redirect();
      q.flush(heredocs);
      let op = c;
      for (const cand of ['<<<', '<<-', '<<', '<>', '<&', '>>', '>&', '>|']) {
        if (s.startsWith(cand, st.i)) { op = cand; break; }
      }
      if (q.cmd.start < 0) q.cmd.start = st.i;
      st.i += op.length;
      if (op === '<<<') q.cmd.stdin = 'herestring';
      else if (op === '<<' || op === '<<-') q.cmd.stdin = 'heredoc';
      else if (op === '<' || op === '<>') q.cmd.stdin = 'file';
      q.cmd.pending = op;
      continue;
    }
    if (c === '(') { depth++; q.end(';', heredocs, true); q.scope(true); st.i++; continue; }
    if (c === ')') {
      if (depth > 0) { depth--; q.end(';', heredocs, true); q.scope(false); st.i++; continue; }
      if (term === ')') {
        q.end(';', heredocs);
        if (heredocs.length) throw new ParseError('heredoc sin cuerpo');
        st.i++;
        Object.assign(st, saved);
        return;
      }
      throw new ParseError('paréntesis sin abrir');
    }
    const wd = q.w();
    if (c === '*' || c === '?' || c === '[') wd.glob = true;
    wd.value += c;
    wd.unq += c;
    st.i++;
  }
  if (term) throw new ParseError('sustitución sin cerrar');
  if (depth) throw new ParseError('paréntesis sin cerrar');
  q.end(';', heredocs);
  if (heredocs.length) throw new ParseError('heredoc sin cuerpo');
  Object.assign(st, saved);
}

// Contenido entre comillas dobles (o cuerpo de heredoc sin comillas si `closing` es false).
function bashDq(st, wd, out, closing) {
  const s = st.s;
  wd.quoted = true;
  while (st.i < s.length) {
    const c = s[st.i];
    if (c === '"' && closing) { st.i++; return; }
    if (c === '\\') {
      const n = s[st.i + 1];
      if (n === '\n') { st.i += 2; continue; }
      if (n === '$' || n === '`' || n === '"' || n === '\\') { wd.value += n; st.i += 2; continue; }
      wd.value += c;
      st.i++;
      continue;
    }
    // Sustitución de comandos dentro de comillas dobles (no la aritmética $(( ))),
    // salvo `$(cat <<'X' … X)`: heredoc con delimitador entre comillas, texto literal.
    if (c === '$' && s[st.i + 1] === '(' && s[st.i + 2] !== '(') {
      const before = out.length;
      bashDollar(st, wd, out, true);
      if (!literalHeredoc(out.slice(before))) wd.dqSub = true;
      continue;
    }
    if (c === '$' && bashDollar(st, wd, out, true)) continue;
    if (c === '`') { wd.dqSub = true; bashBacktick(st, wd, out); continue; }
    wd.value += c;
    st.i++;
  }
  if (closing) throw new ParseError('comilla doble sin cerrar');
}

// La sustitución es solo `cat` leyendo un heredoc con delimitador entre comillas.
function literalHeredoc(cmds) {
  return cmds.length === 1 && cmds[0].words.length === 1 && cmds[0].words[0].value === 'cat'
    && !cmds[0].words[0].dyn && !cmds[0].redirects.length && cmds[0].stdin === 'heredoc' && cmds[0].stdinQuoted === true;
}

function bashDollar(st, wd, out, inDq) {
  const s = st.s;
  const n = s[st.i + 1];
  if (n === '(') {
    markDyn(wd);
    if (s[st.i + 2] === '(') { // aritmética $(( )): sus sustituciones sí se ejecutan
      wd.value += '$(())';
      st.i += 3;
      bashArith(st, out);
      return true;
    }
    wd.value += '$()';
    st.i += 2;
    bashSeq(st, ')', out, true);
    return true;
  }
  if (n === '{') {
    markDyn(wd);
    const start = st.i;
    st.i += 2;
    bashBrace(st, out);
    wd.value += s.slice(start, st.i);
    return true;
  }
  if (n === "'" && !inDq) { // $'...' (ANSI-C): se trata como valor dinámico
    markDyn(wd);
    let i = st.i + 2;
    for (; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === "'") break;
    }
    if (i >= s.length) throw new ParseError("$'...' sin cerrar");
    wd.value += s.slice(st.i, i + 1);
    wd.quoted = true;
    st.i = i + 1;
    return true;
  }
  if (n === '"' && !inDq) { st.i++; return true; } // $"..." se lee como "..."
  const m = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(s.slice(st.i + 1, st.i + 129));
  if (!m) return false;
  markDyn(wd);
  wd.value += `$${m[0]}`;
  st.i += 1 + m[0].length;
  return true;
}

function bashBrace(st, out) {
  const s = st.s;
  const scratch = newWord();
  let depth = 1;
  while (st.i < s.length) {
    const c = s[st.i];
    if (c === '\\') { st.i += 2; continue; }
    if (c === '}') { depth--; st.i++; if (!depth) return; continue; }
    if (c === '{') { depth++; st.i++; continue; }
    if (c === "'") {
      const j = s.indexOf("'", st.i + 1);
      if (j < 0) throw new ParseError('comilla simple sin cerrar');
      st.i = j + 1;
      continue;
    }
    if (c === '"') { st.i++; bashDq(st, scratch, out, true); continue; }
    if (c === '$' && bashDollar(st, scratch, out, true)) continue;
    if (c === '`') { bashBacktick(st, scratch, out); continue; }
    st.i++;
  }
  throw new ParseError('${ sin cerrar');
}

// Cuerpo de $(( … )): se recorre como texto entre comillas dobles (bash expande ahí
// $(…), `…` y ${…}) hasta el `))` que cierra. Un `)` suelto que no sigue a otro es
// la forma $( ( … ) ) (sustitución con un subshell): no verificable.
function bashArith(st, out) {
  const s = st.s;
  const scratch = newWord();
  let depth = 0;
  while (st.i < s.length) {
    const c = s[st.i];
    if (c === '\\') { st.i += 2; continue; }
    if (c === '(') { depth++; st.i++; continue; }
    if (c === ')') {
      if (depth > 0) { depth--; st.i++; continue; }
      if (s[st.i + 1] === ')') { st.i += 2; return; }
      throw new ParseError('$(( … ) ): ¿aritmética o sustitución?');
    }
    if (c === '"') { st.i++; bashDq(st, scratch, out, true); continue; }
    if (c === '$' && bashDollar(st, scratch, out, true)) continue;
    if (c === '`') { bashBacktick(st, scratch, out); continue; }
    st.i++;
  }
  throw new ParseError('$(( sin cerrar');
}

function bashBacktick(st, wd, out) {
  const s = st.s;
  let i = st.i + 1;
  let inner = '';
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '`' || s[i + 1] === '\\' || s[i + 1] === '$')) { inner += s[i + 1]; i++; continue; }
    if (c === '`') break;
    inner += c;
  }
  if (i >= s.length) throw new ParseError('comilla invertida sin cerrar');
  st.i = i + 1;
  markDyn(wd);
  wd.value += '``';
  bashSeq({ s: inner, i: 0, sep: st.sep, scopes: st.scopes }, null, out, true);
}

function readHeredocs(st, list, out) {
  const s = st.s;
  for (const hd of list) {
    let body = '';
    for (;;) {
      if (st.i >= s.length) throw new ParseError('heredoc sin cerrar');
      let j = s.indexOf('\n', st.i);
      if (j < 0) j = s.length;
      let line = s.slice(st.i, j);
      st.i = Math.min(j + 1, s.length);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if ((hd.strip ? line.replace(/^\t+/, '') : line) === hd.delim) break;
      body += `${line}\n`;
    }
    hd.cmd.stdinBody = body;
    hd.cmd.stdinQuoted = hd.quoted;
    // Con delimitador sin comillas, bash expande $(...) y `...` dentro del cuerpo.
    if (!hd.quoted) bashDq({ s: body, i: 0, sep: hd.cmd.sep, scopes: hd.cmd.scopes }, newWord(), out, false);
  }
}

module.exports = { parseBash, ParseError, mentionsGit };
